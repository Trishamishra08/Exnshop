import mongoose from "mongoose";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Commission from "../models/Commission";
import Return from "../models/Return";
import Refund from "../models/Refund";
import Seller from "../models/Seller";

/**
 * Admin "Reports" overview for a date range: KPI cards (with change vs the previous
 * period of the same length), sales trend, seller ledger, customer ledger, monthly
 * commission ledger and GST reconciliation.
 *
 * Sales = items of orders that went through (not cancelled/rejected, and online orders
 * only once paid), excluding items that were cancelled, returned or came back (RTO).
 * An item's `total` is its taxable value; `gstAmount` is added on top.
 */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const IST_MS = 5.5 * 60 * 60 * 1000;
const istDay = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const GST_ON_COMMISSION = 18;

/** Orders whose items count as sales. */
const validOrderMatch = {
  status: { $nin: ["Cancelled", "Rejected"] },
  $or: [{ paymentMethod: { $nin: ["Online", "razorpay"] } }, { paymentStatus: { $in: ["Paid", "Refunded"] } }],
};
const soldItem = { status: { $nin: ["Cancelled", "Returned", "RTO"] }, sellerStatus: { $ne: "Rejected" } };

const salesItemsPipeline = (from: Date, to: Date): any[] => [
  { $match: { createdAt: { $gte: from, $lte: to }, ...soldItem } },
  { $lookup: { from: "orders", localField: "order", foreignField: "_id", as: "o", pipeline: [{ $project: { status: 1, paymentMethod: 1, paymentStatus: 1, customer: 1, customerName: 1, tax: 1 } }] } },
  { $unwind: "$o" },
  { $match: { "o.status": validOrderMatch.status, $or: [{ "o.paymentMethod": { $nin: ["Online", "razorpay"] } }, { "o.paymentStatus": { $in: ["Paid", "Refunded"] } }] } },
];

const kpis = async (from: Date, to: Date) => {
  const [s] = await OrderItem.aggregate([
    ...salesItemsPipeline(from, to),
    { $group: { _id: null, orders: { $addToSet: "$order" }, taxable: { $sum: "$total" }, gst: { $sum: { $ifNull: ["$gstAmount", 0] } } } },
  ]);
  const [returns, exchanges] = await Promise.all([
    Return.countDocuments({ createdAt: { $gte: from, $lte: to }, requestType: { $ne: "EXCHANGE" }, status: { $ne: "Rejected" } }),
    Return.countDocuments({ createdAt: { $gte: from, $lte: to }, requestType: "EXCHANGE", status: { $ne: "Rejected" } }),
  ]);
  const taxable = r2(s?.taxable || 0);
  const gst = r2(s?.gst || 0);
  return { orders: s?.orders?.length || 0, salesValue: r2(taxable + gst), taxable, gst, returns, exchanges };
};

const change = (now: number, before: number) => (before > 0 ? r2(((now - before) / before) * 100) : now > 0 ? 100 : 0);

