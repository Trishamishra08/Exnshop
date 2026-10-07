import { Cashfree, CFEnvironment } from "cashfree-pg";
import Payment from "../models/Payment";
import Order from "../models/Order";
import mongoose from "mongoose";

const getCashfreeInstance = () => {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;

  if (!appId || !secretKey) {
    throw new Error("Cashfree credentials not configured");
  }

  // CASHFREE_ENV=SANDBOX for testing against Cashfree's sandbox (requires
  // separate sandbox-only credentials from the dashboard, not the live ones);
  // defaults to PRODUCTION, matching the live credentials currently set.
  const env = process.env.CASHFREE_ENV === "SANDBOX" ? CFEnvironment.SANDBOX : CFEnvironment.PRODUCTION;
  return new Cashfree(env, appId, secretKey);
};

export interface CashfreeCustomerDetails {
  customerId: string;
  customerPhone: string;
  customerEmail?: string;
  customerName?: string;
}

/**
 * Create a Cashfree order. Pass a single order id for an ordinary checkout,
 * or multiple (a mixed Quick + E-commerce checkout) to have ONE Cashfree
 * payment cover several linked orders.
 *
 * The Cashfree-side order_id is derived from our own first Mongo order id
 * plus a timestamp suffix (so a retried/expired attempt gets a fresh id
 * instead of colliding with Cashfree's history for a reused id). At
 * webhook/verify time we recover the Mongo order id by splitting off that
 * suffix, then find any other orders sharing the same `checkoutGroupId` for
 * the multi-order case — reusing the same linkage the rest of the app
 * already relies on, rather than threading custom metadata through Cashfree.
 */
export const createCashfreeOrder = async (
  orderIds: string | string[],
  amount: number,
  customerDetails: CashfreeCustomerDetails,
  currency: string = "INR"
) => {
  const orderIdList = Array.isArray(orderIds) ? orderIds : [orderIds];
  try {
    const cashfree = getCashfreeInstance();
    const cfOrderId = `${orderIdList[0]}-${Date.now()}`;

    const frontendUrl = (process.env.FRONTEND_URL || "").split(",")[0]?.trim() || "";

    const response = await cashfree.PGCreateOrder({
      order_id: cfOrderId,
      order_amount: Number(amount.toFixed(2)),
      order_currency: currency,
      customer_details: {
        customer_id: customerDetails.customerId,
        customer_phone: customerDetails.customerPhone,
        customer_email: customerDetails.customerEmail,
        customer_name: customerDetails.customerName,
      },
      order_meta: {
        return_url: frontendUrl ? `${frontendUrl}/order-success?cf_order_id={order_id}` : undefined,
      },
    });

    return {
      success: true,
      data: {
        cfOrderId,
        paymentSessionId: response.data.payment_session_id,
        orderId: orderIdList[0],
        isMock: false,
      },
    };
  } catch (error: any) {
    console.error("Error creating Cashfree order:", error?.response?.data || error);

    if (process.env.USE_MOCK_PAYMENT === "true") {
      return {
        success: true,
        data: {
          cfOrderId: `cf_mock_${orderIdList[0]}_${Date.now()}`,
          paymentSessionId: `session_mock_${Date.now()}`,
          orderId: orderIdList[0],
          isMock: true,
        },
      };
    }

    return {
      success: false,
      message: error?.response?.data?.message || error.message || "Failed to create Cashfree order",
    };
  }
};

/**
 * Resolve a Cashfree order_id (as we generated it) back to the full set of
 * Mongo order ids it covers — itself, plus any sibling orders sharing the
 * same checkoutGroupId (a mixed Quick + E-commerce checkout).
 */
async function resolveOrderIdsFromCfOrderId(cfOrderId: string): Promise<string[]> {
  const mongoOrderId = cfOrderId.split("-")[0];
  const order = await Order.findById(mongoOrderId);
  if (!order) return [mongoOrderId];

  if (!order.checkoutGroupId) return [mongoOrderId];

  const siblings = await Order.find({ checkoutGroupId: order.checkoutGroupId }).select("_id");
  return siblings.map((o) => o._id.toString());
}

/**
 * Server-to-server check of a Cashfree order's real status — never trust a
 * client-reported success alone (same principle as Razorpay's signature
 * check, just via a direct API call since Cashfree's client SDK doesn't hand
 * back a signed confirmation the way Razorpay's checkout does).
 */
export const verifyCashfreeOrder = async (cfOrderId: string) => {
  if (cfOrderId.startsWith("cf_mock_")) {
    return { success: true, paid: true, cfPaymentId: `pay_mock_${Date.now()}` };
  }

  try {
    const cashfree = getCashfreeInstance();
    const orderRes = await cashfree.PGFetchOrder(cfOrderId);
    const paid = orderRes.data.order_status === "PAID";

    if (!paid) {
      return { success: true, paid: false, cfPaymentId: null };
    }

    const paymentsRes = await cashfree.PGOrderFetchPayments(cfOrderId);
    const successfulPayment = (paymentsRes.data || []).find((p) => p.payment_status === "SUCCESS");

    return {
      success: true,
      paid: true,
      cfPaymentId: successfulPayment?.cf_payment_id || null,
    };
  } catch (error: any) {
    console.error("Error verifying Cashfree order:", error?.response?.data || error);
    return { success: false, paid: false, cfPaymentId: null, message: error.message };
  }
};

/**
 * Captures payment for one or more linked orders sharing one Cashfree
 * payment — mirrors paymentService.ts's capturePaymentForOrders exactly:
 * verify first, then idempotently create/update Payment + Order records.
 */
