import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Product from "../../../models/Product";
import Category from "../../../models/Category";
import HeaderCategory from "../../../models/HeaderCategory";
import CategoryAttribute, { ATTRIBUTE_TYPES } from "../../../models/CategoryAttribute";
import CategoryListingRule from "../../../models/CategoryListingRule";
import Tax from "../../../models/Tax";
import mongoose from "mongoose";
import { buildSpecGroups } from "../../../services/listingConfigService";
import {
  adminActorOf,
  auditProduct,
  configForProduct,
  listingProblems,
} from "../../../services/productListingService";
import { signedDocumentUrl } from "../../../services/sellerOnboardingService";
import { publicComplianceDocs } from "../../seller/controllers/productListingController";

const SCOPE_TYPES = ["HeaderCategory", "Category"];

const checkScope = async (scopeType: string, scopeId: string): Promise<string | null> => {
  if (!SCOPE_TYPES.includes(scopeType)) return "Scope must be a department or a category";
  const exists = scopeType === "HeaderCategory" ? await HeaderCategory.exists({ _id: scopeId }) : await Category.exists({ _id: scopeId });
  return exists ? null : "That department or category doesn't exist";
};

// ── Attributes & rules (the "Listing Setup" screen) ─────────

export const getListingSetup = asyncHandler(async (req: Request, res: Response) => {
  const { scopeType, scopeId } = req.query as Record<string, string>;
  const problem = await checkScope(scopeType, scopeId);
  if (problem) return res.status(400).json({ success: false, message: problem });

  const [attributes, rule] = await Promise.all([
    CategoryAttribute.find({ scopeType, scopeId }).sort({ displayOrder: 1, label: 1 }).lean(),
    CategoryListingRule.findOne({ scopeType, scopeId }).lean(),
  ]);
  return res.status(200).json({ success: true, data: { attributes, rule: rule || { isRegulated: false, requiredDocs: [] } } });
});

const attributeFromBody = (body: any) => {
  const allowedValues: string[] = (Array.isArray(body.allowedValues) ? body.allowedValues : String(body.allowedValues || "").split(","))
    .map((v: any) => String(v).trim())
    .filter(Boolean);
  const num = (v: any) => (v === "" || v === undefined || v === null ? undefined : Number(v));
  return {
    key: String(body.key || "").trim().toLowerCase(),
    label: String(body.label || "").trim(),
    type: body.type,
    isRequired: body.isRequired === true,
    isVariantAttribute: body.isVariantAttribute === true,
    isFilterable: body.isFilterable === true,
    isSearchable: body.isSearchable === true,
    allowedValues,
    unit: String(body.unit || "").trim() || undefined,
    helpText: String(body.helpText || "").trim() || undefined,
    group: String(body.group || "").trim().slice(0, 40) || undefined,
    keySpec: body.keySpec === true,
    keySpecFormat: String(body.keySpecFormat || "").trim().slice(0, 60) || undefined,
    displayOrder: Number(body.displayOrder) || 0,
    isActive: body.isActive !== false,
    validation:
      num(body.validation?.min) !== undefined || num(body.validation?.max) !== undefined || body.validation?.pattern
        ? { min: num(body.validation?.min), max: num(body.validation?.max), pattern: String(body.validation?.pattern || "").trim() || undefined }
        : undefined,
  };
};

const attributeProblem = (a: ReturnType<typeof attributeFromBody>): string | null => {
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(a.key)) return "Key must be lowercase letters, digits or underscores, e.g. size or screen_size";
  if (!a.label) return "Enter a label";
  if (!ATTRIBUTE_TYPES.includes(a.type)) return "Choose a valid type";
  if ((a.type === "select" || a.type === "multiselect") && a.allowedValues.length === 0) return "Add at least one allowed value for a list attribute";
  if (a.isVariantAttribute && a.type !== "select") return "A variant attribute must be a single-choice list";
  if (a.keySpecFormat && !a.keySpecFormat.includes("{value}")) return 'The key-spec wording must contain {value}, for example "{value} RAM"';
  if (a.keySpec && a.isVariantAttribute) return "A variant option can't be a key spec; it is shown with the selected variant";
  if (a.validation?.pattern) {
    try {
      new RegExp(a.validation.pattern);
    } catch {
      return "The validation pattern isn't a valid regular expression";
    }
  }
  return null;
};

