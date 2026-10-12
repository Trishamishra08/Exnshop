import { Router, Request, Response } from "express";
import Order, { IOrder } from "../models/Order";

const router = Router();

// Terminal statuses that should never be overwritten by a late/out-of-order webhook
const TERMINAL_STATUSES = new Set(["Delivered", "Cancelled", "Rejected", "Returned"]);

/**
 * Maps Shiprocket's free-form `current_status` values onto our Order status enum.
 * Returns undefined when the status isn't recognized, so the caller can leave
 * `order.status` untouched while still recording the raw Shiprocket status.
 */
function mapShiprocketStatus(rawStatus: string | undefined): IOrder["status"] | undefined {
  if (!rawStatus) return undefined;
  const normalized = rawStatus.trim().toUpperCase().replace(/[_-]/g, " ");

  if (["DELIVERED", "RTO DELIVERED"].includes(normalized)) return "Delivered";
  if (normalized.startsWith("RTO")) return "RTO";
  if (["OUT FOR DELIVERY"].includes(normalized)) return "Out for Delivery";
  if (["PICKED UP", "PICKUP COMPLETE"].includes(normalized)) return "Picked up";
  if (
    [
      "SHIPPED",
      "IN TRANSIT",
      "READY TO SHIP",
      "PICKUP SCHEDULED",
      "PICKUP GENERATED",
      "PICKUP QUEUED",
      "INVOICED",
      "MANIFEST GENERATED",
    ].includes(normalized)
  )
    return "Shipped";
  if (["CANCELED", "CANCELLED"].includes(normalized)) return "Cancelled";

  return undefined;
}

/**
 * Shiprocket tracking webhook — receives shipment status updates and
 * reflects them onto the matching Order's `shiprocket` sub-document, and
 * (when recognized) onto the customer/admin-facing `order.status` field too.
 * Configure `/api/v1/webhooks/courier-tracking` in the Shiprocket dashboard.
 */
const handleTrackingWebhook = async (req: Request, res: Response) => {
  try {
    const expectedToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;
    if (expectedToken && req.get("x-api-key") !== expectedToken) {
      return res.status(401).json({ success: false, message: "Invalid webhook token" });
    }

    const { awb, current_status, order_id, track_url } = req.body || {};

    // Shiprocket's "Test Webhook" ping has no shipment identifiers and must get a 200.
    if (!awb && !order_id) {
      return res.status(200).json({ success: true, message: "Webhook reachable" });
    }

    const query = awb ? { "shiprocket.awbCode": awb } : { "shiprocket.orderId": String(order_id) };
    const order = await Order.findOne(query);

    if (!order) {
      // Not an error from Shiprocket's perspective — just nothing to update yet
      return res.status(200).json({ success: true, message: "No matching order found" });
    }

    order.shiprocket = {
      ...order.shiprocket,
      awbCode: awb || order.shiprocket?.awbCode,
      status: current_status || order.shiprocket?.status,
      trackingUrl: track_url || order.shiprocket?.trackingUrl,
    };

    const mappedStatus = mapShiprocketStatus(current_status);
    if (mappedStatus && !TERMINAL_STATUSES.has(order.status)) {
      order.status = mappedStatus;
      if (mappedStatus === "Delivered" && !order.deliveredAt) {
        order.deliveredAt = new Date();
      }
    }

    await order.save();

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error handling Shiprocket webhook:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Shiprocket rejects webhook URLs containing "shiprocket", "sr", "kr" etc., so
// the dashboard must use the neutral path; the old one is kept for compatibility.
router.post("/courier-tracking", handleTrackingWebhook);
router.post("/shiprocket", handleTrackingWebhook);

export default router;