export const captureCashfreeOrderForOrders = async (
  orderIds: string[],
  cfOrderId: string,
  io?: any
) => {
  const verification = await verifyCashfreeOrder(cfOrderId);
  if (!verification.success) {
    return { success: false, message: verification.message || "Failed to verify Cashfree order" };
  }
  if (!verification.paid) {
    return { success: false, message: "Payment not completed" };
  }

  const results = [];
  for (const orderId of orderIds) {
    const order = await Order.findById(orderId);
    if (!order) {
      results.push({ orderId, success: false, message: "Order not found" });
      continue;
    }

    if (order.paymentStatus === "Paid") {
      results.push({ orderId, success: true, message: "Payment already captured" });
      continue;
    }

    let payment = await Payment.findOne({ order: orderId, cashfreeOrderId: cfOrderId });
    if (!payment) {
      payment = new Payment({
        order: orderId,
        customer: order.customer,
        paymentMethod: "Online",
        paymentGateway: "Cashfree",
        cashfreeOrderId: cfOrderId,
        cashfreePaymentId: verification.cfPaymentId || undefined,
        amount: order.total,
        currency: "INR",
        status: "Completed",
        paidAt: new Date(),
        gatewayResponse: {
          success: true,
          message: "Payment captured successfully",
        },
      });
      await payment.save();
    }

    order.paymentStatus = "Paid";
    order.paymentId = verification.cfPaymentId || cfOrderId;
    if (order.status === "Pending") {
      order.status = "Received";
    }
    await order.save();

    if (io) {
      io.to(`customer_${order.customer}`).emit("paymentConfirmed", { orderId: order._id });
    }

    results.push({ orderId, success: true });
  }

  const allSucceeded = results.every((r) => r.success);
  return {
    success: allSucceeded,
    message: allSucceeded ? "Payment captured successfully" : "Some orders failed to update",
    data: { results },
  };
};

/**
 * Handles a Cashfree webhook call — verifies the signature using the SDK's
 * own PGVerifyWebhookSignature (the officially-maintained implementation,
 * rather than a hand-rolled HMAC check), then captures payment for the
 * order(s) it covers.
 */
export const handleCashfreeWebhook = async (
  rawBody: string,
  signature: string,
  timestamp: string,
  io?: any
) => {
  try {
    const cashfree = getCashfreeInstance();
    const event = cashfree.PGVerifyWebhookSignature(signature, rawBody, timestamp);
    // PGVerifyWebhookSignature throws on an invalid signature, so reaching
    // here means it's genuine. `event` carries the parsed webhook payload.
    const payload: any = (event as any).object || JSON.parse(rawBody);
    const cfOrderId: string | undefined = payload?.data?.order?.order_id;

    if (!cfOrderId) {
      return { success: false, message: "Webhook payload missing order_id" };
    }

    const orderIds = await resolveOrderIdsFromCfOrderId(cfOrderId);
    return await captureCashfreeOrderForOrders(orderIds, cfOrderId, io);
  } catch (error: any) {
    console.error("Error handling Cashfree webhook:", error);
    return { success: false, message: error.message || "Invalid webhook signature" };
  }
};

/**
 * Refund a Cashfree payment given OUR Payment document's id — same calling
 * convention as paymentService.ts's processRefund, so refundSettlementService.ts
 * can branch on Payment.paymentGateway with a one-line swap at each call site.
 */
export const processCashfreeRefundForPayment = async (
  paymentId: string,
  amount?: number,
  reason?: string,
  session?: mongoose.ClientSession
) => {
  const payment = session ? await Payment.findById(paymentId).session(session) : await Payment.findById(paymentId);
  if (!payment) {
    throw new Error(`Payment record not found for ID: ${paymentId}`);
  }

  if (!payment.cashfreeOrderId) {
    throw new Error(`Cashfree order ID missing on payment record: ${paymentId}`);
  }

  if (payment.status === "Refunded") {
    return {
      success: true,
      message: "Payment is already marked Refunded (Idempotent)",
      data: {
        refundId: payment.refundId || `refund_existing_${payment._id}`,
        amount: payment.refundAmount || payment.amount,
      },
    };
  }

  const refundAmount = amount || payment.amount;
  if (!refundAmount || refundAmount <= 0) {
    throw new Error(`Invalid refund amount: ₹${refundAmount}`);
  }

  const refundId = `refund_${payment._id}_${Date.now()}`;
  return processCashfreeRefund(payment.cashfreeOrderId, refundAmount, refundId, reason);
};

/**
 * Refund a Cashfree payment — mirrors paymentService.ts's processRefund.
 */
export const processCashfreeRefund = async (
  cfOrderId: string,
  amount: number,
  refundId: string,
  reason?: string
) => {
  try {
    if (cfOrderId.startsWith("cf_mock_")) {
      return { success: true, data: { refundId: `refund_mock_${Date.now()}` } };
    }

    const cashfree = getCashfreeInstance();
    const response = await cashfree.PGOrderCreateRefund(cfOrderId, {
      refund_amount: Number(amount.toFixed(2)),
      refund_id: refundId,
      refund_note: reason,
    });

    return {
      success: true,
      data: {
        refundId: response.data.refund_id,
        status: response.data.refund_status,
      },
    };
  } catch (error: any) {
    console.error("Error processing Cashfree refund:", error?.response?.data || error);
    return {
      success: false,
      message: error?.response?.data?.message || error.message || "Failed to process Cashfree refund",
    };
  }
};
