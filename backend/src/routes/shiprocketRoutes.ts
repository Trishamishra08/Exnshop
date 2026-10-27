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

  // "RTO DELIVERED" is the parcel reaching the seller again — a return, not a delivery.
  if (normalized.startsWith("RTO")) return "RTO";
  if (normalized === "DELIVERED") return "Delivered";
  if (["OUT FOR DELIVERY"].includes(normalized)) return "Out for Delivery";
  if (["PICKED UP", "PICKUP COMPLETE"].includes(normalized)) return "Picked up";
  if (["SHIPPED", "IN TRANSIT"].includes(normalized)) return "Shipped";
  // READY TO SHIP / PICKUP SCHEDULED / MANIFEST GENERATED … happen while the parcel
  // is still with the seller: the order stays "Packed" until the courier picks it up.
  if (["CANCELED", "CANCELLED"].includes(normalized)) return "Cancelled";

  return undefined;
}

const PROGRESS_RANK: Partial<Record<IOrder["status"], number>> = {
  Shipped: 1,
  "Picked up": 1,
  "Out for Delivery": 2,
  Delivered: 3,
};

/**
 * For an order split into several shipments, the customer-facing status is the
 * least-advanced shipment's — the order isn't "Delivered" until every parcel is.
 */
function overallStatus(rawStatuses: (string | undefined)[]): IOrder["status"] | undefined {
  const mapped = rawStatuses.map(mapShiprocketStatus);
  if (mapped.some((s) => !s)) return undefined;
  if (mapped.every((s) => s === mapped[0])) return mapped[0];
  const inProgress = mapped.filter((s) => s && PROGRESS_RANK[s] !== undefined) as IOrder["status"][];
  if (inProgress.length === 0) return undefined;
  return inProgress.reduce((least, s) => (PROGRESS_RANK[s]! < PROGRESS_RANK[least]! ? s : least));
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

    const { awb, current_status, order_id, sr_order_id, track_url, courier_name } = req.body || {};

    // Shiprocket's "Test Webhook" ping has no shipment identifiers and must get a 200.
    if (!awb && !order_id && !sr_order_id) {
      return res.status(200).json({ success: true, message: "Webhook reachable" });
    }

    // E-commerce return pickups ("RET-…") are tracked on their Return, not the order.
    const { applyCourierReturnUpdate } = await import("../services/courierReturnService");
    if (await applyCourierReturnUpdate(req.body)) {
      return res.status(200).json({ success: true });
    }

    // `order_id` is the id we sent (our order number, "-N" suffixed per seller);
    // `sr_order_id` is Shiprocket's own id. The AWB isn't known until a courier
    // is assigned, so it can't be the only lookup key.
    const channelOrderId = order_id != null ? String(order_id) : undefined;
    const srOrderId = sr_order_id != null ? String(sr_order_id) : undefined;
    const or: any[] = [];
    if (awb) or.push({ "shiprocket.awbCode": awb }, { "shiprocketShipments.awbCode": awb });
    if (channelOrderId) {
      or.push(
        { "shiprocketShipments.channelOrderId": channelOrderId },
        { orderNumber: channelOrderId },
        { "shiprocket.orderId": channelOrderId }
      );
    }
    if (srOrderId) or.push({ "shiprocket.orderId": srOrderId }, { "shiprocketShipments.orderId": srOrderId });

    const order = await Order.findOne({ $or: or });

    if (!order) {
      // Not an error from Shiprocket's perspective — just nothing to update yet
      return res.status(200).json({ success: true, message: "No matching order found" });
    }

    const shipments = order.shiprocketShipments || [];
    const shipment = shipments.find(
      (s) =>
        (awb && s.awbCode === awb) ||
        (channelOrderId && s.channelOrderId === channelOrderId) ||
        (srOrderId && s.orderId === srOrderId)
    );
    if (shipment) {
      shipment.awbCode = awb || shipment.awbCode;
      shipment.status = current_status || shipment.status;
      shipment.trackingUrl = track_url || shipment.trackingUrl;
      shipment.courierName = courier_name || shipment.courierName;
      order.markModified("shiprocketShipments");
    }

    // `shiprocket` mirrors the first shipment (what the admin Shipments page shows).
    const isPrimary = !shipment || shipment === shipments[0];
    if (isPrimary) {
      order.shiprocket = {
        ...order.shiprocket,
        awbCode: awb || order.shiprocket?.awbCode,
        status: current_status || order.shiprocket?.status,
        trackingUrl: track_url || order.shiprocket?.trackingUrl,
        courierName: courier_name || order.shiprocket?.courierName,
      };
    }

    const wasDelivered = order.status === "Delivered";
    const mappedStatus =
      shipments.length > 1 ? overallStatus(shipments.map((s) => s.status)) : mapShiprocketStatus(current_status);
    const isNewRto = mappedStatus === "RTO" && order.status !== "RTO" && !TERMINAL_STATUSES.has(order.status);
    if (mappedStatus && !isNewRto && !TERMINAL_STATUSES.has(order.status)) {
      order.status = mappedStatus;
      if (mappedStatus === "Delivered" && !order.deliveredAt) {
        order.deliveredAt = new Date();
      }
    }

    await order.save();

    // Delivered by the courier: release the sellers' earnings (into the
    // return-window hold, then the wallet) — the same step a rider's delivery
    // triggers. COD courier orders have no earning records yet (those are only
    // created on online payment), so create them first.
    if (!wasDelivered && order.status === "Delivered") {
      try {
        const Commission = (await import("../models/Commission")).default;
        const { createPendingCommissions, distributeCommissions } = await import("../services/commissionService");
        if (!(await Commission.exists({ order: order._id, type: "SELLER" }))) {
          await createPendingCommissions(String(order._id));
        }
        const result = await distributeCommissions(String(order._id));
        if (!result.success) {
          console.error(`[Shiprocket] Earnings release failed for ${order.orderNumber}: ${result.message}`);
        }
      } catch (err: any) {
        console.error(`[Shiprocket] Earnings release failed for ${order.orderNumber}:`, err.message);
      }
    }

    // Courier is returning the parcel: run the full RTO (record, stock back,
    // customer refund), the same as when an admin marks it by hand.
    if (isNewRto) {
      try {
        const { initiateRto } = await import("../services/rtoService");
        await initiateRto({
          orderId: String(order._id),
          reasonCode: "COURIER_RTO",
          reason: current_status ? `Courier status: ${current_status}` : "Reported by the courier",
          markedByRole: "System",
        });
      } catch (err: any) {
        // Not RTO-eligible from its current status (e.g. never picked up): still record the status.
        console.error(`[Shiprocket] Full RTO handling failed for ${order.orderNumber}:`, err.message);
        await Order.updateOne({ _id: order._id }, { $set: { status: "RTO" } });
      }
    }

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
