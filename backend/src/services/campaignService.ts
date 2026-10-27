import mongoose from "mongoose";
import Campaign, { ICampaign, ICampaignProduct } from "../models/Campaign";
import CampaignDailyStat from "../models/CampaignDailyStat";
import OrderItem from "../models/OrderItem";
import AppSettings from "../models/AppSettings";
import Product from "../models/Product";
import Seller from "../models/Seller";
import { chargeAdSpend } from "./walletManagementService";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** India calendar date (YYYY-MM-DD) of an instant. */
export const istDayString = (d: Date = new Date()): string => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Append an entry to a campaign's change history (newest last, keeps the latest 100). */
export const pushHistory = (campaignId: any, action: string, detail?: string) =>
  Campaign.updateOne({ _id: campaignId }, { $push: { history: { $each: [{ at: new Date(), action, detail }], $slice: -100 } } }).catch((err) =>
    console.error("Failed to write campaign history:", err?.message)
  );

/** Midnight India time for `now` — daily ad budgets reset on the Indian day, not the server's. */
export const istDayStart = (now: Date = new Date()): Date => {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
};

/** A seller's payout (available + on hold) must cover a click for their ad to be shown. */
const fundsBySeller = async (campaigns: ICampaign[]): Promise<Map<string, number>> => {
  const ids = [...new Set(campaigns.map((c) => c.seller.toString()))];
  const sellers = await Seller.find({ _id: { $in: ids } }).select("balance onHoldBalance").lean();
  return new Map(sellers.map((s: any) => [s._id.toString(), (s.balance || 0) + (s.onHoldBalance || 0)]));
};

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
/**
 * Total budget not exhausted, and today's budget not exhausted. todaySpend is
 * only reset on the next click, so a lastSpendDate before today means today's
 * spend is effectively 0 — the campaign serves again each new day by itself.
 */
const servableBudgetExpr = (now: Date) => {
  const startOfToday = istDayStart(now);
  return {
    $and: [
      { $lt: ["$spend", "$totalBudget"] },
      {
        $or: [
          { $lt: [{ $ifNull: ["$lastSpendDate", new Date(0)] }, startOfToday] },
          { $lt: ["$todaySpend", "$dailyBudget"] },
        ],
      },
    ],
  };
};

export const resolveWinningCampaignEntry = async (
  productId: mongoose.Types.ObjectId | string
): Promise<WinningCampaignEntry | null> => {
  const now = new Date();
  const candidates = await Campaign.find({
    "products.product": productId,
    status: "Active",
    archived: { $ne: true },
    startDate: { $lte: now },
    endDate: { $gte: now },
    $expr: servableBudgetExpr(now),
  });
  const funds = await fundsBySeller(candidates);

  let best: WinningCampaignEntry | null = null;
  for (const campaign of candidates) {
    const entry = campaign.products.find((p) => p.product.toString() === productId.toString());
    if (!entry) continue;
    if ((funds.get(campaign.seller.toString()) ?? 0) < entry.cpcBid) continue;
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
    archived: { $ne: true },
    startDate: { $lte: now },
    endDate: { $gte: now },
    $expr: servableBudgetExpr(now),
  });
  const funds = await fundsBySeller(candidates);

  for (const campaign of candidates) {
    const sellerFunds = funds.get(campaign.seller.toString()) ?? 0;
    for (const entry of campaign.products) {
      const pid = entry.product.toString();
      if (!idSet.has(pid)) continue;
      if (sellerFunds < entry.cpcBid) continue;
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
  const day = istDayString();
  for (const { campaignId, productId } of entries) {
    CampaignDailyStat.updateOne({ campaign: campaignId, day }, { $inc: { impressions: 1 } }, { upsert: true }).catch((err) =>
      console.error("Failed to record daily ad impression:", err)
    );
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

  // The click is paid from the seller's payout; if it can't be charged, it isn't counted.
  const charged = await chargeAdSpend(
    campaign.seller.toString(),
    costPerClick,
    `Ad click charge (campaign ${campaign._id.toString().slice(-6).toUpperCase()})`,
    `AD-${campaign._id}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  if (!charged) return;
  CampaignDailyStat.updateOne({ campaign: campaign._id, day: istDayString(now) }, { $inc: { clicks: 1, spend: costPerClick } }, { upsert: true }).catch((err) =>
    console.error("Failed to record daily ad click:", err)
  );

  // Reset today's spend (campaign-wide and per-product) if this is the first
  // click of a new Indian day.
  const isNewDay = !campaign.lastSpendDate || campaign.lastSpendDate < istDayStart(now);
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

  // Only the total budget pauses the campaign. Hitting the daily budget just
  // stops it being served for the rest of today (see servableBudgetExpr); it
  // resumes automatically tomorrow instead of staying paused forever.
  if (campaign.spend >= campaign.totalBudget) {
    campaign.status = "Paused";
    campaign.history = [...(campaign.history || []), { at: new Date(), action: "Paused automatically", detail: "Total budget used" }].slice(-100);
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

export type CampaignServingState =
  | "Running"
  | "Scheduled"
  | "DailyBudgetReached"
  | "TotalBudgetReached"
  | "LowPayoutBalance"
  | "NotRunning";

/** Why an Active campaign is or isn't being shown right now, for the seller's screen. */
export const getServingState = (campaign: ICampaign, sellerFunds: number, now: Date = new Date()): CampaignServingState => {
  if (campaign.status !== "Active") return "NotRunning";
  if (campaign.startDate > now) return "Scheduled";
  if (campaign.spend >= campaign.totalBudget) return "TotalBudgetReached";
  const spentToday = campaign.lastSpendDate && campaign.lastSpendDate >= istDayStart(now) ? campaign.todaySpend : 0;
  if (spentToday >= campaign.dailyBudget) return "DailyBudgetReached";
  const minBid = Math.min(...campaign.products.map((p) => p.cpcBid));
  if (sellerFunds < minBid) return "LowPayoutBalance";
  return "Running";
};

/**
 * Parses a campaign start/end the seller entered. A full date-time is taken as
 * given; a bare date (YYYY-MM-DD) means the start or end of that day in India.
 */
export const parseCampaignDate = (value: string, edge: "start" | "end"): Date => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}+05:30`);
  }
  // A date-time with no timezone (from a datetime-local input) is India time.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return new Date(`${value}${value.length === 16 ? ":00" : ""}+05:30`);
  }
  return new Date(value);
};

