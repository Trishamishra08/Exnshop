import { Server as SocketIOServer } from "socket.io";
import Return from "../models/Return";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Product from "../models/Product";
import { boughtVariationIndex, exchangeNote } from "./exchangeService";
import { chargeSellerShipping } from "./walletManagementService";

/** Write the new variant's reference the same way the original order stored its own (id, value or title). */
const sameFormatRef = (target: any, bought: any, boughtRef?: string): string => {
  if (bought && String(bought._id) === String(boughtRef)) return String(target._id);
  if (bought && bought.title && bought.title === boughtRef) return target.title || target.value;
  return target.value || String(target._id);
};

/**
 * Exchange: once the seller has the returned unit back, a ₹0 replacement order
 * sends a new unit of the same variant to the customer, through the normal
 * flow of its channel (Quick → seller accepts → rider; E-commerce → seller
 * packs → courier). Safe to call again: one replacement per exchange.
 */
export const createReplacementOrder = async (
  returnId: string,
  io?: SocketIOServer
): Promise<{ success: boolean; orderId?: string; orderNumber?: string; message?: string }> => {
  const ret: any = await Return.findById(returnId);
  if (!ret || ret.requestType !== "EXCHANGE") return { success: false, message: "Not an exchange request" };
  if (ret.replacementOrder) {
    const existing = await Order.findById(ret.replacementOrder).select("orderNumber");
    return { success: true, orderId: String(ret.replacementOrder), orderNumber: existing?.orderNumber };
  }

  const original: any = await Order.findById(ret.order);
  const item: any = await OrderItem.findById(ret.orderItem);
  if (!original || !item) return { success: false, message: "Original order or item not found" };
  const qty = ret.quantity || item.quantity || 1;

  // Reserve the unit first: no stock, no replacement.
  const product: any = await Product.findById(item.product).select("variations stock");
  if (!product) return { success: false, message: "The product no longer exists" };
  const boughtIndex = boughtVariationIndex(product, item.variation);
  // The customer may have asked for another variant (e.g. a different size) of the same product.
  const requestedId = ret.requestedVariation?.id;
  const requestedIndex = requestedId ? (product.variations || []).findIndex((v: any) => String(v._id) === String(requestedId)) : -1;
  if (requestedId && requestedIndex < 0) return { success: false, message: "The variant the customer asked for no longer exists. Contact the customer or issue a refund." };
  const vIndex = requestedIndex >= 0 ? requestedIndex : boughtIndex;
  const reserved =
    vIndex >= 0
      ? await Product.updateOne(
          { _id: product._id, [`variations.${vIndex}.stock`]: { $gte: qty } },
          { $inc: { [`variations.${vIndex}.stock`]: -qty, stock: -qty } }
        )
      : await Product.updateOne({ _id: product._id, stock: { $gte: qty } }, { $inc: { stock: -qty } });
  if (!reserved.modifiedCount) {
    return { success: false, message: "The replacement is out of stock. Restock it, then retry the replacement." };
  }

  // Who pays for this exchange's delivery, fixed when the request was made.
  const payer: "Customer" | "Seller" = ret.exchangeShipping?.payer === "Customer" ? "Customer" : "Seller";
  const charge: number = Number(ret.exchangeShipping?.amount) || 0;
  const customerPays = payer === "Customer" && charge > 0;
  const collectOldItem = Boolean(ret.doorstepSwap);
  const note = exchangeNote(original.orderNumber, payer, charge, collectOldItem);

  const order: any = await Order.create({
    customer: original.customer,
    customerName: original.customerName,
    customerEmail: original.customerEmail,
    customerPhone: original.customerPhone,
    deliveryAddress: original.deliveryAddress,
    items: [],
    subtotal: 0,
    tax: 0,
    // Customer-borne delivery is collected at the door like cash on delivery;
    // otherwise nothing is due (a seller-borne charge is taken from the seller below).
    shipping: customerPays ? charge : 0,
    platformFee: 0,
    discount: 0,
    total: customerPays ? charge : 0,
    paymentMethod: customerPays ? "COD" : "Replacement",
    paymentStatus: customerPays ? "Pending" : "Paid",
    status: "Received",
    channel: original.channel || "Quick",
    deliveryOption: original.deliveryOption || "Standard",
    tipAmount: 0,
    giftPackaging: false,
    replacementFor: original._id,
    adminNotes: `Replacement for order #${original.orderNumber} (exchange of ${item.productName}).`,
    customerNotes: note,
    exchangeInfo: {
      returnId: ret._id,
      originalOrderId: original._id,
      originalOrderNumber: original.orderNumber,
      payer,
      deliveryCharge: charge,
      collectOldItem,
      note,
    },
  });
  const newItem = await OrderItem.create({
    order: order._id,
    product: item.product,
    seller: item.seller,
    productName: item.productName,
    productImage: item.productImage,
    sku: item.sku,
    unitPrice: 0,
    quantity: qty,
    total: 0,
    subtotal: 0,
    variation: requestedIndex >= 0 ? sameFormatRef(product.variations[requestedIndex], product.variations[boughtIndex], item.variation) : item.variation,
    variantTitle: requestedIndex >= 0 ? ret.requestedVariation?.label || item.variantTitle : item.variantTitle,
    status: "Pending",
    sellerStatus: "Pending",
    commissionRate: 0,
    commissionAmount: 0,
    gstRate: 0,
    gstAmount: 0,
    isReturnable: false,
    returnWindowDays: 0,
  });
  order.items = [newItem._id];
  await order.save();

  ret.replacementOrder = order._id;
  await ret.save();

  // Seller's mistake (wrong size sent, defective, wrong product): the delivery cost comes off the seller.
  if (payer === "Seller" && charge > 0 && !ret.returnShippingCharge) {
    const charged = await chargeSellerShipping(
      String(item.seller),
      charge,
      `Exchange delivery for order #${original.orderNumber} (${qty}x ${item.productName})`,
      `RETSHIP-${ret._id}`,
      String(original._id),
    ).catch(() => false);
    if (charged) await Return.updateOne({ _id: ret._id }, { $set: { returnShippingCharge: charge } });
  }

  // Same start as any new order: the seller's panel rings.
  if (io) {
    try {
      const { notifySellersOfOrderUpdate } = await import("./sellerNotificationService");
      await notifySellersOfOrderUpdate(io, order, "NEW_ORDER");
    } catch (err) {
      console.error("[Replacement] Seller notification failed:", err);
    }
  }
  // E-commerce: the courier shipment, as for any paid order.
  if (order.channel === "ECommerce") {
    const { ensureOrderShipments } = await import("./shippingLabelService");
    ensureOrderShipments(String(order._id)).catch((err) => console.error("[Replacement] Shipment failed:", err));
  }
  return { success: true, orderId: String(order._id), orderNumber: order.orderNumber };
};
