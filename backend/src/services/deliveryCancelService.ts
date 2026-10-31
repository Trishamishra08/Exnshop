import { Server as SocketIOServer } from "socket.io";
import Order from "../models/Order";
import Delivery from "../models/Delivery";
import AppSettings from "../models/AppSettings";
import DeliveryCancellation from "../models/DeliveryCancellation";
import { chargeWalletDue, creditWallet } from "./walletManagementService";
import { dispatchOrderToDeliveryBoys } from "./orderNotificationService";
import { expireDeliveryOffersForOrder } from "./orderAlertService";
import { sendNotification } from "./notificationService";

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export const CANCEL_REASONS = [
  "Vehicle breakdown",
  "Medical or family emergency",
  "Accident or road blocked",
  "Seller not ready / shop closed",
  "Wrong or unreachable address",
  "Other",
];

export const getCancelPenalty = async (): Promise<number> => {
  const settings: any = await AppSettings.findOne().select("deliveryCancelPenalty").lean();
  const p = Number(settings?.deliveryCancelPenalty);
  return Number.isFinite(p) && p >= 0 ? p : 50;
};

/** Rings the nearby live riders again (skipping the ones who cancelled this order). */
const ringAgain = async (orderId: string, io?: SocketIOServer) => {
  await expireDeliveryOffersForOrder(orderId).catch(() => undefined);
  await Order.findByIdAndUpdate(orderId, { $set: { deliveryAssignmentStatus: "NotStarted" } });
  const fresh = await Order.findById(orderId).lean();
  if (fresh && io) await dispatchOrderToDeliveryBoys(fresh, io);
};

/**
 * A delivery partner who accepted a Quick order cancels it before picking it up.
 * The penalty is charged to their wallet straight away (they can ask for it back if the
 * reason is genuine, and the admin decides), the order goes back to "Accepted" and
 * nearby partners are rung again.
 */
export const cancelAcceptedDelivery = async (
  orderId: string,
  deliveryBoyId: string,
  reason: string,
  note: string | undefined,
  io?: SocketIOServer,
) => {
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw fail("Please choose a reason for cancelling");

  const order: any = await Order.findById(orderId);
  if (!order) throw fail("Order not found", 404);
  if ((order.channel || "Quick") !== "Quick") throw fail("Only Quick orders can be cancelled by the delivery partner");
  if (!order.deliveryBoy || String(order.deliveryBoy) !== String(deliveryBoyId)) {
    throw fail("This order is not assigned to you", 403);
  }
  if (order.deliveryBoyStatus && order.deliveryBoyStatus !== "Assigned") {
    throw fail("You have already picked this order up. Contact support if you can't deliver it.");
  }
  if (["Delivered", "Cancelled", "Rejected", "Returned"].includes(order.status)) {
    throw fail("This order can no longer be cancelled");
  }

  const penalty = await getCancelPenalty();

  // Free the order first, so another rider can take it even if a later step fails.
  const freed = await Order.findOneAndUpdate(
    { _id: orderId, deliveryBoy: deliveryBoyId },
    {
      $unset: { deliveryBoy: "", assignedAt: "", deliveryBoyStatus: "" },
      $set: { status: "Accepted", deliveryAssignmentStatus: "NotStarted" },
      $addToSet: { deliveryCancelledBy: deliveryBoyId },
    },
    { new: true },
  );
  if (!freed) throw fail("This order was already reassigned");

  const reference = `DELCANCEL-${orderId}-${deliveryBoyId}-${Date.now()}`;
  const charged = await chargeWalletDue(
    "DELIVERY_BOY",
    deliveryBoyId,
    penalty,
    `Penalty for cancelling Quick order ${order.orderNumber} after accepting it`,
    reference,
    "DELIVERY_CANCEL_PENALTY",
    orderId,
  );

  const record = await DeliveryCancellation.create({
    order: order._id,
    orderNumber: order.orderNumber,
    deliveryBoy: deliveryBoyId,
    reason: cleanReason.slice(0, 200),
    note: String(note || "").trim().slice(0, 500) || undefined,
    penalty: charged ? penalty : 0,
    status: charged ? "Charged" : "Waived",
    chargeReference: charged ? reference : undefined,
  });

  const rider: any = await Delivery.findById(deliveryBoyId).select("name").lean();
  const { sendBroadcastNotification } = await import("./notificationService");
  await sendBroadcastNotification(
    "Admin",
    "Delivery partner cancelled an order",
    `${rider?.name || "A delivery partner"} cancelled Quick order #${order.orderNumber} (${cleanReason}). ₹${charged ? penalty : 0} penalty charged. Review it in Delivery Cancellations.`,
    { type: "Warning", link: "/admin/delivery-cancellations", priority: "High" },
  ).catch(() => undefined);

  await ringAgain(orderId, io);
  return record;
};

