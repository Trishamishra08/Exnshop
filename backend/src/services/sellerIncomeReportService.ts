import mongoose from "mongoose";
import Campaign from "../models/Campaign";
import CampaignDailyStat from "../models/CampaignDailyStat";
import Commission from "../models/Commission";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Seller from "../models/Seller";
import WalletTransaction from "../models/WalletTransaction";
import WithdrawRequest from "../models/WithdrawRequest";
import { buildTcsReport, sellerCode } from "./gstTcsReportService";
import { istDate, type ReportPeriod } from "./reportPeriodService";
import { buildXlsx, type Sheet } from "../utils/xlsx";

/**
 * A seller's income statement for a period: what they sold, what Exnshop took (commission,
 * courier, ads, other charges), what they earned, and what was paid to their bank.
 *
 * Orders count by the date they were placed. Earnings come from the per-item earning
 * records (item price − commission − courier charge); charges that are not tied to one
 * order item (ad clicks, return pickups, RTO, penalties …) come from the wallet.
 */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const IST_MS = 5.5 * 60 * 60 * 1000;
const UNDONE = new Set(["Cancelled", "Returned", "RTO"]);

/** Wallet entries that are charges or credits on top of order earnings. */
const WALLET_LABEL: Record<string, string> = {
  AD_SPEND: "Ad campaign clicks",
  RETURN_SHIPPING_DEBIT: "Return pickup courier charges",
  RTO_REVERSE_SHIPPING_DEBIT: "RTO (return to origin) courier charges",
  PLATFORM_FEE_DEBIT: "Commission + platform fee (orders you shipped yourself)",
  SHIPPING_CHARGE_DEBIT: "Courier charges (wallet)",
  SHIPPING_CHARGE_REFUND: "Courier charge refunds",
  DELIVERY_CANCEL_PENALTY: "Penalties",
  PENALTY_REFUND: "Penalty refunds",
  CHARGEBACK_DEBIT: "Chargebacks",
  COD_RETURN_REFUND: "Refunds to customers (COD returns)",
  ORDER_CANCELLATION_REFUND: "Refunds to customers (cancellations)",
  MANUAL_ADMIN_CREDIT: "Credits by Exnshop",
  MANUAL_ADMIN_DEBIT: "Debits by Exnshop",
};
/** Money moves that are not income or charges (shown in the wallet sheet only). */
const NOT_INCOME = new Set(["WALLET_TOPUP", "BALANCE_FREEZE", "BALANCE_RELEASE", "ORDER_PAYMENT"]);

export interface SellerIncomeReport {
  seller: { id: string; code: string; name: string; storeName: string; email: string; mobile: string; gstin: string };
  period: { label: string; from: string; to: string };
  summary: {
    orders: number;
    itemsSold: number;
    grossSales: number; // taxable + GST of items not cancelled / returned
    taxableSales: number;
    gstCollected: number;
    cancelledValue: number;
    returnedValue: number;
    commission: number;
    courierCharges: number;
    orderEarnings: number; // item price − commission − courier, on items not cancelled / returned
    pendingEarnings: number; // part of orderEarnings not yet in the wallet
    walletCharges: number; // ad clicks, return/RTO pickups, penalties … (positive number)
    walletCredits: number; // credits on top of earnings
    adSpend: number;
    netIncome: number; // orderEarnings − walletCharges + walletCredits
    paidToBank: number;
    walletBalance: number;
    onHoldBalance: number;
    gstNetTaxable: number;
    gstNetTax: number;
  };
  chargeBreakdown: Array<{ label: string; debit: number; credit: number }>;
  orders: Array<{
    date: string; orderNumber: string; channel: string; paymentMethod: string; product: string; sku: string; qty: number;
    taxable: number; gst: number; invoiceValue: number; commission: number; courier: number; earning: number; itemStatus: string; settlement: string;
  }>;
  wallet: Array<{ date: string; type: string; category: string; amount: number; description: string; balanceAfter: number | null }>;
  withdrawals: Array<{ requestedOn: string; paidOn: string; amount: number; method: string; status: string; reference: string }>;
  campaigns: Array<{ name: string; status: string; clicks: number; impressions: number; spend: number }>;
}