export const createAttribute = asyncHandler(async (req: Request, res: Response) => {
  const { scopeType, scopeId } = req.body;
  const scopeProblem = await checkScope(scopeType, scopeId);
  if (scopeProblem) return res.status(400).json({ success: false, message: scopeProblem });
  const data = attributeFromBody(req.body);
  const problem = attributeProblem(data);
  if (problem) return res.status(400).json({ success: false, message: problem });
  try {
    const attribute = await CategoryAttribute.create({ ...data, scopeType, scopeId });
    return res.status(201).json({ success: true, data: attribute });
  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ success: false, message: `An attribute with the key "${data.key}" already exists here` });
    throw err;
  }
});

export const updateAttribute = asyncHandler(async (req: Request, res: Response) => {
  const data = attributeFromBody(req.body);
  const problem = attributeProblem(data);
  if (problem) return res.status(400).json({ success: false, message: problem });
  try {
    const attribute = await CategoryAttribute.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!attribute) return res.status(404).json({ success: false, message: "Attribute not found" });
    return res.status(200).json({ success: true, data: attribute });
  } catch (err: any) {
    if (err?.code === 11000) return res.status(409).json({ success: false, message: `An attribute with the key "${data.key}" already exists here` });
    throw err;
  }
});

export const deleteAttribute = asyncHandler(async (req: Request, res: Response) => {
  const attribute = await CategoryAttribute.findByIdAndDelete(req.params.id);
  if (!attribute) return res.status(404).json({ success: false, message: "Attribute not found" });
  return res.status(200).json({ success: true, message: "Attribute deleted" });
});

export const saveListingRule = asyncHandler(async (req: Request, res: Response) => {
  const { scopeType, scopeId } = req.body;
  const scopeProblem = await checkScope(scopeType, scopeId);
  if (scopeProblem) return res.status(400).json({ success: false, message: scopeProblem });

  const defaultHsn = String(req.body.defaultHsn || "").replace(/\s/g, "");
  if (defaultHsn && !/^\d{4}(\d{2}(\d{2})?)?$/.test(defaultHsn)) {
    return res.status(400).json({ success: false, message: "HSN code must be 4, 6 or 8 digits" });
  }
  const isRegulated = req.body.isRegulated === true;
  const requiredDocs = (Array.isArray(req.body.requiredDocs) ? req.body.requiredDocs : [])
    .map((d: any) => ({
      label: String(d.label || "").trim(),
      key: String(d.key || d.label || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40),
    }))
    .filter((d: any) => d.label && d.key);
  if (isRegulated && requiredDocs.length === 0) {
    return res.status(400).json({ success: false, message: "Add at least one required document for a regulated category" });
  }

  const rule = await CategoryListingRule.findOneAndUpdate(
    { scopeType, scopeId },
    { scopeType, scopeId, defaultHsn: defaultHsn || undefined, isRegulated, requiredDocs, notes: String(req.body.notes || "").trim() || undefined },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return res.status(200).json({ success: true, data: rule });
});

// ── Product review extras ───────────────────────────────────

/** Everything the reviewer needs about one product in a single call. */
export const getProductReviewDetails = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id)
    .populate("category", "name")
    .populate("subcategory", "name")
    .populate("subSubCategory", "name")
    .populate("headerCategoryId", "name")
    .populate("brand", "name")
    .populate("shopId", "name")
    .populate(
      "seller",
      "sellerName storeName mobile email isEmailVerified city address returnAddress searchLocation businessType legalBusinessName gstRegistered gstin panCard fssaiLicNo onboardingStatus status channels serviceRadiusKm bankVerificationStatus logo createdAt"
    );
  if (!product) return res.status(404).json({ success: false, message: "Product not found" });

  const config = await configForProduct(product);
  const problems = await listingProblems(product.toObject());
  const attributeValues: any = product.attributes || {};
  const attributeRows = config.attributes
    .filter((a) => attributeValues[a.key] !== undefined)
    .map((a) => ({ label: a.label, value: attributeValues[a.key], unit: a.unit }));
  const isBlank = (v: any) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  const unfilledAttributes = config.attributes
    .filter((a) => !a.isVariantAttribute && isBlank(attributeValues[a.key]))
    .map((a) => ({ label: a.label, group: a.group || "Details", required: a.isRequired }));

  const sellerDoc: any = product.seller;
  const sellerId = sellerDoc?._id;
  const [tax, sellerProductCounts] = await Promise.all([
    product.tax && mongoose.isValidObjectId(product.tax) ? Tax.findById(product.tax).select("name percentage").lean() : null,
    sellerId
      ? Product.aggregate([{ $match: { seller: sellerId } }, { $group: { _id: "$status", n: { $sum: 1 } } }])
      : [],
  ]);
  const seller = sellerDoc
    ? {
        ...(sellerDoc.toObject ? sellerDoc.toObject() : sellerDoc),
        // The product review only needs to recognise the PAN, not read it in full.
        panCard: sellerDoc.panCard ? `${sellerDoc.panCard.slice(0, 2)}••••••${sellerDoc.panCard.slice(-2)}` : undefined,
        productCounts: Object.fromEntries((sellerProductCounts as any[]).map((c) => [c._id, c.n])),
      }
    : null;

  const productJson: any = product.toJSON();
  productJson.seller = sellerId; // seller details are sent once, below, with the PAN masked

  return res.status(200).json({
    success: true,
    data: {
      product: productJson,
      seller,
      tax,
      specGroups: buildSpecGroups(config.attributes, attributeValues),
      unfilledAttributes,
      attributeRows,
      problems,
      isRegulated: config.rule.isRegulated,
      complianceDocs: publicComplianceDocs(product, config.rule.requiredDocs),
      qualityFlags: product.qualityFlags || [],
    },
  });
});

