import { Router } from "express";
import { authenticate, requireUserType } from "../middleware/auth";
import * as sellerNotificationController from "../modules/seller/controllers/sellerNotificationController";

import { getSellerSidebarCounts } from "../modules/seller/controllers/sellerSidebarCountsController";

const router = Router();

// Red numbers next to the seller sidebar entries
router.get("/sidebar-counts", authenticate, requireUserType("Seller"), getSellerSidebarCounts);

router.get(
  "/notifications",
  authenticate,
  requireUserType("Seller"),
  sellerNotificationController.getNotifications
);

router.put(
  "/notifications/:id/read",
  authenticate,
  requireUserType("Seller"),
  sellerNotificationController.markNotificationRead
);

export default router;

