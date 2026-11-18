import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import Notification from "../../../models/Notification";
import OrderItem from "../../../models/OrderItem";
import Order from "../../../models/Order";
import Return from "../../../models/Return";
import SupportTicket from "../../../models/SupportTicket";

const safe = async (fn: () => Promise<number>) => {
  try {
    return await fn();
  } catch {
    return 0;
  }
};

/**
 * GET /seller/sidebar-counts
 * Items waiting for this seller, keyed by sidebar path: unread notifications, new orders to
 * accept, return requests to decide, and support tickets the admin answered or needs info on.
 */
export const getSellerSidebarCounts = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = new mongoose.Types.ObjectId(String((req as any).user?.userId));

  const [notifications, newOrders, returns, tickets] = await Promise.all([
    safe(() => Notification.countDocuments({ recipientType: "Seller", recipientId: sellerId, isRead: false })),
    safe(async () => {
      const orderIds = await OrderItem.distinct("order", { seller: sellerId, sellerStatus: "Pending" });
      return Order.countDocuments({ _id: { $in: orderIds }, status: "Received" });
    }),
    safe(async () => {
      const itemIds = await OrderItem.distinct("_id", { seller: sellerId });
      return Return.countDocuments({ orderItem: { $in: itemIds }, status: "Pending" });
    }),
    safe(async () => {
      const open = await SupportTicket.find({ seller: sellerId, status: { $nin: ["Closed"] } })
        .select("status messages.sender")
        .lean();
      // Admin replied last, or asked the seller for more information.
      return open.filter((t: any) => t.status === "Waiting" || t.messages?.[t.messages.length - 1]?.sender === "Admin").length;
    }),
  ]);

  return res.json({
    success: true,
    data: {
      "/seller/notifications": notifications,
      "/seller/orders": newOrders,
      "/seller/return": returns,
      "/seller/support-tickets": tickets,
    },
  });
});
