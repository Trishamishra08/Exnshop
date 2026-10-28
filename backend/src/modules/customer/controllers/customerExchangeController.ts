import { Request, Response } from "express";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import Return from "../../../models/Return";
import { exchangeOptionsFor, exchangeShippingFor } from "../../../services/exchangeService";
import { sendNotification, sendBroadcastNotification } from "../../../services/notificationService";

/** GET /customer/orders/:orderId/items/:itemId/exchange-options: variants the customer can switch an item to. */
export const getExchangeOptions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const order = await Order.findOne({ _id: req.params.orderId, customer: userId }).select("_id items channel").lean();
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    const item: any = await OrderItem.findOne({ _id: req.params.itemId, order: order._id }).lean();
    if (!item) return res.status(404).json({ success: false, message: "Item not found in this order" });
    const options = await exchangeOptionsFor(item);
    const reason = typeof req.query.reason === "string" ? req.query.reason : "";
    const shipping = await exchangeShippingFor(reason, item.product, item.quantity, (order as any).channel);
    return res.status(200).json({ success: true, data: { ...options, shipping } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Could not load exchange options" });
  }
};

/**
 * POST /customer/returns/:id/exchange-choice
 * When the replacement can't be sent (no stock): the customer picks a refund,
 * or keeps waiting for the seller to restock.
 */
export const chooseExchangeOutcome = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const choice = req.body?.choice;
    if (!["refund", "wait"].includes(choice)) return res.status(400).json({ success: false, message: "Choose refund or wait" });

    const ret: any = await Return.findOne({ _id: req.params.id, customer: userId });
    if (!ret) return res.status(404).json({ success: false, message: "Request not found" });
    if (ret.requestType !== "EXCHANGE" || ret.exchangeState !== "OutOfStock") {
      return res.status(400).json({ success: false, message: "There's nothing to choose on this request right now." });
    }

    const item: any = await OrderItem.findById(ret.orderItem).select("seller productName").lean();

    if (choice === "wait") {
      if (item?.seller) {
        sendNotification("Seller", String(item.seller), "Customer is waiting for a replacement", `${item.productName}: restock it and use "Create replacement" on the exchange.`, {
          type: "Warning",
          priority: "High",
        }).catch(() => undefined);
      }
      return res.status(200).json({ success: true, message: "We'll keep your exchange open. The seller has been asked to restock." });
    }

    // Refund: the exchange becomes a return for the item the seller already received back.
    ret.requestType = "RETURN";
    ret.financialSettlementStatus = "Pending";
    ret.exchangeState = "RefundInitiated";
    ret.status = "Handed To Seller";
    ret.requestedVariation = undefined;
    await ret.save();

    const { executeReturnRefundAndReversal } = await import("../../../services/refundSettlementService");
    const result = await executeReturnRefundAndReversal(String(ret._id));
    if (!result.success) {
      // Put it back so the customer can choose again.
      await Return.updateOne(
        { _id: ret._id },
        { $set: { requestType: "EXCHANGE", exchangeState: "OutOfStock", status: "Completed", financialSettlementStatus: "Completed" } },
      );
      sendBroadcastNotification("Admin", "Exchange refund failed", `Refund for exchange ${ret._id} failed: ${result.message}`, { type: "Warning", priority: "High", link: "/admin/returns" }).catch(() => undefined);
      return res.status(500).json({ success: false, message: `We couldn't process the refund right now: ${result.message}` });
    }
    return res.status(200).json({ success: true, message: "Your refund has been started." });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Could not save your choice" });
  }
};