export const buildSellerIncomeReport = async (sellerId: string, period: ReportPeriod): Promise<SellerIncomeReport> => {
  const sid = new mongoose.Types.ObjectId(sellerId);
  const range = { $gte: period.from, $lte: period.to };
  const seller: any = await Seller.findById(sid).select("sellerName storeName email mobile gstin balance onHoldBalance").lean();
  if (!seller) throw new Error("Seller not found");

  const [orders, wallet, withdrawals, campaigns, tcs] = await Promise.all([
    Order.find({ _id: { $in: await OrderItem.distinct("order", { seller: sid, createdAt: range }) } })
      .select("orderNumber orderDate createdAt channel paymentMethod status")
      .lean(),
    WalletTransaction.find({ userId: sid, userType: "SELLER", status: "Completed", createdAt: range }).sort({ createdAt: 1 }).lean(),
    WithdrawRequest.find({ userId: sid, userType: "SELLER", $or: [{ createdAt: range }, { processedAt: range }] }).sort({ createdAt: 1 }).lean(),
    Campaign.find({ seller: sid }).select("name status").lean(),
    buildTcsReport(period, [sellerId]),
  ]);

  const orderBy = new Map(orders.map((o: any) => [String(o._id), o]));
  const items: any[] = await OrderItem.find({ seller: sid, order: { $in: orders.map((o: any) => o._id) } })
    .select("order productName variantTitle sku quantity total gstAmount status shippingCharge createdAt")
    .lean();
  const comms: any[] = await Commission.find({ seller: sid, type: "SELLER", orderItem: { $in: items.map((i) => i._id) } })
    .select("orderItem commissionAmount shippingCharge status")
    .lean();
  const commBy = new Map(comms.map((c) => [String(c.orderItem), c]));

  let itemsSold = 0, taxable = 0, gst = 0, cancelledValue = 0, returnedValue = 0, commission = 0, courier = 0, earnings = 0, pending = 0;
  const orderRows: SellerIncomeReport["orders"] = [];
  for (const it of items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) {
    const o: any = orderBy.get(String(it.order)) || {};
    const c: any = commBy.get(String(it._id));
    const value = (Number(it.total) || 0) + (Number(it.gstAmount) || 0);
    const undone = UNDONE.has(it.status) || ["Cancelled", "Rejected"].includes(o.status) || c?.status === "Cancelled";
    const itemCommission = undone ? 0 : Number(c?.commissionAmount) || 0;
    const itemCourier = undone ? 0 : Number(c?.shippingCharge ?? it.shippingCharge) || 0;
    const earning = undone ? 0 : (Number(it.total) || 0) - itemCommission - itemCourier;
    if (undone) {
      if (it.status === "Cancelled" || ["Cancelled", "Rejected"].includes(o.status)) cancelledValue += value;
      else returnedValue += value;
    } else {
      itemsSold += Number(it.quantity) || 0;
      taxable += Number(it.total) || 0;
      gst += Number(it.gstAmount) || 0;
      commission += itemCommission;
      courier += itemCourier;
      earnings += earning;
      if (!c || c.status !== "Paid") pending += earning;
    }
    const settlement = undone
      ? "Cancelled"
      : !c
        ? "Pending (not delivered)"
        : c.status === "OnHold"
          ? "On hold (return window)"
          : c.status === "Paid"
            ? "Settled to wallet"
            : c.status;
    orderRows.push({
      date: istDate(o.orderDate || o.createdAt),
      orderNumber: o.orderNumber || "",
      channel: o.channel === "ECommerce" ? "E-commerce" : "Quick",
      paymentMethod: String(o.paymentMethod || "").toUpperCase() === "COD" ? "COD" : o.paymentMethod ? "Online" : "",
      product: it.variantTitle ? `${it.productName} (${it.variantTitle})` : it.productName,
      sku: it.sku || "",
      qty: Number(it.quantity) || 0,
      taxable: r2(it.total),
      gst: r2(it.gstAmount),
      invoiceValue: r2(value),
      commission: r2(itemCommission),
      courier: r2(itemCourier),
      earning: r2(earning),
      itemStatus: it.status,
      settlement,
    });
  }

  // Wallet: charges and credits outside order earnings.
  const breakdown = new Map<string, { debit: number; credit: number }>();
  let walletCharges = 0, walletCredits = 0, adSpend = 0;
  for (const w of wallet as any[]) {
    const cat = w.category || "";
    if (!cat || NOT_INCOME.has(cat)) continue; // order earning credits (already counted) and transfers
    const label = WALLET_LABEL[cat] || cat;
    const b = breakdown.get(label) || { debit: 0, credit: 0 };
    if (w.type === "Debit") {
      b.debit += w.amount;
      walletCharges += w.amount;
      if (cat === "AD_SPEND") adSpend += w.amount;
    } else {
      b.credit += w.amount;
      walletCredits += w.amount;
    }
    breakdown.set(label, b);
  }

  // Ads: clicks / impressions / spend per campaign in the period (India dates).
  const fromDay = istDate(period.from);
  const toDay = istDate(period.to);
  const stats: any[] = campaigns.length
    ? await CampaignDailyStat.aggregate([
        { $match: { campaign: { $in: campaigns.map((c: any) => c._id) }, day: { $gte: fromDay, $lte: toDay } } },
        { $group: { _id: "$campaign", clicks: { $sum: "$clicks" }, impressions: { $sum: "$impressions" }, spend: { $sum: "$spend" } } },
      ])
    : [];
  const statBy = new Map(stats.map((s) => [String(s._id), s]));
  const campaignRows = (campaigns as any[])
    .map((c) => {
      const s = statBy.get(String(c._id)) || {};
      return { name: c.name || "Campaign", status: c.status, clicks: s.clicks || 0, impressions: s.impressions || 0, spend: r2(s.spend || 0) };
    })
    .filter((c) => c.clicks || c.impressions || c.spend)
    .sort((a, b) => b.spend - a.spend);

  const paidToBank = (withdrawals as any[])
    .filter((w) => w.status === "Completed" && w.processedAt && w.processedAt >= period.from && w.processedAt <= period.to)
    .reduce((t, w) => t + (w.amount || 0), 0);

  const orderEarnings = r2(earnings);
  return {
    seller: {
      id: sellerId,
      code: sellerCode(sellerId),
      name: seller.sellerName || "",
      storeName: seller.storeName || "",
      email: seller.email || "",
      mobile: seller.mobile || "",
      gstin: seller.gstin || "",
    },
    period: { label: period.label, from: istDate(period.from), to: istDate(period.to) },
    summary: {
      orders: orders.length,
      itemsSold,
      grossSales: r2(taxable + gst),
      taxableSales: r2(taxable),
      gstCollected: r2(gst),
      cancelledValue: r2(cancelledValue),
      returnedValue: r2(returnedValue),
      commission: r2(commission),
      courierCharges: r2(courier),
      orderEarnings,
      pendingEarnings: r2(pending),
      walletCharges: r2(walletCharges),
      walletCredits: r2(walletCredits),
      adSpend: r2(adSpend),
      netIncome: r2(orderEarnings - walletCharges + walletCredits),
      paidToBank: r2(paidToBank),
      walletBalance: r2(seller.balance),
      onHoldBalance: r2(seller.onHoldBalance),
      gstNetTaxable: tcs.totals.netTaxable,
      gstNetTax: tcs.totals.netTax,
    },
    chargeBreakdown: [...breakdown.entries()].map(([label, v]) => ({ label, debit: r2(v.debit), credit: r2(v.credit) })),
    orders: orderRows,
    wallet: (wallet as any[]).map((w) => ({
      date: new Date(new Date(w.createdAt).getTime() + IST_MS).toISOString().slice(0, 16).replace("T", " "),
      type: w.type,
      category: WALLET_LABEL[w.category] || w.category || "Order earning",
      amount: r2(w.amount),
      description: w.description || "",
      balanceAfter: typeof w.balanceAfter === "number" ? r2(w.balanceAfter) : null,
    })),
    withdrawals: (withdrawals as any[]).map((w) => ({
      requestedOn: istDate(w.createdAt),
      paidOn: istDate(w.processedAt),
      amount: r2(w.amount),
      method: w.paymentMethod || "",
      status: w.status,
      reference: w.transactionReference || "",
    })),
    campaigns: campaignRows,
  };
};

