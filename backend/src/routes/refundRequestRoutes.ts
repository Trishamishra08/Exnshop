import { Router, Request, Response } from "express";
import { authenticate, requireUserType, requireApprovedUser } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { REFUND_REASONS } from "../models/RefundRequest";
import { createRefundRequest, listMyRefundRequests, refundableItems } from "../services/sellerRefundService";
import { sendBroadcastNotification } from "../services/notificationService";

const router = Router();

router.use(authenticate, requireUserType("Seller"), requireApprovedUser);

const sellerId = (req: Request) => String((req as any).user.userId);

const handle = (fn: (req: Request) => Promise<any>, status = 200) =>
  asyncHandler(async (req: Request, res: Response) => {
    try {
      return res.status(status).json({ success: true, data: await fn(req) });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Request failed" });
    }
  });

// Reasons to choose from
router.get("/reasons", handle(async () => REFUND_REASONS));

// Items of an order (by number or id) that can still be refunded
router.get("/eligible/:orderRef", handle((req) => refundableItems(sellerId(req), req.params.orderRef)));

router.get("/my", handle((req) => listMyRefundRequests(sellerId(req))));

router.post(
  "/",
  handle(async (req) => {
    const created = await createRefundRequest(sellerId(req), req.body || {});
    sendBroadcastNotification(
      "Admin",
      "Seller refund request",
      `Order ${created.orderNumber}: ₹${created.refundAmount} refund asked (${created.reason}).`,
      { type: "Info", priority: "Medium", link: "/admin/refund-requests" },
    ).catch((err) => console.error("Failed to notify admins of refund request:", err?.message));
    return created;
  }, 201),
);

export default router;
