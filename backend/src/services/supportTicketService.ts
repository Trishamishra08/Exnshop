import SupportTicket, { ISupportTicket, SLA_MINUTES, TicketStatus } from "../models/SupportTicket";
import Customer from "../models/Customer";
import { sendBroadcastNotification, sendNotification } from "./notificationService";
import { sendTicketEmail } from "./emailService";
import { sendTicketSms } from "./otpService";

/**
 * Support ticket rules shared by the customer, seller and admin sides:
 *  - SLA: every ticket has a resolution target by priority (Critical 30m · High 2h · Medium 6h · Low 24h).
 *  - Escalation: a ticket that misses its deadline moves up a level, each with its own deadline.
 *  - Resolved tickets close by themselves after AUTO_CLOSE_DAYS unless the requester reacts.
 */

export const ESCALATION_LEVELS = [
  { level: 0, name: "Support Executive", hours: 0 },
  { level: 1, name: "Support Manager", hours: 4 },
  { level: 2, name: "Senior Admin", hours: 8 },
  { level: 3, name: "Grievance Officer", hours: 24 },
] as const;

export const MAX_LEVEL = ESCALATION_LEVELS.length - 1;
export const AUTO_CLOSE_DAYS = 3;
/** How long after resolution / closure a customer may still appeal. */
export const APPEAL_WINDOW_DAYS = 7;

export const levelName = (level: number) => ESCALATION_LEVELS[Math.min(Math.max(level, 0), MAX_LEVEL)].name;

type Actor = "Seller" | "Customer" | "Admin" | "System";

export const setTicketStatus = (ticket: ISupportTicket, status: TicketStatus, by: Actor, note?: string) => {
  if (ticket.status === status) return false;
  ticket.status = status;
  ticket.statusHistory.push({ status, by, note, at: new Date() });
  if (status === "Resolved") ticket.resolvedAt = new Date();
  if (status === "Closed") ticket.closedAt = new Date();
  return true;
};

/** New priority re-bases the resolution target while the ticket is still with the first level. */
export const applyPriority = (ticket: ISupportTicket, priority: ISupportTicket["priority"]) => {
  if (!SLA_MINUTES[priority] || ticket.priority === priority) return false;
  ticket.priority = priority;
  if (ticket.escalationLevel === 0) {
    ticket.slaDueAt = new Date(new Date(ticket.createdAt || Date.now()).getTime() + SLA_MINUTES[priority] * 60000);
    ticket.levelDueAt = ticket.slaDueAt;
  }
  return true;
};

/** Moves the ticket one level up (reopening it if it was resolved/closed). Returns false at the last level. */
export const escalateTicket = (ticket: ISupportTicket, by: "Customer" | "Admin" | "System", reason?: string) => {
  if (ticket.escalationLevel >= MAX_LEVEL) return false;
  const next = ticket.escalationLevel + 1;
  ticket.escalationLevel = next;
  ticket.levelDueAt = new Date(Date.now() + ESCALATION_LEVELS[next].hours * 3600 * 1000);
  ticket.escalationHistory.push({ level: next, by, reason, at: new Date() });
  if (ticket.status === "Resolved" || ticket.status === "Closed") {
    setTicketStatus(ticket, "In Progress", by, "Reopened on escalation");
    ticket.closedAt = undefined;
    ticket.resolvedAt = undefined;
  }
  return true;
};

const trackLink = (ticket: ISupportTicket) => {
  const base = (process.env.FRONTEND_URL || process.env.CLIENT_URL || "").replace(/\/$/, "");
  return base ? `${base}/account/support-tickets/${ticket._id}` : undefined;
};

/** Tells whoever raised the ticket: in-app for all, plus email and SMS for customers. Never throws. */
export const notifyRequester = async (ticket: ISupportTicket, title: string, message: string) => {
  const number = ticket.ticketNumber || "";
  try {
    if (ticket.requesterType === "Customer" && ticket.customer) {
      const customerId = String(ticket.customer);
      sendNotification("Customer", customerId, `${title}${number ? ` (${number})` : ""}`, message, {
        type: "Info",
        priority: "Medium",
        link: `/account/support-tickets/${ticket._id}`,
      }).catch((e) => console.error("[Ticket] in-app notify failed:", e?.message));

      if (ticket.requesterEmail) {
        sendTicketEmail(ticket.requesterEmail, number, title, message, trackLink(ticket)).catch(() => undefined);
      }
      const c: any = await Customer.findById(customerId).select("phone").lean();
      if (c?.phone) sendTicketSms(String(c.phone), `Exnshop ticket ${number}: ${title}. ${message}`.slice(0, 160)).catch(() => undefined);
    } else if (ticket.seller) {
      await sendNotification("Seller", String(ticket.seller), `Support Ticket Update: ${ticket.subject}`, message, {
        type: "Info",
        priority: "Medium",
        link: "/seller/support-tickets",
      });
    }
  } catch (err: any) {
    console.error("[Ticket] notifyRequester failed:", err?.message);
  }
};

const notifyAdmins = (title: string, message: string, priority: "Medium" | "High" = "High") =>
  sendBroadcastNotification("Admin", title, message, { type: "Warning", priority, link: "/admin/support-tickets" }).catch((e) =>
    console.error("[Ticket] admin notify failed:", e?.message)
  );

/**
 * Run every few minutes:
 *  1. resolved tickets nobody reacted to are closed automatically;
 *  2. open tickets past their level deadline are escalated (a ticket waiting on the requester is paused).
 */
export const runTicketSweep = async () => {
  const now = new Date();

  const stale = await SupportTicket.find({
    status: "Resolved",
    resolvedAt: { $lt: new Date(now.getTime() - AUTO_CLOSE_DAYS * 86400000) },
  });
  for (const t of stale) {
    setTicketStatus(t, "Closed", "System", `Closed automatically after ${AUTO_CLOSE_DAYS} days`);
    await t.save();
    await notifyRequester(t, "Ticket closed", `Your ticket was closed automatically. If the problem is not fixed, you can reopen it from Track Ticket within ${APPEAL_WINDOW_DAYS} days.`);
  }

  const overdue = await SupportTicket.find({
    status: { $in: ["Open", "Assigned", "In Progress"] },
    levelDueAt: { $lt: now },
  });
  for (const t of overdue) {
    t.slaBreached = true;
    if (escalateTicket(t, "System", "Deadline missed")) {
      await t.save();
      await notifyAdmins(
        `Ticket ${t.ticketNumber || ""} escalated to ${levelName(t.escalationLevel)}`,
        `${t.requesterName || "A user"} · ${t.subject} — the ${t.priority}-priority deadline was missed.`
      );
      await notifyRequester(t, "Your ticket was escalated", `We are sorry for the delay. Your ticket is now with our ${levelName(t.escalationLevel)}.`);
    } else {
      // Already with the Grievance Officer: remind every 24h.
      t.levelDueAt = new Date(now.getTime() + 24 * 3600 * 1000);
      await t.save();
      await notifyAdmins(`Grievance ticket overdue: ${t.ticketNumber || ""}`, `${t.subject} is still unresolved at the final level.`);
    }
  }
  return { autoClosed: stale.length, escalated: overdue.length };
};
