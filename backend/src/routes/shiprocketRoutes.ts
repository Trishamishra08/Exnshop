import { Router, Request, Response } from "express";
import Order from "../models/Order";

const router = Router();

/**
 * Shiprocket tracking webhook — receives shipment status updates and
 * reflects them onto the matching Order's `shiprocket` sub-document.
 * Configure this URL (`/api/webhooks/shiprocket`) in the Shiprocket dashboard.
 */
router.post("/shiprocket", async (req: Request, res: Response) => {
  try {
    const { awb, current_status, order_id, track_url } = req.body || {};

    if (!awb && !order_id) {
      return res.status(400).json({ success: false, message: "Missing awb/order_id in webhook payload" });
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
    await order.save();

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error handling Shiprocket webhook:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
