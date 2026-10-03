import mongoose from "mongoose";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import RTOEvent from "../models/RTOEvent";
import { processOrderStatusTransition } from "./orderService";
import { reverseCommissions } from "./commissionService";
import { debitWallet } from "./walletManagementService";

export interface InitiateRtoParams {
  orderId: string;
  reasonCode: string;
  reason?: string;
  reverseShippingCost?: number;
  markedBy: string;
  markedByRole: "Delivery" | "Admin";
}

const RTO_ELIGIBLE_STATUSES = ["Shipped", "Picked up", "On the way", "Out for Delivery"];

/**
 * Marks an order as RTO (Return To Origin — courier tried to deliver, the
 * customer refused or was unreachable, the parcel goes back to the seller
 * without ever being accepted). ECommerce/courier-shipped orders only —
 * in-house Quick delivery has its own driver-retry flow, not a courier
 * network, so it's out of scope here.
 *
 * Creates one RTOEvent per seller represented on the order (most orders have
 * just one), restores inventory the same way a cancellation does, and
 * charges each seller their share of the reverse-shipping cost. Commission
 * reversal is called defensively but is expected to be a no-op in the common
 * case — commissions are only created once an order reaches "Delivered",
 * which an RTO order, by definition, never did.
 */
export async function initiateRto(params: InitiateRtoParams) {
  const { orderId, reasonCode, reason, reverseShippingCost, markedBy, markedByRole } = params;

  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  if (order.channel !== "ECommerce") {
    throw new Error("RTO can only be marked for ECommerce (courier-shipped) orders");
  }

  if (!RTO_ELIGIBLE_STATUSES.includes(order.status)) {
    throw new Error(
      `Cannot mark RTO from status "${order.status}". Order must be one of: ${RTO_ELIGIBLE_STATUSES.join(", ")}`
    );
  }

  const previousStatus = order.status;
  const courierName = order.shiprocket?.courierName;
  const cost = Math.max(0, Number(reverseShippingCost) || 0);

  order.status = "RTO";
  order.rtoDetails = {
    markedAt: new Date(),
    markedBy: new mongoose.Types.ObjectId(markedBy),
    markedByRole,
    reasonCode,
    reason,
    courierName,
    reverseShippingCost: cost,
    resolutionStatus: "Pending",
  };
  await order.save();

  // Restore inventory, exactly like a cancellation would.
  await processOrderStatusTransition(orderId, "RTO", previousStatus);

  // Safety net: reverse any commission that may already exist for this order.
  // Expected to be a no-op (see function doc), but cheap and idempotent.
  try {
    await reverseCommissions(orderId);
  } catch (err) {
    console.error("[RTO] reverseCommissions safety-net call failed:", err);
  }

  // One RTOEvent per seller represented on the order.
  const items = await OrderItem.find({ order: order._id });
  const itemsBySeller = new Map<string, mongoose.Types.ObjectId[]>();
  for (const item of items) {
    const key = item.seller.toString();
    if (!itemsBySeller.has(key)) itemsBySeller.set(key, []);
    itemsBySeller.get(key)!.push(item._id as mongoose.Types.ObjectId);
  }

  const rtoEvents = [];
  for (const [sellerId, orderItemIds] of itemsBySeller.entries()) {
    const rtoEvent = await RTOEvent.create({
      order: order._id,
      orderItems: orderItemIds,
      seller: sellerId,
      courierName,
      reasonCode,
      reason,
      markedBy: new mongoose.Types.ObjectId(markedBy),
      markedByRole,
      reverseShippingCost: cost,
      status: "Initiated",
      financialSettlementStatus: "Pending",
    });

    // The real financial consequence of an RTO: the seller bears the
    // reverse-shipping cost — not a commission reversal (there is usually
    // none to reverse), a direct debit for the courier's return-trip fee.
    if (cost > 0) {
      await debitWallet(
        sellerId,
        "SELLER",
        cost,
        `Reverse shipping cost for RTO on order #${order.orderNumber}`,
        order._id.toString(),
        undefined,
        `RTO-${rtoEvent._id}`,
        "RTO_REVERSE_SHIPPING_DEBIT"
      );
    }

    rtoEvent.financialSettlementStatus = "Completed";
    rtoEvent.commissionReversalDone = true;
    await rtoEvent.save();

    await OrderItem.updateMany(
      { _id: { $in: orderItemIds } },
      { $set: { rtoReversed: true, status: "RTO" } }
    );

    rtoEvents.push(rtoEvent);
  }

  return { order, rtoEvents };
}

/**
 * Admin-side resolution update once the physically-returned parcel's status
 * changes (e.g. courier confirms it reached the seller's warehouse).
 */
export async function updateRtoResolution(
  rtoEventId: string,
  resolutionStatus: "InTransit" | "ReceivedBySeller" | "Disposed" | "Lost"
) {
  const rtoEvent = await RTOEvent.findById(rtoEventId);
  if (!rtoEvent) {
    throw new Error("RTO event not found");
  }

  const statusMap: Record<string, "InTransit" | "ReceivedBySeller" | "Disposed" | "Lost"> = {
    InTransit: "InTransit",
    ReceivedBySeller: "ReceivedBySeller",
    Disposed: "Disposed",
    Lost: "Lost",
  };
  rtoEvent.status = statusMap[resolutionStatus];
  await rtoEvent.save();

  const orderResolutionMap: Record<
    string,
    "InTransitBackToSeller" | "ReceivedBySeller" | "Disposed" | "Lost"
  > = {
    InTransit: "InTransitBackToSeller",
    ReceivedBySeller: "ReceivedBySeller",
    Disposed: "Disposed",
    Lost: "Lost",
  };
  await Order.findByIdAndUpdate(rtoEvent.order, {
    $set: {
      "rtoDetails.resolutionStatus": orderResolutionMap[resolutionStatus],
      "rtoDetails.resolvedAt":
        resolutionStatus === "ReceivedBySeller" || resolutionStatus === "Disposed" || resolutionStatus === "Lost"
          ? new Date()
          : undefined,
    },
  });

  return rtoEvent;
}
