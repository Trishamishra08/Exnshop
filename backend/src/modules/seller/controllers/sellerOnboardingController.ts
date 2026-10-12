import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { SELLER_DOCUMENT_TYPES, SellerDocumentType } from "../../../models/Seller";
import {
  ACCOUNT_NUMBER_REGEX,
  BUSINESS_TYPES,
  FSSAI_REGEX,
  GSTIN_REGEX,
  IFSC_REGEX,
  PAN_REGEX,
  SECTIONS,
  Section,
  auditSeller,
  buildOnboardingView,
  canEditSection,
  deletePrivateDocument,
  diffFields,
  effectiveStatus,
  findSellerOrThrow,
  lookupIfsc,
  notifyAdmins,
  notifySeller,
  refreshActiveStatus,
  refreshPreSubmitStatus,
  sectionGaps,
  setOnboardingStatus,
  signedDocumentUrl,
  uploadPrivateDocument,
} from "../../../services/sellerOnboardingService";
import { queueSellerPickupSync } from "../../../services/shiprocketService";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const sellerIdOf = (req: Request) => (req as any).user.userId as string;
const clean = (v: unknown) => (typeof v === "string" ? v.trim() : v);
const upper = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase() : v);

const locked = (res: Response, section: Section) =>
  res.status(409).json({
    success: false,
    message:
      section === "business" || section === "kyc"
        ? "These details are locked while your application is under review or after approval. Contact support to change them."
        : "Your application is under review. You can edit again if changes are requested.",
  });

const markSectionEdited = (seller: any, section: Section) => {
  if (!seller.onboardingReview) seller.onboardingReview = {};
  const current = seller.onboardingReview[section]?.status;
  // An approved seller editing bank details needs re-verification.
  if (current === "Approved" || current === "ChangesRequired") {
    seller.onboardingReview[section] = { status: "Submitted", remarks: "" };
  }
};

/** GET /seller/onboarding */
export const getOnboarding = asyncHandler(async (req: Request, res: Response) => {
  const seller = await findSellerOrThrow(sellerIdOf(req));
  await refreshActiveStatus(seller);
  return res.json({ success: true, data: buildOnboardingView(seller) });
});

/** PUT /seller/onboarding/business */
export const saveBusiness = asyncHandler(async (req: Request, res: Response) => {
  const seller = await findSellerOrThrow(sellerIdOf(req));
  if (!canEditSection(seller, "business")) return locked(res, "business");

  const businessType = clean(req.body.businessType) as string;
  const legalBusinessName = clean(req.body.legalBusinessName) as string;
  const panCard = upper(req.body.panCard) as string;
  const gstRegistered = req.body.gstRegistered === true || req.body.gstRegistered === "true";
  const gstin = upper(req.body.gstin) as string;
  const fssaiLicNo = clean(req.body.fssaiLicNo) as string;

  const errors: string[] = [];
  if (!BUSINESS_TYPES.includes(businessType as any)) errors.push("Select a valid business type");
  if (!PAN_REGEX.test(panCard || "")) errors.push("PAN must be 10 characters, e.g. ABCDE1234F");
  if (gstRegistered) {
    if (!GSTIN_REGEX.test(gstin || "")) errors.push("GSTIN must be 15 characters, e.g. 22ABCDE1234F1Z5");
    else if (PAN_REGEX.test(panCard || "") && gstin.slice(2, 12) !== panCard) {
      errors.push("GSTIN does not match the PAN entered");
    }
  }
  if (fssaiLicNo && !FSSAI_REGEX.test(fssaiLicNo)) errors.push("FSSAI license number must be 14 digits");
  if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

  const updates: Record<string, any> = {
    businessType,
    legalBusinessName: legalBusinessName || (["Individual", "Proprietorship"].includes(businessType) ? seller.sellerName : ""),
    panCard,
    gstRegistered,
    gstin: gstRegistered ? gstin : "",
    fssaiLicNo: fssaiLicNo || "",
  };
  const changes = diffFields(seller, updates, Object.keys(updates));
  Object.assign(seller, updates);
  if (changes.length) markSectionEdited(seller, "business");
  refreshPreSubmitStatus(seller);
  await seller.save();

  if (changes.length) {
    await auditSeller({ sellerId: seller._id, actorType: "Seller", actorId: seller._id, actorName: seller.sellerName, action: "BUSINESS_UPDATED", section: "business", changes });
  }
  return res.json({ success: true, message: "Business details saved", data: buildOnboardingView(seller) });
});

