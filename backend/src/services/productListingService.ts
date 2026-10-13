import mongoose from "mongoose";
import Product, { IProduct } from "../models/Product";
import Seller from "../models/Seller";
import ProductAuditLog from "../models/ProductAuditLog";

// ── Field rules ─────────────────────────────────────────────

/** Fields only the system / admins may set. Sellers can never write these. */
export const PROTECTED_FIELDS = [
  "_id",
  "id",
  "seller",
  "sellerId",
  "status",
  "requiresApproval",
  "approvedBy",
  "approvedAt",
  "rejectionReason",
  "pendingRevision",
  "commission",
  "rating",
  "reviewsCount",
  "discount",
  "translations",
  "createdAt",
  "updatedAt",
  "__v",
];

/**
 * Customer-facing identity of a listing. Changing these on a live product goes
 * back to admin review (the approved version stays live meanwhile). Price,
 * stock, discounts, publishing and SEO stay free for sellers to change.
 */
export const MATERIAL_FIELDS = [
  "productName",
  "smallDescription",
  "description",
  "category",
  "subcategory",
  "subSubCategory",
  "headerCategoryId",
  "brand",
  "mainImage",
  "galleryImages",
  "manufacturer",
  "madeIn",
  "fssaiLicNo",
  "variationType",
  "tax",
  "isReturnable",
  "maxReturnDays",
  "returnPolicyText",
  "isShopByStoreOnly",
  "shopId",
];

const ID_FIELDS = new Set(["category", "subcategory", "subSubCategory", "headerCategoryId", "brand", "tax", "shopId"]);

export const stripProtectedFields = <T extends Record<string, any>>(body: T): T => {
  const clean: Record<string, any> = { ...body };
  for (const f of PROTECTED_FIELDS) delete clean[f];
  return clean as T;
};

const norm = (v: any): string => {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.map(norm).join("|");
  if (typeof v === "object") return v._id ? String(v._id) : JSON.stringify(v);
  return String(v);
};

export const sameValue = (a: any, b: any) => norm(a) === norm(b);

/** The subset of `incoming` material fields that differ from the product's current values. */
export const materialChanges = (product: any, incoming: Record<string, any>) => {
  const changed: Record<string, any> = {};
  for (const f of MATERIAL_FIELDS) {
    if (incoming[f] === undefined) continue;
    const value = ID_FIELDS.has(f) && !incoming[f] ? undefined : incoming[f];
    if (!sameValue(product[f], value)) changed[f] = value ?? null;
  }
  return changed;
};

// ── SKUs ────────────────────────────────────────────────────

const randomPart = () => Math.random().toString(36).slice(2, 6).toUpperCase();
export const generateSkuBase = (sellerId: string) => `EXN-${sellerId.slice(-4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}${randomPart()}`;

export interface SkuInput {
  sku?: string;
  variations?: Array<{ sku?: string }>;
}

/** Fills in missing SKUs (product + each variation). Existing ones are kept. */
export const ensureSkus = (sellerId: string, data: SkuInput, existingSku?: string) => {
  const base = (data.sku || existingSku || "").trim() || generateSkuBase(sellerId);
  data.sku = base;
  if (Array.isArray(data.variations)) {
    data.variations.forEach((v, i) => {
      v.sku = (v.sku || "").trim() || `${base}-${i + 1}`;
    });
  }
};

/** Returns an error message if the SKUs repeat inside the product or clash with another of the seller's products. */
export const findSkuProblem = async (sellerId: string, data: SkuInput, excludeProductId?: string): Promise<string | null> => {
  const all = [data.sku, ...(data.variations || []).map((v) => v.sku)].filter(Boolean) as string[];
  const dupe = all.find((s, i) => all.indexOf(s) !== i);
  if (dupe) return `SKU "${dupe}" is used more than once in this product`;

  const clash: any = await Product.findOne({
    seller: sellerId,
    ...(excludeProductId ? { _id: { $ne: excludeProductId } } : {}),
    $or: [{ sku: { $in: all } }, { "variations.sku": { $in: all } }],
  }).select("productName sku variations.sku");
  if (!clash) return null;
  const used = all.find((s) => clash.sku === s || (clash.variations || []).some((v: any) => v.sku === s));
  return `SKU "${used}" is already used by your product "${clash.productName}". SKUs must be unique.`;
};

// ── Completeness ────────────────────────────────────────────

