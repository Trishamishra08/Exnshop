import mongoose from "mongoose";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Seller from "../models/Seller";
import Courier from "../models/Courier";

export type ShippingMethod = "Self" | "Company";

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

/** Unset means the seller never chose; they ship via the company, as before. */
export const effectiveShippingMethod = (seller: { shippingMethod?: ShippingMethod } | null | undefined): ShippingMethod =>
  seller?.shippingMethod === "Self" ? "Self" : "Company";

export const getSellerShippingMethod = async (sellerId: string): Promise<ShippingMethod> => {
  const seller = await Seller.findById(sellerId).select("shippingMethod").lean();
  return effectiveShippingMethod(seller as any);
};

/** Of these seller ids, the ones that ship via the company (and so need a Shiprocket shipment). */
export const companyShippedSellerIds = async (sellerIds: string[]): Promise<string[]> => {
  const sellers = await Seller.find({ _id: { $in: sellerIds } }).select("shippingMethod").lean();
  const selfIds = new Set(sellers.filter((s: any) => s.shippingMethod === "Self").map((s: any) => s._id.toString()));
  return sellerIds.filter((id) => !selfIds.has(id));
};

export const activeCourierNames = async (): Promise<string[]> => {
  const couriers = await Courier.find({ isActive: true }).select("name").sort({ name: 1 }).lean();
  return couriers.map((c: any) => c.name);
};

export const getShippingMethodState = async (sellerId: string) => {
  const seller: any = await Seller.findById(sellerId)
    .select("shippingMethod shippingMethodChosenAt shippingMethodRequest channels")
    .lean();
  if (!seller) throw fail("Seller not found", 404);
  return {
    method: seller.shippingMethod || null,
    effectiveMethod: effectiveShippingMethod(seller),
    chosenAt: seller.shippingMethodChosenAt || null,
    request: seller.shippingMethodRequest || null,
    shipsEcommerce: (seller.channels || []).includes("ECommerce"),
    couriers: await activeCourierNames(),
  };
};

/** First choice only: applies right away and becomes fixed. */
export const chooseShippingMethodFirstTime = async (sellerId: string, method: ShippingMethod) => {
  if (!["Self", "Company"].includes(method)) throw fail("Choose Self shipping or By Company");
  const updated = await Seller.findOneAndUpdate(
    { _id: sellerId, shippingMethod: { $exists: false } },
    { $set: { shippingMethod: method, shippingMethodChosenAt: new Date() } },
    { new: true },
  );
  if (!updated) {
    throw fail("Your shipping method is already set. To change it, send a change request for admin approval.", 409);
  }
  return updated;
};

export const requestShippingMethodChange = async (sellerId: string, requested: ShippingMethod, reason?: string) => {
  if (!["Self", "Company"].includes(requested)) throw fail("Choose Self shipping or By Company");
  const seller: any = await Seller.findById(sellerId).select("shippingMethod shippingMethodRequest storeName sellerName");
  if (!seller) throw fail("Seller not found", 404);
  if (!seller.shippingMethod) throw fail("You haven't chosen a shipping method yet. Choose one directly.", 409);
  if (seller.shippingMethod === requested) throw fail(`You already ship using ${requested === "Self" ? "Self shipping" : "the company"}.`, 409);
  if (seller.shippingMethodRequest?.status === "Pending") throw fail("You already have a change request waiting for admin approval.", 409);

  seller.shippingMethodRequest = {
    requestedMethod: requested,
    reason: reason?.trim().slice(0, 500) || undefined,
    status: "Pending",
    requestedAt: new Date(),
  };
  await seller.save();

  try {
    const { sendBroadcastNotification } = await import("./notificationService");
    await sendBroadcastNotification(
      "Admin",
      "Shipping method change request",
      `${seller.storeName || seller.sellerName} wants to switch to ${requested === "Self" ? "Self shipping" : "By Company shipping"}.`,
      { type: "Info", priority: "Medium", link: "/admin/shipping-method-requests" },
    );
  } catch (err: any) {
    console.error("[Shipping] Admin notification failed:", err?.message);
  }
  return seller.shippingMethodRequest;
};

