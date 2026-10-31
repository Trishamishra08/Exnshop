/**
 * returnHandoverService.ts
 *
 * The rider brings a returned item back to the seller. The seller reads out a 4-digit
 * code; the rider enters it. A correct code marks the item "Handed To Seller" and
 * confirms receipt automatically (the return closes and, for an exchange, the
 * replacement is sent). A seller who finds the item defective or wrong afterwards
 * reports it to the admin (see reportReturnIssue in the seller return controller).
 */

import Return from "../models/Return";
import OrderItem from "../models/OrderItem";
import Order from "../models/Order";

const MAX_ATTEMPTS = 5;

const isTestMode = (): boolean =>
  process.env.NODE_ENV !== "production" && String(process.env.DELIVERY_TEST_MODE).trim().toLowerCase() === "true";

const freshCode = (): string => (isTestMode() ? "9999" : String(Math.floor(1000 + Math.random() * 9000)));

/** The code the seller reads to the rider. Created on first use once the item is with the rider. */
export async function ensureHandoverOtp(returnId: string): Promise<string | undefined> {
  const r: any = await Return.findById(returnId).select("+handoverOtp status");
  if (!r || !["Picked Up", "In Transit"].includes(r.status)) return undefined;
  if (r.handoverOtp) return r.handoverOtp;
  const code = freshCode();
  await Return.updateOne({ _id: returnId }, { $set: { handoverOtp: code, handoverOtpAttempts: 0, handoverOtpVerified: false } });
  return code;
}

export async function verifyHandoverOtp(
  returnId: string,
  otp: string,
  io?: any,
): Promise<{ success: boolean; message: string }> {
  const r: any = await Return.findById(returnId).select("+handoverOtp");
  if (!r) throw new Error("Return request not found");

  if (r.status === "Handed To Seller" || r.status === "Completed") {
    return { success: true, message: "The seller has already received this item." };
  }
  if (r.status !== "In Transit") {
    throw new Error(`Cannot hand over now: the return is "${r.status}". Mark it In Transit first.`);
  }
  if (!r.handoverOtp) {
    await ensureHandoverOtp(returnId);
    throw new Error("The seller's code was just created. Ask the seller for the code shown in their app.");
  }

  const attempts = r.handoverOtpAttempts || 0;
  const devBypass = (process.env.NODE_ENV !== "production" || process.env.USE_MOCK_OTP === "true") && otp === "9999";
  if (!devBypass && String(r.handoverOtp) !== String(otp).trim()) {
    const next = attempts + 1;
    if (next >= MAX_ATTEMPTS) {
      // A fresh code goes to the seller; the rider asks again.
      await Return.updateOne({ _id: returnId }, { $set: { handoverOtp: freshCode(), handoverOtpAttempts: 0 } });
      throw new Error("Too many wrong codes. The seller has a new code now. Ask them again.");
    }
    await Return.updateOne({ _id: returnId }, { $set: { handoverOtpAttempts: next } });
    const left = MAX_ATTEMPTS - next;
    throw new Error(`Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.`);
  }

  await Return.updateOne(
    { _id: returnId, status: "In Transit" },
    { $set: { status: "Handed To Seller", handedToSellerAt: new Date(), handoverOtpVerified: true, handoverOtpAttempts: 0 }, $unset: { handoverOtp: "" } },
  );

  const done = await autoConfirmReceipt(returnId, io);
  return { success: true, message: done.message };
}

/** Receipt confirmed by the OTP: close the return, settle, and send the replacement for an exchange. */
export async function autoConfirmReceipt(returnId: string, io?: any): Promise<{ settled: boolean; message: string }> {
  const ret: any = await Return.findById(returnId);
  if (!ret) return { settled: false, message: "Return not found" };

  const { triggerReturnFinancialSettlement } = await import("./returnLifecycleService");
  const settle = await triggerReturnFinancialSettlement(returnId);
  if (!settle.success) {
    await Return.updateOne({ _id: returnId }, { $addToSet: { flags: "RECEIPT_SETTLEMENT_FAILED" } });
    try {
      const { sendBroadcastNotification } = await import("./notificationService");
      await sendBroadcastNotification("Admin", "Return could not be closed", `The seller received the item but closing the return failed: ${settle.message}`, {
        type: "Error",
        priority: "High",
        link: "/admin/returns",
      });
    } catch { /* best effort */ }
    return { settled: false, message: "Item handed over. Closing the return needs an admin; they have been told." };
  }

  const reqType = ret.requestType || "RETURN";
  let note = "";
  if (reqType === "EXCHANGE") {
    const { createReplacementOrder } = await import("./replacementOrderService");
    const replacement = await createReplacementOrder(returnId, io);
    if (replacement.success) {
      await Return.updateOne({ _id: returnId }, { $unset: { exchangeState: "" } });
      note = ` Replacement order #${replacement.orderNumber} created.`;
    } else if (/out of stock/i.test(replacement.message || "")) {
      await Return.updateOne({ _id: returnId }, { $set: { exchangeState: "OutOfStock" } });
      try {
        const { sendNotification } = await import("./notificationService");
        await sendNotification(
          "Customer",
          String(ret.customer),
          "Your replacement is out of stock",
          "We received your item, but the replacement is out of stock. Open your order to choose a refund or wait for the seller to restock.",
          { type: "Warning", priority: "High" },
        );
      } catch { /* best effort */ }
      note = " Replacement is out of stock; the customer will choose a refund or to wait.";
    } else {
      note = ` Replacement not created yet: ${replacement.message}`;
    }
  }

  try {
    const order: any = await Order.findById(ret.order).select("orderNumber");
    const item: any = await OrderItem.findById(ret.orderItem).select("productName seller");
    const { sendReturnStatusNotificationToCustomer, sendNotification } = await import("./notificationService");
    await sendReturnStatusNotificationToCustomer(
      String(ret.customer),
      order?.orderNumber || "Order",
      item?.productName || "Product",
      "Completed",
      undefined,
      String(ret.order),
      io,
      reqType,
      String(ret._id),
    );
    if (item?.seller) {
      await sendNotification(
        "Seller",
        String(item.seller),
        "Returned item received",
        `You confirmed the returned ${item.productName || "item"} with the handover code. If it is defective or not the product you sent, report it to the admin from the Returns page.`,
        { type: "Info", priority: "Medium", link: "/seller/returns" },
      );
      io?.to(`seller-${String(item.seller)}`).emit("return-handed-to-seller", { returnId, status: "Completed" });
    }
  } catch (err) {
    console.error("[Return handover] notifications failed:", err);
  }

  return {
    settled: true,
    message: (reqType === "EXCHANGE" ? "Handed over. Exchange complete." : "Handed over. Return complete.") + note,
  };
}
