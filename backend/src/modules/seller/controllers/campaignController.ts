import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Campaign from "../../../models/Campaign";
import Product from "../../../models/Product";
import {
  computeCampaignMetrics,
  completeExpiredCampaigns,
} from "../../../services/campaignService";

export const createCampaign = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { productId, dailyBudget, totalBudget, startDate, endDate } = req.body;

  if (!productId || !dailyBudget || !totalBudget || !startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: "productId, dailyBudget, totalBudget, startDate and endDate are required",
    });
  }

  const product = await Product.findOne({ _id: productId, seller: sellerId });
  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found or doesn't belong to you",
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
    product: productId,
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
    .populate("product", "productName mainImage price")
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
  const { dailyBudget, totalBudget, startDate, endDate } = req.body;

  const campaign = await Campaign.findOne({ _id: id, seller: sellerId });
  if (!campaign) {
    return res.status(404).json({ success: false, message: "Campaign not found" });
  }
  if (campaign.status === "Active" || campaign.status === "Completed") {
    return res.status(400).json({
      success: false,
      message: "Pause the campaign before editing its budget or dates",
    });
  }

  if (dailyBudget !== undefined) campaign.dailyBudget = Number(dailyBudget);
  if (totalBudget !== undefined) campaign.totalBudget = Number(totalBudget);
  if (startDate !== undefined) campaign.startDate = new Date(startDate);
  if (endDate !== undefined) campaign.endDate = new Date(endDate);

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

// ==================== Admin ====================

export const getAllCampaignsAdmin = asyncHandler(async (_req: Request, res: Response) => {
  await completeExpiredCampaigns();
  const campaigns = await Campaign.find({})
    .populate("product", "productName mainImage")
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
