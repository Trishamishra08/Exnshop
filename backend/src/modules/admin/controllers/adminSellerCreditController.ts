import { Request, Response } from "express";
import mongoose from "mongoose";
import Seller from "../../../models/Seller";
import AppSettings from "../../../models/AppSettings";
import { asyncHandler } from "../../../utils/asyncHandler";
import { applySellerHold, effectiveCreditLimit, getDefaultCreditLimit } from "../../../services/sellerCreditService";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MAX_CREDIT_LIMIT = 10_000_000;

/**
 * Sellers with their wallet position: available, on hold, frozen, credit limit and how
 * much of it is used. Searchable by store / seller name / mobile.
 */
export const getSellerCredits = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const search = String(req.query.search || "").trim();

  const query: any = { status: "Approved" };
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    query.$or = [{ storeName: rx }, { sellerName: rx }, { mobile: rx }, { email: rx }];
  }

  const [sellers, total, defaultLimit] = await Promise.all([
    Seller.find(query)
      .select("storeName sellerName mobile balance onHoldBalance frozenBalance creditLimit")
      .sort({ storeName: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Seller.countDocuments(query),
    getDefaultCreditLimit(),
  ]);

  const rows = sellers.map((s: any) => {
    const available = Number(s.balance || 0);
    const credit = effectiveCreditLimit(s, defaultLimit);
    const creditUsed = Math.max(0, -available);
    return {
      _id: s._id,
      storeName: s.storeName,
      sellerName: s.sellerName,
      mobile: s.mobile,
      available,
      onHold: Number(s.onHoldBalance || 0),
      frozen: Number(s.frozenBalance || 0),
      totalBalance: available + Number(s.onHoldBalance || 0) + Number(s.frozenBalance || 0),
      ownCreditLimit: s.creditLimit === null || s.creditLimit === undefined ? null : Number(s.creditLimit),
      creditLimit: credit,
      creditUsed,
      creditRemaining: Math.max(0, credit - creditUsed),
    };
  });

  return res.status(200).json({
    success: true,
    data: { defaultCreditLimit: defaultLimit, sellers: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
});

/**
 * Credit limit for all sellers at once: sets the platform default. With `applyToAll`,
 * every seller's own limit is cleared too, so the default applies to everyone.
 */
export const setDefaultCreditLimit = asyncHandler(async (req: Request, res: Response) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_CREDIT_LIMIT) {
    return res.status(400).json({ success: false, message: "Enter a credit limit of ₹0 or more" });
  }
  const settings = await AppSettings.getSettings();
  (settings as any).defaultSellerCreditLimit = Math.round(amount * 100) / 100;
  await settings.save();

  let reset = 0;
  if (req.body?.applyToAll === true) {
    const r = await Seller.updateMany({ creditLimit: { $ne: null } }, { $set: { creditLimit: null } });
    reset = r.modifiedCount || 0;
  }
  return res.status(200).json({
    success: true,
    message: req.body?.applyToAll
      ? `Credit limit ₹${amount} set for all sellers${reset ? ` (${reset} individual limit${reset === 1 ? "" : "s"} replaced)` : ""}.`
      : `Default credit limit set to ₹${amount}. Sellers with their own limit keep it.`,
    data: { defaultCreditLimit: (settings as any).defaultSellerCreditLimit },
  });
});

/** One seller's own credit limit; `creditLimit: null` makes them use the default again. */
export const setSellerCreditLimit = asyncHandler(async (req: Request, res: Response) => {
  const { sellerId } = req.params;
  if (!mongoose.isValidObjectId(sellerId)) {
    return res.status(400).json({ success: false, message: "Invalid seller" });
  }
  const raw = req.body?.creditLimit;
  let value: number | null = null;
  if (raw !== null && raw !== undefined && raw !== "") {
    value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > MAX_CREDIT_LIMIT) {
      return res.status(400).json({ success: false, message: "Enter a credit limit of ₹0 or more" });
    }
    value = Math.round(value * 100) / 100;
  }
  const seller = await Seller.findByIdAndUpdate(sellerId, { $set: { creditLimit: value } }, { new: true }).select("storeName creditLimit");
  if (!seller) {
    return res.status(404).json({ success: false, message: "Seller not found" });
  }
  return res.status(200).json({
    success: true,
    message: value === null ? `${seller.storeName} now uses the default credit limit.` : `Credit limit for ${seller.storeName} set to ₹${value}.`,
    data: { creditLimit: value },
  });
});

/** Freeze, release or deduct (chargeback) a seller's held amount. */
export const holdSellerBalance = asyncHandler(async (req: Request, res: Response) => {
  const { sellerId } = req.params;
  const { action, amount, reason } = req.body || {};
  if (!["freeze", "release", "deduct"].includes(action)) {
    return res.status(400).json({ success: false, message: "Action must be freeze, release or deduct" });
  }
  const result = await applySellerHold(sellerId, action, Number(amount), String(reason || ""), (req as any).user?.userId);
  return res.status(result.success ? 200 : 400).json(result);
});
