import { Router } from "express";
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  updateStock,
  updateProductStatus,
  bulkUpdateStock,
  getBulkUploadTemplate,
  bulkUploadProducts,
  getShops,
  getAllowedHeaderCategories,
} from "../modules/seller/controllers/productController";
import {
  getListingConfig,
  createDraft,
  duplicateProduct,
  uploadComplianceDoc,
  deleteComplianceDoc,
  getComplianceDocUrl,
} from "../modules/seller/controllers/productListingController";
import { getBrands } from "../modules/admin/controllers/adminProductController";
import { authenticate, requireUserType, requireApprovedUser } from "../middleware/auth";
import { uploadCsv, uploadDocument, handleUploadError } from "../middleware/upload";

const router = Router();

// All routes require authentication, seller user type, and operational approval
router.use(authenticate);
router.use(requireUserType("Seller"));
router.use(requireApprovedUser);

// Get allowed header categories for this seller (based on registration)
router.get("/allowed-header-categories", getAllowedHeaderCategories);

// Get all brands - sellers need this for product creation
router.get("/brands", getBrands);

// Get all active shops - sellers need this for shop-by-store-only products
router.get("/shops", getShops);

// Bulk upload (template download + CSV upload) — must come before "/:id"
router.get("/bulk-upload-template", getBulkUploadTemplate);
router.post(
  "/bulk-upload",
  uploadCsv.single("file"),
  handleUploadError,
  bulkUploadProducts
);

// Guided listing flow (must come before "/:id")
router.get("/listing-config", getListingConfig);
router.post("/draft", createDraft);

// Create product
router.post("/", createProduct);

// Copy one of the seller's own products into a new draft
router.post("/:id/duplicate", duplicateProduct);

// Compliance documents for regulated categories
router.post("/:id/compliance", uploadDocument.single("file"), handleUploadError, uploadComplianceDoc);
router.delete("/:id/compliance/:docId", deleteComplianceDoc);
router.get("/:id/compliance/:docId/url", getComplianceDocUrl);

// Get seller's products with filters
router.get("/", getProducts);

// Get product by ID
router.get("/:id", getProductById);

// Update product
router.put("/:id", updateProduct);

// Delete product
router.delete("/:id", deleteProduct);

// Update stock for a product variation
router.patch("/:id/variations/:variationId/stock", updateStock);

// Bulk update stock
router.patch("/bulk-stock-update", bulkUpdateStock);

// Update product status (publish, popular, dealOfDay)
router.patch("/:id/status", updateProductStatus);

export default router;
