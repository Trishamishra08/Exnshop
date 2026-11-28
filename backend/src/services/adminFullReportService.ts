import Campaign from "../models/Campaign";
import CampaignDailyStat from "../models/CampaignDailyStat";
import Commission from "../models/Commission";
import Refund from "../models/Refund";
import Seller from "../models/Seller";
import WithdrawRequest from "../models/WithdrawRequest";
import { collectAdminEarnings, type EarningType } from "./adminEarningsLedgerService";
import { buildTcsReport } from "./gstTcsReportService";
import { getReportsOverview } from "./reportsOverviewService";
import { istDate, type ReportPeriod } from "./reportPeriodService";
import { buildXlsx, type Sheet } from "../utils/xlsx";

/**
 * Exnshop's own report for a period: everything the platform earned and from where
 * (platform fees, seller commission, delivery charges, ad campaigns), what it paid out
 * (rider payouts, refunds, seller bank payouts), courier charges passed through to
 * sellers, GST, and the seller-wise and campaign-wise breakdowns.
 *
 * Earnings use the same events as the Admin earnings ledger, so the totals agree with it.
 */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const IST_MS = 5.5 * 60 * 60 * 1000;
const GST_ON_FEES = 18;
const SOURCES: EarningType[] = ["Platform fee", "Seller commission", "Commission reversed", "Delivery charge", "Rider payout", "Ad click"];

export interface AdminFullReport {
  period: { label: string; from: string; to: string };
  summary: {
    orders: number;
    salesValue: number;
    taxableSales: number;
    gstOnSales: number;
    platformFees: number;
    commission: number;
    commissionReversed: number;
    deliveryCharges: number;
    riderPayouts: number;
    adRevenue: number;
    netEarnings: number;
    gstOnFees: number;
    courierChargedToSellers: number;
    refundsToCustomers: number;
    sellerBankPayouts: number;
    returns: number;
    exchanges: number;
  };
  bySource: Array<{ source: string; amount: number; entries: number }>;
  byMonth: Array<{ month: string } & Record<string, number | string>>;
  ledger: Array<{ date: string; orderNumber: string; type: string; amount: number; remark: string }>;
  sellers: Array<{ sellerId: string; sellerName: string; sales: number; gst: number; commission: number; courier: number; adSpend: number; settlement: number; balance: number }>;
  campaigns: Array<{ campaign: string; seller: string; status: string; clicks: number; impressions: number; spend: number }>;
  gstByRate: Array<{ rate: number; taxable: number; gst: number }>;
  gstTcs: { salesTaxable: number; salesTax: number; returnTaxable: number; returnTax: number; netTaxable: number; netTax: number };
}

