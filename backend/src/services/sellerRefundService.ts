import mongoose from "mongoose";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Return from "../models/Return";
import RefundRequest, { REFUND_REASONS } from "../models/RefundRequest";
import { calculateItemRefundAmount, executeReturnRefundAndReversal } from "./refundSettlementService";

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

/** Units of an item that are already refunded/returned or have a return or refund in progress. */
const unitsTaken = async (orderItemId: any): Promise<number> => {
  const [returns, requests] = await Promise.all([
    Return.find({ orderItem: orderItemId, status: { $ne: "Rejected" } }).select("quantity").lean(),
    RefundRequest.find({ orderItem: orderItemId, status: { $in: ["Pending", "Processing"] } }).select("quantity").lean(),
  ]);
  // An approved request has already created a Return, which is counted in `returns`.
  return returns.reduce((a: number, r: any) => a + r.quantity, 0) + requests.reduce((a: number, r: any) => a + r.quantity, 0);
};

/** Delivered items of this seller on one order, with how many units can still be refunded on each. */
export const refundableItems = async (sellerId: string, orderRef: string) => {
  const ref = String(orderRef || "").trim().replace(/^#/, "");
  const order: any = await Order.findOne(mongoose.isValidObjectId(ref) ? { _id: ref } : { orderNumber: ref }).lean();
  if (!order) throw fail("Order not found", 404);
  const items: any[] = await OrderItem.find({ order: order._id, seller: sellerId }).lean();
  if (items.length === 0) throw fail("You don't have any items in this order", 403);
  if (order.status !== "Delivered") {
    throw fail(`Only delivered orders can be refunded here. This order is ${String(order.status).toLowerCase()}. For an undelivered order, cancel it instead.`);
  }
  const rows = [];
  for (const item of items) {
    if (["Cancelled", "Returned"].includes(item.status) || item.sellerStatus === "Rejected") continue;
    const left = item.quantity - (await unitsTaken(item._id));
    if (left <= 0) continue;
    rows.push({
      orderItemId: String(item._id),
      productName: item.productName,
      sku: item.sku,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      refundableQuantity: left,
    });
  }
  return { orderId: String(order._id), orderNumber: order.orderNumber, items: rows };
};

export const createRefundRequest = async (
  sellerId: string,
  input: { orderId?: string; orderItemId?: string; quantity?: number; reason?: string; noteToBuyer?: string; noteToSelf?: string },
) => {
  const quantity = Number(input.quantity);
  if (!input.orderId || !input.orderItemId) throw fail("Choose the order and the item to refund");
  if (!Number.isInteger(quantity) || quantity < 1) throw fail("Quantity must be at least 1");
  if (!REFUND_REASONS.includes(input.reason as any)) throw fail("Choose a reason for the refund");

  const eligible = await refundableItems(sellerId, input.orderId);
  const row = eligible.items.find((i) => i.orderItemId === input.orderItemId);
  if (!row) throw fail("This item can't be refunded. It may already be refunded or returned, or have a request waiting.", 409);
  if (quantity > row.refundableQuantity) throw fail(`You can refund at most ${row.refundableQuantity} unit(s) of this item`);

  const [order, item]: any[] = await Promise.all([Order.findById(eligible.orderId).lean(), OrderItem.findById(input.orderItemId).lean()]);
  const calc = calculateItemRefundAmount(item, quantity, order.subtotal, order.discount || 0);

  return RefundRequest.create({
    seller: sellerId,
    order: order._id,
    orderNumber: order.orderNumber,
    orderItem: item._id,
    productName: item.productName,
    quantity,
    reason: input.reason,
    noteToBuyer: input.noteToBuyer?.trim().slice(0, 255) || undefined,
    noteToSelf: input.noteToSelf?.trim().slice(0, 255) || undefined,
    refundAmount: calc.customerRefundAmount,
    status: "Pending",
  });
};

export const listMyRefundRequests = (sellerId: string) => RefundRequest.find({ seller: sellerId }).sort({ createdAt: -1 }).lean();

export const listAllRefundRequests = (status?: string) =>
  RefundRequest.find(status && status !== "All" ? { status } : {})
    .populate("seller", "sellerName storeName mobile")
    .sort({ createdAt: -1 })
    .lean();

/**
 * Admin decision. Approving runs the platform's normal return settlement
 * (customer refund to wallet/original payment, the seller's earning taken
 * back, commission cancelled) with no courier pickup, so no pickup charge.
 */
export const decideRefundRequest = async (id: string, decision: "Approved" | "Rejected", adminId: string, note?: string) => {
  if (!["Approved", "Rejected"].includes(decision)) throw fail("Decision must be Approved or Rejected");
  if (decision === "Rejected" && !note?.trim()) throw fail("Add a note for the seller when declining");

  // Claim it so two clicks can never refund twice.
  const request: any = await RefundRequest.findOneAndUpdate(
    { _id: id, status: "Pending" },
    { $set: { status: decision === "Approved" ? "Processing" : "Rejected", adminNote: note?.trim() || undefined, decidedBy: adminId, decidedAt: new Date() } },
    { new: true },
  );
  if (!request) throw fail("This request was already decided", 409);
  if (decision === "Rejected") return request;

  const [order, item]: any[] = await Promise.all([Order.findById(request.order).lean(), OrderItem.findById(request.orderItem).lean()]);
  if (!order || !item) {
    await RefundRequest.updateOne({ _id: id }, { $set: { status: "Failed", failureReason: "Order or item no longer exists" } });
    throw fail("The order or item no longer exists", 404);
  }

  const returnDoc: any = await Return.create({
    order: order._id,
    orderItem: item._id,
    customer: order.customer,
    requestType: "RETURN",
    initiatedBy: "Seller",
    reason: `Refund by seller: ${request.reason}`,
    description: request.noteToBuyer,
    quantity: request.quantity,
    status: "Approved",
  });

  const result = await executeReturnRefundAndReversal(String(returnDoc._id), adminId);
  if (!result.success) {
    // Nothing moved (the settlement is one transaction): drop the unused return so the item can be retried.
    await Return.deleteOne({ _id: returnDoc._id });
    await RefundRequest.updateOne({ _id: id }, { $set: { status: "Failed", failureReason: result.message } });
    throw fail(`Refund could not be completed: ${result.message}`, 500);
  }

  await RefundRequest.updateOne({ _id: id }, { $set: { status: "Approved", returnId: returnDoc._id } });
  return RefundRequest.findById(id).lean();
};
