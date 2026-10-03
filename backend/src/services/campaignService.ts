import mongoose from "mongoose";
import Campaign, { ICampaign, ICampaignProduct } from "../models/Campaign";
import OrderItem from "../models/OrderItem";
import AppSettings from "../models/AppSettings";
import Product from "../models/Product";

export interface WinningCampaignEntry {
  campaign: ICampaign;
  productEntry: ICampaignProduct;
}

/** True if `candidate` should win over `current` for the same product. */
function isBetterEntry(
  candidate: { cpcBid: number; campaignCreatedAt: Date },
  current: { cpcBid: number; campaignCreatedAt: Date }
): boolean {
  if (candidate.cpcBid !== current.cpcBid) return candidate.cpcBid > current.cpcBid;
  return candidate.campaignCreatedAt < current.campaignCreatedAt;
}

/**
 * Finds the winning campaign+bid for a single product among all currently-
 * Active, in-date-range, budget-remaining campaigns that include it. If more
 * than one campaign targets the same product, the highest `cpcBid` wins
 * (surfaces the seller's best current bid for this product), with earliest
 * `createdAt` as the final tiebreak.
 */
export const resolveWinningCampaignEntry = async (
  productId: mongoose.Types.ObjectId | string
): Promise<WinningCampaignEntry | null> => {
  const now = new Date();
  const candidates = await Campaign.find({
    "products.product": productId,
    status: "Active",
    startDate: { $lte: now },
    endDate: { $gte: now },
    $expr: { $lt: ["$spend", "$totalBudget"] },
  });

  let best: WinningCampaignEntry | null = null;
  for (const campaign of candidates) {
    const entry = campaign.products.find((p) => p.product.toString() === productId.toString());
    if (!entry) continue;
    if (
      !best ||
      isBetterEntry(
        { cpcBid: entry.cpcBid, campaignCreatedAt: campaign.createdAt },
        { cpcBid: best.productEntry.cpcBid, campaignCreatedAt: best.campaign.createdAt }
      )
    ) {
      best = { campaign, productEntry: entry };
    }
  }

  return best;
};

/**
 * Batched version of resolveWinningCampaignEntry for a whole listing page —
 * one DB round trip regardless of how many products are being checked.
 */
export const getActiveCampaignsForProducts = async (
  productIds: (mongoose.Types.ObjectId | string)[]
): Promise<Map<string, WinningCampaignEntry>> => {
  const map = new Map<string, WinningCampaignEntry>();
  if (productIds.length === 0) return map;

  const now = new Date();
  const idSet = new Set(productIds.map((id) => id.toString()));
  const candidates = await Campaign.find({
    "products.product": { $in: productIds },
    status: "Active",
    startDate: { $lte: now },
    endDate: { $gte: now },
    $expr: { $lt: ["$spend", "$totalBudget"] },
  });

  for (const campaign of candidates) {
    for (const entry of campaign.products) {
      const pid = entry.product.toString();
      if (!idSet.has(pid)) continue;
      const existing = map.get(pid);
      if (
        !existing ||
        isBetterEntry(
          { cpcBid: entry.cpcBid, campaignCreatedAt: campaign.createdAt },
          { cpcBid: existing.productEntry.cpcBid, campaignCreatedAt: existing.campaign.createdAt }
        )
      ) {
        map.set(pid, { campaign, productEntry: entry });
      }
    }
  }

  return map;
};

/**
 * Fire-and-forget impression logging for a batch of (campaign, product)
 * pairs shown in one listing response. Never awaited by the caller — must
 * never slow down or break a product listing request.
 */
export const recordImpressions = (
  entries: { campaignId: mongoose.Types.ObjectId | string; productId: mongoose.Types.ObjectId | string }[]
): void => {
  if (entries.length === 0) return;
  for (const { campaignId, productId } of entries) {
    Campaign.updateOne(
      { _id: campaignId, "products.product": productId },
      { $inc: { impressions: 1, "products.$.impressions": 1 } }
    ).catch((err) => console.error("Failed to record ad impression:", err));
  }
};

/**
 * Record a click on a sponsored product: resolves the winning campaign+bid
 * for this product, charges that product's own cpcBid against both its own
 * and the campaign's shared spend/today-spend, and auto-pauses the campaign
 * if it just exhausted its total or daily budget.
 */
