import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Campaign from "../../../models/Campaign";
import Product from "../../../models/Product";
import {
  computeCampaignMetrics,
  completeExpiredCampaigns,
  getBidCompetitiveness,
  getSuggestedMinimumCpc,
} from "../../../services/campaignService";

interface ProductBidInput {
  productId: string;
  cpcBid: number;
}

export const createCampaign = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { products, dailyBudget, totalBudget, startDate, endDate } = req.body as {
    products: ProductBidInput[];
    dailyBudget: number;
    totalBudget: number;
    startDate: string;
    endDate: string;
  };

  if (!Array.isArray(products) || products.length === 0 || !dailyBudget || !totalBudget || !startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "products (at least one), dailyBudget, totalBudget, startDate and endDate are required",
    });
  }

  for (const p of products) {
    if (!p.productId || p.cpcBid === undefined || Number(p.cpcBid) < 0) {
      return res.status(400).json({
        success: false,
        message: "Every product needs a productId and a non-negative cpcBid",
      });
    }
  }

  const productIds = products.map((p) => p.productId);
  const ownedProducts = await Product.find({ _id: { $in: productIds }, seller: sellerId }).select("_id");
  if (ownedProducts.length !== productIds.length) {
    return res.status(404).json({
      success: false,
      message: "One or more products were not found or don't belong to you",
    });
  }

  if (new Date(endDate) <= new Date(startDate)) {
    return res.status(400).json({
      success: false,
      message: "End date must be after start date",
    });
  }

  const campaign = await Campaign.create({
    seller: sellerId,
    products: products.map((p) => ({
      product: p.productId,
      cpcBid: Number(p.cpcBid),
      spend: 0,
      todaySpend: 0,
      impressions: 0,
      clicks: 0,
    })),
    dailyBudget: Number(dailyBudget),
    totalBudget: Number(totalBudget),
    startDate,
    endDate,
    status: "Draft",
  });

  return res.status(201).json({
    success: true,
    message: "Campaign created as Draft. Activate it when you're ready to start spending.",
    data: campaign,
  });
});

export const getMyCampaigns = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  await completeExpiredCampaigns();

  const campaigns = await Campaign.find({ seller: sellerId })
    .populate("products.product", "productName mainImage price")
    .sort({ createdAt: -1 });

  const withMetrics = await Promise.all(
    campaigns.map(async (c) => ({
      ...c.toObject(),
      metrics: await computeCampaignMetrics(c),
    }))
  );

  return res.status(200).json({
    success: true,
    message: "Campaigns fetched successfully",
    data: withMetrics,
  });
});

export const updateCampaign = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;
  const { dailyBudget, totalBudget, startDate, endDate, products } = req.body as {
    dailyBudget?: number;
    totalBudget?: number;
    startDate?: string;
    endDate?: string;
    products?: ProductBidInput[];
  };

  const campaign = await Campaign.findOne({ _id: id, seller: sellerId });
  if (!campaign) {
    return res.status(404).json({ success: false, message: "Campaign not found" });
  }
  if (campaign.status === "Active" || campaign.status === "Completed") {
    return res.status(400).json({
      success: false,
      message: "Pause the campaign before editing its budget, dates, or products",
    });
  }

  if (dailyBudget !== undefined) campaign.dailyBudget = Number(dailyBudget);
  if (totalBudget !== undefined) campaign.totalBudget = Number(totalBudget);
  if (startDate !== undefined) campaign.startDate = new Date(startDate);
  if (endDate !== undefined) campaign.endDate = new Date(endDate);

  if (products !== undefined) {
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, message: "At least one product is required" });
    }
    for (const p of products) {
      if (!p.productId || p.cpcBid === undefined || Number(p.cpcBid) < 0) {
        return res.status(400).json({
          success: false,
          message: "Every product needs a productId and a non-negative cpcBid",
        });
      }
    }
    const productIds = products.map((p) => p.productId);
    const ownedProducts = await Product.find({ _id: { $in: productIds }, seller: sellerId }).select("_id");
    if (ownedProducts.length !== productIds.length) {
      return res.status(404).json({
        success: false,
        message: "One or more products were not found or don't belong to you",
      });
    }

    // Preserve existing spend/impressions/clicks for products that stay in
    // the campaign; new products start fresh.
    const existingByProduct = new Map(campaign.products.map((p) => [p.product.toString(), p]));
    campaign.products = products.map((p) => {
      const existing = existingByProduct.get(p.productId);
      return {
        product: p.productId as any,
        cpcBid: Number(p.cpcBid),
        spend: existing?.spend || 0,
        todaySpend: existing?.todaySpend || 0,
        impressions: existing?.impressions || 0,
        clicks: existing?.clicks || 0,
      };
    });
  }

  await campaign.save();

  return res.status(200).json({
    success: true,
    message: "Campaign updated successfully",
    data: campaign,
  });
});

