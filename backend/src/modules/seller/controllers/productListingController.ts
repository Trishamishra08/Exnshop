import { Request, Response } from "express";
import Product from "../../../models/Product";
import Seller from "../../../models/Seller";
import Category from "../../../models/Category";
import { sellerDepartmentError } from "../../../services/sellerCategoryService";
import { asyncHandler } from "../../../utils/asyncHandler";
import {
  auditProduct,
  configForProduct,
  ensureSkus,
  ownerView,
  stripProtectedFields,
} from "../../../services/productListingService";
import { resolveListingConfig } from "../../../services/listingConfigService";
import { deletePrivateDocument, signedDocumentUrl, uploadPrivateDocument } from "../../../services/sellerOnboardingService";

const sellerActor = (req: Request) => ({ actorType: "Seller" as const, actorId: (req as any).user?.userId });
const MAX_COMPLIANCE_BYTES = 10 * 1024 * 1024;

/** Same rule as the product form and the department list: sellers list only in their departments. */
async function validateSellerHeaderCategory(sellerId: string, headerCategoryId?: string): Promise<string | null> {
  if (!headerCategoryId) return null;
  const seller = await Seller.findById(sellerId).select("categories");
  if (!seller) return "Seller not found";
  return sellerDepartmentError(seller.categories, headerCategoryId);
}

/** Safe view of a product's compliance documents (never exposes storage ids). */
export const publicComplianceDocs = (product: any, requiredDocs: Array<{ key: string; label: string }>) =>
  (product.complianceDocs || []).map((d: any) => ({
    _id: d._id,
    docType: d.docType,
    label: requiredDocs.find((r) => r.key === d.docType)?.label || d.docType,
    originalName: d.originalName,
    format: d.format,
    status: d.status,
    remarks: d.remarks || "",
    uploadedAt: d.uploadedAt,
  }));

/**
 * Attributes and rules for a category branch, plus what this seller must provide
 * (HSN for GST-registered sellers, shipping details for E-Commerce sellers).
 */
export const getListingConfig = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const q = req.query as Record<string, string | undefined>;
  const [seller, config] = await Promise.all([
    Seller.findById(sellerId).select("gstRegistered channels"),
    resolveListingConfig({
      headerCategoryId: q.headerCategoryId,
      category: q.categoryId,
      subcategory: q.subcategoryId,
      subSubCategory: q.subSubCategoryId,
    }),
  ]);
  return res.status(200).json({
    success: true,
    data: {
      ...config,
      seller: {
        gstRegistered: seller?.gstRegistered === true,
        requiresShipping: (seller?.channels || []).includes("ECommerce"),
      },
    },
  });
});

/** Creates a draft after the Category/Basic steps, so later steps can save into it. */
export const createDraft = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const body = stripProtectedFields(req.body);

  const productName = String(body.productName || "").trim();
  if (!productName) return res.status(400).json({ success: false, message: "Enter a product name" });
  if (!body.categoryId) return res.status(400).json({ success: false, message: "Select a category" });

  const categoryError = await validateSellerHeaderCategory(sellerId, body.headerCategoryId);
  if (categoryError) return res.status(403).json({ success: false, message: categoryError });
  const category = await Category.findById(body.categoryId);
  if (!category) return res.status(400).json({ success: false, message: "Invalid product category ID provided" });

  const data: any = {
    seller: sellerId,
    productName,
    category: body.categoryId,
    headerCategoryId: body.headerCategoryId || undefined,
    subcategory: body.subcategoryId || undefined,
    subSubCategory: body.subSubCategoryId || undefined,
    brand: body.brandId || undefined,
    price: 0,
    stock: 0,
    variations: [],
    status: "Draft",
    requiresApproval: true,
    publish: true,
    isReturnable: true,
    listingVersion: 2,
    listingMethod: "single",
    condition: "New",
  };
  ensureSkus(sellerId, data);

  const product = await Product.create(data);
  await auditProduct({ product, ...sellerActor(req), action: "CREATED_DRAFT" });
  return res.status(201).json({ success: true, message: "Draft created", data: ownerView(product) });
});

