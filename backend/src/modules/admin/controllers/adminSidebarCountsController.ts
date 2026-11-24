import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Notification from "../../../models/Notification";
import SupportTicket from "../../../models/SupportTicket";
import Customer from "../../../models/Customer";
import Seller from "../../../models/Seller";
import Return from "../../../models/Return";
import WithdrawRequest from "../../../models/WithdrawRequest";
import RefundRequest from "../../../models/RefundRequest";
import Claim from "../../../models/Claim";
import Order from "../../../models/Order";
import Delivery from "../../../models/Delivery";
import { listPendingSellerChanges } from "../../../services/sellerProfileChangeService";
import { listPendingDeliveryChanges } from "../../../services/deliveryProfileChangeService";

/** Tickets the admin still has to act on (not waiting on the requester, not resolved/closed). */
const OPEN_TICKET = ["Open", "Assigned", "In Progress"];

const safe = async (fn: () => Promise<number>) => {
  try {
    return await fn();
  } catch {
    return 0; // one failing count must not hide the others
  }
};

/**
 * GET /admin/sidebar-counts
 * How many items wait for the admin on each sidebar page, keyed by the page path.
 * The red number next to a menu entry clears as the admin handles the items.
 */
export const getSidebarCounts = asyncHandler(async (req: Request, res: Response) => {
  const adminId = (req as any).user?.userId;

  const [
    notifications,
    customerSupport,
    sellerSupport,
    bankRequests,
    sellerChanges,
    deliveryChanges,
    shippingMethods,
    returns,
    withdrawals,
    refundRequests,
    claims,
    newOrders,
    pendingSellers,
    pendingDelivery,
  ] = await Promise.all([
    safe(() => Notification.countDocuments({ recipientType: "Admin", recipientId: adminId, isRead: false })),
    safe(() => SupportTicket.countDocuments({ requesterType: "Customer", status: { $in: OPEN_TICKET } })),
    safe(() => SupportTicket.countDocuments({ requesterType: { $ne: "Customer" }, status: { $in: OPEN_TICKET } })),
    safe(() => Customer.countDocuments({ "pendingBankChange.status": "Pending" })),
    safe(async () => ((await listPendingSellerChanges()) as any[])?.length || 0),
    safe(async () => ((await listPendingDeliveryChanges()) as any[])?.length || 0),
    safe(() => Seller.countDocuments({ "shippingMethodRequest.status": "Pending" })),
    safe(() => Return.countDocuments({ status: "Pending" })),
    safe(() => WithdrawRequest.countDocuments({ status: "Pending" })),
    safe(() => RefundRequest.countDocuments({ status: "Pending" })),
    safe(() => Claim.countDocuments({ status: { $in: ["Raised", "Under Review"] } })),
    safe(() => Order.countDocuments({ status: "Received" })),
    safe(() => Seller.countDocuments({ onboardingStatus: "UnderReview" })),
    // Delivery partners with documents waiting for review
    safe(() => Delivery.countDocuments({ "documents.status": "Pending" })),
  ]);

  return res.json({
    success: true,
    data: {
      "/admin/notification": notifications,
      "/admin/customer-support": customerSupport,
      "/admin/seller-support": sellerSupport,
      "/admin/bank-requests": bankRequests,
      "/admin/seller-change-requests": sellerChanges,
      "/admin/delivery-change-requests": deliveryChanges,
      "/admin/shipping-method-requests": shippingMethods,
      "/admin/return": returns,
      "/admin/wallet": withdrawals,
      "/admin/refund-requests": refundRequests,
      "/admin/claims": claims,
      "/admin/orders/received": newOrders,
      "/admin/manage-seller/pending": pendingSellers,
      "/admin/delivery-boy/manage": pendingDelivery,
    },
  });
});
