import mongoose from "mongoose";
import Seller from "../models/Seller";
import AppSettings from "../models/AppSettings";
import WalletTransaction from "../models/WalletTransaction";
import WithdrawRequest from "../models/WithdrawRequest";

/**
 * Seller credit limit and admin holds.
 *
 * - Available balance (`balance`) may go below zero, down to the seller's credit limit,
 *   when they accept self-delivery COD orders (the platform's share is debited after
 *   delivery) and when their ads are clicked. Dues for work already done (platform fee,
 *   courier charges) are always applied, even past the limit.
 * - Credit limit = the seller's own limit, or the platform default when they have none.
 * - Frozen balance: money the admin has moved out of `balance` and holds (e.g. against a
 *   chargeback). It can be released back or deducted. It is never withdrawable.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export const getDefaultCreditLimit = async (): Promise<number> => {
  const settings = await AppSettings.findOne().select("defaultSellerCreditLimit").lean();
  return Number((settings as any)?.defaultSellerCreditLimit || 0);
};

/** The seller's own limit when set, otherwise the platform default. */
export const effectiveCreditLimit = (seller: { creditLimit?: number | null } | null | undefined, defaultLimit: number): number => {
  const own = seller?.creditLimit;
  return own === null || own === undefined ? defaultLimit : Number(own) || 0;
};

/** How much the seller can still spend (available balance + credit limit). */
export const getSellerSpendable = async (sellerId: string): Promise<{ balance: number; creditLimit: number; spendable: number }> => {
  const [seller, defaultLimit] = await Promise.all([
    Seller.findById(sellerId).select("balance creditLimit").lean(),
    getDefaultCreditLimit(),
  ]);
  const balance = Number((seller as any)?.balance || 0);
  const creditLimit = effectiveCreditLimit(seller as any, defaultLimit);
  return { balance, creditLimit, spendable: round2(balance + creditLimit) };
};

/** Spendable amount for many sellers at once (ads ranking). */
export const getSpendableBySeller = async (sellerIds: string[]): Promise<Map<string, number>> => {
  const [sellers, defaultLimit] = await Promise.all([
    Seller.find({ _id: { $in: sellerIds } }).select("balance creditLimit").lean(),
    getDefaultCreditLimit(),
  ]);
  return new Map(
    sellers.map((s: any) => [String(s._id), round2(Number(s.balance || 0) + effectiveCreditLimit(s, defaultLimit))]),
  );
};

export interface SellerBalanceSummary {
  /** Available balance (ad spend and platform fees already deducted); may be negative. */
  available: number;
  /** Earnings of delivered orders still inside the return window. */
  onHold: number;
  /** Held by the admin (e.g. against a chargeback). */
  frozen: number;
  /** available + onHold + frozen */
  totalBalance: number;
  /** What the seller can withdraw to their bank now. */
  eligibleForPayout: number;
  /** A withdrawal already requested and not yet paid out. */
  pendingWithdrawal: number;
  creditLimit: number;
  creditUsed: number;
  creditRemaining: number;
  /** Lifetime ad-click charges and platform fees debited (already inside `available`). */
  adSpendTotal: number;
  platformFeeTotal: number;
}

