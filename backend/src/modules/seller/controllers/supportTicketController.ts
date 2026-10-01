import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import SupportTicket from "../../../models/SupportTicket";
import { sendNotification } from "../../../services/notificationService";

export const createTicket = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { category, priority, subject, description } = req.body;

  if (!subject || !description) {
    return res.status(400).json({
      success: false,
      message: "Subject and description are required",
    });
  }

  const ticket = await SupportTicket.create({
    seller: sellerId,
    category: category || "Other",
    priority: priority || "Medium",
    subject,
    description,
    status: "Open",
    messages: [],
  });

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

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: "Message is required" });
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
    message: message.trim(),
    attachments: Array.isArray(attachments) ? attachments : [],
    createdAt: new Date(),
  });
  // A seller reply on a resolved ticket reopens it for the support team.
  if (ticket.status === "Resolved") ticket.status = "Open";
  await ticket.save();

  return res.status(200).json({ success: true, message: "Reply sent", data: ticket });
});

// ==================== Admin ====================

export const getAllTickets = asyncHandler(async (req: Request, res: Response) => {
  const { status, priority } = req.query;
  const query: any = {};
  if (status) query.status = status;
  if (priority) query.priority = priority;

  const tickets = await SupportTicket.find(query)
    .populate("seller", "sellerName storeName")
    .sort({ updatedAt: -1 });

  return res.status(200).json({ success: true, message: "Tickets fetched successfully", data: tickets });
});

export const getTicketByIdAdmin = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await SupportTicket.findById(req.params.id).populate(
    "seller",
    "sellerName storeName email mobile"
  );
  if (!ticket) {
    return res.status(404).json({ success: false, message: "Ticket not found" });
  }
  return res.status(200).json({ success: true, message: "Ticket fetched successfully", data: ticket });
});

export const replyToTicketAsAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { message, attachments, status } = req.body;

  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) {
    return res.status(404).json({ success: false, message: "Ticket not found" });
  }

  if (message && message.trim()) {
    ticket.messages.push({
      sender: "Admin",
      message: message.trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      createdAt: new Date(),
    });
  }

  if (status && ["Open", "In Progress", "Resolved", "Closed"].includes(status)) {
    ticket.status = status;
  }

  await ticket.save();

  sendNotification(
    "Seller",
    ticket.seller.toString(),
    `Support Ticket Update: ${ticket.subject}`,
    message?.trim() || `Your ticket status changed to ${ticket.status}.`,
    { type: "Info", priority: "Medium" }
  ).catch((err) => console.error("Failed to send support ticket notification:", err));

  return res.status(200).json({ success: true, message: "Reply sent", data: ticket });
});
