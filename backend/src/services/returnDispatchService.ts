import { Server as SocketIOServer } from "socket.io";
import Return from "../models/Return";
import Order from "../models/Order";
import { findDeliveryBoysNearLocation } from "./orderNotificationService";
import { sendNotification } from "./notificationService";

const RETURN_PICKUP_RADIUS_KM = Number(process.env.RETURN_PICKUP_RADIUS_KM) || 15;
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

/**
 * Quick return pickup: alert the nearest live delivery partners around the customer.
 * The first one to accept gets it (see claimReturnPickup). Called when the admin approves
 * the request, and again from "Ring again" when nobody has taken it.
 */
export const dispatchReturnPickup = async (returnId: string, io?: SocketIOServer): Promise<{ offered: number; message: string }> => {
  const ret: any = await Return.findById(returnId)
    .populate("order", "orderNumber channel deliveryAddress")
    .populate({ path: "orderItem", populate: { path: "product", select: "productName" } });
  if (!ret) throw fail("Return request not found", 404);
  const order: any = ret.order;
  if (!order || order.channel === "ECommerce") return { offered: 0, message: "E-commerce returns are picked up by courier." };
  if (ret.requestType !== "RETURN" || ret.doorstepSwap) return { offered: 0, message: "No separate pickup for this request." };
  if (ret.status !== "Pickup Pending") return { offered: 0, message: `Return is ${ret.status}; nothing to dispatch.` };

  // Nearest live riders to the customer's address (where the item is collected).
  const lat = Number(order.deliveryAddress?.latitude);
  const lng = Number(order.deliveryAddress?.longitude);
  let riders: { deliveryBoyId: any; distance: number }[] = [];
  if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    riders = await findDeliveryBoysNearLocation(lat, lng, RETURN_PICKUP_RADIUS_KM, order.deliveryAddress?.city);
  }
  const ids = riders.map((r) => String(r.deliveryBoyId));
  if (!ids.length) {
    await Return.updateOne({ _id: returnId }, { $set: { offeredTo: [], offeredAt: new Date() } });
    return { offered: 0, message: "No live delivery partner found near the customer. Try again in a moment, or assign one manually." };
  }

  await Return.updateOne({ _id: returnId }, { $set: { offeredTo: ids, offeredAt: new Date() } });

  const productName = ret.orderItem?.product?.productName || ret.orderItem?.productName || "Product";
  const payload = {
    returnId: String(ret._id),
    orderNumber: order.orderNumber || "N/A",
    productName,
    quantity: ret.quantity,
    reason: ret.reason,
    address: order.deliveryAddress?.address,
    type: "RETURN_PICKUP_OFFER",
  };
  await Promise.all(
    ids.map(async (id) => {
      io?.to(`delivery-${id}`).emit("return-pickup-offer", payload);
      await sendNotification(
        "Delivery",
        id,
        "Return pickup nearby",
        `Pick up a return for order #${payload.orderNumber} (${productName}). The first partner to accept gets it.`,
        { type: "Order", link: "/delivery/returns", priority: "High", data: { returnId: payload.returnId, type: "RETURN_PICKUP_OFFER", panel: "delivery" } },
      ).catch(() => undefined);
    }),
  );
  return { offered: ids.length, message: `Alerted ${ids.length} nearby delivery partner${ids.length === 1 ? "" : "s"}.` };
};

/** First delivery partner to accept an offered return pickup gets it (atomic: only one can win). */
export const claimReturnPickup = async (returnId: string, riderId: string, io?: SocketIOServer) => {
  const claimed: any = await Return.findOneAndUpdate(
    {
      _id: returnId,
      status: "Pickup Pending",
      offeredTo: riderId,
      $or: [{ deliveryBoy: null }, { deliveryBoy: { $exists: false } }],
    },
    {
      $set: { deliveryBoy: riderId, assignedAt: new Date(), status: "Delivery Partner Assigned" },
      $unset: { offeredTo: "", offeredAt: "" },
    },
    { new: true },
  );
  if (!claimed) {
    const ret: any = await Return.findById(returnId).select("status deliveryBoy offeredTo");
    if (ret?.deliveryBoy && String(ret.deliveryBoy) !== String(riderId)) throw fail("Another delivery partner already took this pickup.", 409);
    if (ret && !(ret.offeredTo || []).map(String).includes(String(riderId)) && ret.status === "Pickup Pending") throw fail("This pickup was not offered to you.", 403);
    throw fail("This pickup is no longer available.", 409);
  }
  // Tell the others it is gone.
  const order: any = await Order.findById(claimed.order).select("orderNumber").lean();
  io?.emit("return-pickup-taken", { returnId: String(claimed._id) });
  await sendNotification(
    "Customer",
    String(claimed.customer),
    "Pickup partner assigned",
    `A delivery partner is on the way to collect your return for order #${order?.orderNumber || ""}.`,
    { type: "Info", priority: "Medium" },
  ).catch(() => undefined);
  return claimed;
};

/** Pickups currently offered to this rider. */
export const offersForRider = async (riderId: string) => {
  const rows: any[] = await Return.find({ status: "Pickup Pending", offeredTo: riderId })
    .populate("order", "orderNumber deliveryAddress customerName")
    .populate({ path: "orderItem", select: "productName quantity" })
    .sort({ offeredAt: -1 })
    .limit(20)
    .lean();
  return rows.map((r) => ({
    returnId: String(r._id),
    orderNumber: r.order?.orderNumber,
    productName: r.orderItem?.productName,
    quantity: r.quantity,
    reason: r.reason,
    address: r.order?.deliveryAddress?.address,
    city: r.order?.deliveryAddress?.city,
    customerName: r.order?.customerName,
    offeredAt: r.offeredAt,
  }));
};
