import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Seller from "../../../models/Seller";
import { sectionGaps } from "../../../services/sellerOnboardingService";

/** Sellers who started signing up but have not submitted their application yet. */
export const PRE_SUBMIT_STATUSES = ["Draft", "KYCPending"];

const SECTION_TITLES: Record<string, string> = {
  business: "Business",
  kyc: "KYC documents",
  bank: "Bank",
  store: "Store",
};

/**
 * GET /admin/sellers/drafts
 * Sellers who left onboarding half-way, with what each one still has to fill in.
 */
export const getDraftSellers = asyncHandler(async (_req: Request, res: Response) => {
  const sellers = await Seller.find({ onboardingStatus: { $in: PRE_SUBMIT_STATUSES } })
    .select("-password")
    .sort({ updatedAt: -1 });

  const rows = sellers.map((s: any) => {
    const gaps = sectionGaps(s);
    return {
      _id: s._id,
      sellerName: s.sellerName,
      storeName: s.storeName,
      mobile: s.mobile,
      email: s.email,
      onboardingStatus: s.onboardingStatus,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      missing: Object.entries(gaps).flatMap(([section, items]) =>
        (items as string[]).map((item) => ({ section: SECTION_TITLES[section] || section, item }))
      ),
    };
  });

  return res.status(200).json({ success: true, data: rows });
});

/**
 * Get all sellers (for dropdowns/lists)
 */
export const getAllSellers = asyncHandler(async (_req: Request, res: Response) => {
    const sellers = await Seller.find({})
        .select("sellerName storeName profile status")
        .sort({ storeName: 1 });

    return res.status(200).json({
        success: true,
        message: "Sellers fetched successfully",
        data: sellers,
    });
});
