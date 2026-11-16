import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import SupportTicket from "../../../models/SupportTicket";
import { sendBroadcastNotification } from "../../../services/notificationService";
import {
  APPEAL_WINDOW_DAYS,
  ESCALATION_LEVELS,
  MAX_LEVEL,
  escalateTicket,
  levelName,
  notifyRequester,
  setTicketStatus,
} from "../../../services/supportTicketService";

/** A customer only ever sees their own tickets. */
const findOwn = (req: Request) =>
  SupportTicket.findOne({ _id: req.params.id, customer: req.user!.userId, requesterType: "Customer" });

const toView = (ticket: any) => ({
  ...ticket.toObject(),
  levelName: levelName(ticket.escalationLevel),
  levels: ESCALATION_LEVELS,
});

const notifyAdmins = (title: string, message: string) =>
  sendBroadcastNotification("Admin", title, message, { type: "Info", priority: "High", link: "/admin/support-tickets" }).catch((e) =>
    console.error("[Ticket] admin notify failed:", e?.message)
  );

/** GET /customer/support/tickets */
export const listMyTickets = asyncHandler(async (req: Request, res: Response) => {
  const tickets = await SupportTicket.find({ customer: req.user!.userId, requesterType: "Customer" })
    .select("ticketNumber subject category priority status escalationLevel slaDueAt levelDueAt slaBreached rating createdAt updatedAt")
    .sort({ updatedAt: -1 })
    .limit(100);
  return res.json({ success: true, data: tickets });
});

/** GET /customer/support/tickets/:id */
export const getMyTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await findOwn(req);
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
  return res.json({ success: true, data: toView(ticket) });
});

/** POST /customer/support/tickets/:id/reply  { message } — also the answer to "more information needed". */
export const replyToMyTicket = asyncHandler(async (req: Request, res: Response) => {
  const message = String(req.body.message || "").trim();
  if (message.length < 2 || message.length > 2000) {
    return res.status(400).json({ success: false, message: "Write a message of up to 2000 characters" });
  }
  const ticket = await findOwn(req);
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
  if (ticket.status === "Closed") {
    return res.status(400).json({ success: false, message: "This ticket is closed. Use 'Not satisfied? Reopen' to continue." });
  }

  ticket.messages.push({ sender: "Customer", message, attachments: [], createdAt: new Date() });
  if (ticket.status === "Waiting") setTicketStatus(ticket, "In Progress", "Customer", "Customer replied");
  else if (ticket.status === "Resolved") setTicketStatus(ticket, "In Progress", "Customer", "Reopened by customer reply");
  await ticket.save();

  notifyAdmins(`Customer replied on ${ticket.ticketNumber || "a ticket"}`, `${ticket.requesterName || "Customer"} · ${ticket.subject}`);
  return res.json({ success: true, message: "Reply sent", data: toView(ticket) });
});

/** POST /customer/support/tickets/:id/rate  { stars: 1-5, feedback? } — rating a resolved ticket closes it. */
export const rateMyTicket = asyncHandler(async (req: Request, res: Response) => {
  const stars = Number(req.body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ success: false, message: "Choose a rating from 1 to 5 stars" });
  }
  const ticket = await findOwn(req);
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });
  if (!["Resolved", "Closed"].includes(ticket.status)) {
    return res.status(400).json({ success: false, message: "You can rate a ticket once it is resolved" });
  }
  if (ticket.rating?.stars) return res.status(400).json({ success: false, message: "You have already rated this ticket" });

  ticket.rating = { stars, feedback: String(req.body.feedback || "").trim().slice(0, 500) || undefined, at: new Date() };
  setTicketStatus(ticket, "Closed", "Customer", "Closed after customer feedback");
  await ticket.save();

  if (stars <= 2) {
    notifyAdmins(`Low rating (${stars}★) on ${ticket.ticketNumber || "a ticket"}`, `${ticket.requesterName || "Customer"}: ${ticket.rating.feedback || ticket.subject}`);
  }
  return res.json({ success: true, message: "Thanks for your feedback", data: toView(ticket) });
});

/**
 * POST /customer/support/tickets/:id/escalate  { reason }
 * The customer's appeal: a late ticket moves up a level, a resolved/closed one (within 7 days)
 * is reopened one level higher.
 */
export const appealMyTicket = asyncHandler(async (req: Request, res: Response) => {
  const reason = String(req.body.reason || "").trim().slice(0, 300);
  if (reason.length < 5) return res.status(400).json({ success: false, message: "Tell us briefly what is still wrong" });

  const ticket = await findOwn(req);
  if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

  const finished = ticket.status === "Resolved" || ticket.status === "Closed";
  if (finished) {
    const since = new Date(ticket.closedAt || ticket.resolvedAt || ticket.updatedAt).getTime();
    if (Date.now() - since > APPEAL_WINDOW_DAYS * 86400000) {
      return res.status(400).json({ success: false, message: `Appeals are accepted within ${APPEAL_WINDOW_DAYS} days. Please raise a new ticket.` });
    }
  } else if (ticket.levelDueAt && ticket.levelDueAt.getTime() > Date.now() && ticket.status !== "Waiting") {
    return res.status(400).json({ success: false, message: "Our team is still within the promised time for this ticket" });
  }

  if (!escalateTicket(ticket, "Customer", reason)) {
    if (!finished) return res.status(400).json({ success: false, message: "Your ticket is already with our Grievance Officer" });
    // Final level: reopen it for the Grievance Officer to look at again.
    setTicketStatus(ticket, "In Progress", "Customer", "Appeal at final level");
    ticket.levelDueAt = new Date(Date.now() + ESCALATION_LEVELS[MAX_LEVEL].hours * 3600 * 1000);
    ticket.escalationHistory.push({ level: MAX_LEVEL, by: "Customer", reason, at: new Date() });
    ticket.closedAt = undefined;
    ticket.resolvedAt = undefined;
  }
  ticket.messages.push({ sender: "Customer", message: `Appeal: ${reason}`, attachments: [], createdAt: new Date() });
  ticket.slaBreached = ticket.slaBreached || !finished;
  await ticket.save();

  notifyAdmins(`Customer appeal on ${ticket.ticketNumber || "a ticket"} → ${levelName(ticket.escalationLevel)}`, `${ticket.requesterName || "Customer"}: ${reason}`);
  await notifyRequester(ticket, "Your appeal was received", `Your ticket is now with our ${levelName(ticket.escalationLevel)}.`);
  return res.json({ success: true, message: `Escalated to ${levelName(ticket.escalationLevel)}`, data: toView(ticket) });
});
