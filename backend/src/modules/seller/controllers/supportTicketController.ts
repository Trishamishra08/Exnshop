import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import SupportTicket, { TICKET_STATUSES, TicketStatus } from "../../../models/SupportTicket";
import { sendBroadcastNotification } from "../../../services/notificationService";
import { applyPriority, escalateTicket, levelName, notifyRequester, setTicketStatus } from "../../../services/supportTicketService";

const STATUS_LABELS: Record<TicketStatus, string> = {
  Open: "Ticket Created",
  Assigned: "With Support Team",
  "In Progress": "Under Investigation",
  Waiting: "Waiting for your reply",
  Resolved: "Resolved",
  Closed: "Closed",
};

const cleanAttachments = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim()).slice(0, 5) : [];

const setStatus = setTicketStatus;

export const createTicket = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { category, priority, subject, description, attachments } = req.body;

  if (!subject || !description) {
    return res.status(400).json({
      success: false,
      message: "Subject and description are required",
    });
  }

  const ticket = await SupportTicket.create({
    seller: sellerId,
    requesterType: "Seller",
    category: category || "Other",
    priority: priority || "Medium",
    subject,
    description,
    attachments: cleanAttachments(attachments),
    status: "Open",
    statusHistory: [{ status: "Open", by: "Seller", at: new Date() }],
    messages: [],
  });

  sendBroadcastNotification(
    "Admin",
    `New support ticket (${ticket.priority} priority)`,
    `${ticket.category}: ${ticket.subject}`,
    { type: "Info", priority: ticket.priority === "High" || ticket.priority === "Critical" ? "High" : "Medium", link: "/admin/seller-support" }
  ).catch((err) => console.error("Failed to notify admins of new support ticket:", err?.message));

  return res.status(201).json({
    success: true,
    message: "Support ticket raised successfully",
    data: ticket,
  });
});

export const getMyTickets = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { status } = req.query;
  const query: any = { seller: sellerId };
  if (status) query.status = status;

  const tickets = await SupportTicket.find(query).sort({ updatedAt: -1 });
  return res.status(200).json({
    success: true,
    message: "Tickets fetched successfully",
    data: tickets,
  });
});

export const getMyTicketById = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const ticket = await SupportTicket.findOne({ _id: req.params.id, seller: sellerId });
  if (!ticket) {
    return res.status(404).json({ success: false, message: "Ticket not found" });
  }
  return res.status(200).json({ success: true, message: "Ticket fetched successfully", data: ticket });
});

export const replyToTicketAsSeller = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { message, attachments } = req.body;
  const files = cleanAttachments(attachments);

  if ((!message || !message.trim()) && files.length === 0) {
    return res.status(400).json({ success: false, message: "Message or attachment is required" });
  }

  const ticket = await SupportTicket.findOne({ _id: req.params.id, seller: sellerId });
  if (!ticket) {
    return res.status(404).json({ success: false, message: "Ticket not found" });
  }
  if (ticket.status === "Closed") {
    return res.status(400).json({ success: false, message: "This ticket is closed" });
  }

  ticket.messages.push({
    sender: "Seller",
    message: message?.trim() || "(attachment)",
    attachments: files,
    createdAt: new Date(),
  });
  // A seller reply on a resolved ticket means the issue isn't fixed; an answer to a question
  // from support puts the ticket back with the support team.
  if (ticket.status === "Resolved") setStatus(ticket, "In Progress", "Seller", "Reopened by seller reply");
  else if (ticket.status === "Waiting") setStatus(ticket, "In Progress", "Seller", "Seller replied");
  await ticket.save();

  return res.status(200).json({ success: true, message: "Reply sent", data: ticket });
});