export const decideShippingMethodRequest = async (
  sellerId: string,
  decision: "Approved" | "Rejected",
  adminId: string,
  note?: string,
) => {
  if (!["Approved", "Rejected"].includes(decision)) throw fail("Decision must be Approved or Rejected");
  const seller: any = await Seller.findById(sellerId).select("shippingMethod shippingMethodRequest");
  if (!seller?.shippingMethodRequest || seller.shippingMethodRequest.status !== "Pending") {
    throw fail("This seller has no pending change request", 404);
  }

  const request = seller.shippingMethodRequest;
  request.status = decision;
  request.decidedAt = new Date();
  request.decidedBy = adminId;
  request.adminNote = note?.trim().slice(0, 500) || undefined;
  if (decision === "Approved") {
    seller.shippingMethod = request.requestedMethod;
    seller.shippingMethodChosenAt = new Date();
  }
  seller.markModified("shippingMethodRequest");
  await seller.save();

  try {
    const { sendNotification } = await import("./notificationService");
    await sendNotification(
      "Seller",
      sellerId,
      decision === "Approved" ? "Shipping method changed" : "Shipping method change declined",
      decision === "Approved"
        ? `Your shipping method is now ${request.requestedMethod === "Self" ? "Self shipping" : "By Company"}. It applies to your orders from now on.`
        : `Your request to change the shipping method was declined.${request.adminNote ? ` ${request.adminNote}` : ""}`,
      { type: decision === "Approved" ? "Success" : "Warning", priority: "Medium", link: "/seller/account-settings" },
    );
  } catch (err: any) {
    console.error("[Shipping] Seller notification failed:", err?.message);
  }
  return seller;
};

/** Admin can always set a seller's method directly (also clears a pending request). */
export const adminSetShippingMethod = async (sellerId: string, method: ShippingMethod) => {
  if (!["Self", "Company"].includes(method)) throw fail("Method must be Self or Company");
  const seller: any = await Seller.findByIdAndUpdate(
    sellerId,
    { $set: { shippingMethod: method, shippingMethodChosenAt: new Date() }, $unset: { shippingMethodRequest: "" } },
    { new: true },
  );
  if (!seller) throw fail("Seller not found", 404);
  return seller;
};

/** Admin list: sellers with a request (default: pending) plus how many E-commerce orders they still have open. */
export const listShippingMethodRequests = async (status?: string) => {
  const query: any = status && status !== "All" ? { "shippingMethodRequest.status": status } : { shippingMethodRequest: { $exists: true } };
  const sellers: any[] = await Seller.find(query)
    .select("sellerName storeName mobile shippingMethod shippingMethodRequest")
    .sort({ "shippingMethodRequest.requestedAt": -1 })
    .lean();

  const sellerIds = sellers.map((s) => s._id);
  const items = await OrderItem.find({ seller: { $in: sellerIds }, status: { $nin: ["Cancelled", "Delivered", "Returned", "RTO"] } })
    .select("order seller")
    .lean();
  const orderIds = [...new Set(items.map((i: any) => i.order.toString()))];
  const openOrders = await Order.find({
    _id: { $in: orderIds },
    channel: "ECommerce",
    status: { $nin: ["Delivered", "Cancelled", "Rejected", "Returned", "RTO"] },
  })
    .select("_id")
    .lean();
  const openSet = new Set(openOrders.map((o: any) => o._id.toString()));
  const counts = new Map<string, Set<string>>();
  for (const i of items as any[]) {
    if (!openSet.has(i.order.toString())) continue;
    const key = i.seller.toString();
    if (!counts.has(key)) counts.set(key, new Set());
    counts.get(key)!.add(i.order.toString());
  }

  return sellers.map((s) => ({
    sellerId: s._id,
    sellerName: s.sellerName,
    storeName: s.storeName,
    mobile: s.mobile,
    currentMethod: s.shippingMethod || null,
    request: s.shippingMethodRequest,
    openEcommerceOrders: counts.get(s._id.toString())?.size || 0,
  }));
};

// ─── Self shipping on a single order ─────────────────────────────────────────

const normalize = (s?: string) => (s || "").trim().toUpperCase();

/**
 * Saves the courier and tracking number a self-shipping seller booked for
 * their part of an order. Stored on the seller's shipment entry — the same
 * place Shiprocket data lives — so the customer's order screen shows it
 * without any extra work.
 */
