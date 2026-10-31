import { Server as SocketIOServer } from "socket.io";
import Return from "../models/Return";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import { validateSellerReturnTransition } from "./returnLifecycleService";

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

/**
 * The admin approves or rejects a customer's return / replacement request (the seller no longer
 * does). Approving a Quick return alerts the nearest live delivery partners automatically; a
 * Quick replacement creates the replacement order and alerts them too; E-commerce books the courier.
 */
export const decideReturnRequest = async (
  returnId: string,
  decision: "Approved" | "Rejected",
  reason: string | undefined,
  admin: { id?: string; name?: string },
  io?: SocketIOServer,
) => {
  if (!["Approved", "Rejected"].includes(decision)) throw fail("Decision must be Approved or Rejected");
  const rejectionReason = String(reason || "").trim();
  if (decision === "Rejected" && !rejectionReason) throw fail("A reason is required when rejecting a request.");

  const returnReq: any = await Return.findById(returnId);
  if (!returnReq) throw fail("Return request not found", 404);
  // Same state machine as before: a request can be decided only while it is Pending.
  validateSellerReturnTransition(returnReq.status as any, decision as any);

  const update: any = { processedBy: admin.id, processedAt: new Date() };
  if (decision === "Approved") {
    update.status = "Pickup Pending";
    update.approvedAt = new Date();
  } else {
    update.status = "Rejected";
    update.rejectionReason = rejectionReason;
  }
  let updated: any = await Return.findByIdAndUpdate(returnId, update, { new: true });
  const reqType = returnReq.requestType || "RETURN";

  let note = "";
  if (decision === "Approved") {
    const parentOrder: any = await Order.findById(returnReq.order).select("channel");
    if (parentOrder?.channel === "ECommerce") {
      const { startCourierReturn } = await import("./courierReturnService");
      const booked = await startCourierReturn(returnId);
      note = booked.success ? " Courier pickup booked from the customer." : ` Courier pickup could not be booked yet (${booked.message}); it can be retried.`;
    } else if (reqType === "EXCHANGE") {
      // Quick replacement: create the replacement order; the rider takes the old item back in the same trip.
      const { startDoorstepSwap } = await import("./exchangeService");
      const swap = await startDoorstepSwap(returnId, io);
      if (swap.started) note = ` ${swap.message}`;
    } else {
      // Quick return: ring the nearest live delivery partners; the first to accept gets the pickup.
      const { dispatchReturnPickup } = await import("./returnDispatchService");
      const sent = await dispatchReturnPickup(returnId, io);
      note = ` ${sent.message}`;
    }
    updated = await Return.findById(returnId);
  }

  // Tell the customer.
  try {
    const { sendReturnStatusNotificationToCustomer } = await import("./notificationService");
    const order: any = await Order.findById(returnReq.order);
    const item: any = await OrderItem.findById(returnReq.orderItem);
    await sendReturnStatusNotificationToCustomer(
      String(returnReq.customer),
      order?.orderNumber || "Order",
      item?.productName || "Product",
      decision,
      rejectionReason || undefined,
      String(returnReq.order),
      io,
      reqType,
      String(returnReq._id),
    );
  } catch (err) {
    console.error("Error sending customer status notification:", err);
  }

  return {
    data: updated,
    message:
      decision === "Approved"
        ? `${reqType === "EXCHANGE" ? "Replacement" : "Return"} approved.${note}`
        : `${reqType === "EXCHANGE" ? "Replacement" : "Return"} rejected.`,
  };
};
