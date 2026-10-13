import axios from "axios";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary";
import Seller, {
  ISeller,
  OnboardingStatus,
  ReviewSectionStatus,
  SellerDocumentType,
} from "../models/Seller";
import Product from "../models/Product";
import SellerAuditLog from "../models/SellerAuditLog";
import { apiclubConfigured, apiclubIsTestEnvironment } from "./apiclubService";

export const BUSINESS_TYPES = [
  "Individual",
  "Proprietorship",
  "Partnership",
  "LLP",
  "PrivateLimited",
  "PublicLimited",
] as const;

export const SECTIONS = ["business", "kyc", "bank", "store"] as const;
export type Section = (typeof SECTIONS)[number];

export const DOCUMENT_LABELS: Record<SellerDocumentType, string> = {
  PAN_CARD: "PAN Card",
  ADDRESS_PROOF: "Address Proof (Aadhaar / Utility bill / Rent agreement)",
  BUSINESS_REGISTRATION: "Business Registration (Partnership deed / Incorporation certificate)",
  GST_CERTIFICATE: "GST Registration Certificate",
  CANCELLED_CHEQUE: "Cancelled Cheque / Bank Passbook",
  FSSAI_LICENSE: "FSSAI License",
  ID_PROOF: "Owner ID Proof",
  SELFIE: "Selfie (used to match your PAN card photo)",
};

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_NUMBER_REGEX = /^[0-9]{9,18}$/;
export const FSSAI_REGEX = /^[0-9]{14}$/;

const EDITABLE_STATUSES: OnboardingStatus[] = ["Draft", "KYCPending", "ActionRequired"];
const LIVE_STATUSES: OnboardingStatus[] = ["Approved", "Active"];

const isIndividual = (businessType?: string) =>
  businessType === "Individual" || businessType === "Proprietorship";

export const requiredDocuments = (seller: ISeller): SellerDocumentType[] => {
  const docs: SellerDocumentType[] = ["PAN_CARD", "CANCELLED_CHEQUE"];
  if (seller.businessType && !isIndividual(seller.businessType)) docs.push("BUSINESS_REGISTRATION");
  else docs.push("ADDRESS_PROOF");
  if (seller.gstRegistered) docs.push("GST_CERTIFICATE");
  if (seller.fssaiLicNo) docs.push("FSSAI_LICENSE");
  return docs;
};

const hasValidPin = (seller: ISeller) => {
  const [lng, lat] = seller.location?.coordinates || [];
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
};

/** What each onboarding section is still missing (empty list = complete). */
export const sectionGaps = (seller: ISeller): Record<Section, string[]> => {
  const business: string[] = [];
  if (!BUSINESS_TYPES.includes(seller.businessType as any)) business.push("Business type");
  if (!isIndividual(seller.businessType) && !seller.legalBusinessName) business.push("Registered business name");
  if (!seller.panCard || !PAN_REGEX.test(seller.panCard)) business.push("Valid PAN");
  if (typeof seller.gstRegistered !== "boolean") business.push("GST registration (Yes/No)");
  if (seller.gstRegistered && (!seller.gstin || !GSTIN_REGEX.test(seller.gstin))) business.push("Valid GSTIN");

  const uploaded = new Map(
    (seller.documents || []).map((d) => [d.docType, d.status] as [string, string])
  );
  const kyc = requiredDocuments(seller)
    .filter((t) => !uploaded.has(t) || uploaded.get(t) === "Rejected")
    .map((t) => DOCUMENT_LABELS[t]);

  const bank: string[] = [];
  if (!seller.accountName) bank.push("Account holder name");
  if (!seller.accountNumber || !ACCOUNT_NUMBER_REGEX.test(seller.accountNumber)) bank.push("Valid account number");
  if (!seller.ifsc || !IFSC_REGEX.test(seller.ifsc)) bank.push("Valid IFSC");
  if (!seller.bankName) bank.push("Bank name");

  const store: string[] = [];
  if (!seller.storeName) store.push("Store name");
  if (!seller.address) store.push("Pickup address");
  if (!seller.city) store.push("City");
  if (!hasValidPin(seller)) store.push("Store location on map");

  return { business, kyc, bank, store };
};