/**
 * Seller-controlled state transitions: Draft/Paused -> Active, Active -> Paused.
 * "Completed" is system-set only (endDate passed), never seller-triggered.
 */
export const updateCampaignStatus = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;
  const { status } = req.body;

  if (!["Active", "Paused"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be Active or Paused",
    });
  }

  const campaign = await Campaign.findOne({ _id: id, seller: sellerId });
  if (!campaign) {
    return res.status(404).json({ success: false, message: "Campaign not found" });
  }
  if (campaign.status === "Completed") {
    return res.status(400).json({ success: false, message: "This campaign has already completed" });
  }
  if (status === "Active" && campaign.spend >= campaign.totalBudget) {
    return res.status(400).json({
      success: false,
      message: "This campaign's total budget is exhausted. Increase the budget before reactivating.",
    });
  }

  campaign.status = status;
  await campaign.save();

  return res.status(200).json({
    success: true,
    message: `Campaign ${status === "Active" ? "activated" : "paused"}`,
    data: campaign,
  });
});

export const deleteCampaign = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const campaign = await Campaign.findOneAndDelete({
    _id: req.params.id,
    seller: sellerId,
    status: { $in: ["Draft", "Paused"] },
  });
  if (!campaign) {
    return res.status(404).json({
      success: false,
      message: "Campaign not found, or it can't be deleted while Active/Completed",
    });
  }
  return res.status(200).json({ success: true, message: "Campaign deleted successfully" });
});

/**
 * Live feedback while a seller is choosing a bid: how their proposed CPC
 * compares to other active bids on products in the same category, plus a
 * suggested minimum to reference.
 */
export const getBidFeedback = asyncHandler(async (req: Request, res: Response) => {
  const { categoryId, cpcBid } = req.query;
  if (!categoryId || cpcBid === undefined) {
    return res.status(400).json({ success: false, message: "categoryId and cpcBid are required" });
  }

  const [competitiveness, suggestedMinimum] = await Promise.all([
    getBidCompetitiveness(categoryId as string, Number(cpcBid)),
    getSuggestedMinimumCpc(),
  ]);

  return res.status(200).json({
    success: true,
    data: { ...competitiveness, suggestedMinimum },
  });
});

// ==================== Admin ====================

export const getAllCampaignsAdmin = asyncHandler(async (_req: Request, res: Response) => {
  await completeExpiredCampaigns();
  const campaigns = await Campaign.find({})
    .populate("products.product", "productName mainImage")
    .populate("seller", "sellerName storeName")
    .sort({ createdAt: -1 });

  const withMetrics = await Promise.all(
    campaigns.map(async (c) => ({
      ...c.toObject(),
      metrics: await computeCampaignMetrics(c),
    }))
  );

  return res.status(200).json({
    success: true,
    message: "Campaigns fetched successfully",
    data: withMetrics,
  });
});

/**
 * Admin override: force-pause any campaign (e.g. policy violation), regardless
 * of its current status.
 */
export const forcePauseCampaign = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await Campaign.findByIdAndUpdate(
    req.params.id,
    { status: "Paused" },
    { new: true }
  );
  if (!campaign) {
    return res.status(404).json({ success: false, message: "Campaign not found" });
  }
  return res.status(200).json({ success: true, message: "Campaign paused by admin", data: campaign });
});
