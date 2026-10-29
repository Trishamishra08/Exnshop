import mongoose from "mongoose";
import { Server as SocketIOServer } from "socket.io";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import AppSettings from "../models/AppSettings";
import { recomputeOrderFulfillment } from "./orderFulfillmentOrchestrator";
import { sendNotification } from "./notificationService";

/** Quick (rider) orders: the seller must respond within minutes. */
const SELLER_RESPONSE_TIMEOUT_MS =
  Number(process.env.SELLER_TIMEOUT_MS) || 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_ECOMMERCE_ACCEPT_DAYS = 3;

/** E-commerce (courier) orders: days to accept, set by the admin (default 3). */
export const getEcommerceAcceptDays = async (): Promise<number> => {
  const settings: any = await AppSettings.findOne().select("ecommerceSellerAcceptDays").lean();
  const days = Number(settings?.ecommerceSellerAcceptDays);
  return Number.isFinite(days) && days >= 1 ? days : DEFAULT_ECOMMERCE_ACCEPT_DAYS;
};

/** When a seller must accept this order by before it is auto-rejected. */
export const acceptDeadlineFor = (order: { channel?: string; createdAt?: Date }, ecommerceDays: number): Date => {
  const placed = new Date(order.createdAt || Date.now()).getTime();
  return new Date(placed + (order.channel === "ECommerce" ? ecommerceDays * DAY_MS : SELLER_RESPONSE_TIMEOUT_MS));
};

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
  const ecommerceDays = await getEcommerceAcceptDays();

  for (const order of orders) {
    // E-commerce orders give the seller days, not minutes, to accept.
    if (acceptDeadlineFor(order as any, ecommerceDays).getTime() > Date.now()) continue;
    const windowText = (order as any).channel === "ECommerce"
      ? `${ecommerceDays} day${ecommerceDays === 1 ? "" : "s"}`
      : `${Math.round(SELLER_RESPONSE_TIMEOUT_MS / 60000)} minutes`;

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
        `Order #${order.orderNumber} was automatically rejected because you didn't accept it within ${windowText}.`,
        { type: "Order", link: `/seller/orders/${order._id}`, priority: "High" },
      ).catch((err) =>
        console.error("[SellerTimeout] Failed to send auto-reject notification:", err?.message),
      );

      console.log(
        `⏱️ [SellerTimeout] Auto-rejected seller ${sellerId}'s items on order ${order.orderNumber} (no response within ${windowText})`,
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