/** Marks a submitted product as being looked at ("Under review") so two admins don't duplicate work. */
export const startProductReview = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: "Product not found" });
  if (product.status !== "Pending") {
    return res.status(409).json({ success: false, message: "Only a submitted product can be put under review" });
  }
  const actor = await adminActorOf(req);
  product.reviewStartedAt = new Date();
  product.reviewStartedBy = actor.actorId;
  product.reviewStartedByName = actor.actorName;
  await product.save();
  await auditProduct({ product, ...actor, action: "REVIEW_STARTED" });
  return res.status(200).json({ success: true, data: { reviewStartedAt: product.reviewStartedAt, reviewStartedByName: product.reviewStartedByName } });
});

export const getProductComplianceDocUrl = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id);
  const doc: any = product?.complianceDocs?.find((d: any) => String(d._id) === req.params.docId);
  if (!product || !doc) return res.status(404).json({ success: false, message: "Document not found" });
  await auditProduct({ product, ...(await adminActorOf(req)), action: "COMPLIANCE_VIEWED", changes: [{ field: doc.docType }] });
  return res.status(200).json({ success: true, data: { url: signedDocumentUrl(doc) } });
});

export const reviewProductComplianceDoc = asyncHandler(async (req: Request, res: Response) => {
  const status = req.body.status as "Approved" | "Rejected";
  const remarks = String(req.body.remarks || "").trim();
  if (!["Approved", "Rejected"].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be Approved or Rejected" });
  }
  if (status === "Rejected" && !remarks) {
    return res.status(400).json({ success: false, message: "Please give a reason so the seller knows what to fix" });
  }
  const product = await Product.findById(req.params.id);
  const doc: any = product?.complianceDocs?.find((d: any) => String(d._id) === req.params.docId);
  if (!product || !doc) return res.status(404).json({ success: false, message: "Document not found" });

  doc.status = status;
  doc.remarks = status === "Rejected" ? remarks : undefined;
  await product.save();
  await auditProduct({
    product,
    ...(await adminActorOf(req)),
    action: `COMPLIANCE_${status.toUpperCase()}`,
    changes: [{ field: doc.docType }],
    remarks: remarks || undefined,
  });

  const config = await configForProduct(product);
  return res.status(200).json({ success: true, data: publicComplianceDocs(product, config.rule.requiredDocs) });
});
