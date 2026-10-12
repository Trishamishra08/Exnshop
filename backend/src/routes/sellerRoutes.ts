import { Router } from "express";
import {
  getAllSellers,
  getSellerById,
  updateSellerStatus,
  updateSeller,
  deleteSeller,
  updateSellerCategoryCommissions,
} from "../modules/seller/controllers/sellerController";
import {
  getSellerOnboarding,
  getSellerDocumentUrl,
  reviewSellerDocument,
  reviewSellerSection,
  decideSellerOnboarding,
  runSellerVerifications,
} from "../modules/admin/controllers/adminSellerOnboardingController";
import { authenticate, requireUserType } from "../middleware/auth";

const router = Router();

// All routes require authentication and admin user type
router.use(authenticate);
router.use(requireUserType("Admin"));

// Onboarding / KYC review
router.get("/:id/onboarding", getSellerOnboarding);
router.get("/:id/documents/:docId/url", getSellerDocumentUrl);
router.patch("/:id/documents/:docId", reviewSellerDocument);
router.post("/:id/verifications/run", runSellerVerifications);
router.post("/:id/onboarding/review", reviewSellerSection);
router.post("/:id/onboarding/decision", decideSellerOnboarding);

// Get all sellers
router.get("/", getAllSellers);

// Get seller by ID
router.get("/:id", getSellerById);

// Update seller status
router.patch("/:id/status", updateSellerStatus);

// Update seller category commissions
router.put("/:id/category-commissions", updateSellerCategoryCommissions);

// Update seller details
router.put("/:id", updateSeller);

// Delete seller
router.delete("/:id", deleteSeller);

export default router;