export const recordClick = async (productId: string): Promise<void> => {
  const winner = await resolveWinningCampaignEntry(productId);
  if (!winner) return;

  const { campaign, productEntry } = winner;
  const now = new Date();
  const costPerClick = productEntry.cpcBid;

  // Reset today's spend (campaign-wide and per-product) if this is the first
  // click of a new day.
  const isNewDay =
    !campaign.lastSpendDate || campaign.lastSpendDate.toDateString() !== now.toDateString();
  if (isNewDay) {
    campaign.todaySpend = 0;
    campaign.lastSpendDate = now;
    campaign.products.forEach((p) => {
      p.todaySpend = 0;
    });
  }

  productEntry.clicks += 1;
  productEntry.spend += costPerClick;
  productEntry.todaySpend += costPerClick;

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

export interface CampaignProductMetrics extends CampaignMetrics {
  product: mongoose.Types.ObjectId;
  cpcBid: number;
}

export interface CampaignMetricsResult {
  overall: CampaignMetrics;
  byProduct: CampaignProductMetrics[];
}

/**
 * Orders/Revenue are computed live from OrderItem records (the real source of
 * truth for what actually sold), not from a denormalized counter maintained
 * via hooks into checkout — this keeps the ad system fully decoupled from the
 * order-creation flow, at zero risk to checkout. Returns both a campaign-wide
 * rollup and a per-product breakdown, since a campaign can now span several
 * products.
 */
export const computeCampaignMetrics = async (campaign: ICampaign): Promise<CampaignMetricsResult> => {
  const rangeEnd = campaign.endDate < new Date() ? campaign.endDate : new Date();
  const productIds = campaign.products.map((p) => p.product);

  const rows = await OrderItem.aggregate([
    {
      $match: {
        product: { $in: productIds },
        seller: campaign.seller,
        status: { $ne: "Cancelled" },
        createdAt: { $gte: campaign.startDate, $lte: rangeEnd },
      },
    },
    {
      $group: {
        _id: "$product",
        orders: { $sum: 1 },
        revenue: { $sum: "$total" },
      },
    },
  ]);

  const byProductId = new Map<string, { orders: number; revenue: number }>();
  rows.forEach((r) => byProductId.set(r._id.toString(), { orders: r.orders, revenue: r.revenue }));

  let totalOrders = 0;
  let totalRevenue = 0;
  const byProduct: CampaignProductMetrics[] = campaign.products.map((p) => {
    const row = byProductId.get(p.product.toString()) || { orders: 0, revenue: 0 };
    totalOrders += row.orders;
    totalRevenue += row.revenue;
    return {
      product: p.product,
      cpcBid: p.cpcBid,
      orders: row.orders,
      revenue: row.revenue,
      ctr: p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0,
      conversionRate: p.clicks > 0 ? (row.orders / p.clicks) * 100 : 0,
      roas: p.spend > 0 ? row.revenue / p.spend : 0,
    };
  });

  const overall: CampaignMetrics = {
    orders: totalOrders,
    revenue: totalRevenue,
    ctr: campaign.impressions > 0 ? (campaign.clicks / campaign.impressions) * 100 : 0,
    conversionRate: campaign.clicks > 0 ? (totalOrders / campaign.clicks) * 100 : 0,
    roas: campaign.spend > 0 ? totalRevenue / campaign.spend : 0,
  };

  return { overall, byProduct };
};

export interface BidCompetitiveness {
  percentile: number;
  label: "Low" | "Fair" | "Good" | "Great";
}

/**
 * How competitive a proposed CPC bid is against other sellers' active bids
 * on products in the same category — the "Good Visibility" meter feedback.
 * No historical data to compare against yet (new category, or no other ads
 * running) falls back to a neutral "Fair" rather than implying a judgement
 * with no basis.
 */
export const getBidCompetitiveness = async (
  categoryId: string,
  proposedCpcBid: number
): Promise<BidCompetitiveness> => {
  const productIds = await Product.find({ category: categoryId }).distinct("_id");
  if (productIds.length === 0) {
    return { percentile: 50, label: "Fair" };
  }

  const rows = await Campaign.aggregate([
    { $match: { status: "Active" } },
    { $unwind: "$products" },
    { $match: { "products.product": { $in: productIds } } },
    { $project: { cpcBid: "$products.cpcBid" } },
  ]);

  const bids: number[] = rows.map((r) => r.cpcBid);
  if (bids.length === 0) {
    return { percentile: 50, label: "Fair" };
  }

  const belowOrEqual = bids.filter((b) => b <= proposedCpcBid).length;
  const percentile = Math.round((belowOrEqual / bids.length) * 100);

  let label: BidCompetitiveness["label"];
  if (percentile >= 75) label = "Great";
  else if (percentile >= 50) label = "Good";
  else if (percentile >= 25) label = "Fair";
  else label = "Low";

  return { percentile, label };
};

/**
 * Suggested-minimum CPC shown to a seller while choosing a bid — no longer
 * the actual charge source (each product's own cpcBid is), just a reference
 * floor so a seller doesn't bid an unrealistically low amount.
 */
export const getSuggestedMinimumCpc = async (): Promise<number> => {
  const settings = await AppSettings.findOne().select("adCostPerClick");
  return settings?.adCostPerClick ?? 2;
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
