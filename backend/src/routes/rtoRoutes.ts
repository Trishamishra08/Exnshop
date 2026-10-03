import { Router } from "express";
import {
  getRtoDashboard,
  getActiveRtoPromoBanners,
} from "../modules/seller/controllers/sellerRtoDashboardController";
import { authenticate, requireUserType, requireApprovedUser } from "../middleware/auth";

const router = Router();

router.use(authenticate);
router.use(requireUserType("Seller"));
router.use(requireApprovedUser);

router.get("/dashboard", getRtoDashboard);
router.get("/promo-banners", getActiveRtoPromoBanners);

export default router;
