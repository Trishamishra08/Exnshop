import mongoose from "mongoose";
import { Server as SocketIOServer } from "socket.io";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import { recomputeOrderFulfillment } from "./orderFulfillmentOrchestrator";
import { sendNotification } from "./notificationService";

const SELLER_RESPONSE_TIMEOUT_MS =
  Number(process.env.SELLER_TIMEOUT_MS) || 5 * 60 * 1000;

/**
 * Auto-rejects a seller's share of an order if they haven't accepted/rejected
 * within SELLER_TIMEOUT_MS of the order being placed. Mirrors the manual
 * reject path in seller/orderController.ts's updateOrderStatus (same
 * OrderItem/Order updates, same recomputeOrderFulfillment call) so fulfillment,
 * notifications and delivery dispatch all behave identically to a seller who
 * explicitly hit "Reject" — just triggered by a timeout instead of a tap.
 */
export const expireUnansweredSellerOrders = async (
  io?: SocketIOServer,
): Promise<{ expiredCount: number }> => {
  const cutoff = new Date(Date.now() - SELLER_RESPONSE_TIMEOUT_MS);

  const staleItems = await OrderItem.find({ sellerStatus: "Pending" }).select(
    "order seller",
  );
  if (staleItems.length === 0) return { expiredCount: 0 };

  const orderIds = [...new Set(staleItems.map((i) => i.order.toString()))];
  const orders = await Order.find({
    _id: { $in: orderIds },
    createdAt: { $lte: cutoff },
    status: { $nin: ["Cancelled", "Rejected", "Returned", "Delivered"] },
  });

  let expiredCount = 0;

  for (const order of orders) {
    // Online orders that haven't actually been paid yet aren't a seller's
    // problem to respond to — nothing to expire.
    const isOnlinePayment =
      order.paymentMethod === "Online" || order.paymentMethod === "razorpay";
    if (isOnlinePayment && order.paymentStatus !== "Paid") continue;

    const pendingSellerIds = [
      ...new Set(
        staleItems
          .filter((i) => i.order.toString() === order._id.toString())
          .map((i) => i.seller.toString()),
      ),
    ];
    if (pendingSellerIds.length === 0) continue;

    for (const sellerId of pendingSellerIds) {
      await OrderItem.updateMany(
        { order: order._id, seller: sellerId, sellerStatus: "Pending" },
        { $set: { sellerStatus: "Rejected", status: "Cancelled" } },
      );

      if (!order.sellerResponses) order.sellerResponses = [] as any;
      const sellerObjId = new mongoose.Types.ObjectId(sellerId);
      const existingIdx = (order.sellerResponses as any[]).findIndex(
        (r: any) => r.seller.toString() === sellerId,
      );
      if (existingIdx >= 0) {
        (order.sellerResponses as any[])[existingIdx].status = "Rejected";
        (order.sellerResponses as any[])[existingIdx].respondedAt = new Date();
      } else {
        (order.sellerResponses as any[]).push({
          seller: sellerObjId,
          status: "Rejected",
          respondedAt: new Date(),
        });
      }

      sendNotification(
        "Seller",
        sellerId,
        "Order auto-rejected (no response)",
        `Order #${order.orderNumber} was automatically rejected because you didn't respond within ${Math.round(
          SELLER_RESPONSE_TIMEOUT_MS / 60000,
        )} minutes.`,
        { type: "Order", link: `/seller/orders/${order._id}`, priority: "High" },
      ).catch((err) =>
        console.error("[SellerTimeout] Failed to send auto-reject notification:", err?.message),
      );

      console.log(
        `⏱️ [SellerTimeout] Auto-rejected seller ${sellerId}'s items on order ${order.orderNumber} (no response within ${SELLER_RESPONSE_TIMEOUT_MS}ms)`,
      );
      expiredCount++;
    }

    await order.save();
    await recomputeOrderFulfillment(order._id.toString(), io).catch((err) =>
      console.error(
        `[SellerTimeout] recomputeOrderFulfillment failed for order ${order._id}:`,
        err?.message,
      ),
    );
  }

  return { expiredCount };
};
