import { Router } from "express";
import { authenticate, requireUserType } from "../middleware/auth";
import { uploadDocument as documentUpload, handleUploadError } from "../middleware/upload";
import * as onboarding from "../modules/seller/controllers/sellerOnboardingController";

// Not behind requireApprovedUser: unapproved sellers must be able to finish onboarding.
const router = Router();
router.use(authenticate, requireUserType("Seller"));

router.get("/", onboarding.getOnboarding);
router.put("/business", onboarding.saveBusiness);
router.put("/bank", onboarding.saveBank);
router.put("/store", onboarding.saveStore);
router.post("/documents", documentUpload.single("file"), handleUploadError, onboarding.uploadDocument);
router.delete("/documents/:docId", onboarding.deleteDocument);
router.get("/documents/:docId/url", onboarding.getDocumentUrl);
router.post("/submit", onboarding.submitOnboarding);

export default router;
