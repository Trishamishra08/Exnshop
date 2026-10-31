import Seller from "../models/Seller";
import SellerAuditLog from "../models/SellerAuditLog";
import { auditSeller, effectiveStatus, notifyAdmins, notifySeller } from "./sellerOnboardingService";
import { queueSellerPickupSync } from "./shiprocketService";

/**
 * Profile, store and bank changes of an approved seller wait for admin approval.
 * The approved details stay live (and are what customers, payouts and couriers use)
 * until an admin approves; every request and decision is kept in the seller's audit
 * trail with the old and new value, so all activity can be traced later.
 */

/** Sellers whose details were already verified; their changes need approval. */
export const changesNeedApproval = (seller: any) => ["Approved", "Active"].includes(effectiveStatus(seller));

/** Settings a seller may still change on their own (preferences, not business details). */
const INSTANT_FIELDS = new Set(["notificationPreferences", "preferredLanguage", "language"]);

/** Fields never accepted through a change request, whatever the client sends. */
const NEVER_FIELDS = new Set(["_id", "__v", "pendingProfileChange", "createdAt", "updatedAt"]);

const FIELD_LABELS: Record<string, string> = {
  sellerName: "Owner name",
  storeName: "Store name",
  storeDescription: "Store description",
  logo: "Store logo",
  address: "Pickup address",
  returnAddress: "Return address",
  city: "City",
  searchLocation: "Location",
  latitude: "Latitude",
  longitude: "Longitude",
  location: "Map location",
  serviceRadiusKm: "Service radius (km)",
  accountName: "Account holder",
  accountNumber: "Account number",
  ifsc: "IFSC",
  bankName: "Bank name",
  branch: "Branch",
  upiId: "UPI ID",
  categories: "Categories",
  category: "Category",
  channels: "Sells via",
};
export const fieldLabel = (f: string) => FIELD_LABELS[f] || f.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

const norm = (v: any) => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const same = (a: any, b: any) => norm(a) === norm(b);

/** Splits an update into what applies now and what waits for approval (only real changes). */
export const splitSellerUpdate = (seller: any, updates: Record<string, any>) => {
  const instant: Record<string, any> = {};
  const review: Record<string, any> = {};
  for (const [field, value] of Object.entries(updates)) {
    if (NEVER_FIELDS.has(field) || value === undefined) continue;
    const top = field.split(".")[0];
    if (!Seller.schema.path(top) && !Seller.schema.path(field)) continue; // unknown fields are ignored on save anyway
    if (INSTANT_FIELDS.has(top) || field.startsWith("onboardingReview")) {
      instant[field] = value;
      continue;
    }
    const liveValue = seller.get ? seller.get(field) : seller[field];
    if (same(liveValue, value)) continue;
    // The form fills an empty return address / location with the pickup address: not a real change.
    if (["returnAddress", "searchLocation"].includes(field) && !norm(liveValue) && same(value, seller.address)) {
      instant[field] = value;
      continue;
    }
    review[field] = value;
  }
  return { instant, review };
};

/**
 * Adds changes to the seller's pending request (merging with any earlier pending ones),
 * records them in the audit trail and tells the admins. Returns the pending data.
 */
export const queueSellerChange = async (seller: any, changes: Record<string, any>, source: string) => {
  const current = { ...(seller.pendingProfileChange?.data || {}) };
  const live = (f: string) => (seller.get ? seller.get(f) : seller[f]);
  for (const [field, value] of Object.entries(changes)) {
    if (same(live(field), value)) delete current[field]; // edited back to the approved value
    else current[field] = value;
  }

  const pending = Object.keys(current).length ? { data: current, submittedAt: new Date() } : undefined;
  await Seller.updateOne({ _id: seller._id }, pending ? { $set: { pendingProfileChange: pending } } : { $unset: { pendingProfileChange: "" } });

  const logged = Object.entries(changes).filter(([f, v]) => !same(live(f), v) && f !== "location");
  if (logged.length) {
    await auditSeller({
      sellerId: seller._id,
      actorType: "Seller",
      actorId: seller._id,
      actorName: seller.sellerName,
      action: "CHANGE_REQUESTED",
      section: source,
      changes: logged.map(([field, to]) => ({ field, from: live(field), to })),
    });
    await notifyAdmins(
      "Seller details changed — approval needed",
      `${seller.storeName || seller.sellerName} changed ${logged.map(([f]) => fieldLabel(f)).join(", ")}. Review it in Seller Change Requests.`
    );
  }
  return pending?.data || null;
};

