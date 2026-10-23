import Return from "../models/Return";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Seller from "../models/Seller";
import { assignReturnAwb, createShiprocketReturn, resolveSellerAddress } from "./shiprocketService";

/**
 * E-commerce returns and exchanges come back by courier (a Shiprocket reverse
 * pickup), not by an Exnshop rider: the customer may be in any city. Quick
 * returns keep the rider pickup.
 */

/**
 * Books the reverse pickup for an approved E-commerce return. Safe to call
 * again: an existing shipment only has its AWB retried.
 */
export const startCourierReturn = async (returnId: string): Promise<{ success: boolean; message?: string }> => {
  const ret: any = await Return.findById(returnId);
  if (!ret) return { success: false, message: "Return request not found" };
  const order: any = await Order.findById(ret.order);
  if (!order || order.channel !== "ECommerce") return { success: false, message: "Only E-commerce returns are picked up by courier" };
  if (ret.shiprocketReturn?.awbCode) return { success: true };

  const save = async (fields: Record<string, any>) => {
    ret.shiprocketReturn = { ...(ret.shiprocketReturn?.toObject?.() || ret.shiprocketReturn || {}), ...fields };
    ret.markModified("shiprocketReturn");
    await ret.save();
  };

  // Shipment already created earlier but its AWB failed: retry only the AWB.
  if (ret.shiprocketReturn?.shipmentId) {
    const awb = await assignReturnAwb(ret.shiprocketReturn.shipmentId);
    await save(awb.success
      ? { awbCode: awb.awbCode, courierName: awb.courierName, status: "Pickup Scheduled", error: undefined }
      : { error: awb.message });
    return { success: awb.success, message: awb.message };
  }

  const item: any = await OrderItem.findById(ret.orderItem);
  const seller: any = item ? await Seller.findById(item.seller) : null;
  if (!item || !seller) return { success: false, message: "The returned item or its seller was not found" };
  const sellerAddress = await resolveSellerAddress(seller).catch(() => null);
  const address = order.deliveryAddress || {};
  const channelOrderId = `RET-${order.orderNumber}-${String(ret._id).slice(-6)}`;

  const result = await createShiprocketReturn({
    channelOrderId,
    customer: {
      name: order.customerName || "Customer",
      phone: order.customerPhone,
      email: order.customerEmail,
      address: address.address || "",
      city: address.city || "",
      state: address.state || "",
      pincode: address.pincode || "",
    },
    seller: {
      name: seller.storeName || seller.sellerName,
      phone: seller.mobile,
      email: seller.email,
      address: seller.returnAddress || sellerAddress?.line1 || seller.address || "",
      city: sellerAddress?.city || seller.city || "",
      state: sellerAddress?.state || "",
      pincode: sellerAddress?.pincode || "",
    },
    item: {
      name: item.productName || "Item",
      sku: item.sku || String(item.product),
      units: ret.quantity || item.quantity || 1,
      sellingPrice: item.unitPrice || 0,
      product: item.product,
    },
  });

  await save({
    channelOrderId,
    orderId: result.orderId,
    shipmentId: result.shipmentId,
    awbCode: result.awbCode,
    courierName: result.courierName,
    status: result.awbCode ? "Pickup Scheduled" : "Not booked",
    error: result.success ? undefined : result.message,
  });
  return { success: result.success, message: result.message };
};

// Courier status → return status. Reaching the seller = "Handed To Seller";
// the seller then confirms receipt, which triggers the refund.
const RETURN_STATUS_RANK: Record<string, number> = {
  "Pickup Pending": 0,
  "Picked Up": 1,
  "In Transit": 2,
  "Handed To Seller": 3,
};
const mapCourierReturnStatus = (raw?: string): string | undefined => {
  const s = String(raw || "").trim().toUpperCase().replace(/[_-]/g, " ");
  if (!s) return undefined;
  if (s.includes("DELIVERED")) return "Handed To Seller";
  if (s.includes("PICKED UP") || s === "PICKUP COMPLETE") return "Picked Up";
  if (s.includes("IN TRANSIT") || s === "SHIPPED" || s.includes("OUT FOR DELIVERY")) return "In Transit";
  return undefined;
};

/**
 * Applies a Shiprocket webhook to an E-commerce return, if it is one. Returns
 * true when the update belonged to a return shipment.
 */
export const applyCourierReturnUpdate = async (body: any): Promise<boolean> => {
  const { awb, current_status, order_id, sr_order_id, track_url, courier_name } = body || {};
  const or: any[] = [];
  if (awb) or.push({ "shiprocketReturn.awbCode": String(awb) });
  if (order_id != null) or.push({ "shiprocketReturn.channelOrderId": String(order_id) });
  if (sr_order_id != null) or.push({ "shiprocketReturn.orderId": String(sr_order_id) });
  if (or.length === 0) return false;

  const ret: any = await Return.findOne({ $or: or });
  if (!ret) return false;

  ret.shiprocketReturn = {
    ...(ret.shiprocketReturn?.toObject?.() || ret.shiprocketReturn || {}),
    awbCode: awb || ret.shiprocketReturn?.awbCode,
    courierName: courier_name || ret.shiprocketReturn?.courierName,
    trackingUrl: track_url || ret.shiprocketReturn?.trackingUrl,
    status: current_status || ret.shiprocketReturn?.status,
  };
  ret.markModified("shiprocketReturn");

  // Only move forward (webhooks can arrive late or out of order).
  const next = mapCourierReturnStatus(current_status);
  if (next && (RETURN_STATUS_RANK[next] ?? -1) > (RETURN_STATUS_RANK[ret.status] ?? 99)) {
    ret.status = next;
  }
  await ret.save();
  return true;
};
