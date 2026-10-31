import mongoose from "mongoose";
import Delivery from "../models/Delivery";
import DeliveryAuditLog from "../models/DeliveryAuditLog";
import { sendNotification } from "./notificationService";

/**
 * An approved (Active) delivery partner's profile, vehicle and bank changes wait for
 * admin approval; the approved details stay in use until then. Every request and
 * decision is kept in DeliveryAuditLog with the old and new value.
 */

export const DELIVERY_EDITABLE_FIELDS = [
  "name", "email", "address", "city", "vehicleNumber", "vehicleType",
  "bankName", "accountNumber", "ifscCode", "accountName", "upiId",
];

const LABELS: Record<string, string> = {
  name: "Name", email: "Email", address: "Address", city: "City", vehicleNumber: "Vehicle number",
  vehicleType: "Vehicle type", bankName: "Bank name", accountNumber: "Account number", ifscCode: "IFSC",
  accountName: "Account holder", upiId: "UPI ID",
};
export const deliveryFieldLabel = (f: string) => LABELS[f] || f;

/** Account numbers are kept masked in the history. */
const SENSITIVE = new Set(["accountNumber"]);
const fmt = (field: string, v: any) => {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return SENSITIVE.has(field) && s.length > 4 ? `${"•".repeat(s.length - 4)}${s.slice(-4)}` : s;
};
const same = (a: any, b: any) => String(a ?? "").trim() === String(b ?? "").trim();

export const auditDelivery = async (entry: {
  deliveryId: any; actorType: "Delivery" | "Admin" | "System"; actorId?: any; actorName?: string;
  action: string; changes?: Array<{ field: string; from?: any; to?: any }>; remarks?: string;
}) => {
  try {
    await DeliveryAuditLog.create({
      delivery: entry.deliveryId,
      actorType: entry.actorType,
      actorId: entry.actorId && mongoose.isValidObjectId(entry.actorId) ? entry.actorId : undefined,
      actorName: entry.actorName,
      action: entry.action,
      remarks: entry.remarks,
      changes: (entry.changes || []).map((c) => ({ field: c.field, from: fmt(c.field, c.from), to: fmt(c.field, c.to) })),
    });
  } catch (err) {
    console.error("[DeliveryAudit] write failed:", err);
  }
};

/** Partner edits their details: applied straight away before approval, queued for the admin after. */
export const submitDeliveryChanges = async (deliveryId: string, input: Record<string, any>) => {
  const delivery: any = await Delivery.findById(deliveryId);
  if (!delivery) throw Object.assign(new Error("Delivery partner not found"), { statusCode: 404 });

  const changes: Record<string, any> = {};
  for (const f of DELIVERY_EDITABLE_FIELDS) {
    if (input[f] === undefined) continue;
    let v = typeof input[f] === "string" ? input[f].trim() : input[f];
    if (f === "ifscCode" && v) v = String(v).toUpperCase();
    if (f !== "upiId" && (v === "" || v === null)) continue; // blank keeps the saved value
    if (!same(delivery[f], v)) changes[f] = v;
  }
  if (!Object.keys(changes).length) return { delivery, queued: false };

  const logged = Object.entries(changes).map(([field, to]) => ({ field, from: delivery[field], to }));

  // Not approved yet: the admin reviews everything at activation anyway.
  if (delivery.status !== "Active") {
    Object.assign(delivery, changes);
    await delivery.save();
    await auditDelivery({ deliveryId, actorType: "Delivery", actorId: deliveryId, actorName: delivery.name, action: "PROFILE_UPDATED", changes: logged });
    return { delivery, queued: false };
  }

  const pending = { ...(delivery.pendingProfileChange?.data || {}), ...changes };
  for (const [f, v] of Object.entries(pending)) if (same(delivery[f], v)) delete pending[f];
  delivery.pendingProfileChange = Object.keys(pending).length ? { data: pending, submittedAt: new Date() } : undefined;
  await delivery.save();
  await auditDelivery({ deliveryId, actorType: "Delivery", actorId: deliveryId, actorName: delivery.name, action: "CHANGE_REQUESTED", changes: logged });

  try {
    const { sendBroadcastNotification } = await import("./notificationService");
    await sendBroadcastNotification(
      "Admin",
      "Delivery partner details changed — approval needed",
      `${delivery.name} changed ${Object.keys(changes).map(deliveryFieldLabel).join(", ")}. Review it in Delivery Change Requests.`,
      { type: "Info", priority: "High", link: "/admin/delivery-change-requests" },
    );
  } catch { /* notification is best-effort */ }
  return { delivery, queued: true };
};

export const listPendingDeliveryChanges = async () => {
  const rows: any[] = await Delivery.find({ "pendingProfileChange.submittedAt": { $exists: true } })
    .select("name mobile email pendingProfileChange " + DELIVERY_EDITABLE_FIELDS.join(" "))
    .sort({ "pendingProfileChange.submittedAt": 1 })
    .lean();
  return rows.map((d) => ({
    deliveryId: String(d._id),
    name: d.name,
    mobile: d.mobile,
    submittedAt: d.pendingProfileChange?.submittedAt,
    changes: Object.entries(d.pendingProfileChange?.data || {}).map(([field, to]) => ({
      field, label: deliveryFieldLabel(field), from: d[field] ?? null, to,
    })),
  }));
};

export const decideDeliveryChange = async (
  deliveryId: string, decision: "Approved" | "Rejected", admin: { id?: string; name?: string }, remarks?: string,
) => {
  const fail = (m: string, c = 400) => Object.assign(new Error(m), { statusCode: c });
  if (!["Approved", "Rejected"].includes(decision)) throw fail("Decision must be Approved or Rejected");
  const note = String(remarks || "").trim().slice(0, 500);
  if (decision === "Rejected" && !note) throw fail("Please give a reason");

  const delivery: any = await Delivery.findById(deliveryId);
  const data = delivery?.pendingProfileChange?.data;
  if (!delivery || !data || !Object.keys(data).length) throw fail("No changes waiting for this partner", 404);

  const changes = Object.entries(data).map(([field, to]) => ({ field, from: delivery[field], to }));
  if (decision === "Approved") Object.assign(delivery, data);
  delivery.pendingProfileChange = undefined;
  await delivery.save();

  await auditDelivery({
    deliveryId, actorType: "Admin", actorId: admin.id, actorName: admin.name,
    action: decision === "Approved" ? "CHANGE_APPROVED" : "CHANGE_REJECTED", changes, remarks: note || undefined,
  });
  await sendNotification(
    "Delivery", deliveryId,
    decision === "Approved" ? "Profile changes approved" : "Profile changes not approved",
    decision === "Approved"
      ? `Your changes to ${changes.map((c) => deliveryFieldLabel(c.field)).join(", ")} are approved.`
      : `Your requested changes were not approved. ${note}`,
    { type: decision === "Approved" ? "Success" : "Warning", link: "/delivery/profile", priority: "Medium" },
  ).catch(() => undefined);
  return delivery;
};

export const deliveryHistory = async (deliveryId: string) =>
  DeliveryAuditLog.find({ delivery: deliveryId }).sort({ createdAt: -1 }).limit(500).lean();