/** PUT /seller/onboarding/bank */
export const saveBank = asyncHandler(async (req: Request, res: Response) => {
  const seller = await findSellerOrThrow(sellerIdOf(req));
  if (!canEditSection(seller, "bank")) return locked(res, "bank");

  const accountName = clean(req.body.accountName) as string;
  const ifsc = upper(req.body.ifsc) as string;
  const rawAccount = clean(req.body.accountNumber) as string;
  const confirmAccount = clean(req.body.confirmAccountNumber) as string;
  const upiId = clean(req.body.upiId) as string;
  // The seller only ever sees a masked number; leaving it blank keeps the saved one.
  const accountNumber = rawAccount ? rawAccount.replace(/\s/g, "") : seller.accountNumber || "";

  const errors: string[] = [];
  if (!accountName) errors.push("Enter the account holder name");
  if (!ACCOUNT_NUMBER_REGEX.test(accountNumber)) errors.push("Account number must be 9–18 digits");
  if (rawAccount && rawAccount.replace(/\s/g, "") !== (confirmAccount || "").replace(/\s/g, "")) {
    errors.push("Account numbers do not match");
  }
  if (!IFSC_REGEX.test(ifsc || "")) errors.push("IFSC must be 11 characters, e.g. HDFC0001234");
  if (upiId && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upiId)) errors.push("Enter a valid UPI ID");
  if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

  const ifscInfo = await lookupIfsc(ifsc);
  if (!ifscInfo.valid) return res.status(400).json({ success: false, message: "This IFSC code does not exist" });

  const updates: Record<string, any> = {
    accountName,
    accountNumber,
    ifsc,
    bankName: ifscInfo.bank || clean(req.body.bankName) || seller.bankName,
    branch: ifscInfo.branch || clean(req.body.branch) || seller.branch,
    upiId: upiId || "",
  };
  if (!updates.bankName) {
    return res.status(400).json({ success: false, message: "Could not look up the bank name. Please enter it." });
  }

  const changes = diffFields(seller, updates, Object.keys(updates));
  const bankIdentityChanged = changes.some((c) => ["accountName", "accountNumber", "ifsc"].includes(c.field));
  Object.assign(seller, updates);
  if (bankIdentityChanged) {
    seller.bankVerificationStatus = "Unverified";
    seller.bankVerificationMethod = undefined;
    seller.bankVerifiedAt = undefined;
    seller.bankVerificationRemarks = undefined;
    markSectionEdited(seller, "bank");
  }
  refreshPreSubmitStatus(seller);
  await seller.save();

  if (changes.length) {
    await auditSeller({ sellerId: seller._id, actorType: "Seller", actorId: seller._id, actorName: seller.sellerName, action: "BANK_UPDATED", section: "bank", changes });
  }
  const status = effectiveStatus(seller);
  if (bankIdentityChanged && (status === "Approved" || status === "Active")) {
    await notifyAdmins("Seller bank details changed", `${seller.storeName} changed their bank account. Verify it before releasing payouts.`);
  }
  return res.json({ success: true, message: "Bank details saved", data: buildOnboardingView(seller) });
});

/** PUT /seller/onboarding/store */
export const saveStore = asyncHandler(async (req: Request, res: Response) => {
  const seller = await findSellerOrThrow(sellerIdOf(req));
  if (!canEditSection(seller, "store")) return locked(res, "store");

  const storeName = clean(req.body.storeName) as string;
  const address = clean(req.body.address) as string;
  const city = clean(req.body.city) as string;
  const lat = parseFloat(req.body.latitude);
  const lng = parseFloat(req.body.longitude);

  const errors: string[] = [];
  if (!storeName) errors.push("Enter your store name");
  if (!address || address.length < 10) errors.push("Enter the full pickup address (shop no., building, street)");
  if (!city) errors.push("Enter your city");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    errors.push("Set your store location on the map");
  }
  if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

  const updates: Record<string, any> = {
    storeName,
    storeDescription: clean(req.body.storeDescription) || "",
    logo: clean(req.body.logo) || seller.logo,
    address,
    returnAddress: clean(req.body.returnAddress) || address,
    city,
    searchLocation: clean(req.body.searchLocation) || seller.searchLocation,
    latitude: lat.toString(),
    longitude: lng.toString(),
  };
  const changes = diffFields(seller, updates, Object.keys(updates));
  Object.assign(seller, updates);
  seller.location = { type: "Point", coordinates: [lng, lat] };
  refreshPreSubmitStatus(seller);
  await seller.save();

  if (changes.length) {
    await auditSeller({ sellerId: seller._id, actorType: "Seller", actorId: seller._id, actorName: seller.sellerName, action: "STORE_UPDATED", section: "store", changes });
    queueSellerPickupSync(seller._id.toString());
  }
  return res.json({ success: true, message: "Store details saved", data: buildOnboardingView(seller) });
});