export const getReportsOverview = async (from: Date, to: Date) => {
  const span = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - span);

  const [now, before] = await Promise.all([kpis(from, to), kpis(prevFrom, prevTo)]);
  const cards = {
    totalOrders: { value: now.orders, change: change(now.orders, before.orders) },
    totalSales: { value: now.salesValue, change: change(now.salesValue, before.salesValue) },
    totalGst: { value: now.gst, change: change(now.gst, before.gst) },
    totalReturns: { value: now.returns, change: change(now.returns, before.returns) },
    totalExchanges: { value: now.exchanges, change: change(now.exchanges, before.exchanges) },
  };

  // 1. Sales trend, day by day (India dates).
  const items: any[] = await OrderItem.aggregate([
    ...salesItemsPipeline(from, to),
    { $project: { createdAt: 1, total: 1, gstAmount: { $ifNull: ["$gstAmount", 0] }, gstRate: { $ifNull: ["$gstRate", 0] }, seller: 1, order: 1, customer: "$o.customer", customerName: "$o.customerName", orderTax: { $ifNull: ["$o.tax", 0] } } },
  ]);
  const byDay = new Map<string, { taxable: number; gst: number }>();
  for (let t = from.getTime(); t <= to.getTime(); t += 24 * 60 * 60 * 1000) byDay.set(istDay(new Date(t)), { taxable: 0, gst: 0 });
  for (const it of items) {
    const d = byDay.get(istDay(new Date(it.createdAt))) || { taxable: 0, gst: 0 };
    d.taxable += it.total || 0;
    d.gst += it.gstAmount || 0;
    byDay.set(istDay(new Date(it.createdAt)), d);
  }
  const salesTrend = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, salesValue: r2(v.taxable + v.gst), gst: r2(v.gst) }));
  const sales = { salesValue: now.salesValue, gst: now.gst, taxable: now.taxable, salesChange: cards.totalSales.change, gstChange: cards.totalGst.change };

  // 2. Seller ledger.
  const sellerAgg = new Map<string, { taxable: number; gst: number }>();
  for (const it of items) {
    const k = String(it.seller);
    const a = sellerAgg.get(k) || { taxable: 0, gst: 0 };
    a.taxable += it.total || 0;
    a.gst += it.gstAmount || 0;
    sellerAgg.set(k, a);
  }
  const orderIds = [...new Set(items.map((i) => String(i.order)))].map((id) => new mongoose.Types.ObjectId(id));
  const comms: any[] = await Commission.find({ order: { $in: orderIds }, type: "SELLER", status: { $ne: "Cancelled" } })
    .select("seller commissionAmount shippingCharge")
    .lean();
  const commBySeller = new Map<string, { commission: number; shipping: number }>();
  for (const c of comms) {
    const k = String(c.seller);
    const a = commBySeller.get(k) || { commission: 0, shipping: 0 };
    a.commission += c.commissionAmount || 0;
    a.shipping += c.shippingCharge || 0;
    commBySeller.set(k, a);
  }
  const sellers: any[] = await Seller.find({ _id: { $in: [...sellerAgg.keys()] } }).select("storeName sellerName balance onHoldBalance").lean();
  const sellerName = new Map(sellers.map((s) => [String(s._id), s]));
  const sellerLedger = [...sellerAgg.entries()]
    .map(([id, a]) => {
      const c = commBySeller.get(id) || { commission: 0, shipping: 0 };
      const s: any = sellerName.get(id) || {};
      return {
        sellerId: id,
        sellerName: s.storeName || s.sellerName || "Seller",
        totalSales: r2(a.taxable + a.gst),
        commission: r2(c.commission),
        gst: r2(a.gst),
        // What the seller earns from these sales: taxable value − commission − courier charge.
        settlement: r2(a.taxable - c.commission - c.shipping),
        // Wallet now (available + on hold), not limited to the period.
        balance: r2((s.balance || 0) + (s.onHoldBalance || 0)),
      };
    })
    .sort((x, y) => y.totalSales - x.totalSales);

  // 3. Customer ledger.
  const custAgg = new Map<string, { name: string; orders: Set<string>; value: number }>();
  for (const it of items) {
    const k = String(it.customer || "guest");
    const a = custAgg.get(k) || { name: it.customerName || "Customer", orders: new Set<string>(), value: 0 };
    a.orders.add(String(it.order));
    a.value += (it.total || 0) + (it.gstAmount || 0);
    custAgg.set(k, a);
  }
  const refunds: any[] = await Refund.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ["Completed", "Processed", "Approved"] } } },
    { $group: { _id: "$customer", amount: { $sum: "$amount" } } },
  ]);
  const refundBy = new Map(refunds.map((r) => [String(r._id), r.amount || 0]));
  const customerLedger = [...custAgg.entries()]
    .map(([id, a]) => {
      const refund = r2(refundBy.get(id) || 0);
      const value = r2(a.value);
      return { customerId: id, customerName: a.name, totalOrders: a.orders.size, purchaseValue: value, refund, netAmount: r2(value - refund) };
    })
    .sort((x, y) => y.purchaseValue - x.purchaseValue);

  // 4. Commission ledger: last 6 months up to the end of the range.
  const months: { key: string; label: string; start: Date; end: Date }[] = [];
  const endIst = new Date(to.getTime() + IST_MS);
  for (let i = 0; i < 6; i++) {
    const y = endIst.getUTCFullYear();
    const m = endIst.getUTCMonth() - i;
    const startUtc = new Date(Date.UTC(y, m, 1) - IST_MS);
    const endUtc = new Date(Date.UTC(y, m + 1, 1) - IST_MS - 1);
    const label = new Date(Date.UTC(y, m, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
    months.push({ key: label, label, start: startUtc, end: endUtc });
  }
  const commissionLedger = await Promise.all(
    months.map(async (mo) => {
      const [s] = await OrderItem.aggregate([
        ...salesItemsPipeline(mo.start, mo.end),
        { $group: { _id: null, taxable: { $sum: "$total" }, orders: { $addToSet: "$order" } } },
      ]);
      const ids = (s?.orders || []) as mongoose.Types.ObjectId[];
      const [c] = ids.length
        ? await Commission.aggregate([
            { $match: { order: { $in: ids }, type: "SELLER", status: { $ne: "Cancelled" } } },
            { $group: { _id: null, commission: { $sum: "$commissionAmount" } } },
          ])
        : [null];
      const totalSales = r2(s?.taxable || 0);
      const commission = r2(c?.commission || 0);
      return {
        period: mo.label,
        totalSales,
        commissionPercent: totalSales > 0 ? r2((commission / totalSales) * 100) : 0,
        commission,
        gstOnCommission: r2((commission * GST_ON_COMMISSION) / 100),
      };
    }),
  );

  // 5. GST reconciliation: item-level GST against the GST on the order invoices.
  const byRate = new Map<number, { taxable: number; gst: number }>();
  for (const it of items) {
    const rate = Number(it.gstRate) || 0;
    const a = byRate.get(rate) || { taxable: 0, gst: 0 };
    a.taxable += it.total || 0;
    a.gst += it.gstAmount || 0;
    byRate.set(rate, a);
  }
  const gstTotal = now.gst;
  const gstByRate = [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, a]) => ({ rate, taxable: r2(a.taxable), gst: r2(a.gst), share: gstTotal > 0 ? r2((a.gst / gstTotal) * 100) : 0 }));
  // Check: GST charged on the order invoices = GST of all the items on those orders
  // (returned items included, since the invoice was raised for them too).
  const invoiceOrders: any[] = await Order.find({ _id: { $in: orderIds } }).select("tax").lean();
  const invoiceGst = r2(invoiceOrders.reduce((t, o) => t + (Number(o.tax) || 0), 0));
  const [allItemGst] = orderIds.length
    ? await OrderItem.aggregate([{ $match: { order: { $in: orderIds } } }, { $group: { _id: null, gst: { $sum: { $ifNull: ["$gstAmount", 0] } } } }])
    : [null];
  const itemGst = r2(allItemGst?.gst || 0);
  const difference = r2(invoiceGst - itemGst);
  const gstReconciliation = {
    totalSales: now.salesValue,
    taxable: now.taxable,
    totalGst: gstTotal,
    invoiceGst,
    itemGst,
    returnedGst: r2(itemGst - gstTotal),
    difference,
    status: Math.abs(difference) < 1 ? "Matched" : "Mismatch",
    byRate: gstByRate,
  };

  return { range: { from, to }, cards, sales, salesTrend, sellerLedger, customerLedger, commissionLedger, gstReconciliation };
};
