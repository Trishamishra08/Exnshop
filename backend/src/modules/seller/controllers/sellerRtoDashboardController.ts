import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { getSellerRtoDashboard } from "../../../services/rtoDashboardService";
import RtoPromoBanner from "../../../models/RtoPromoBanner";

/**
 * Combined payload for the seller RTO/Return dashboard — rates, average
 * reverse shipping cost, and per-product RTO performance, this month vs
 * last month.
 */
export const getRtoDashboard = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const data = await getSellerRtoDashboard(sellerId);
  return res.status(200).json({ success: true, data });
});

/**
 * Active promo banner(s) for the RTO dashboard (e.g. "Use Branded Packets
 * & get up to 80% RTO claims approval").
 */
export const getActiveRtoPromoBanners = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const banners = await RtoPromoBanner.find({
    isActive: true,
    $and: [
      { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: now } }] },
    ],
  }).sort({ order: 1 });

  return res.status(200).json({ success: true, data: banners });
});