const sectionStatus = (seller: ISeller, section: Section): ReviewSectionStatus =>
  (seller.onboardingReview as any)?.[section]?.status || "NotSubmitted";

/** Legacy sellers (pre-onboarding) have no onboardingStatus; derive one. */
export const effectiveStatus = (seller: ISeller): OnboardingStatus => {
  if (seller.onboardingStatus) return seller.onboardingStatus;
  if (seller.status === "Approved") return "Approved";
  if (seller.status === "Rejected") return "Rejected";
  return preSubmitStatus(seller);
};

const preSubmitStatus = (seller: ISeller): OnboardingStatus => {
  const gaps = sectionGaps(seller);
  return gaps.business.length || gaps.store.length ? "Draft" : "KYCPending";
};

/** Sets the onboarding status and keeps the legacy `status` (the selling gate) in sync. */
export const setOnboardingStatus = (seller: ISeller, next: OnboardingStatus, reason?: string) => {
  seller.onboardingStatus = next;
  seller.onboardingStatusReason = reason || undefined;
  seller.status = LIVE_STATUSES.includes(next) ? "Approved" : next === "Rejected" ? "Rejected" : "Pending";
};

/** While a seller is still filling in details, move between Draft and KYC Pending automatically. */
export const refreshPreSubmitStatus = (seller: ISeller) => {
  const current = effectiveStatus(seller);
  if (current === "Draft" || current === "KYCPending") setOnboardingStatus(seller, preSubmitStatus(seller));
};

/** Approved → Active once the seller has at least one live product. */
export const refreshActiveStatus = async (seller: ISeller): Promise<boolean> => {
  if (seller.onboardingStatus !== "Approved") return false;
  const live = await Product.exists({ seller: seller._id, status: "Active", publish: true });
  if (!live) return false;
  setOnboardingStatus(seller, "Active");
  await seller.save();
  await auditSeller({ sellerId: seller._id, actorType: "System", action: "STATUS_ACTIVE", remarks: "First product went live" });
  return true;
};

export const canEditSection = (seller: ISeller, section: Section): boolean => {
  const status = effectiveStatus(seller);
  if (EDITABLE_STATUSES.includes(status)) return true;
  // Approved sellers may still change bank (re-verified) and store details.
  if (LIVE_STATUSES.includes(status)) return section === "bank" || section === "store";
  return false;
};

/** Reason a seller can't be paid out right now, or null when payouts are allowed. */
export const payoutBlockReason = (seller: ISeller, paymentMethod?: string): string | null => {
  // Not yet migrated to onboarding: keep pre-existing payout behaviour.
  if (!seller.onboardingStatus) return null;
  if (!LIVE_STATUSES.includes(seller.onboardingStatus)) {
    return "Payouts are available after your seller account and KYC are approved.";
  }
  if (paymentMethod !== "UPI" && seller.bankVerificationStatus !== "Verified") {
    return "Your bank account is not verified yet. Payouts will be enabled once Exnshop verifies it.";
  }
  return null;
};