/** All sellers with changes waiting, oldest first, with the live (old) and requested (new) values. */
export const listPendingSellerChanges = async () => {
  const sellers: any[] = await Seller.find({ "pendingProfileChange.submittedAt": { $exists: true } })
    .select("-password -fcmTokens -fcmTokenMobile")
    .sort({ "pendingProfileChange.submittedAt": 1 })
    .limit(300)
    .lean();
  return sellers.map((s) => {
    const data = s.pendingProfileChange?.data || {};
    return {
      sellerId: String(s._id),
      sellerName: s.sellerName,
      storeName: s.storeName,
      mobile: s.mobile,
      email: s.email,
      submittedAt: s.pendingProfileChange?.submittedAt,
      changes: Object.keys(data)
        .filter((f) => f !== "location")
        .map((field) => ({ field, label: fieldLabel(field), from: s[field] ?? null, to: data[field] })),
    };
  });
};

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

/** Admin approves (applies) or rejects (discards) a seller's pending changes. */
export const decideSellerChange = async (
  sellerId: string,
  decision: "Approved" | "Rejected",
  admin: { id?: string; name?: string },
  remarks?: string
) => {
  if (!["Approved", "Rejected"].includes(decision)) throw fail("Decision must be Approved or Rejected");
  const note = String(remarks || "").trim().slice(0, 500);
  if (decision === "Rejected" && !note) throw fail("Please give a reason so the seller knows what to fix");

  const seller: any = await Seller.findById(sellerId);
  const data = seller?.pendingProfileChange?.data;
  if (!seller || !data || !Object.keys(data).length) throw fail("This seller has no changes waiting", 404);

  const changes = Object.entries(data)
    .filter(([f]) => f !== "location")
    .map(([field, to]) => ({ field, from: seller.get(field), to }));

  if (decision === "Approved") {
    for (const [field, value] of Object.entries(data)) seller.set(field, value);
    // A store pin that moved keeps the map location in step.
    const lat = parseFloat(seller.latitude);
    const lng = parseFloat(seller.longitude);
    if (("latitude" in data || "longitude" in data) && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      seller.location = { type: "Point", coordinates: [lng, lat] };
    }
    // A new bank account has to be verified again before payouts.
    if (["accountName", "accountNumber", "ifsc"].some((f) => f in data)) {
      seller.bankVerificationStatus = "Unverified";
      seller.bankVerificationMethod = undefined;
      seller.bankVerifiedAt = undefined;
      seller.bankVerificationRemarks = undefined;
    }
  }
  seller.pendingProfileChange = undefined;
  await seller.save();

  await auditSeller({
    sellerId: seller._id,
    actorType: "Admin",
    actorId: admin.id,
    actorName: admin.name,
    action: decision === "Approved" ? "CHANGE_APPROVED" : "CHANGE_REJECTED",
    changes,
    remarks: note || undefined,
  });

  if (decision === "Approved" && ["address", "city", "latitude", "longitude", "storeName", "returnAddress"].some((f) => f in data)) {
    queueSellerPickupSync(String(seller._id));
  }
  await notifySeller(
    seller,
    decision === "Approved" ? "Profile changes approved" : "Profile changes not approved",
    decision === "Approved"
      ? `Your changes to ${changes.map((c) => fieldLabel(c.field)).join(", ")} are approved and now live.`
      : `Your requested changes were not approved. ${note}`,
    decision === "Approved" ? "Success" : "Warning"
  );
  return seller;
};

/** Full history of a seller's activity (newest first), for the admin. */
export const sellerHistory = async (sellerId: string) =>
  SellerAuditLog.find({ seller: sellerId }).sort({ createdAt: -1 }).limit(500).lean();
