import axios from "axios";
import mongoose from "mongoose";
import WithdrawRequest from "../models/WithdrawRequest";
import Seller from "../models/Seller";
import Delivery from "../models/Delivery";
import PlatformWallet from "../models/PlatformWallet";
import { creditWallet, debitWallet } from "./walletManagementService";

const API = "https://api.razorpay.com/v1";

/**
 * RazorpayX Payouts need the same API key pair as payments (RazorpayX must be
 * activated on the account) plus the RazorpayX account number to pay from.
 */
export const razorpayPayoutsConfigured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAYX_ACCOUNT_NUMBER);

const client = () =>
  axios.create({
    baseURL: API,
    auth: { username: process.env.RAZORPAY_KEY_ID!, password: process.env.RAZORPAY_KEY_SECRET! },
    timeout: 30_000,
  });

const apiError = (err: any): string =>
  err?.response?.data?.error?.description || err?.response?.data?.message || err?.message || "Razorpay request failed";

const refundReservation = async (request: any, reason: string) => {
  await creditWallet(
    request.userId.toString(),
    request.userType,
    request.amount,
    `Payout not sent, amount returned to wallet (${reason.slice(0, 120)})`,
    undefined,
    undefined,
    undefined,
    `WD-REFUND-${request._id}-${Date.now()}`,
  );
};

/** Put a withdrawal back to "Approved" so an admin can retry, keeping the reason. */
const markRetryable = async (id: string, reason: string, payoutStatus?: string) => {
  await WithdrawRequest.updateOne(
    { _id: id },
    { $set: { status: "Approved", payoutFailureReason: reason, payoutStatus: payoutStatus || "failed" }, $unset: { razorpayPayoutId: "" } },
  );
};

export const payWithdrawalViaRazorpay = async (
  requestId: string,
  adminId: string,
): Promise<{ success: boolean; message: string; data?: any }> => {
  if (!razorpayPayoutsConfigured()) {
    return {
      success: false,
      message: "Razorpay payouts aren't set up yet. Add RAZORPAYX_ACCOUNT_NUMBER to the server environment (RazorpayX must be activated on your Razorpay account).",
    };
  }

  // Claim it atomically so two clicks (or two admins) can never pay the same request twice.
  const request = await WithdrawRequest.findOneAndUpdate(
    { _id: requestId, status: "Approved" },
    { $set: { status: "Processing", payoutStatus: "initiating", payoutFailureReason: "", processedBy: new mongoose.Types.ObjectId(adminId), processedAt: new Date() } },
    { new: true },
  );
  if (!request) {
    return { success: false, message: "Only an approved withdrawal that hasn't been paid yet can be paid." };
  }

  const Model: any = request.userType === "SELLER" ? Seller : Delivery;
  const user = await Model.findById(request.userId);
  if (!user) {
    await markRetryable(requestId, "User not found");
    return { success: false, message: "User not found" };
  }

  const isUpi = request.paymentMethod === "UPI";
  const upiId = (request.upiId || user.upiId || "").trim();
  const accountNumber = String(user.accountNumber || "").trim();
  const ifsc = String(user.ifsc || user.ifscCode || "").trim().toUpperCase();
  const holderName = String(user.accountName || user.sellerName || user.name || "Account holder").trim();
  if (isUpi ? !upiId : !accountNumber || !ifsc) {
    const reason = isUpi ? "UPI ID missing on the profile" : "Bank account number or IFSC missing on the profile";
    await markRetryable(requestId, reason);
    return { success: false, message: reason };
  }

  // Reserve the money first (idempotent by reference), so the wallet can't be spent while the payout is in flight.
  const debit = await debitWallet(
    request.userId.toString(),
    request.userType,
    request.amount,
    `Withdrawal payout to ${isUpi ? "UPI" : "bank"} (${request._id})`,
    undefined,
    undefined,
    `WD-${request._id}`,
  );
  if (!debit.success) {
    await markRetryable(requestId, debit.message || "Wallet balance too low");
    return { success: false, message: debit.message || "Wallet balance is too low for this payout" };
  }

  try {
    const http = client();
    const contact = await http.post("/contacts", {
      name: holderName.slice(0, 50),
      email: user.email || undefined,
      contact: user.mobile || user.phone || undefined,
      type: request.userType === "SELLER" ? "vendor" : "employee",
      reference_id: `${request.userType}-${request.userId}`.slice(0, 40),
    });

    const fundAccount = await http.post(
      "/fund_accounts",
      isUpi
        ? { contact_id: contact.data.id, account_type: "vpa", vpa: { address: upiId } }
        : { contact_id: contact.data.id, account_type: "bank_account", bank_account: { name: holderName, ifsc, account_number: accountNumber } },
    );

    const amountPaise = Math.round(request.amount * 100);
    const payout = await http.post(
      "/payouts",
      {
        account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER,
        fund_account_id: fundAccount.data.id,
        amount: amountPaise,
        currency: "INR",
        mode: isUpi ? "UPI" : request.amount > 500000 ? "NEFT" : "IMPS",
        purpose: "payout",
        queue_if_low_balance: true,
        reference_id: String(request._id),
        narration: "Exnshop payout",
      },
      { headers: { "X-Payout-Idempotency": `exnshop-wd-${request._id}` } },
    );

    request.razorpayPayoutId = payout.data.id;
    request.payoutStatus = payout.data.status;
    await request.save();

    if (payout.data.status === "processed") {
      await finalizePayout(String(request._id), payout.data.utr);
    }
    return {
      success: true,
      message: payout.data.status === "processed" ? "Payout sent" : `Payout ${payout.data.status}. The status updates automatically.`,
      data: request,
    };
  } catch (err: any) {
    const reason = apiError(err);
    console.error(`[RazorpayX] Payout failed for withdrawal ${request._id}:`, reason);
    // If Razorpay never created the payout, give the reserved money back.
    await refundReservation(request, reason).catch((e) => console.error("[RazorpayX] Refund after failed payout failed:", e));
    await markRetryable(requestId, reason);
    return { success: false, message: `Razorpay could not send the payout: ${reason}` };
  }
};