export const sellerIncomeSheets = (rep: SellerIncomeReport): Sheet[] => {
  const s = rep.summary;
  return [
    {
      name: "Summary",
      widths: [46, 22],
      rows: [
        ["Exnshop seller income report", ""],
        ["Seller", `${rep.seller.storeName} (${rep.seller.name})`],
        ["Seller code", rep.seller.code],
        ["GSTIN", rep.seller.gstin || "—"],
        ["Period", `${rep.period.label} (${rep.period.from} to ${rep.period.to})`],
        [],
        ["Orders placed", s.orders],
        ["Items sold (not cancelled / returned)", s.itemsSold],
        ["Gross sales incl. GST (₹)", s.grossSales],
        ["Taxable sales (₹)", s.taxableSales],
        ["GST collected (₹)", s.gstCollected],
        ["Cancelled order value (₹)", s.cancelledValue],
        ["Returned / RTO value (₹)", s.returnedValue],
        [],
        ["Commission to Exnshop (₹)", -s.commission],
        ["Courier charges (₹)", -s.courierCharges],
        ["Earnings from orders (₹)", s.orderEarnings],
        ["   of which not in wallet yet (₹)", s.pendingEarnings],
        ["Other charges from wallet (₹)", -s.walletCharges],
        ["   of which ad campaign clicks (₹)", -s.adSpend],
        ["Other credits to wallet (₹)", s.walletCredits],
        ["NET INCOME FOR THE PERIOD (₹)", s.netIncome],
        [],
        ["Paid to your bank in the period (₹)", s.paidToBank],
        ["Wallet balance now (₹)", s.walletBalance],
        ["On hold now (return window) (₹)", s.onHoldBalance],
        [],
        ["GST: net taxable value (sales − returns) (₹)", s.gstNetTaxable],
        ["GST: net tax (₹)", s.gstNetTax],
      ],
    },
    {
      name: "Charges & credits",
      widths: [52, 14, 14],
      rows: [["Wallet entry", "Debit (₹)", "Credit (₹)"], ...rep.chargeBreakdown.map((c) => [c.label, c.debit || null, c.credit || null])],
    },
    {
      name: "Orders",
      widths: [12, 22, 12, 9, 36, 16, 6, 12, 10, 12, 12, 11, 12, 12, 24],
      rows: [
        ["Order date", "Order number", "Channel", "Payment", "Product", "SKU", "Qty", "Taxable (₹)", "GST (₹)", "Invoice value (₹)", "Commission (₹)", "Courier (₹)", "Earning (₹)", "Item status", "Settlement"],
        ...rep.orders.map((o) => [o.date, o.orderNumber, o.channel, o.paymentMethod, o.product, o.sku, o.qty, o.taxable, o.gst, o.invoiceValue, o.commission, o.courier, o.earning, o.itemStatus, o.settlement]),
      ],
    },
    {
      name: "Wallet",
      widths: [17, 8, 40, 12, 60, 16],
      rows: [["Date (IST)", "Type", "Category", "Amount (₹)", "Description", "Balance after (₹)"], ...rep.wallet.map((w) => [w.date, w.type, w.category, w.amount, w.description, w.balanceAfter])],
    },
    {
      name: "Bank payouts",
      widths: [13, 13, 12, 14, 12, 24],
      rows: [["Requested on", "Paid on", "Amount (₹)", "Method", "Status", "Bank reference"], ...rep.withdrawals.map((w) => [w.requestedOn, w.paidOn, w.amount, w.method, w.status, w.reference])],
    },
    {
      name: "Ad campaigns",
      widths: [34, 12, 10, 13, 12],
      rows: [["Campaign", "Status", "Clicks", "Impressions", "Spend (₹)"], ...rep.campaigns.map((c) => [c.name, c.status, c.clicks, c.impressions, c.spend])],
    },
  ];
};

export const buildSellerIncomeXlsx = async (sellerId: string, period: ReportPeriod) => {
  const report = await buildSellerIncomeReport(sellerId, period);
  return {
    report,
    fileName: `income_${report.seller.code}_${period.fileTag}.xlsx`,
    buffer: buildXlsx(sellerIncomeSheets(report)),
  };
};