/** Starts a new draft from one of the seller's own products ("sell something similar"). */
export const duplicateProduct = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const source: any = await Product.findOne({ _id: req.params.id, seller: sellerId }).lean();
  if (!source) return res.status(404).json({ success: false, message: "Product not found" });

  const copyFields = [
    "smallDescription", "description", "category", "subcategory", "subSubCategory", "headerCategoryId", "brand",
    "mainImage", "galleryImages", "price", "discPrice", "compareAtPrice", "stock", "variationType", "manufacturer",
    "madeIn", "tax", "fssaiLicNo", "totalAllowedQuantity", "isReturnable", "maxReturnDays", "returnPolicyText",
    "seoTitle", "seoKeywords", "seoDescription", "seoImageAlt", "pack", "shelfLife", "marketer", "tags", "condition",
    "modelNumber", "hsnCode", "attributes", "handlingTimeDays", "weightGrams", "dimensionsCm", "isShopByStoreOnly", "shopId",
  ];
  const data: any = {};
  for (const f of copyFields) if (source[f] !== undefined && source[f] !== null) data[f] = source[f];
  data.seller = sellerId;
  data.productName = `${source.productName} (Copy)`.slice(0, 150);
  data.variations = (source.variations || []).map((v: any) => ({
    name: v.name,
    value: v.value,
    price: v.price,
    discPrice: v.discPrice,
    stock: v.stock,
    status: v.status,
  }));
  Object.assign(data, { status: "Draft", requiresApproval: true, publish: true, listingVersion: 2, listingMethod: "copy" });
  ensureSkus(sellerId, data);

  const product = await Product.create(data);
  await auditProduct({ product, ...sellerActor(req), action: "CREATED_DRAFT", remarks: `Copied from "${source.productName}"` });
  return res.status(201).json({ success: true, message: "Draft created from your existing product", data: ownerView(product) });
});

export const uploadComplianceDoc = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const product = await Product.findOne({ _id: req.params.id, seller: sellerId });
  if (!product) return res.status(404).json({ success: false, message: "Product not found" });

  const docType = String(req.body.docType || "");
  const file = (req as any).file;
  const config = await configForProduct(product);
  if (!config.rule.requiredDocs.some((d) => d.key === docType)) {
    return res.status(400).json({ success: false, message: "That document isn't required for this product's category" });
  }
  if (!file) return res.status(400).json({ success: false, message: "Please choose a file to upload" });
  if (file.size > MAX_COMPLIANCE_BYTES) return res.status(400).json({ success: false, message: "File must be 10 MB or smaller" });

  const stored = await uploadPrivateDocument(sellerId, file.buffer, "exnshop/product-compliance");
  const previous: any = product.complianceDocs?.find((d) => d.docType === docType);
  if (previous) {
    await deletePrivateDocument(previous.publicId, previous.resourceType);
    (product.complianceDocs as any).pull(previous._id);
  }
  product.complianceDocs!.push({
    docType,
    publicId: stored.publicId,
    resourceType: stored.resourceType,
    format: stored.format,
    originalName: String(file.originalname || "").slice(0, 120),
    uploadedAt: new Date(),
    status: "Pending",
  } as any);
  await product.save();

  await auditProduct({
    product,
    ...sellerActor(req),
    action: previous ? "COMPLIANCE_REPLACED" : "COMPLIANCE_UPLOADED",
    changes: [{ field: docType, to: file.originalname }],
  });
  return res.status(200).json({ success: true, message: "Document uploaded", data: publicComplianceDocs(product, config.rule.requiredDocs) });
});

export const deleteComplianceDoc = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const product = await Product.findOne({ _id: req.params.id, seller: sellerId });
  const doc: any = product?.complianceDocs?.find((d: any) => String(d._id) === req.params.docId);
  if (!product || !doc) return res.status(404).json({ success: false, message: "Document not found" });

  await deletePrivateDocument(doc.publicId, doc.resourceType);
  (product.complianceDocs as any).pull(doc._id);
  await product.save();
  await auditProduct({ product, ...sellerActor(req), action: "COMPLIANCE_DELETED", changes: [{ field: doc.docType }] });

  const config = await configForProduct(product);
  return res.status(200).json({ success: true, data: publicComplianceDocs(product, config.rule.requiredDocs) });
});

export const getComplianceDocUrl = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const product = await Product.findOne({ _id: req.params.id, seller: sellerId });
  const doc: any = product?.complianceDocs?.find((d: any) => String(d._id) === req.params.docId);
  if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
  return res.status(200).json({ success: true, data: { url: signedDocumentUrl(doc) } });
});
