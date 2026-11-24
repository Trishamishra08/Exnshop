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

// Delete the seller's own notifications (one, or all)
router.delete("/notifications/:id", authenticate, requireUserType("Seller"), sellerNotificationController.deleteNotification);
router.delete("/notifications", authenticate, requireUserType("Seller"), sellerNotificationController.clearNotifications);

export default router;