/** POST /seller/onboarding/documents  (multipart: file, docType) */
export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  const seller = await findSellerOrThrow(sellerIdOf(req));
  if (!canEditSection(seller, "kyc")) return locked(res, "kyc");

  const docType = req.body.docType as SellerDocumentType;
  const file = (req as any).file;
  if (!SELLER_DOCUMENT_TYPES.includes(docType)) {
    return res.status(400).json({ success: false, message: "Invalid document type" });
  }
  if (!file) return res.status(400).json({ success: false, message: "Please choose a file to upload" });
  if (file.size > MAX_DOCUMENT_BYTES) {
    return res.status(400).json({ success: false, message: "File must be 10 MB or smaller" });
  }

  const stored = await uploadPrivateDocument(seller._id.toString(), file.buffer);

  const previous = seller.documents.find((d) => d.docType === docType);
  if (previous) {
    await deletePrivateDocument(previous.publicId, previous.resourceType);
    seller.documents.pull(previous._id);
  }
  seller.documents.push({
    docType,
    publicId: stored.publicId,
    resourceType: stored.resourceType,
    format: stored.format,
    bytes: stored.bytes,
    originalName: String(file.originalname || "").slice(0, 120),
    uploadedAt: new Date(),
    status: "Pending",
  } as any);
  markSectionEdited(seller, "kyc");
  refreshPreSubmitStatus(seller);
  await seller.save();

  await auditSeller({
    sellerId: seller._id,
    actorType: "Seller",
    actorId: seller._id,
    actorName: seller.sellerName,
    action: previous ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED",
    section: "kyc",
    changes: [{ field: docType, to: file.originalname }],
  });
  return res.json({ success: true, message: "Document uploaded", data: buildOnboardingView(seller) });
});

/** DELETE /seller/onboarding/documents/:docId */
export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const seller = await findSellerOrThrow(sellerIdOf(req));
  if (!canEditSection(seller, "kyc")) return locked(res, "kyc");

  const doc = seller.documents.id(req.params.docId);
  if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

  await deletePrivateDocument(doc.publicId, doc.resourceType);
  const docType = doc.docType;
  seller.documents.pull(doc._id);
  refreshPreSubmitStatus(seller);
  await seller.save();

  await auditSeller({ sellerId: seller._id, actorType: "Seller", actorId: seller._id, actorName: seller.sellerName, action: "DOCUMENT_DELETED", section: "kyc", changes: [{ field: docType }] });
  return res.json({ success: true, message: "Document removed", data: buildOnboardingView(seller) });
});

/** GET /seller/onboarding/documents/:docId/url — seller viewing their own document */
export const getDocumentUrl = asyncHandler(async (req: Request, res: Response) => {
  const seller = await findSellerOrThrow(sellerIdOf(req));
  const doc = seller.documents.id(req.params.docId);
  if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
  return res.json({ success: true, data: { url: signedDocumentUrl(doc) } });
});

/** POST /seller/onboarding/submit */
export const submitOnboarding = asyncHandler(async (req: Request, res: Response) => {
  const seller = await findSellerOrThrow(sellerIdOf(req));
  const status = effectiveStatus(seller);
  if (!["Draft", "KYCPending", "ActionRequired"].includes(status)) {
    return res.status(409).json({ success: false, message: "Your application has already been submitted" });
  }

  const gaps = sectionGaps(seller);
  const incomplete = SECTIONS.filter((s) => gaps[s].length);
  if (incomplete.length) {
    return res.status(400).json({
      success: false,
      message: `Please complete: ${incomplete.map((s) => gaps[s].join(", ")).join("; ")}`,
      data: buildOnboardingView(seller),
    });
  }

  if (!seller.onboardingReview) seller.onboardingReview = {} as any;
  for (const s of SECTIONS) {
    const current = (seller.onboardingReview as any)[s]?.status;
    if (current !== "Approved") (seller.onboardingReview as any)[s] = { status: "Submitted", remarks: "" };
  }
  seller.onboardingSubmittedAt = new Date();
  setOnboardingStatus(seller, "UnderReview");
  await seller.save();

  await auditSeller({
    sellerId: seller._id,
    actorType: "Seller",
    actorId: seller._id,
    actorName: seller.sellerName,
    action: status === "ActionRequired" ? "RESUBMITTED" : "SUBMITTED",
  });
  await notifySeller(
    seller,
    "Application submitted",
    "Thanks! Your seller application has been submitted. Our team will review your details and documents, and we'll notify you of the result.",
    "Success"
  );
  await notifyAdmins(
    status === "ActionRequired" ? "Seller application resubmitted" : "New seller application",
    `${seller.storeName} (${seller.mobile}) submitted their application for review.`
  );

  return res.json({ success: true, message: "Application submitted for review", data: buildOnboardingView(seller) });
});
