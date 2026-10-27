import { Router } from "express";
import {
  createCampaign,
  getMyCampaigns,
  updateCampaign,
  updateCampaignStatus,
  archiveCampaign,
  getCampaignAnalytics,
  deleteCampaign,
  getBidFeedback,
} from "../modules/seller/controllers/campaignController";
import { authenticate, requireUserType, requireApprovedUser } from "../middleware/auth";

const router = Router();

router.use(authenticate);
router.use(requireUserType("Seller"));
router.use(requireApprovedUser);

router.post("/", createCampaign);
router.get("/my", getMyCampaigns);
router.get("/bid-feedback", getBidFeedback);
router.get("/analytics", getCampaignAnalytics);
router.put("/:id", updateCampaign);
router.patch("/:id/status", updateCampaignStatus);
router.patch("/:id/archive", archiveCampaign);
router.delete("/:id", deleteCampaign);

export default router;
