import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Admin from "../../../models/Admin";
import SellerAuditLog from "../../../models/SellerAuditLog";
import {
  SECTIONS,
  Section,
  auditSeller,
  buildOnboardingView,
  effectiveStatus,
  findSellerOrThrow,
  notifySeller,
  refreshActiveStatus,
  setOnboardingStatus,
  signedDocumentUrl,
} from "../../../services/sellerOnboardingService";
import { queueSellerPickupSync } from "../../../services/shiprocketService";

const SECTION_LABELS: Record<Section, string> = {
  business: "Business details",
  kyc: "KYC documents",
  bank: "Bank account",
  store: "Store details",
};

const adminActor = async (req: Request) => {
  const adminId = (req as any).user?.userId;
  const admin = adminId ? await Admin.findById(adminId).select("firstName lastName email") : null;
  return {
    actorType: "Admin" as const,
    actorId: adminId,
    actorName: admin ? `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || admin.email : "Admin",
  };
};

const ensureReview = (seller: any) => {
  if (!seller.onboardingReview) seller.onboardingReview = {};
  return seller.onboardingReview;
};

/** GET /sellers/:id/onboarding */
export const getSellerOnboarding = asyncHandler(async (req: Request, res: Response) => {
  const seller = await findSellerOrThrow(req.params.id);
  await refreshActiveStatus(seller);
  const auditLog = await SellerAuditLog.find({ seller: seller._id }).sort({ createdAt: -1 }).limit(200).lean();
  return res.json({
    success: true,
    data: {
      ...buildOnboardingView(seller, { forAdmin: true }),
      seller: {
        sellerName: seller.sellerName,
        storeName: seller.storeName,
        mobile: seller.mobile,
        email: seller.email,
        city: seller.city,
        createdAt: (seller as any).createdAt,
        channels: seller.channels,
        requireProductApproval: seller.requireProductApproval,
      },
      auditLog,
    },
  });
});

/** GET /sellers/:id/documents/:docId/url — every view is recorded */
export const getSellerDocumentUrl = asyncHandler(async (req: Request, res: Response) => {
  const seller = await findSellerOrThrow(req.params.id);
  const doc = seller.documents.id(req.params.docId);
  if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
  await auditSeller({ sellerId: seller._id, ...(await adminActor(req)), action: "DOCUMENT_VIEWED", section: "kyc", changes: [{ field: doc.docType }] });
  return res.json({ success: true, data: { url: signedDocumentUrl(doc) } });
});

/** PATCH /sellers/:id/documents/:docId  { status: Approved|Rejected, remarks } */
export const reviewSellerDocument = asyncHandler(async (req: Request, res: Response) => {
  const { status, remarks } = req.body;
  if (!["Approved", "Rejected"].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be Approved or Rejected" });
  }
  if (status === "Rejected" && !String(remarks || "").trim()) {
    return res.status(400).json({ success: false, message: "Please give a reason so the seller knows what to fix" });
  }

  const seller = await findSellerOrThrow(req.params.id);
  const doc = seller.documents.id(req.params.docId);
  if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

  doc.status = status;
  doc.remarks = status === "Rejected" ? String(remarks).trim() : undefined;
  const review = ensureReview(seller);
  if (status === "Rejected") {
    review.kyc = { status: "ChangesRequired", remarks: `${doc.docType}: ${doc.remarks}`, reviewedAt: new Date() };
  } else if (seller.documents.every((d) => d.status === "Approved")) {
    review.kyc = { status: "Approved", remarks: "", reviewedAt: new Date() };
  }
  await seller.save();

  await auditSeller({ sellerId: seller._id, ...(await adminActor(req)), action: `DOCUMENT_${status.toUpperCase()}`, section: "kyc", changes: [{ field: doc.docType }], remarks: doc.remarks });
  return res.json({ success: true, data: buildOnboardingView(seller, { forAdmin: true }) });
});

/** POST /sellers/:id/onboarding/review  { section, decision: Approved|ChangesRequired, remarks } */
export const reviewSellerSection = asyncHandler(async (req: Request, res: Response) => {
  const section = req.body.section as Section;
  const decision = req.body.decision as "Approved" | "ChangesRequired";
  const remarks = String(req.body.remarks || "").trim();

  if (!SECTIONS.includes(section)) return res.status(400).json({ success: false, message: "Invalid section" });
  if (!["Approved", "ChangesRequired"].includes(decision)) {
    return res.status(400).json({ success: false, message: "Decision must be Approved or ChangesRequired" });
  }
  if (decision === "ChangesRequired" && !remarks) {
    return res.status(400).json({ success: false, message: "Please explain what the seller needs to change" });
  }

  const seller = await findSellerOrThrow(req.params.id);
  ensureReview(seller)[section] = { status: decision, remarks: decision === "ChangesRequired" ? remarks : "", reviewedAt: new Date() };

  if (section === "kyc" && decision === "Approved") {
    seller.documents.forEach((d) => {
      if (d.status === "Pending") d.status = "Approved";
    });
  }
  if (section === "bank") {
    seller.bankVerificationStatus = decision === "Approved" ? "Verified" : "Failed";
    seller.bankVerificationMethod = decision === "Approved" ? "Manual" : undefined;
    seller.bankVerifiedAt = decision === "Approved" ? new Date() : undefined;
    seller.bankVerificationRemarks = remarks || undefined;
  }
  await seller.save();

  await auditSeller({ sellerId: seller._id, ...(await adminActor(req)), action: `SECTION_${decision.toUpperCase()}`, section, remarks });

  // A live seller only hears about bank re-verification; others get one message on the final decision.
  const status = effectiveStatus(seller);
  if (section === "bank" && (status === "Approved" || status === "Active")) {
    await notifySeller(
      seller,
      decision === "Approved" ? "Bank account verified" : "Bank account could not be verified",
      decision === "Approved" ? "Your bank account is verified. Payouts are enabled." : `Please update your bank details. Reason: ${remarks}`,
      decision === "Approved" ? "Success" : "Warning"
    );
  }
  return res.json({ success: true, data: buildOnboardingView(seller, { forAdmin: true }) });
});

/** POST /sellers/:id/onboarding/decision  { action, remarks } */
export const decideSellerOnboarding = asyncHandler(async (req: Request, res: Response) => {
  const action = req.body.action as "approve" | "request_changes" | "reject" | "suspend" | "reactivate";
  const remarks = String(req.body.remarks || "").trim();
  const seller = await findSellerOrThrow(req.params.id);
  const status = effectiveStatus(seller);
  const review: any = ensureReview(seller);
  const actor = await adminActor(req);

  const fail = (message: string) => res.status(400).json({ success: false, message });

  switch (action) {
    case "approve": {
      if (!["UnderReview", "ActionRequired"].includes(status)) return fail(`Cannot approve a seller who is ${status}`);
      const pending = SECTIONS.filter((s) => review[s]?.status !== "Approved");
      if (pending.length) return fail(`Approve every section first: ${pending.map((s) => SECTION_LABELS[s]).join(", ")}`);
      setOnboardingStatus(seller, "Approved");
      await seller.save();
      await refreshActiveStatus(seller);
      queueSellerPickupSync(seller._id.toString());
      await notifySeller(seller, "🎉 Seller account approved", "Congratulations! Your seller account is approved. Add products to go live on Exnshop.", "Success");
      break;
    }
    case "request_changes": {
      if (status !== "UnderReview") return fail("Changes can only be requested while the application is under review");
      const flagged = SECTIONS.filter((s) => review[s]?.status === "ChangesRequired");
      if (!flagged.length && !remarks) return fail("Mark at least one section as 'Changes required' or add a note");
      setOnboardingStatus(seller, "ActionRequired", remarks);
      await seller.save();
      const details = flagged.map((s) => `${SECTION_LABELS[s]}: ${review[s].remarks}`).join("\n");
      await notifySeller(seller, "Action required on your seller application", [remarks, details].filter(Boolean).join("\n"), "Warning");
      break;
    }
    case "reject": {
      if (!remarks) return fail("Please give a reason for rejection");
      if (["Rejected", "Approved", "Active"].includes(status)) return fail(`Cannot reject a seller who is ${status}. Suspend instead.`);
      setOnboardingStatus(seller, "Rejected", remarks);
      await seller.save();
      await notifySeller(seller, "Seller application not approved", `Reason: ${remarks}`, "Error");
      break;
    }
    case "suspend": {
      if (!remarks) return fail("Please give a reason for suspension");
      if (!["Approved", "Active"].includes(status)) return fail("Only approved or active sellers can be suspended");
      setOnboardingStatus(seller, "Suspended", remarks);
      await seller.save();
      await notifySeller(seller, "Seller account suspended", `Selling is paused on your account. Reason: ${remarks}`, "Error");
      break;
    }
    case "reactivate": {
      if (status !== "Suspended") return fail("Only suspended sellers can be reactivated");
      setOnboardingStatus(seller, "Approved");
      await seller.save();
      await refreshActiveStatus(seller);
      await notifySeller(seller, "Seller account reactivated", "Your seller account is active again.", "Success");
      break;
    }
    default:
      return fail("Unknown action");
  }

  await auditSeller({ sellerId: seller._id, ...actor, action: `STATUS_${action.toUpperCase()}`, changes: [{ field: "onboardingStatus", from: status, to: seller.onboardingStatus }], remarks });
  return res.json({ success: true, message: "Seller updated", data: buildOnboardingView(seller, { forAdmin: true }) });
});