export const saveSelfShipment = async (
  orderId: string,
  sellerId: string,
  input: { courierName?: string; trackingNumber?: string; trackingUrl?: string },
) => {
  const courierName = (input.courierName || "").trim();
  const trackingNumber = (input.trackingNumber || "").trim();
  const trackingUrl = (input.trackingUrl || "").trim();

  if (!courierName) throw fail("Select the courier company");
  if (!trackingNumber) throw fail("Enter the tracking number");
  if (trackingNumber.length < 4 || trackingNumber.length > 40 || !/^[A-Za-z0-9\-_/]+$/.test(trackingNumber)) {
    throw fail("Tracking number should be 4–40 letters, numbers or dashes");
  }
  if (trackingUrl && !/^https?:\/\/\S+$/i.test(trackingUrl)) throw fail("Tracking link must start with http:// or https://");

  const couriers = await activeCourierNames();
  if (!couriers.some((c) => normalize(c) === normalize(courierName))) {
    throw fail("Pick a courier from the list. Ask admin to add yours if it's missing.");
  }

  const seller: any = await Seller.findById(sellerId).select("shippingMethod");
  if (effectiveShippingMethod(seller) !== "Self") throw fail("Your shipping method is By Company, so Exnshop books the courier.", 403);

  const order: any = await Order.findById(orderId);
  if (!order || !(await OrderItem.exists({ order: orderId, seller: sellerId }))) throw fail("Order not found", 404);
  if (order.channel !== "ECommerce") throw fail("Self shipping applies to E-commerce orders only");
  if (["Cancelled", "Rejected", "Returned", "Delivered"].includes(order.status)) throw fail(`This order is ${order.status.toLowerCase()}`);

  const canonicalName = couriers.find((c) => normalize(c) === normalize(courierName))!;
  const entry = {
    seller: new mongoose.Types.ObjectId(sellerId),
    channelOrderId: order.orderNumber,
    courierName: canonicalName,
    awbCode: trackingNumber,
    trackingUrl: trackingUrl || undefined,
    status: "Packed",
    awbAssignedAt: new Date(),
    provider: "Self" as const,
  };

  const shipments: any[] = order.shiprocketShipments || [];
  const idx = shipments.findIndex((s) => String(s.seller?._id || s.seller) === String(sellerId));
  if (idx >= 0) {
    if (shipments[idx].provider !== "Self") throw fail("A courier shipment already exists for this order. Contact support to change it.", 409);
    if (["Shipped", "Delivered"].includes(shipments[idx].status)) throw fail("This parcel is already marked shipped. Tracking can't be changed now.", 409);
    Object.assign(shipments[idx], entry);
  } else {
    shipments.push(entry);
  }
  order.shiprocketShipments = shipments;
  order.markModified("shiprocketShipments");

  // `shiprocket` mirrors the first shipment (what the older screens read).
  if (shipments.length === 1) {
    order.shiprocket = { ...(order.shiprocket?.toObject?.() || order.shiprocket || {}), awbCode: trackingNumber, courierName: canonicalName, trackingUrl: trackingUrl || undefined, status: "Packed" };
  }
  await order.save();
  return entry;
};

/**
 * Updates one self-shipping seller's parcel (Packed → Shipped → Delivered) and
 * works out the order's overall status: the order only becomes Delivered once
 * every seller's parcel is. Mutates `order`; the caller saves it.
 */
export const applySelfShipmentStatus = async (
  order: any,
  sellerId: string,
  status: "Processed" | "Shipped" | "Delivered",
): Promise<{ ok: true; orderStatus: string } | { ok: false; message: string }> => {
  const shipments: any[] = order.shiprocketShipments || [];
  const entry = shipments.find((s) => String(s.seller?._id || s.seller) === String(sellerId) && s.provider === "Self");
  if (!entry?.awbCode) {
    return { ok: false, message: "Select the courier company and enter the tracking number first." };
  }

  const current = String(entry.status || "");
  if (status === "Processed") {
    if (current === "Shipped" || current === "Delivered") return { ok: true, orderStatus: order.status };
    entry.status = "Packed";
  } else if (status === "Shipped") {
    if (current === "Delivered") return { ok: true, orderStatus: order.status };
    entry.status = "Shipped";
  } else {
    if (current !== "Shipped" && current !== "Delivered") {
      return { ok: false, message: "Mark the parcel as shipped before marking it delivered." };
    }
    entry.status = "Delivered";
  }
  order.shiprocketShipments = shipments;
  order.markModified("shiprocketShipments");
  if (shipments.length === 1) {
    order.shiprocket = { ...(order.shiprocket?.toObject?.() || order.shiprocket || {}), status: entry.status };
  }

  const rank: Record<string, number> = { Accepted: 1, Processed: 2, Shipped: 3 };
  const bump = (target: "Processed" | "Shipped") =>
    (rank[order.status] ?? 99) < rank[target] ? target : order.status;

  if (entry.status === "Packed") return { ok: true, orderStatus: bump("Processed") };
  if (entry.status === "Shipped") return { ok: true, orderStatus: bump("Shipped") };

  // Delivered: every seller still on the order needs a delivered parcel.
  const items: any[] = await OrderItem.find({ order: order._id }).select("seller sellerStatus status").lean();
  const sellersOnOrder = [
    ...new Set(items.filter((i) => i.sellerStatus !== "Rejected" && i.status !== "Cancelled").map((i) => String(i.seller))),
  ];
  const deliveredFor = new Set(
    shipments.filter((s) => String(s.status || "").toUpperCase() === "DELIVERED").map((s) => String(s.seller?._id || s.seller)),
  );
  if (sellersOnOrder.every((id) => deliveredFor.has(id))) {
    if (!order.deliveredAt) order.deliveredAt = new Date();
    return { ok: true, orderStatus: "Delivered" };
  }
  return { ok: true, orderStatus: order.status };
};
