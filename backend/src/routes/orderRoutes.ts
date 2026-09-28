import { Router } from "express";
import {
  getOrders,
  getOrderById,
  getOrderCODBreakdown,
  getOrderEarningBreakdownSeller,
  getSettlementOrders,
  updateOrderStatus,
  getPendingOrderAlerts,
  getAvailableDeliveryPartners,
  assignDeliveryBoySeller,
} from "../modules/seller/controllers/orderController";
import { authenticate, requireUserType, requireApprovedUser } from "../middleware/auth";

const router = Router();

// All routes require authentication, seller user type, and operational approval
router.use(authenticate);
router.use(requireUserType("Seller"));
router.use(requireApprovedUser);

// Get seller's orders with filters
router.get("/", getOrders);
// Pending actionable order alerts (must be before /:id)
router.get("/pending-alerts", getPendingOrderAlerts);
// Settlement page (must be before /:id)
router.get("/settlement", getSettlementOrders);

// Available delivery partners for manual seller assignment (must be before /:id)
router.get("/:id/available-delivery-partners", getAvailableDeliveryPartners);
// Manual seller delivery assignment
router.patch("/:id/assign-delivery", assignDeliveryBoySeller);
router.post("/:id/assign-delivery", assignDeliveryBoySeller);

// COD breakdown (admin commission, your earning, Self Assign note)
router.get("/:id/cod-breakdown", getOrderCODBreakdown);
// Earning breakdown for any order (COD or Online): your earning, delivery (Self / delivery partner)
router.get("/:id/earning-breakdown", getOrderEarningBreakdownSeller);

// Note: sellers cannot mark COD as paid — that reconciliation is admin/delivery-agent
// driven only (see admin cash collection flow). See markOrderCODPaidSeller removal.

// Update order status (support both PATCH and PUT)
router.patch("/:id/status", updateOrderStatus);
router.put("/:id/status", updateOrderStatus);

// Get order by ID (must be after specific sub-routes)
router.get("/:id", getOrderById);

export default router;

