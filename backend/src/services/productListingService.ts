import mongoose from "mongoose";
import Product, { IProduct } from "../models/Product";
import Seller from "../models/Seller";
import Admin from "../models/Admin";
import ProductAuditLog from "../models/ProductAuditLog";
import { attributeProblems, idOf, resolveListingConfig } from "./listingConfigService";

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
  // Set by the listing workflow itself
  "listingVersion",
  "listingMethod",
  "qualityFlags",
  "complianceDocs",
  "reviewStartedAt",
  "reviewStartedBy",
  "reviewStartedByName",
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
  "modelNumber",
  "barcode",
  "condition",
  "attributes",
  "hsnCode",
];

const ID_FIELDS = new Set(["category", "subcategory", "subSubCategory", "headerCategoryId", "brand", "tax", "shopId"]);

export const stripProtectedFields = <T extends Record<string, any>>(body: T): T => {
  const clean: Record<string, any> = { ...body };
  for (const f of PROTECTED_FIELDS) delete clean[f];
  return clean as T;
};

const sortKeys = (v: any): any =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
      : v;

const norm = (v: any): string => {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return v.map(norm).join("|");
  if (typeof v === "object") return v._id ? String(v._id) : JSON.stringify(sortKeys(v.toObject ? v.toObject() : v));
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

const HSN_REGEX = /^\d{4}(\d{2}(\d{2})?)?$/;
const CONDITIONS = ["New", "Used", "Refurbished"];

/**
 * Coerces and validates the listing fields added by the guided flow, in place.
 * Returns an error message for a value that is present but invalid, else null.
 * (Missing values are the business of listingProblems, so drafts can be partial.)
 */
export const normalizeListingFields = (data: Record<string, any>): string | null => {
  if (data.condition !== undefined && data.condition !== "" && !CONDITIONS.includes(data.condition)) {
    return "Condition must be New, Used or Refurbished";
  }
  if (data.condition === "") delete data.condition;

  if (data.hsnCode !== undefined) {
    data.hsnCode = String(data.hsnCode || "").replace(/\s/g, "");
    if (data.hsnCode && !HSN_REGEX.test(data.hsnCode)) return "HSN code must be 4, 6 or 8 digits";
    if (!data.hsnCode) data.hsnCode = undefined;
  }
  if (data.modelNumber !== undefined) data.modelNumber = String(data.modelNumber || "").trim().slice(0, 80) || undefined;
  if (data.barcode !== undefined) {
    data.barcode = String(data.barcode || "").trim();
    if (data.barcode && !/^[0-9A-Za-z-]{4,20}$/.test(data.barcode)) return "Barcode / GTIN must be 4–20 letters or digits";
    if (!data.barcode) data.barcode = undefined;
  }

  const num = (v: any) => (v === "" || v === null || v === undefined ? undefined : Number(v));
  if (data.weightGrams !== undefined) {
    const w = num(data.weightGrams);
    if (w !== undefined && (!Number.isFinite(w) || w <= 0 || w > 100000)) return "Weight must be between 1 g and 100 kg";
    data.weightGrams = w;
  }
  if (data.dimensionsCm !== undefined) {
    const d = data.dimensionsCm || {};
    const dims = { length: num(d.length), width: num(d.width), height: num(d.height) };
    for (const [k, v] of Object.entries(dims)) {
      if (v !== undefined && (!Number.isFinite(v) || v <= 0 || v > 500)) return `Package ${k} must be between 0.1 and 500 cm`;
    }
    data.dimensionsCm = dims.length || dims.width || dims.height ? dims : undefined;
  }
  if (data.handlingTimeDays !== undefined) {
    const h = num(data.handlingTimeDays);
    if (h !== undefined && (!Number.isInteger(h) || h < 0 || h > 30)) return "Handling time must be a whole number of days (0–30)";
    data.handlingTimeDays = h;
  }
  return null;
};

export interface ListingContext {
  seller?: any;
  configs: Map<string, Awaited<ReturnType<typeof resolveListingConfig>>>;
}
export const newListingContext = (): ListingContext => ({ configs: new Map() });

/** A product sold under a brand needs proof the seller may sell that brand. */
export const BRAND_AUTH_DOC = {
  key: "brand_authorization",
  label: "Brand authorization (authorization letter, trademark certificate or distributor invoice)",
};

export const configForProduct = async (p: any, ctx?: ListingContext) => {
  const scope = {
    headerCategoryId: idOf(p.headerCategoryId),
    category: idOf(p.category),
    subcategory: idOf(p.subcategory),
    subSubCategory: idOf(p.subSubCategory),
  };
  const key = JSON.stringify(scope);
  let config = ctx?.configs.get(key);
  if (!config) {
    config = await resolveListingConfig(scope);
    ctx?.configs.set(key, config);
  }
  if (!p.brand) return config;
  // Branded product: the brand document joins the category's own required documents.
  return {
    ...config,
    rule: {
      ...config.rule,
      requiredDocs: [...config.rule.requiredDocs.filter((d) => d.key !== BRAND_AUTH_DOC.key), BRAND_AUTH_DOC],
    },
  };
};

const brandDocProblem = (p: any): string | null => {
  if (!p.brand) return null;
  const doc = (p.complianceDocs || []).find((d: any) => d.docType === BRAND_AUTH_DOC.key);
  if (!doc) return "Document: Brand authorization";
  if (doc.status === "Rejected") return "Document: Brand authorization (the uploaded one was rejected)";
  return null;
};

/**
 * Everything blocking a submission. Legacy products (no listingVersion) only
 * face the core checks; products from the guided flow also need attributes,
 * HSN (GST-registered sellers), shipping details (E-Commerce) and, for
 * regulated categories, their compliance documents.
 */
export const listingProblems = async (p: any, ctx?: ListingContext): Promise<string[]> => {
  const problems = submissionProblems(p);
  if (!(p.listingVersion >= 2)) {
    // Older/classic-form products skip the guided checks, but never the brand document.
    const brandProblem = brandDocProblem(p);
    return brandProblem ? [...problems, brandProblem] : problems;
  }

  const sellerId = idOf(p.seller);
  let seller = ctx?.seller;
  if (!seller || String(seller._id) !== sellerId) {
    seller = await Seller.findById(sellerId).select("gstRegistered channels");
    if (ctx) ctx.seller = seller;
  }
  const config = await configForProduct(p, ctx);

  const missingAttrs = attributeProblems(config.attributes, p.attributes);
  missingAttrs.forEach((label) => problems.push(`Attribute: ${label}`));

  if (seller?.gstRegistered === true && !p.hsnCode) problems.push("HSN code");

  if ((seller?.channels || []).includes("ECommerce")) {
    if (!(Number(p.weightGrams) > 0)) problems.push("Package weight");
    const d = p.dimensionsCm || {};
    if (!(Number(d.length) > 0 && Number(d.width) > 0 && Number(d.height) > 0)) problems.push("Package dimensions (L × W × H)");
  }

  for (const req of config.rule.requiredDocs) {
    const doc = (p.complianceDocs || []).find((d: any) => d.docType === req.key);
    if (!doc) problems.push(`Document: ${req.label}`);
    else if (doc.status === "Rejected") problems.push(`Document: ${req.label} (the uploaded one was rejected)`);
  }
  return problems;
};

/** Non-blocking warnings from automated checks, for the reviewer to weigh. */
export const computeQualityFlags = async (p: any): Promise<string[]> => {
  const flags: string[] = [];
  const name = String(p.productName || "").trim();
  const letters = name.replace(/[^A-Za-z]/g, "");
  if (name.length < 10) flags.push("Very short product title");
  if (letters.length >= 8 && letters === letters.toUpperCase()) flags.push("Title is in ALL CAPS");
  if (!String(p.description || "").trim() && !String(p.smallDescription || "").trim()) flags.push("No description");
  if (!(p.galleryImages || []).length) flags.push("Only one image");

  const variations: any[] = p.variations || [];
  const deepDiscount = variations.some((v) => Number(v.price) > 0 && Number(v.discPrice) > 0 && Number(v.discPrice) < Number(v.price) * 0.3);
  if (deepDiscount) flags.push("Discount above 70%");

  const dupe: any = await Product.findOne({
    seller: idOf(p.seller),
    ...(p._id ? { _id: { $ne: p._id } } : {}),
    status: { $ne: "Draft" },
    productName: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  }).select("productName");
  if (dupe) flags.push(`Possible duplicate of another of this seller's products ("${dupe.productName}")`);
  return flags;
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
  // Seller-facing: no storage ids, no internal reviewer notes.
  if (Array.isArray(obj.complianceDocs)) {
    obj.complianceDocs = obj.complianceDocs.map(({ publicId, resourceType, ...rest }: any) => rest);
  }
  delete obj.qualityFlags;
  delete obj.reviewStartedBy;
  delete obj.reviewStartedByName;
  return obj;
};

/** Who an admin request is from, for the audit trail and "under review by". */
export const adminActorOf = async (req: any) => {
  const adminId = req.user?.userId;
  const admin = adminId ? await Admin.findById(adminId).select("firstName lastName email") : null;
  return {
    actorType: "Admin" as const,
    actorId: adminId,
    actorName: admin ? `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || admin.email : "Admin",
  };
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
