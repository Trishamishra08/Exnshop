import { Request, Response } from "express";
import CustomerSupportRequest from "../../../models/CustomerSupportRequest";
import Customer from "../../../models/Customer";
import { sendSupportEmail } from "../../../services/emailService";
import SupportTicket from "../../../models/SupportTicket";
import { sendBroadcastNotification } from "../../../services/notificationService";
import { notifyRequester } from "../../../services/supportTicketService";

// What the customer picked in the form -> ticket category and how urgent it is.
const CATEGORY_MAP: Record<string, { category: string; priority: "Low" | "Medium" | "High" }> = {
  "Order Issue": { category: "Order", priority: "Medium" },
  "Delivery Issue": { category: "Delivery", priority: "High" },
  "Product Issue": { category: "Product", priority: "Medium" },
  "Payment Issue": { category: "Payment", priority: "High" },
  "Return Issue": { category: "Return", priority: "Medium" },
  "General Inquiry": { category: "General", priority: "Low" },
};

/**
 * Submit Customer Support / Contact Form
 * POST /api/customer/support/contact or POST /customer/support/contact
 */
export const submitCustomerSupport = async (req: Request, res: Response) => {
  try {
    let { name, email, subject, message } = req.body;
    const picked = CATEGORY_MAP[String(req.body.category || "")] || CATEGORY_MAP["General Inquiry"];

    // 1. Sanitize & trim inputs
    name = (name || "").trim().replace(/[\r\n]/g, " ");
    email = (email || "").trim().toLowerCase().replace(/[\r\n]/g, "");
    subject = (subject || "").trim().replace(/[\r\n]/g, " ");
    message = (message || "").trim();

    // 2. Validate fields
    if (!name || name.length < 2 || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid name (2-100 characters).",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    if (!subject || subject.length < 3 || subject.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid subject (3-200 characters).",
      });
    }

    if (!message || message.length < 10 || message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Please describe your issue (10-2000 characters).",
      });
    }

    // 3. Extract authenticated customer ID if present
    let customerId: string | undefined = undefined;
    if (req.user?.userId) {
      customerId = req.user.userId;
      // Fetch customer profile to confirm identity if needed
      try {
        const custDoc = await Customer.findById(customerId).select("name email");
        if (custDoc) {
          // Verify customer identity
          if (!name) name = custDoc.name;
          if (!email) email = custDoc.email;
        }
      } catch (err) {
        console.warn("[SUPPORT CONTROLLER] Unable to fetch customer profile:", err);
      }
    }

    // 4. Save Customer Support Request to MongoDB
    const supportRequest = new CustomerSupportRequest({
      customer: customerId,
      name,
      email,
      subject,
      message,
      status: "Pending",
      emailSent: false,
    });
    await supportRequest.save();

    let ticketInfo: { ticketId: string; ticketNumber?: string } | undefined;
    // 4b. Raise a ticket so it shows up in the admin panel (Support Tickets) with a notification.
    try {
      const ticket = await SupportTicket.create({
        customer: customerId,
        requesterType: "Customer",
        requesterName: name,
        requesterEmail: email,
        category: picked.category,
        priority: picked.priority,
        subject,
        description: message,
        status: "Open",
        statusHistory: [{ status: "Open", by: "Customer", at: new Date() }],
        messages: [],
      });
      sendBroadcastNotification(
        "Admin",
        `New customer support ticket (${picked.priority} priority)`,
        `${name} · ${picked.category}: ${subject}`,
        { type: "Info", priority: picked.priority === "High" ? "High" : "Medium", link: "/admin/customer-support" }
      ).catch((err) => console.error("Failed to notify admins of customer ticket:", err?.message));
      ticketInfo = { ticketId: String(ticket._id), ticketNumber: ticket.ticketNumber };
      if (customerId) {
        notifyRequester(ticket, "Ticket created", `We received your request "${subject}". Our team will reply soon; you can follow it from Track Ticket.`).catch(() => undefined);
      }
    } catch (err: any) {
      console.error("[SUPPORT CONTROLLER] Could not create admin ticket:", err?.message);
    }

    // 5. Send Support Email via Nodemailer
    console.log(`[SUPPORT CONTROLLER] Sending support email for Request ID: ${supportRequest._id}`);
    const emailResult = await sendSupportEmail({
      name,
      email,
      subject,
      message,
      customerId,
      submittedAt: supportRequest.createdAt,
    });

    if (emailResult.success) {
      supportRequest.emailSent = true;
      supportRequest.emailMessageId = emailResult.messageId;
      await supportRequest.save();

      return res.status(200).json({
        success: true,
        message: "Your support request has been sent successfully. Our support team will get back to you.",
        data: {
          requestId: supportRequest._id,
          ...(ticketInfo || {}),
        },
      });
    } else {
      console.error(`[SUPPORT CONTROLLER ERROR] Email delivery failed for Request ID ${supportRequest._id}: ${emailResult.error}`);
      return res.status(500).json({
        success: false,
        message: "Unable to send your message right now. Please try again later.",
      });
    }
  } catch (error: any) {
    console.error("[SUPPORT CONTROLLER EXCEPTION]", error);
    return res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred while submitting your support request.",
    });
  }
};
