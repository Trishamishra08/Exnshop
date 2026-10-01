import { Router } from "express";
import {
  createCampaign,
  getMyCampaigns,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
} from "../modules/seller/controllers/campaignController";
import { authenticate, requireUserType, requireApprovedUser } from "../middleware/auth";

const router = Router();

router.use(authenticate);
router.use(requireUserType("Seller"));
router.use(requireApprovedUser);

router.post("/", createCampaign);
router.get("/my", getMyCampaigns);
router.put("/:id", updateCampaign);
router.patch("/:id/status", updateCampaignStatus);
router.delete("/:id", deleteCampaign);

export default router;
