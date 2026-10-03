import mongoose from "mongoose";
import RTOEvent from "../models/RTOEvent";
import Return from "../models/Return";
import OrderItem from "../models/OrderItem";

interface PeriodRange {
  start: Date;
  end: Date;
}

function getThisAndLastMonth(): { thisMonth: PeriodRange; lastMonth: PeriodRange } {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return {
    thisMonth: { start: thisMonthStart, end: now },
    lastMonth: { start: lastMonthStart, end: thisMonthStart },
  };
}

/**
 * Return Rate % and RTO Rate % for a seller, this month vs last month —
 * following the same two-parallel-period pattern used elsewhere in the app
 * (see dashboardService.ts). "Shipped" here is approximated as any OrderItem
 * that reached Delivered, Returned, or RTO in the period, since the schema
 * doesn't track a distinct "shipped" milestone separately.
 */
export async function getSellerRtoAndReturnRates(sellerId: string) {
  const { thisMonth, lastMonth } = getThisAndLastMonth();
  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

  const [
    shippedThisMonth,
    shippedLastMonth,
    rtoThisMonth,
    rtoLastMonth,
    returnsThisMonth,
    returnsLastMonth,
  ] = await Promise.all([
    OrderItem.countDocuments({
      seller: sellerObjectId,
      status: { $in: ["Delivered", "Returned", "RTO"] },
      createdAt: { $gte: thisMonth.start, $lte: thisMonth.end },
    }),
    OrderItem.countDocuments({
      seller: sellerObjectId,
      status: { $in: ["Delivered", "Returned", "RTO"] },
      createdAt: { $gte: lastMonth.start, $lt: lastMonth.end },
    }),
    RTOEvent.countDocuments({
      seller: sellerObjectId,
      createdAt: { $gte: thisMonth.start, $lte: thisMonth.end },
    }),
    RTOEvent.countDocuments({
      seller: sellerObjectId,
      createdAt: { $gte: lastMonth.start, $lt: lastMonth.end },
    }),
    Return.countDocuments({
      createdAt: { $gte: thisMonth.start, $lte: thisMonth.end },
      orderItem: {
        $in: await OrderItem.find({ seller: sellerObjectId }).distinct("_id"),
      },
    }),
    Return.countDocuments({
      createdAt: { $gte: lastMonth.start, $lt: lastMonth.end },
      orderItem: {
        $in: await OrderItem.find({ seller: sellerObjectId }).distinct("_id"),
      },
    }),
  ]);

  const pct = (numerator: number, denominator: number) =>
    denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;

  return {
    returnRate: {
      thisMonth: pct(returnsThisMonth, shippedThisMonth),
      lastMonth: pct(returnsLastMonth, shippedLastMonth),
    },
    rtoRate: {
      thisMonth: pct(rtoThisMonth, shippedThisMonth),
      lastMonth: pct(rtoLastMonth, shippedLastMonth),
    },
    deliveredCount: { thisMonth: shippedThisMonth, lastMonth: shippedLastMonth },
    returnCount: { thisMonth: returnsThisMonth, lastMonth: returnsLastMonth },
    rtoCount: { thisMonth: rtoThisMonth, lastMonth: rtoLastMonth },
  };
}

export async function getSellerAverageReverseShippingCost(sellerId: string) {
  const { thisMonth, lastMonth } = getThisAndLastMonth();
  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

  const [thisMonthAgg, lastMonthAgg] = await Promise.all([
    RTOEvent.aggregate([
      { $match: { seller: sellerObjectId, createdAt: { $gte: thisMonth.start, $lte: thisMonth.end } } },
      { $group: { _id: null, avg: { $avg: "$reverseShippingCost" } } },
    ]),
    RTOEvent.aggregate([
      { $match: { seller: sellerObjectId, createdAt: { $gte: lastMonth.start, $lt: lastMonth.end } } },
      { $group: { _id: null, avg: { $avg: "$reverseShippingCost" } } },
    ]),
  ]);

  return {
    thisMonth: Number((thisMonthAgg[0]?.avg || 0).toFixed(2)),
    lastMonth: Number((lastMonthAgg[0]?.avg || 0).toFixed(2)),
  };
}

/**
 * Per-product RTO count this month vs last month, for the seller RTO
 * dashboard's Product Performance table.
 */
export async function getSellerProductRtoPerformance(sellerId: string) {
  const { thisMonth, lastMonth } = getThisAndLastMonth();
  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

  const aggregateByProduct = async (range: PeriodRange) => {
    return RTOEvent.aggregate([
      { $match: { seller: sellerObjectId, createdAt: { $gte: range.start, $lte: range.end } } },
      { $unwind: "$orderItems" },
      {
        $lookup: {
          from: "orderitems",
          localField: "orderItems",
          foreignField: "_id",
          as: "item",
        },
      },
      { $unwind: "$item" },
      {
        $group: {
          _id: "$item.product",
          productName: { $first: "$item.productName" },
          rtoCount: { $sum: 1 },
        },
      },
    ]);
  };

  const [thisMonthRows, lastMonthRows] = await Promise.all([
    aggregateByProduct(thisMonth),
    aggregateByProduct(lastMonth),
  ]);

  const lastMonthMap = new Map<string, number>();
  lastMonthRows.forEach((row: any) => lastMonthMap.set(row._id.toString(), row.rtoCount));

  return thisMonthRows
    .map((row: any) => {
      const productId = row._id.toString();
      const rtoCountThisMonth = row.rtoCount;
      const rtoCountLastMonth = lastMonthMap.get(productId) || 0;
      const trendPercent =
        rtoCountLastMonth > 0
          ? Number((((rtoCountThisMonth - rtoCountLastMonth) / rtoCountLastMonth) * 100).toFixed(1))
          : rtoCountThisMonth > 0
            ? 100
            : 0;
      return {
        productId,
        productName: row.productName,
        rtoCountThisMonth,
        rtoCountLastMonth,
        trendPercent,
      };
    })
    .sort((a, b) => b.rtoCountThisMonth - a.rtoCountThisMonth);
}

/**
 * Combined payload for the seller RTO dashboard — one round trip.
 */
export async function getSellerRtoDashboard(sellerId: string) {
  const [rates, avgReverseShippingCost, productPerformance] = await Promise.all([
    getSellerRtoAndReturnRates(sellerId),
    getSellerAverageReverseShippingCost(sellerId),
    getSellerProductRtoPerformance(sellerId),
  ]);

  return {
    ...rates,
    avgReverseShippingCost,
    productPerformance,
  };
}