/** Seller: ring nearby live riders again when nobody took the order (or the rider cancelled). */
export const sellerRingAgain = async (orderId: string, sellerId: string, io?: SocketIOServer) => {
  const order: any = await Order.findById(orderId).populate({ path: "items", select: "seller" });
  if (!order) throw fail("Order not found", 404);
  const mine = (order.items || []).some((i: any) => String(i.seller?._id || i.seller) === String(sellerId));
  if (!mine) throw fail("This order is not yours", 403);
  if ((order.channel || "Quick") !== "Quick") throw fail("Only Quick orders have delivery partners");
  if (order.status !== "Accepted" || order.deliveryBoy) throw fail("This order already has a delivery partner or is not waiting for one");
  if (order.deliveryPreference === "Self") throw fail("You chose to deliver this order yourself");
  await ringAgain(orderId, io);
  return { success: true };
};

/** Admin: refund the penalty when the rider's reason was genuine, or keep it. */
export const decideCancellation = async (
  id: string,
  decision: "Refunded" | "Charged",
  admin: { id?: string },
  remarks?: string,
) => {
  const rec: any = await DeliveryCancellation.findById(id);
  if (!rec) throw fail("Cancellation not found", 404);
  if (!["Refunded", "Charged"].includes(decision)) throw fail("Decision must be Refunded or Charged");
  if (rec.status === decision) throw fail(`Already ${decision.toLowerCase()}`);
  if (rec.status === "Waived") throw fail("No penalty was charged on this one");

  if (decision === "Refunded") {
    const res = await creditWallet(
      String(rec.deliveryBoy),
      "DELIVERY_BOY",
      rec.penalty,
      `Penalty refunded for cancelled order ${rec.orderNumber} (reason accepted)`,
      String(rec.order),
      undefined,
      undefined,
      `PENALTYREFUND-${rec._id}`,
      "PENALTY_REFUND",
    );
    if (!res.success) throw fail(res.message || "Could not refund the penalty");
  } else {
    // Taking a refunded penalty back.
    await chargeWalletDue(
      "DELIVERY_BOY",
      String(rec.deliveryBoy),
      rec.penalty,
      `Penalty re-charged for cancelled order ${rec.orderNumber}`,
      `PENALTYRECHARGE-${rec._id}-${Date.now()}`,
      "DELIVERY_CANCEL_PENALTY",
      String(rec.order),
    );
  }
  rec.status = decision;
  rec.decidedBy = admin.id;
  rec.decidedAt = new Date();
  rec.adminRemarks = String(remarks || "").trim().slice(0, 500) || undefined;
  await rec.save();

  await sendNotification(
    "Delivery",
    String(rec.deliveryBoy),
    decision === "Refunded" ? "Penalty refunded" : "Penalty kept",
    decision === "Refunded"
      ? `₹${rec.penalty} was refunded to your wallet for the cancelled order #${rec.orderNumber}.`
      : `Your cancellation of order #${rec.orderNumber} was reviewed and the ₹${rec.penalty} penalty stays.${rec.adminRemarks ? ` ${rec.adminRemarks}` : ""}`,
    { type: decision === "Refunded" ? "Success" : "Warning", link: "/delivery/wallet", priority: "Medium" },
  ).catch(() => undefined);
  return rec;
};

export const listCancellations = async (status?: string) =>
  DeliveryCancellation.find(status && status !== "All" ? { status } : {})
    .populate("deliveryBoy", "name mobile")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();
