import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Seller from "../../../models/Seller";
import { getRazorpayInstance, verifyPaymentSignature } from "../../../services/paymentService";
import { creditWallet } from "../../../services/walletManagementService";

/**
 * Seller wallet top-up by Razorpay.
 *
 * Sellers who deliver orders themselves collect the customer's cash, so the
 * platform's share (commission + platform fee) is debited from their wallet
 * after delivery. They keep the wallet funded with this top-up; while the
 * balance is below zero, new self-delivery COD orders can't be accepted.
 */

const MIN_TOPUP = 100;
const MAX_TOPUP = 100000;
const PURPOSE = "SELLER_WALLET_TOPUP";

/** POST /seller/wallet/topup/create { amount } -> Razorpay order to open checkout with. */
export const createWalletTopup = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = String((req as any).user.userId);
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
    return res.status(400).json({ success: false, message: `Enter an amount between ₹${MIN_TOPUP} and ₹${MAX_TOPUP}` });
  }
  const seller: any = await Seller.findById(sellerId).select("storeName email mobile").lean();
  if (!seller) return res.status(404).json({ success: false, message: "Seller not found" });

  const order: any = await getRazorpayInstance().orders.create({
    amount: Math.round(amount * 100),
    currency: "INR",
    receipt: `TOPUP-${Date.now()}`,
    notes: { purpose: PURPOSE, sellerId },
  });

  return res.status(200).json({
    success: true,
    data: {
      razorpayOrderId: order.id,
      razorpayKey: process.env.RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      prefill: { name: seller.storeName, email: seller.email, contact: seller.mobile },
    },
  });
});

/**
 * POST /seller/wallet/topup/verify { razorpayOrderId, razorpayPaymentId, razorpaySignature }
 * Credits the wallet with the amount Razorpay actually captured (never the amount the app sends).
 */
export const verifyWalletTopup = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = String((req as any).user.userId);
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return res.status(400).json({ success: false, message: "Payment details are missing" });
  }
  if (!verifyPaymentSignature(String(razorpayOrderId), String(razorpayPaymentId), String(razorpaySignature))) {
    return res.status(400).json({ success: false, message: "Payment could not be verified" });
  }

  const razorpay = getRazorpayInstance();
  const [order, payment]: any[] = await Promise.all([
    razorpay.orders.fetch(String(razorpayOrderId)),
    razorpay.payments.fetch(String(razorpayPaymentId)),
  ]);
  if (order?.notes?.purpose !== PURPOSE || String(order?.notes?.sellerId) !== sellerId) {
    return res.status(403).json({ success: false, message: "This payment is not a top-up for your account" });
  }
  if (payment?.order_id !== order.id || !["captured", "authorized"].includes(payment?.status)) {
    return res.status(400).json({ success: false, message: "Payment is not complete yet" });
  }

  const amount = Math.round(Number(payment.amount)) / 100;
  // The reference makes this idempotent: verifying the same payment twice credits once.
  const result: any = await creditWallet(
    sellerId,
    "SELLER",
    amount,
    `Wallet top-up (Razorpay ${razorpayPaymentId})`,
    undefined,
    undefined,
    undefined,
    `TOPUP-${razorpayPaymentId}`,
    "WALLET_TOPUP",
  );
  if (result && result.success === false) {
    return res.status(500).json({ success: false, message: result.message || "Could not credit the wallet" });
  }
  const seller: any = await Seller.findById(sellerId).select("balance").lean();
  return res.status(200).json({
    success: true,
    message: `₹${amount.toFixed(2)} added to your wallet`,
    data: { amount, balance: seller?.balance ?? 0 },
  });
});
