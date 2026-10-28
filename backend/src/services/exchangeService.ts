import Product from "../models/Product";

/**
 * Helpers for exchange requests. An exchange swaps an item for another variant
 * (size/colour) of the SAME product from the SAME seller. To avoid price
 * differences to collect or refund, only variants priced the same as the one
 * bought are offered.
 */

export const variantLabel = (v: any): string => [v?.name, v?.value].filter(Boolean).join(": ") || String(v?._id || "");
const priceOf = (v: any): number => (Number(v?.discPrice) > 0 ? Number(v.discPrice) : Number(v?.price) || 0);

/** Index of the variation an order item was bought as (matched by id, value or title, like the replacement order does). */
export const boughtVariationIndex = (product: any, itemVariation?: string): number =>
  (product?.variations || []).findIndex(
    (v: any) => itemVariation && (String(v._id) === String(itemVariation) || v.value === itemVariation || v.title === itemVariation),
  );

export interface ExchangeOption {
  id: string;
  label: string;
  stock: number;
}

export interface ExchangeOptions {
  current: string | null;
  canChooseVariant: boolean;
  options: ExchangeOption[];
}

/** Variants a customer can switch to: other variants of the product with the same price and units in stock. */
export const exchangeOptionsFor = async (item: { product: any; variation?: string }): Promise<ExchangeOptions> => {
  const product: any = await Product.findById(item.product?._id || item.product).select("variations").lean();
  const variations: any[] = product?.variations || [];
  if (variations.length < 2) return { current: null, canChooseVariant: false, options: [] };

  const idx = boughtVariationIndex(product, item.variation);
  const bought = idx >= 0 ? variations[idx] : null;
  const options = variations
    .filter((v, i) => i !== idx && (Number(v.stock) || 0) > 0 && v.status !== "Sold out" && (!bought || Math.abs(priceOf(v) - priceOf(bought)) < 0.01))
    .map((v) => ({ id: String(v._id), label: variantLabel(v), stock: Number(v.stock) || 0 }));
  return { current: bought ? variantLabel(bought) : null, canChooseVariant: true, options };
};

/** Seller-fault reasons: the seller bears the return pickup cost when the exchange is valid. */
export const isSellerFaultReason = (reason?: string) => /defect|damag|wrong|quality/i.test(reason || "");

/** Reasons that need photo proof before the request can be filed. */
export const needsPhotoProof = (reason?: string) => /defect|damag|wrong/i.test(reason || "");

// ─── Delivery charge for an exchange ─────────────────────────────────────────

import Return from "../models/Return";
import Order from "../models/Order";
import { returnPickupCharge } from "./shippingChargeService";

/**
 * Who pays the delivery of an exchange: the customer for a size/fit or colour
 * change they chose, the seller when the seller's mistake caused it (wrong size
 * or variant sent, defective, damaged, wrong product, quality).
 *
 * Amount: the shipping rate card for the item. A Quick doorstep swap is one rider
 * trip (one charge); a courier exchange is a pickup plus a delivery (two).
 */
export const exchangeShippingFor = async (
  reason: string,
  productId: any,
  quantity: number,
  channel: string | undefined,
): Promise<{ payer: "Customer" | "Seller"; amount: number }> => {
  const payer = isSellerFaultReason(reason) ? "Seller" : "Customer";
  const oneWay = await returnPickupCharge(productId, quantity);
  const trips = channel === "ECommerce" ? 2 : 1;
  return { payer, amount: Math.round(oneWay * trips * 100) / 100 };
};

/** The note shown on a replacement order. */
export const exchangeNote = (originalNumber: string | undefined, payer: "Customer" | "Seller", charge: number, collectOldItem: boolean): string => {
  const parts = [`EXCHANGE / REPLACEMENT for order #${originalNumber || "—"}. This is not a new purchase.`];
  parts.push(payer === "Customer" && charge > 0 ? `Delivery charge ₹${charge.toFixed(2)} is payable on delivery.` : "No payment is due for this order.");
  if (collectOldItem) parts.push("The delivery partner will collect the old item when delivering this one.");
  return parts.join(" ");
};

/**
 * Called when a rider has delivered a replacement order. For a doorstep swap the
 * old item is now with the rider: the return moves to "In Transit" under that
 * rider, so the usual "handed to seller" step and the seller's receipt check follow.
 */
export const completeSwapOnDelivery = async (orderId: string, riderId: string): Promise<void> => {
  const order: any = await Order.findById(orderId).select("exchangeInfo orderNumber").lean();
  const info = order?.exchangeInfo;
  if (!info?.collectOldItem) return;

  const ret: any = await Return.findById(info.returnId);
  if (!ret || !["Approved", "Pickup Pending", "Delivery Partner Assigned"].includes(ret.status)) return;

  const now = new Date();
  ret.deliveryBoy = riderId;
  ret.assignedAt = ret.assignedAt || now;
  ret.pickupOtpVerified = true; // the customer's delivery OTP confirmed this handover
  ret.pickedUpAt = now;
  ret.status = "In Transit";
  ret.inTransitAt = now;
  await ret.save();

  try {
    const item: any = await (await import("../models/OrderItem")).default.findById(ret.orderItem).select("seller productName").lean();
    if (item?.seller) {
      const { sendNotification } = await import("./notificationService");
      await sendNotification(
        "Seller",
        String(item.seller),
        "Old item is on its way back",
        `The replacement was delivered and the delivery partner collected the old ${item.productName}. You'll be asked to confirm receipt.`,
        { type: "Info", priority: "Medium", link: "/seller/returns" },
      );
    }
  } catch (err) {
    console.error("[Exchange] Seller notification after swap failed:", err);
  }
};

/**
 * Quick exchange on approval: create the replacement order now so one rider trip
 * delivers it and takes the old item back (a doorstep swap). If the replacement
 * can't be created (no stock), nothing changes and the normal flow applies: the
 * item is collected first, and the replacement follows once it is received.
 */
export const startDoorstepSwap = async (returnId: string, io?: any): Promise<{ started: boolean; message?: string }> => {
  const ret: any = await Return.findById(returnId);
  if (!ret || ret.requestType !== "EXCHANGE" || ret.replacementOrder) return { started: false };
  const order: any = await Order.findById(ret.order).select("channel").lean();
  if (!order || order.channel === "ECommerce") return { started: false };

  await Return.updateOne({ _id: returnId }, { $set: { doorstepSwap: true } });
  const { createReplacementOrder } = await import("./replacementOrderService");
  const result = await createReplacementOrder(returnId, io);
  if (!result.success) {
    await Return.updateOne({ _id: returnId }, { $set: { doorstepSwap: false } });
    return { started: false, message: result.message };
  }
  return { started: true, message: `Replacement order #${result.orderNumber} created. The rider will collect the old item when delivering it.` };
};