export const getSellerAdFunds = async (sellerId: string): Promise<number> => {
  const seller = await Seller.findById(sellerId).select("balance onHoldBalance").lean();
  return ((seller as any)?.balance || 0) + ((seller as any)?.onHoldBalance || 0);
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

export interface AnalyticsRow {
  day: string;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  revenue: number;
}

/**
 * Daily performance for a seller's campaigns (all, or one) over the last `days`
 * India days. Impressions, clicks and spend come from the per-day counters kept
 * since daily tracking began; orders and revenue are read live from sales of the
 * campaigns' products, like the per-campaign numbers.
 */
export const campaignAnalytics = async (sellerId: string, days: number, campaignId?: string) => {
  const span = Math.min(180, Math.max(1, Math.floor(days) || 30));
  const campaigns = await Campaign.find({ seller: sellerId, ...(campaignId ? { _id: campaignId } : {}) })
    .select("products.product")
    .lean();
  const campaignIds = campaigns.map((c: any) => c._id);
  const productIds = [...new Set(campaigns.flatMap((c: any) => c.products.map((p: any) => String(p.product))))].map(
    (id) => new mongoose.Types.ObjectId(id),
  );

  const DAY_MS = 24 * 60 * 60 * 1000;
  const today = new Date();
  const dayList: string[] = [];
  for (let i = span - 1; i >= 0; i--) dayList.push(istDayString(new Date(today.getTime() - i * DAY_MS)));
  const fromDay = dayList[0];
  const fromInstant = new Date(new Date(`${fromDay}T00:00:00Z`).getTime() - IST_OFFSET_MS);

  const [stats, sales] = await Promise.all([
    campaignIds.length ? CampaignDailyStat.find({ campaign: { $in: campaignIds }, day: { $gte: fromDay } }).lean() : [],
    productIds.length
      ? OrderItem.aggregate([
          {
            $match: {
              seller: new mongoose.Types.ObjectId(sellerId),
              product: { $in: productIds },
              status: { $ne: "Cancelled" },
              createdAt: { $gte: fromInstant },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } },
              orders: { $sum: 1 },
              revenue: { $sum: "$total" },
            },
          },
        ])
      : [],
  ]);

  const byDay = new Map<string, AnalyticsRow>(dayList.map((d) => [d, { day: d, impressions: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 }]));
  for (const s of stats as any[]) {
    const row = byDay.get(s.day);
    if (!row) continue;
    row.impressions += s.impressions || 0;
    row.clicks += s.clicks || 0;
    row.spend += s.spend || 0;
  }
  for (const s of sales as any[]) {
    const row = byDay.get(s._id);
    if (!row) continue;
    row.orders += s.orders;
    row.revenue += s.revenue;
  }

  const series = dayList.map((d) => {
    const r = byDay.get(d)!;
    return { ...r, spend: Math.round(r.spend * 100) / 100, revenue: Math.round(r.revenue * 100) / 100 };
  });
  const sum = (k: keyof AnalyticsRow) => series.reduce((a, r) => a + (r[k] as number), 0);
  const impressions = sum("impressions");
  const clicks = sum("clicks");
  const spend = sum("spend");
  const orders = sum("orders");
  const revenue = sum("revenue");
  return {
    days: span,
    series,
    totals: {
      impressions,
      clicks,
      spend: Math.round(spend * 100) / 100,
      orders,
      revenue: Math.round(revenue * 100) / 100,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      conversionRate: clicks > 0 ? (orders / clicks) * 100 : 0,
      roas: spend > 0 ? revenue / spend : 0,
    },
  };
};
