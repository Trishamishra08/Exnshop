import mongoose from "mongoose";
import Campaign, { ICampaign } from "../models/Campaign";
import OrderItem from "../models/OrderItem";
import AppSettings from "../models/AppSettings";

/**
 * Find currently-active campaigns (status Active, within date range, budget not
 * exhausted) for a batch of product IDs. Used to mark "sponsored" products in
 * customer-facing listings and to log impressions.
 */
export const getActiveCampaignsForProducts = async (
  productIds: (mongoose.Types.ObjectId | string)[]
): Promise<Map<string, ICampaign>> => {
  const now = new Date();
  const campaigns = await Campaign.find({
    product: { $in: productIds },
    status: "Active",
    startDate: { $lte: now },
    endDate: { $gte: now },
    $expr: { $lt: ["$spend", "$totalBudget"] },
  });

  const map = new Map<string, ICampaign>();
  campaigns.forEach((c) => map.set(c.product.toString(), c));
  return map;
};

/**
 * Fire-and-forget impression logging for a batch of campaigns shown in one
 * listing response. Never awaited by the caller — must never slow down or
 * break a product listing request.
 */
export const recordImpressions = (campaignIds: mongoose.Types.ObjectId[]): void => {
  if (campaignIds.length === 0) return;
  Campaign.updateMany(
    { _id: { $in: campaignIds } },
    { $inc: { impressions: 1 } }
  ).catch((err) => console.error("Failed to record ad impressions:", err));
};

/**
 * Record a click on a sponsored product: increments clicks, charges the
 * configured cost-per-click against the campaign's spend/today-spend, and
 * auto-pauses the campaign if it just exhausted its total or daily budget.
 */
export const recordClick = async (productId: string): Promise<void> => {
  const now = new Date();
  const campaign = await Campaign.findOne({
    product: productId,
    status: "Active",
    startDate: { $lte: now },
    endDate: { $gte: now },
  });
  if (!campaign) return;

  const settings = await AppSettings.findOne().select("adCostPerClick");
  const costPerClick = settings?.adCostPerClick ?? 2;

  // Reset today's spend if this is the first click of a new day.
  const isNewDay =
    !campaign.lastSpendDate ||
    campaign.lastSpendDate.toDateString() !== now.toDateString();
  if (isNewDay) {
    campaign.todaySpend = 0;
    campaign.lastSpendDate = now;
  }

  campaign.clicks += 1;
  campaign.spend += costPerClick;
  campaign.todaySpend += costPerClick;

  if (campaign.spend >= campaign.totalBudget || campaign.todaySpend >= campaign.dailyBudget) {
    campaign.status = "Paused";
  }

  await campaign.save();
};

export interface CampaignMetrics {
  orders: number;
  revenue: number;
  ctr: number;
  conversionRate: number;
  roas: number;
}

/**
 * Orders/Revenue are computed live from OrderItem records (the real source of
 * truth for what actually sold), not from a denormalized counter maintained
 * via hooks into checkout — this keeps the ad system fully decoupled from the
 * order-creation flow, at zero risk to checkout.
 */
export const computeCampaignMetrics = async (campaign: ICampaign): Promise<CampaignMetrics> => {
  const rangeEnd = campaign.endDate < new Date() ? campaign.endDate : new Date();
  const result = await OrderItem.aggregate([
    {
      $match: {
        product: campaign.product,
        seller: campaign.seller,
        status: { $ne: "Cancelled" },
        createdAt: { $gte: campaign.startDate, $lte: rangeEnd },
      },
    },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        revenue: { $sum: "$total" },
      },
    },
  ]);

  const orders = result[0]?.orders || 0;
  const revenue = result[0]?.revenue || 0;
  const ctr = campaign.impressions > 0 ? (campaign.clicks / campaign.impressions) * 100 : 0;
  const conversionRate = campaign.clicks > 0 ? (orders / campaign.clicks) * 100 : 0;
  const roas = campaign.spend > 0 ? revenue / campaign.spend : 0;

  return { orders, revenue, ctr, conversionRate, roas };
};

/**
 * Auto-complete campaigns whose end date has passed. Safe to call opportunistically
 * (e.g. at the top of any campaign list fetch) — cheap no-op when nothing's due.
 */
export const completeExpiredCampaigns = async (): Promise<void> => {
  await Campaign.updateMany(
    { status: { $in: ["Active", "Paused"] }, endDate: { $lt: new Date() } },
    { status: "Completed" }
  ).catch((err) => console.error("Failed to auto-complete expired campaigns:", err));
};