/** Seller confirms a resolved ticket is fixed and closes it. */
export const closeTicketAsSeller = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const ticket = await SupportTicket.findOne({ _id: req.params.id, seller: sellerId });
  if (!ticket) {
    return res.status(404).json({ success: false, message: "Ticket not found" });
  }
  if (ticket.status === "Closed") {
    return res.status(400).json({ success: false, message: "This ticket is already closed" });
  }
  setStatus(ticket, "Closed", "Seller", "Closed by seller");
  await ticket.save();
  return res.status(200).json({ success: true, message: "Ticket closed", data: ticket });
});

// ==================== Admin ====================

export const getAllTickets = asyncHandler(async (req: Request, res: Response) => {
  const { status, priority, requesterType } = req.query;
  const query: any = {};
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (requesterType) query.requesterType = requesterType;

  const tickets = await SupportTicket.find(query)
    .populate("seller", "sellerName storeName")
    .populate("customer", "name email phone")
    .sort({ updatedAt: -1 });

  return res.status(200).json({ success: true, message: "Tickets fetched successfully", data: tickets });
});

export const getTicketByIdAdmin = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await SupportTicket.findById(req.params.id)
    .populate("seller", "sellerName storeName email mobile")
    .populate("customer", "name email phone");
  if (!ticket) {
    return res.status(404).json({ success: false, message: "Ticket not found" });
  }
  return res.status(200).json({ success: true, message: "Ticket fetched successfully", data: ticket });
});

export const replyToTicketAsAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { message, attachments, status, priority } = req.body;

  if (status && !(TICKET_STATUSES as readonly string[]).includes(status)) {
    return res.status(400).json({ success: false, message: `Status must be one of: ${TICKET_STATUSES.join(", ")}` });
  }
  if (priority && !["Low", "Medium", "High", "Critical"].includes(priority)) {
    return res.status(400).json({ success: false, message: "Priority must be Low, Medium, High or Critical" });
  }

  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) {
    return res.status(404).json({ success: false, message: "Ticket not found" });
  }

  const hasMessage = !!(message && message.trim());
  if (hasMessage) {
    ticket.messages.push({
      sender: "Admin",
      message: message.trim(),
      attachments: cleanAttachments(attachments),
      createdAt: new Date(),
    });
  }

  if (priority) applyPriority(ticket, priority);

  let statusChanged = false;
  if (status) {
    statusChanged = setStatus(ticket, status, "Admin");
  } else if (hasMessage && ticket.status === "Open") {
    // The support team picking up a fresh ticket moves it out of "Ticket Created".
    statusChanged = setStatus(ticket, "Assigned", "System");
  }

  await ticket.save();

  const resolved = statusChanged && ticket.status === "Resolved";
  await notifyRequester(
    ticket,
    resolved ? "Your ticket is resolved" : hasMessage ? "New reply from support" : "Ticket status updated",
    hasMessage
      ? `${message.trim()}${resolved ? "\n\nPlease rate your experience from Track Ticket." : ""}`
      : resolved
        ? "We have resolved your ticket. Please rate your experience from Track Ticket."
        : `Your ticket is now: ${STATUS_LABELS[ticket.status]}.`
  );

  return res.status(200).json({
    success: true,
    message: statusChanged && !hasMessage ? `Ticket moved to ${STATUS_LABELS[ticket.status]}` : "Reply sent",
    data: ticket,
  });
});

/** Admin moves a ticket up one escalation level (Support Manager → Senior Admin → Grievance Officer). */
export const escalateTicketAsAdmin = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
  const reason = String(req.body.reason || "").trim().slice(0, 300);
  if (!escalateTicket(ticket, "Admin", reason || undefined)) {
    return res.status(400).json({ success: false, message: "This ticket is already with the Grievance Officer" });
  }
  await ticket.save();
  await notifyRequester(ticket, "Your ticket was escalated", `Your ticket is now with our ${levelName(ticket.escalationLevel)} for a closer look.`);
  return res.status(200).json({ success: true, message: `Escalated to ${levelName(ticket.escalationLevel)}`, data: ticket });
});