export const getSellerBalanceSummary = async (sellerId: string): Promise<SellerBalanceSummary> => {
  const sid = new mongoose.Types.ObjectId(sellerId);
  const [seller, defaultLimit, debits, pending] = await Promise.all([
    Seller.findById(sellerId).select("balance onHoldBalance frozenBalance creditLimit").lean(),
    getDefaultCreditLimit(),
    WalletTransaction.aggregate([
      { $match: { userId: sid, userType: "SELLER", type: "Debit", status: "Completed", category: { $in: ["AD_SPEND", "PLATFORM_FEE_DEBIT"] } } },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
    ]),
    WithdrawRequest.aggregate([
      // Pending/Approved are still inside `balance`; Processing has already been debited.
      { $match: { userId: sid, userType: "SELLER", status: { $in: ["Pending", "Approved"] } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);
  const s: any = seller || {};
  const available = round2(Number(s.balance || 0));
  const onHold = round2(Number(s.onHoldBalance || 0));
  const frozen = round2(Number(s.frozenBalance || 0));
  const creditLimit = effectiveCreditLimit(s, defaultLimit);
  const creditUsed = round2(Math.max(0, -available));
  const pendingWithdrawal = round2(Number(pending[0]?.total || 0));
  const sumOf = (cat: string) => round2(Number(debits.find((d: any) => d._id === cat)?.total || 0));
  return {
    available,
    onHold,
    frozen,
    totalBalance: round2(available + onHold + frozen),
    eligibleForPayout: round2(Math.max(0, available - pendingWithdrawal)),
    pendingWithdrawal,
    creditLimit,
    creditUsed,
    creditRemaining: round2(Math.max(0, creditLimit - creditUsed)),
    adSpendTotal: sumOf("AD_SPEND"),
    platformFeeTotal: sumOf("PLATFORM_FEE_DEBIT"),
  };
};

const fail = (message: string) => ({ success: false as const, message });

/**
 * Admin hold actions on a seller's money:
 * - freeze:  available → frozen (only out of a positive available balance)
 * - release: frozen → available
 * - deduct:  frozen → platform (a chargeback the seller owes)
 * Each step is atomic and leaves a wallet transaction for the seller's statement.
 */
export const applySellerHold = async (
  sellerId: string,
  action: "freeze" | "release" | "deduct",
  rawAmount: number,
  reason: string,
  adminId?: string,
) => {
  const amount = round2(Number(rawAmount));
  if (!(amount > 0)) return fail("Enter an amount greater than zero");
  if (!mongoose.isValidObjectId(sellerId)) return fail("Invalid seller");
  const note = String(reason || "").trim().slice(0, 300);
  if ((action === "freeze" || action === "deduct") && !note) return fail("Add a reason (e.g. the chargeback / order reference)");

  let filter: any;
  let update: any;
  if (action === "freeze") {
    filter = { _id: sellerId, balance: { $gte: amount } };
    update = { $inc: { balance: -amount, frozenBalance: amount } };
  } else {
    filter = { _id: sellerId, frozenBalance: { $gte: amount } };
    update = action === "release" ? { $inc: { balance: amount, frozenBalance: -amount } } : { $inc: { frozenBalance: -amount } };
  }

  const updated: any = await Seller.findOneAndUpdate(filter, update, { new: true }).select("balance frozenBalance storeName");
  if (!updated) {
    const s: any = await Seller.findById(sellerId).select("balance frozenBalance").lean();
    if (!s) return fail("Seller not found");
    return action === "freeze"
      ? fail(`Only ₹${Math.max(0, Number(s.balance || 0)).toFixed(2)} of this seller's available balance can be frozen.`)
      : fail(`This seller has only ₹${Number(s.frozenBalance || 0).toFixed(2)} frozen.`);
  }

  const balanceAfter = Number(updated.balance || 0);
  const label = { freeze: "Balance held by admin", release: "Held balance released", deduct: "Chargeback deducted from held balance" }[action];
  await WalletTransaction.create({
    userId: sellerId,
    userType: "SELLER",
    category: action === "freeze" ? "BALANCE_FREEZE" : action === "release" ? "BALANCE_RELEASE" : "CHARGEBACK_DEBIT",
    amount,
    // Freeze/release move money between available and held; a deduction leaves available as it was.
    balanceBefore: action === "freeze" ? balanceAfter + amount : action === "release" ? balanceAfter - amount : balanceAfter,
    balanceAfter,
    type: action === "release" ? "Credit" : "Debit",
    description: note ? `${label}: ${note}` : label,
    status: "Completed",
    reference: `HOLD-${action.toUpperCase()}-${sellerId}-${Date.now()}${adminId ? `-${String(adminId).slice(-6)}` : ""}`,
  } as any);

  return {
    success: true as const,
    message: { freeze: "Amount frozen", release: "Amount released to the seller's available balance", deduct: "Chargeback deducted from the frozen amount" }[action],
    data: { balance: balanceAfter, frozenBalance: Number(updated.frozenBalance || 0) },
  };
};