export const maskAccountNumber = (value?: string) =>
  value ? `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : "";

// ── Audit trail ─────────────────────────────────────────────

const SENSITIVE_FIELDS = new Set(["accountNumber"]);

export const auditSeller = async (entry: {
  sellerId: any;
  actorType: "Seller" | "Admin" | "System";
  actorId?: any;
  actorName?: string;
  action: string;
  section?: string;
  changes?: Array<{ field: string; from?: any; to?: any }>;
  remarks?: string;
}) => {
  try {
    await SellerAuditLog.create({
      seller: entry.sellerId,
      actorType: entry.actorType,
      actorId: entry.actorId && mongoose.isValidObjectId(entry.actorId) ? entry.actorId : undefined,
      actorName: entry.actorName,
      action: entry.action,
      section: entry.section,
      remarks: entry.remarks,
      changes: (entry.changes || []).map((c) => {
        const fmt = (v: any) =>
          v === undefined || v === null ? "" : SENSITIVE_FIELDS.has(c.field) ? maskAccountNumber(String(v)) : String(v);
        return { field: c.field, from: fmt(c.from), to: fmt(c.to) };
      }),
    });
  } catch (err) {
    console.error("[SellerAudit] Failed to write audit entry:", err);
  }
};

/** Diff of tracked fields between a seller and a set of incoming updates. */
export const diffFields = (seller: any, updates: Record<string, any>, fields: string[]) =>
  fields
    .filter((f) => updates[f] !== undefined && String(updates[f] ?? "") !== String(seller[f] ?? ""))
    .map((f) => ({ field: f, from: seller[f], to: updates[f] }));

// ── Notifications ───────────────────────────────────────────

export const notifySeller = async (
  seller: ISeller,
  title: string,
  message: string,
  type: "Info" | "Success" | "Warning" | "Error" = "Info"
) => {
  try {
    const { sendNotification } = await import("./notificationService");
    await sendNotification("Seller", seller._id.toString(), title, message, {
      type,
      link: "/seller/onboarding",
      priority: "High",
    });
  } catch (err: any) {
    console.error("[SellerOnboarding] Notification failed:", err?.message);
  }
  if (seller.email) {
    try {
      const { sendSellerStatusEmail } = await import("./emailService");
      await sendSellerStatusEmail(seller.email, title, message);
    } catch (err: any) {
      console.error("[SellerOnboarding] Email failed:", err?.message);
    }
  }
};

export const notifyAdmins = async (title: string, message: string) => {
  try {
    const { sendBroadcastNotification } = await import("./notificationService");
    await sendBroadcastNotification("Admin", title, message, {
      type: "Info",
      priority: "High",
      link: "/admin/manage-seller/list",
    });
  } catch (err: any) {
    console.error("[SellerOnboarding] Admin notification failed:", err?.message);
  }
};

// ── Bank helpers ────────────────────────────────────────────

/** Looks up bank/branch for an IFSC via Razorpay's free public IFSC directory. */
export const lookupIfsc = async (
  ifsc: string
): Promise<{ valid: boolean; bank?: string; branch?: string; unreachable?: boolean }> => {
  try {
    const { data } = await axios.get(`https://ifsc.razorpay.com/${encodeURIComponent(ifsc)}`, { timeout: 6000 });
    return { valid: true, bank: data?.BANK, branch: data?.BRANCH };
  } catch (err: any) {
    if (err?.response?.status === 404) return { valid: false };
    return { valid: true, unreachable: true };
  }
};

// ── Private document storage ────────────────────────────────

const DOC_FOLDER = "exnshop/seller-kyc";

/** Uploads a KYC document as a Cloudinary *private* asset (no public URL exists). */
export const uploadPrivateDocument = (sellerId: string, buffer: Buffer, folder: string = DOC_FOLDER) =>
  new Promise<{ publicId: string; resourceType: string; format?: string; bytes?: number }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `${folder}/${sellerId}`, type: "private", resource_type: "auto" },
      (error: any, result: any) => {
        if (error || !result) return reject(new Error(error?.message || "Document upload failed"));
        resolve({
          publicId: result.public_id,
          resourceType: result.resource_type,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );
    stream.end(buffer);
  });

export const deletePrivateDocument = async (publicId: string, resourceType: string) => {
  try {
    await cloudinary.uploader.destroy(publicId, { type: "private", resource_type: resourceType, invalidate: true });
  } catch (err: any) {
    console.error("[SellerOnboarding] Failed to delete old document:", err?.message);
  }
};