export const buildAdminFullReport = async (period: ReportPeriod): Promise<AdminFullReport> => {
  const { from, to } = period;
  const [overview, allEarnings, refunds, payouts, tcs] = await Promise.all([
    getReportsOverview(from, to),
    collectAdminEarnings(),
    Refund.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: ["Completed", "Processed", "Approved"] } } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
    WithdrawRequest.aggregate([
      { $match: { userType: "SELLER", status: "Completed", processedAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
    buildTcsReport(period),
  ]);

  // Earnings by source and by month.
  const rows = allEarnings.filter((r) => {
    const t = new Date(r.date).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });
  const bySourceMap = new Map<string, { amount: number; entries: number }>(SOURCES.map((s) => [s, { amount: 0, entries: 0 }]));
  const monthMap = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const s = bySourceMap.get(r.type) || { amount: 0, entries: 0 };
    s.amount += r.amount;
    s.entries += 1;
    bySourceMap.set(r.type, s);
    const month = istDate(r.date).slice(0, 7);
    const m = monthMap.get(month) || {};
    m[r.type] = (m[r.type] || 0) + r.amount;
    monthMap.set(month, m);
  }
  const amt = (t: EarningType) => r2(bySourceMap.get(t)?.amount || 0);
  const platformFees = amt("Platform fee");
  const commission = amt("Seller commission");
  const commissionReversed = -amt("Commission reversed");
  const deliveryCharges = amt("Delivery charge");
  const riderPayouts = -amt("Rider payout");
  const adRevenue = amt("Ad click");
  const netEarnings = r2(platformFees + commission - commissionReversed + deliveryCharges - riderPayouts + adRevenue);

  // Courier charges billed to sellers on orders of the period (Exnshop pays Shiprocket the same).
  const [courier] = await Commission.aggregate([
    { $match: { type: "SELLER", status: { $ne: "Cancelled" }, createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: null, amount: { $sum: { $ifNull: ["$shippingCharge", 0] } } } },
  ]);

  // Campaign-wise ad revenue (India dates).
  const stats: any[] = await CampaignDailyStat.aggregate([
    { $match: { day: { $gte: istDate(from), $lte: istDate(to) } } },
    { $group: { _id: "$campaign", clicks: { $sum: "$clicks" }, impressions: { $sum: "$impressions" }, spend: { $sum: "$spend" } } },
  ]);
  const camps: any[] = await Campaign.find({ _id: { $in: stats.map((s) => s._id) } }).select("name status seller").lean();
  const campSellers: any[] = await Seller.find({ _id: { $in: camps.map((c) => c.seller) } }).select("storeName sellerName").lean();
  const campBy = new Map(camps.map((c) => [String(c._id), c]));
  const sellerNameBy = new Map(campSellers.map((s) => [String(s._id), s.storeName || s.sellerName || "Seller"]));
  const campaigns = stats
    .map((s) => {
      const c: any = campBy.get(String(s._id)) || {};
      return { campaign: c.name || "Campaign", seller: sellerNameBy.get(String(c.seller)) || "—", status: c.status || "", clicks: s.clicks || 0, impressions: s.impressions || 0, spend: r2(s.spend) };
    })
    .filter((c) => c.clicks || c.impressions || c.spend)
    .sort((a, b) => b.spend - a.spend);
  const adBySeller = new Map<string, number>();
  for (const c of campaigns) adBySeller.set(c.seller, (adBySeller.get(c.seller) || 0) + c.spend);

  return {
    period: { label: period.label, from: istDate(from), to: istDate(to) },
    summary: {
      orders: overview.cards.totalOrders.value,
      salesValue: overview.sales.salesValue,
      taxableSales: overview.sales.taxable,
      gstOnSales: overview.sales.gst,
      platformFees,
      commission,
      commissionReversed,
      deliveryCharges,
      riderPayouts,
      adRevenue,
      netEarnings,
      gstOnFees: r2(((platformFees + commission - commissionReversed + adRevenue) * GST_ON_FEES) / (100 + GST_ON_FEES)),
      courierChargedToSellers: r2(courier?.amount || 0),
      refundsToCustomers: r2(refunds[0]?.amount || 0),
      sellerBankPayouts: r2(payouts[0]?.amount || 0),
      returns: overview.cards.totalReturns.value,
      exchanges: overview.cards.totalExchanges.value,
    },
    bySource: [...bySourceMap.entries()].map(([source, v]) => ({ source, amount: r2(v.amount), entries: v.entries })),
    byMonth: [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => {
        const out: any = { month };
        let total = 0;
        for (const s of SOURCES) {
          out[s] = r2(v[s] || 0);
          total += v[s] || 0;
        }
        out.Total = r2(total);
        return out;
      }),
    ledger: rows
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((r) => ({
        date: new Date(new Date(r.date).getTime() + IST_MS).toISOString().slice(0, 16).replace("T", " "),
        orderNumber: r.orderNumber,
        type: r.type,
        amount: r2(r.amount),
        remark: r.remark,
      })),
    sellers: overview.sellerLedger.map((s: any) => ({
      sellerId: s.sellerId,
      sellerName: s.sellerName,
      sales: s.totalSales,
      gst: s.gst,
      commission: s.commission,
      courier: r2(s.totalSales - s.gst - s.commission - s.settlement),
      adSpend: r2(adBySeller.get(s.sellerName) || 0),
      settlement: s.settlement,
      balance: s.balance,
    })),
    campaigns,
    gstByRate: overview.gstReconciliation.byRate.map((g: any) => ({ rate: g.rate, taxable: g.taxable, gst: g.gst })),
    gstTcs: {
      salesTaxable: tcs.totals.salesTaxable,
      salesTax: tcs.totals.salesTax,
      returnTaxable: tcs.totals.returnTaxable,
      returnTax: tcs.totals.returnTax,
      netTaxable: tcs.totals.netTaxable,
      netTax: tcs.totals.netTax,
    },
  };
};

export const adminFullReportSheets = (rep: AdminFullReport): Sheet[] => {
  const s = rep.summary;
  return [
    {
      name: "Summary",
      widths: [50, 20],
      rows: [
        ["Exnshop platform report", ""],
        ["Period", `${rep.period.label} (${rep.period.from} to ${rep.period.to})`],
        [],
        ["Orders", s.orders],
        ["Sales value incl. GST (₹)", s.salesValue],
        ["Taxable sales (₹)", s.taxableSales],
        ["GST on sales — sellers' liability (₹)", s.gstOnSales],
        ["Returns / exchanges requested", `${s.returns} / ${s.exchanges}`],
        [],
        ["EXNSHOP EARNINGS", ""],
        ["Platform fees (paid by customers) (₹)", s.platformFees],
        ["Seller commission (₹)", s.commission],
        ["Commission given back on returns / cancellations (₹)", -s.commissionReversed],
        ["Delivery charges (paid by customers) (₹)", s.deliveryCharges],
        ["Rider payouts (₹)", -s.riderPayouts],
        ["Ad campaign clicks (₹)", s.adRevenue],
        ["NET EARNINGS (₹)", s.netEarnings],
        ["   GST included at 18% on fees, commission and ads (indicative) (₹)", s.gstOnFees],
        [],
        ["MONEY PASSED THROUGH", ""],
        ["Courier charges billed to sellers (paid to Shiprocket) (₹)", s.courierChargedToSellers],
        ["Refunds to customers (₹)", s.refundsToCustomers],
        ["Payouts to sellers' banks (₹)", s.sellerBankPayouts],
        [],
        ["GST / TCS (all sellers)", ""],
        ["Taxable value dispatched (₹)", rep.gstTcs.salesTaxable],
        ["Tax on it (₹)", rep.gstTcs.salesTax],
        ["Taxable value cancelled / returned (₹)", -rep.gstTcs.returnTaxable],
        ["Tax on it (₹)", -rep.gstTcs.returnTax],
        ["Net taxable value (₹)", rep.gstTcs.netTaxable],
        ["Net tax (₹)", rep.gstTcs.netTax],
      ],
    },
    {
      name: "Earnings by source",
      widths: [26, 16, 10],
      rows: [["Source", "Amount (₹)", "Entries"], ...rep.bySource.map((b) => [b.source, b.amount, b.entries]), ["Net earnings", s.netEarnings, null]],
    },
    {
      name: "Earnings by month",
      widths: [10, 14, 18, 20, 16, 14, 12, 14],
      rows: [["Month", ...SOURCES, "Total"], ...rep.byMonth.map((m) => [m.month, ...SOURCES.map((k) => m[k] as number), m.Total as number])],
    },
    {
      name: "Earnings ledger",
      widths: [17, 22, 20, 12, 70],
      rows: [["Date (IST)", "Order", "Type", "Amount (₹)", "Remark"], ...rep.ledger.map((l) => [l.date, l.orderNumber, l.type, l.amount, l.remark])],
    },
    {
      name: "Seller-wise",
      widths: [30, 14, 12, 14, 12, 12, 16, 16],
      rows: [
        ["Seller", "Sales (₹)", "GST (₹)", "Commission (₹)", "Courier (₹)", "Ad spend (₹)", "Seller earning (₹)", "Wallet now (₹)"],
        ...rep.sellers.map((x) => [x.sellerName, x.sales, x.gst, x.commission, x.courier, x.adSpend, x.settlement, x.balance]),
      ],
    },
    {
      name: "Campaign-wise",
      widths: [32, 28, 12, 10, 13, 12],
      rows: [["Campaign", "Seller", "Status", "Clicks", "Impressions", "Spend (₹)"], ...rep.campaigns.map((c) => [c.campaign, c.seller, c.status, c.clicks, c.impressions, c.spend])],
    },
    {
      name: "GST by rate",
      widths: [10, 16, 14],
      rows: [["GST rate %", "Taxable (₹)", "GST (₹)"], ...rep.gstByRate.map((g) => [g.rate, g.taxable, g.gst])],
    },
  ];
};

export const buildAdminFullXlsx = async (period: ReportPeriod) => {
  const report = await buildAdminFullReport(period);
  return { report, fileName: `exnshop_platform_report_${period.fileTag}.xlsx`, buffer: buildXlsx(adminFullReportSheets(report)) };
};
