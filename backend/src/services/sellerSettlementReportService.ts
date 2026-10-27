import mongoose from "mongoose";
import Commission from "../models/Commission";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Return from "../models/Return";
import WithdrawRequest from "../models/WithdrawRequest";
import WalletTransaction from "../models/WalletTransaction";

/**
 * Pending    — order not delivered yet, or COD cash not yet reconciled
 * Processing — delivered, earning held until the return window closes
 * Settled    — credited to the seller's wallet (available to withdraw)
 * Paid       — covered by a completed bank/UPI withdrawal
 */
export type SettlementStatus = "Pending" | "Processing" | "Settled" | "Paid" | "Cancelled";

export interface SettlementRow {
  settlementId: string;
  orderId: string;
  orderNumber: string;
  date: Date;
  grossAmount: number;
  /** Everything taken off: platform commission + courier shipping charge. */
  deductions: number;
  commissionAmount: number;
  shippingCharge: number;
  netAmount: number;
  status: SettlementStatus;
  expectedSettlementDate: Date | null;
  paymentDate: Date | null;
  bankReference: string | null;
}

export interface PaymentSummary {
  totalSales: number;
  deliveredSales: number;
  pendingSettlement: number;
  settledToWallet: number;
  paidToBank: number;
  refunds: number;
  platformDeductions: number;
  /** Courier pickup charges billed for customer returns (these come out of the wallet, not the order row). */
  returnShippingCharges: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export async function buildSellerSettlementReport(sellerId: string): Promise<{
  summary: PaymentSummary;
  rows: SettlementRow[];
}> {
  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

  const [commissions, items, completedWithdrawals] = await Promise.all([
    Commission.find({ seller: sellerObjectId, type: "SELLER" }).lean(),
    OrderItem.find({ seller: sellerObjectId }).select("order total status").lean(),
    WithdrawRequest.find({ userId: sellerObjectId, userType: "SELLER", status: "Completed" })
      .sort({ processedAt: 1 })
      .lean(),
  ]);

  const orderIds = [
    ...new Set([...commissions.map((c) => c.order.toString()), ...items.map((i) => i.order.toString())]),
  ];
  const orders = await Order.find({ _id: { $in: orderIds } })
    .select("orderNumber status createdAt deliveredAt")
    .lean();
  const orderById = new Map(orders.map((o: any) => [o._id.toString(), o]));

  // ── Summary ────────────────────────────────────────────────────────────
  let totalSales = 0;
  let deliveredSales = 0;
  for (const item of items) {
    const order: any = orderById.get(item.order.toString());
    if (!order || ["Cancelled", "Rejected", "Pending"].includes(order.status) || item.status === "Cancelled") continue;
    totalSales += item.total;
    if (order.status === "Delivered") deliveredSales += item.total;
  }

  const sellerItemIds = items.map((i: any) => i._id);
  const completedReturns = await Return.find({
    orderItem: { $in: sellerItemIds },
    requestType: "RETURN",
    status: "Completed",
  })
    .select("refundAmount")
    .lean();
  const refunds = completedReturns.reduce((acc, r: any) => acc + (r.refundAmount || 0), 0);

  // ── Rows: one per order ────────────────────────────────────────────────
  const byOrder = new Map<string, typeof commissions>();
  for (const c of commissions) {
    const key = c.order.toString();
    if (!byOrder.has(key)) byOrder.set(key, []);
    byOrder.get(key)!.push(c);
  }

  const rows: SettlementRow[] = [];
  let pendingSettlement = 0;
  let settledToWallet = 0;
  let platformDeductions = 0;

  for (const [orderId, comms] of byOrder) {
    const order: any = orderById.get(orderId);
    const live = comms.filter((c) => c.status !== "Cancelled");
    const gross = live.reduce((a, c) => a + c.orderAmount, 0);
    const commissionTotal = live.reduce((a, c) => a + c.commissionAmount, 0);
    const shippingTotal = live.reduce((a, c) => a + (c.shippingCharge || 0), 0);
    const deductions = commissionTotal + shippingTotal;
    const net = gross - deductions;

    let status: SettlementStatus;
    if (live.length === 0) status = "Cancelled";
    else if (live.some((c) => c.status === "Pending")) status = "Pending";
    else if (live.some((c) => c.status === "OnHold")) status = "Processing";
    else status = "Settled";

    if (status === "Pending" || status === "Processing") pendingSettlement += net;
    if (status === "Settled") settledToWallet += net;
    if (status !== "Cancelled") platformDeductions += deductions;

    const paidAts = live.map((c) => c.paidAt).filter(Boolean) as Date[];
    const holdUntils = live.map((c) => c.onHoldUntil).filter(Boolean) as Date[];

    const firstId = comms.map((c) => c._id.toString()).sort()[0];
    rows.push({
      settlementId: `STL-${firstId.slice(-10).toUpperCase()}`,
      orderId,
      orderNumber: order?.orderNumber || orderId,
      date: order?.createdAt || comms[0].createdAt,
      grossAmount: round(gross),
      deductions: round(deductions),
      commissionAmount: round(commissionTotal),
      shippingCharge: round(shippingTotal),
      netAmount: round(net),
      status,
      expectedSettlementDate:
        status === "Processing" && holdUntils.length
          ? new Date(Math.max(...holdUntils.map((d) => new Date(d).getTime())))
          : null,
      paymentDate: status === "Settled" && paidAts.length
        ? new Date(Math.max(...paidAts.map((d) => new Date(d).getTime())))
        : null,
      bankReference: null,
    });
  }

  // Withdrawals are amount-based, not tied to orders, so attribute completed
  // payouts to settled orders oldest-first (FIFO). An order counts as Paid once
  // the cumulative amount withdrawn to the bank covers it.
  const settledRows = rows
    .filter((r) => r.status === "Settled")
    .sort((a, b) => (a.paymentDate?.getTime() ?? 0) - (b.paymentDate?.getTime() ?? 0));
  let withdrawnSoFar = 0;
  let wIdx = 0;
  let coveredSoFar = 0;
  for (const row of settledRows) {
    const needed = coveredSoFar + row.netAmount;
    while (wIdx < completedWithdrawals.length && withdrawnSoFar < needed - 0.01) {
      withdrawnSoFar += completedWithdrawals[wIdx].amount;
      wIdx++;
    }
    if (withdrawnSoFar >= needed - 0.01 && wIdx > 0) {
      const w: any = completedWithdrawals[wIdx - 1];
      row.status = "Paid";
      row.paymentDate = w.processedAt || w.updatedAt;
      row.bankReference = w.transactionReference || null;
      settledToWallet -= row.netAmount;
    }
    coveredSoFar = needed;
  }

  const returnShippingTxns = await WalletTransaction.find({ userId: sellerObjectId, userType: "SELLER", category: "RETURN_SHIPPING_DEBIT" })
    .select("amount")
    .lean();
  const returnShippingCharges = returnShippingTxns.reduce((a: number, t: any) => a + (t.amount || 0), 0);

  const paidToBank = completedWithdrawals.reduce((a, w: any) => a + w.amount, 0);

  rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    summary: {
      totalSales: round(totalSales),
      deliveredSales: round(deliveredSales),
      pendingSettlement: round(pendingSettlement),
      settledToWallet: round(Math.max(0, settledToWallet)),
      paidToBank: round(paidToBank),
      refunds: round(refunds),
      platformDeductions: round(platformDeductions),
      returnShippingCharges: round(returnShippingCharges),
    },
    rows,
  };
}