/** Short-lived (5 min) signed link to view a private document. */
export const signedDocumentUrl = (doc: { publicId: string; resourceType: string; format?: string }) =>
  cloudinary.utils.private_download_url(doc.publicId, doc.format || "", {
    resource_type: doc.resourceType || "image",
    type: "private",
    expires_at: Math.floor(Date.now() / 1000) + 300,
    attachment: false,
  } as any);

// ── Views ───────────────────────────────────────────────────

export const buildOnboardingView = (seller: ISeller, opts: { forAdmin?: boolean } = {}) => {
  const status = effectiveStatus(seller);
  const gaps = sectionGaps(seller);
  const sections = Object.fromEntries(
    SECTIONS.map((s) => [
      s,
      {
        complete: gaps[s].length === 0,
        missing: gaps[s],
        reviewStatus: sectionStatus(seller, s),
        remarks: (seller.onboardingReview as any)?.[s]?.remarks || "",
        editable: canEditSection(seller, s),
      },
    ])
  );

  return {
    sellerId: seller._id,
    onboardingStatus: status,
    statusReason: seller.onboardingStatusReason || "",
    submittedAt: seller.onboardingSubmittedAt,
    canSubmit: EDITABLE_STATUSES.includes(status) && SECTIONS.every((s) => gaps[s].length === 0),
    sections,
    business: {
      businessType: seller.businessType || "",
      legalBusinessName: seller.legalBusinessName || "",
      panCard: seller.panCard || "",
      gstRegistered: seller.gstRegistered,
      gstin: seller.gstin || "",
      fssaiLicNo: seller.fssaiLicNo || "",
    },
    bank: {
      accountName: seller.accountName || "",
      bankName: seller.bankName || "",
      branch: seller.branch || "",
      ifsc: seller.ifsc || "",
      upiId: seller.upiId || "",
      accountNumber: opts.forAdmin ? seller.accountNumber || "" : undefined,
      accountNumberMasked: maskAccountNumber(seller.accountNumber),
      verificationStatus: seller.bankVerificationStatus || "Unverified",
      verificationMethod: seller.bankVerificationMethod,
      verifiedAt: seller.bankVerifiedAt,
      verificationRemarks: seller.bankVerificationRemarks || "",
    },
    store: {
      storeName: seller.storeName || "",
      storeDescription: seller.storeDescription || "",
      logo: seller.logo || "",
      address: seller.address || "",
      returnAddress: seller.returnAddress || "",
      city: seller.city || "",
      searchLocation: seller.searchLocation || "",
      latitude: seller.latitude || "",
      longitude: seller.longitude || "",
      mobile: seller.mobile,
      email: seller.email,
    },
    requiredDocuments: requiredDocuments(seller),
    documents: (seller.documents || []).map((d: any) => ({
      _id: d._id,
      docType: d.docType,
      label: DOCUMENT_LABELS[d.docType as SellerDocumentType] || d.docType,
      originalName: d.originalName,
      format: d.format,
      uploadedAt: d.uploadedAt,
      status: d.status,
      remarks: d.remarks || "",
    })),
    options: {
      businessTypes: BUSINESS_TYPES,
      documentLabels: DOCUMENT_LABELS,
    },
    ...(opts.forAdmin
      ? {
          verification: {
            configured: apiclubConfigured(),
            testMode: apiclubIsTestEnvironment(),
            checks: (seller.verificationChecks || []).map((c: any) => ({
              type: c.type,
              status: c.status,
              summary: c.summary,
              details: c.details instanceof Map ? Object.fromEntries(c.details) : c.details || {},
              ranAt: c.ranAt,
              ranBy: c.ranBy,
            })),
          },
        }
      : {}),
  };
};

export const findSellerOrThrow = async (sellerId: string) => {
  const seller = await Seller.findById(sellerId).select("-password");
  if (!seller) {
    const err: any = new Error("Seller not found");
    err.statusCode = 404;
    throw err;
  }
  return seller;
};
