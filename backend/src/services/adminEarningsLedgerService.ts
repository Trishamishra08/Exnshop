import Order from "../models/Order";
import Commission from "../models/Commission";
import WalletTransaction from "../models/WalletTransaction";

/**
 * Admin earnings ledger: every rupee Exnshop earns, one row per event, with a
 * running balance. Same sources as "Total Admin Earning" on the wallet page
 * (seller commission + platform fee + delivery charge − rider payout), plus
 * sellers' ad clicks.
 */

export type EarningType = "Platform fee" | "Seller commission" | "Delivery charge" | "Rider payout" | "Ad click" | "Commission reversed";

export interface LedgerRow {
  date: Date;
  orderNumber: string;
  type: EarningType;
  amount: number; // + earned, − paid out / reversed
  remark: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const collectAdminEarnings = async (): Promise<LedgerRow[]> => {
  const rows: LedgerRow[] = [];

  // Platform fee and delivery charge: taken from the customer on paid orders.
  const orders: any[] = await Order.find({
    paymentStatus: "Paid",
    status: { $ne: "Cancelled" },
    $or: [{ platformFee: { $gt: 0 } }, { shipping: { $gt: 0 } }],
  })
    .select("orderNumber platformFee shipping paymentMethod deliveredAt createdAt")
    .lean();
  for (const o of orders) {
    // COD is collected at delivery; online payments when the order is placed.
    const date = String(o.paymentMethod).toUpperCase() === "COD" ? o.deliveredAt || o.createdAt : o.createdAt;
    if (o.platformFee > 0) {
      rows.push({ date, orderNumber: o.orderNumber, type: "Platform fee", amount: r2(o.platformFee), remark: `Platform fee paid by the customer (${o.paymentMethod})` });
    }
    if (o.shipping > 0) {
      rows.push({ date, orderNumber: o.orderNumber, type: "Delivery charge", amount: r2(o.shipping), remark: "Delivery charge paid by the customer" });
    }
  }

  // Commissions: sellers' commission is earned, riders' payout is paid out.
  const comms: any[] = await Commission.find({ commissionAmount: { $gt: 0 } })
    .select("order seller type status commissionRate commissionAmount onHoldUntil createdAt updatedAt")
    .populate("order", "orderNumber")
    .populate("seller", "storeName")
    .lean();
  for (const c of comms) {
    const orderNumber = c.order?.orderNumber || "—";
    if (c.type === "SELLER") {
      const store = c.seller?.storeName || "seller";
      const hold = c.status === "OnHold" && c.onHoldUntil ? ` · on hold till ${new Date(c.onHoldUntil).toLocaleDateString("en-GB")}` : "";
      rows.push({ date: c.createdAt, orderNumber, type: "Seller commission", amount: r2(c.commissionAmount), remark: `${c.commissionRate}% commission from ${store}${hold}` });
      if (c.status === "Cancelled") {
        rows.push({ date: c.updatedAt || c.createdAt, orderNumber, type: "Commission reversed", amount: -r2(c.commissionAmount), remark: `Order returned or cancelled: commission from ${store} given back` });
      }
    } else if (c.type === "DELIVERY_BOY" && c.status !== "Cancelled") {
      rows.push({ date: c.createdAt, orderNumber, type: "Rider payout", amount: -r2(c.commissionAmount), remark: "Delivery partner's share of the delivery charge" });
    }
  }

  // Ad clicks charged to sellers' wallets.
  const ads: any[] = await WalletTransaction.find({ category: "AD_SPEND", type: "Debit", status: "Completed" })
    .select("amount description createdAt")
    .lean();
  for (const a of ads) {
    rows.push({ date: a.createdAt, orderNumber: "—", type: "Ad click", amount: r2(a.amount), remark: a.description || "Seller ad click" });
  }

  return rows.sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
};

export const getAdminEarningsLedger = async (opts: { from?: Date; to?: Date; type?: string; page: number; limit: number }) => {
  const all = await collectAdminEarnings();

  // Opening balance = everything earned before the period starts.
  let opening = 0;
  const inRange: LedgerRow[] = [];
  for (const row of all) {
    const t = new Date(row.date).getTime();
    if (opts.from && t < opts.from.getTime()) {
      opening += row.amount;
      continue;
    }
    if (opts.to && t > opts.to.getTime()) continue;
    inRange.push(row);
  }

  // Running balance across the period (before the type filter, so balances stay true).
  let bal = opening;
  const withBalance = inRange.map((row) => {
    const openingBalance = r2(bal);
    bal += row.amount;
    return { ...row, openingBalance, closingBalance: r2(bal) };
  });
  const filtered = opts.type ? withBalance.filter((r) => r.type === opts.type) : withBalance;

  const credit = r2(filtered.filter((r) => r.amount > 0).reduce((t, r) => t + r.amount, 0));
  const debit = r2(filtered.filter((r) => r.amount < 0).reduce((t, r) => t - r.amount, 0));

  // Newest first on screen.
  const newestFirst = [...filtered].reverse();
  const start = (opts.page - 1) * opts.limit;
  return {
    rows: newestFirst.slice(start, start + opts.limit),
    total: filtered.length,
    summary: { openingBalance: r2(opening), credit, debit, closingBalance: r2(bal) },
  };
};