/** What is still missing before a product can be sent for review (empty = ready). */
export const submissionProblems = (p: any): string[] => {
  const problems: string[] = [];
  if (!String(p.productName || "").trim()) problems.push("Product name");
  if (!p.category && !p.isShopByStoreOnly) problems.push("Category");
  if (!p.mainImage) problems.push("Main product image");
  const variations: any[] = p.variations || [];
  if (variations.length === 0) problems.push("At least one variation with a price");
  for (const v of variations) {
    const label = v.value || v.title || v.name || "variation";
    if (!(Number(v.price) > 0)) problems.push(`Price for "${label}"`);
    else if (Number(v.discPrice) > Number(v.price)) problems.push(`Discounted price for "${label}" (must not exceed price)`);
    if (v.stock !== undefined && Number(v.stock) < 0) problems.push(`Stock for "${label}"`);
  }
  if (variations.length === 0 && !(Number(p.price) > 0)) problems.push("Price");
  if (!p.sku) problems.push("SKU");
  return problems;
};

export const describeProblems = (problems: string[]) => `This product isn't ready to submit. Missing or invalid: ${problems.join(", ")}.`;

// ── Seller's own view of a product (with its pending revision merged in) ──

export const ownerView = (product: any) => {
  const obj = typeof product.toObject === "function" ? product.toObject() : { ...product };
  const revision = obj.pendingRevision?.data;
  if (revision) {
    for (const [field, value] of Object.entries(revision)) {
      obj[field] = ID_FIELDS.has(field) && value ? { _id: String(value) } : value;
    }
  }
  obj.revisionPending = Boolean(revision && Object.keys(revision).length);
  return obj;
};

// ── Audit trail ─────────────────────────────────────────────

const clip = (v: any) => {
  const s = norm(v);
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
};

export const auditProduct = async (entry: {
  product: Pick<IProduct, "_id" | "seller" | "productName"> | any;
  actorType: "Seller" | "Admin" | "System";
  actorId?: any;
  actorName?: string;
  action: string;
  changes?: Array<{ field: string; from?: any; to?: any }>;
  remarks?: string;
}) => {
  try {
    await ProductAuditLog.create({
      product: entry.product._id,
      seller: entry.product.seller?._id || entry.product.seller,
      productName: entry.product.productName,
      actorType: entry.actorType,
      actorId: entry.actorId && mongoose.isValidObjectId(entry.actorId) ? entry.actorId : undefined,
      actorName: entry.actorName,
      action: entry.action,
      remarks: entry.remarks,
      changes: (entry.changes || []).map((c) => ({ field: c.field, from: clip(c.from), to: clip(c.to) })),
    });
  } catch (err) {
    console.error("[ProductAudit] Failed to write audit entry:", err);
  }
};

export const trackedDiff = (product: any, updates: Record<string, any>, fields: string[]) =>
  fields.filter((f) => updates[f] !== undefined && !sameValue(product[f], updates[f])).map((f) => ({ field: f, from: product[f], to: updates[f] }));

// ── Notifications ───────────────────────────────────────────

export const notifyAdminsProductsSubmitted = async (storeName: string, count: number) => {
  try {
    const { sendBroadcastNotification } = await import("./notificationService");
    await sendBroadcastNotification(
      "Admin",
      count > 1 ? `${count} products awaiting review` : "Product awaiting review",
      `${storeName} submitted ${count > 1 ? `${count} products` : "a product"} for approval.`,
      { type: "Info", priority: "Medium", link: "/admin/product/approvals" }
    );
  } catch (err: any) {
    console.error("[ProductListing] Admin notification failed:", err?.message);
  }
};

/** In-app + push (existing) and an email to the seller about a review decision. */
export const notifySellerProductDecision = async (
  product: any,
  decision: "Approved" | "Rejected",
  remarks?: string,
  kind: "listing" | "edit" = "listing"
) => {
  const sellerId = (product.seller?._id || product.seller)?.toString();
  if (!sellerId) return;
  try {
    const { sendProductApprovalNotification } = await import("./notificationService");
    await sendProductApprovalNotification(sellerId, product._id.toString(), decision, remarks);
  } catch (err: any) {
    console.error("[ProductListing] Seller notification failed:", err?.message);
  }
  try {
    const seller = await Seller.findById(sellerId).select("email");
    if (!seller?.email) return;
    const { sendSellerStatusEmail } = await import("./emailService");
    const what = kind === "edit" ? "your changes to" : "your listing";
    await sendSellerStatusEmail(
      seller.email,
      decision === "Approved" ? `Product approved: ${product.productName}` : `Changes needed: ${product.productName}`,
      decision === "Approved"
        ? `Good news: ${what} "${product.productName}" ${kind === "edit" ? "were" : "was"} approved${kind === "listing" ? " and is now live on Exnshop" : ""}.`
        : `We couldn't approve ${what} "${product.productName}".\n\nReason: ${remarks || "Not specified"}\n\nOpen the product in your seller panel, fix it, and submit it again.`
    );
  } catch (err: any) {
    console.error("[ProductListing] Seller email failed:", err?.message);
  }
};