/** Payout reached the bank: close the request (money was already taken from the wallet at initiation). */
export const finalizePayout = async (requestId: string, utr?: string) => {
  const request = await WithdrawRequest.findOneAndUpdate(
    { _id: requestId, status: { $in: ["Processing", "Approved"] } },
    { $set: { status: "Completed", payoutStatus: "processed", transactionReference: utr || undefined, processedAt: new Date() } },
    { new: true },
  );
  if (!request) return;

  try {
    const platformWallet = await PlatformWallet.getWallet();
    platformWallet.currentPlatformBalance = Math.max(0, platformWallet.currentPlatformBalance - request.amount);
    if (request.userType === "SELLER") {
      platformWallet.sellerPendingPayouts = Math.max(0, platformWallet.sellerPendingPayouts - request.amount);
    } else {
      platformWallet.deliveryBoyPendingPayouts = Math.max(0, platformWallet.deliveryBoyPendingPayouts - request.amount);
    }
    await platformWallet.save();
  } catch (err) {
    console.error("[RazorpayX] Platform wallet update failed:", err);
  }

  try {
    const { sendNotification } = await import("./notificationService");
    await sendNotification(
      request.userType === "SELLER" ? "Seller" : "Delivery",
      request.userId.toString(),
      "Withdrawal Completed",
      `₹${request.amount.toLocaleString("en-IN")} has been sent to your ${request.paymentMethod === "UPI" ? "UPI" : "bank account"}.${utr ? ` Reference: ${utr}` : ""}`,
      { type: "Success", priority: "High", link: request.userType === "SELLER" ? "/seller/wallet" : "/delivery/wallet" },
    );
  } catch (err) {
    console.error("[RazorpayX] Completion notification failed:", err);
  }
};

/** Payout failed, was rejected or reversed after being sent: return the money and let the admin retry. */
const failPayout = async (requestId: string, reason: string, status: string) => {
  const request = await WithdrawRequest.findOneAndUpdate(
    { _id: requestId, status: "Processing" },
    { $set: { status: "Approved", payoutStatus: status, payoutFailureReason: reason }, $unset: { razorpayPayoutId: "" } },
    { new: true },
  );
  if (!request) return; // already settled one way or the other
  await refundReservation(request, reason).catch((e) => console.error("[RazorpayX] Refund after failed payout failed:", e));
};

/** RazorpayX payout.* webhook events. */
export const handlePayoutWebhook = async (event: string, payout: any) => {
  const requestId = payout?.reference_id;
  if (!requestId || !mongoose.isValidObjectId(requestId)) return;

  switch (event) {
    case "payout.processed":
      await finalizePayout(requestId, payout.utr);
      break;
    case "payout.failed":
    case "payout.rejected":
    case "payout.reversed":
    case "payout.cancelled":
      await failPayout(requestId, payout.failure_reason || payout.status_details?.description || event.replace("payout.", ""), payout.status || event.replace("payout.", ""));
      break;
    default:
      await WithdrawRequest.updateOne({ _id: requestId, status: "Processing" }, { $set: { payoutStatus: payout.status || event.replace("payout.", "") } });
  }
};
