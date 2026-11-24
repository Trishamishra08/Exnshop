import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import OrderItem from "../../../models/OrderItem";
import WalletTransaction from "../../../models/WalletTransaction";
import Seller from "../../../models/Seller";
import Delivery from "../../../models/Delivery";
import Customer from "../../../models/Customer";

/** Admin reports: platform-wide Sales Report and the wallet Ledger. Read-only. */

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const dateRange = (from?: any, to?: any) => {
  const range: any = {};
  if (from) {
    const d = new Date(String(from));
    if (!isNaN(d.getTime())) range.$gte = d;
  }
  if (to) {
    const d = new Date(String(to));
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      range.$lte = d;
    }
  }
  return Object.keys(range).length ? range : undefined;
};

const paging = (req: Request) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  // Export asks for a large page (max 5000 rows).
  const limit = Math.min(5000, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

/**
 * GET /admin/reports/sales?from&to&sellerId&channel&status&search&page&limit
 * Every order line across all sellers, with GST, commission and payment details,
 * plus totals for the whole filter (cancelled / rejected lines are left out of the totals).
 */
export const getAdminSalesReport = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = paging(req);
  const match: any = {};
  const created = dateRange(req.query.from, req.query.to);
  if (created) match.createdAt = created;
  if (req.query.sellerId && mongoose.isValidObjectId(String(req.query.sellerId))) {
    match.seller = new mongoose.Types.ObjectId(String(req.query.sellerId));
  }
  if (req.query.status) match.status = String(req.query.status);

  const after: any = {};
  if (req.query.channel === "Quick" || req.query.channel === "ECommerce") after["order.channel"] = req.query.channel;
  const search = String(req.query.search || "").trim();
  if (search) {
    const rx = new RegExp(escapeRx(search), "i");
    after.$or = [{ productName: rx }, { sku: rx }, { "order.orderNumber": rx }, { "seller.storeName": rx }];
  }

  const live = { $nin: ["Cancelled", "Returned", "RTO"] };
  const [result] = await OrderItem.aggregate([
    { $match: match },
    { $lookup: { from: "orders", localField: "order", foreignField: "_id", as: "order", pipeline: [{ $project: { orderNumber: 1, channel: 1, paymentMethod: 1, paymentStatus: 1, status: 1, customerName: 1 } }] } },
    { $unwind: { path: "$order", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "sellers", localField: "seller", foreignField: "_id", as: "seller", pipeline: [{ $project: { storeName: 1, sellerName: 1 } }] } },
    { $unwind: { path: "$seller", preserveNullAndEmptyArrays: true } },
    ...(Object.keys(after).length ? [{ $match: after }] : []),
    {
      $facet: {
        rows: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              date: "$createdAt",
              orderId: "$order._id",
              orderNumber: "$order.orderNumber",
              channel: "$order.channel",
              paymentMethod: "$order.paymentMethod",
              paymentStatus: "$order.paymentStatus",
              orderStatus: "$order.status",
              customerName: "$order.customerName",
              seller: { $ifNull: ["$seller.storeName", "$seller.sellerName"] },
              productName: 1,
              sku: 1,
              variation: { $ifNull: ["$variantTitle", "$variation"] },
              quantity: 1,
              unitPrice: 1,
              total: 1,
              gstRate: 1,
              gstAmount: 1,
              commissionAmount: 1,
              shippingCharge: 1,
              status: 1,
            },
          },
        ],
        count: [{ $count: "n" }],
        totals: [
          { $match: { status: live } },
          {
            $group: {
              _id: null,
              grossSales: { $sum: "$total" },
              gst: { $sum: { $ifNull: ["$gstAmount", 0] } },
              commission: { $sum: { $ifNull: ["$commissionAmount", 0] } },
              shipping: { $sum: { $ifNull: ["$shippingCharge", 0] } },
              units: { $sum: "$quantity" },
              orders: { $addToSet: "$order._id" },
            },
          },
          { $project: { _id: 0, grossSales: 1, gst: 1, commission: 1, shipping: 1, units: 1, orders: { $size: "$orders" } } },
        ],
      },
    },
  ]);

  const total = result?.count?.[0]?.n || 0;
  return res.json({
    success: true,
    data: {
      rows: result?.rows || [],
      totals: result?.totals?.[0] || { grossSales: 0, gst: 0, commission: 0, shipping: 0, units: 0, orders: 0 },
    },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const PARTY_MODEL: Record<string, any> = { SELLER: Seller, DELIVERY_BOY: Delivery, CUSTOMER: Customer };

/**
 * GET /admin/reports/ledger?userType&party&from&to&type&category&page&limit
 * Every wallet entry (credit / debit) for sellers, delivery partners and customers, with the
 * balance after each entry. `party` searches the name / store / mobile of the account holder.
 */
export const getAdminLedger = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = paging(req);
  const query: any = {};
  const userType = String(req.query.userType || "");
  if (PARTY_MODEL[userType]) query.userType = userType;
  if (req.query.userId && mongoose.isValidObjectId(String(req.query.userId))) query.userId = new mongoose.Types.ObjectId(String(req.query.userId));
  if (req.query.type === "Credit" || req.query.type === "Debit") query.type = req.query.type;
  if (req.query.category) query.category = String(req.query.category);
  const created = dateRange(req.query.from, req.query.to);
  if (created) query.createdAt = created;

  const party = String(req.query.party || "").trim();
  if (party && !query.userId) {
    const rx = new RegExp(escapeRx(party), "i");
    const types = query.userType ? [query.userType] : Object.keys(PARTY_MODEL);
    const ids: mongoose.Types.ObjectId[] = [];
    for (const t of types) {
      const fields =
        t === "SELLER" ? ["storeName", "sellerName", "mobile", "email"] : t === "DELIVERY_BOY" ? ["name", "mobile", "email"] : ["name", "phone", "email"];
      const found = await PARTY_MODEL[t].find({ $or: fields.map((f) => ({ [f]: rx })) }).select("_id").limit(200).lean();
      ids.push(...found.map((d: any) => d._id));
    }
    query.userId = { $in: ids };
  }

  const [rows, total, sums] = await Promise.all([
    WalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("relatedOrder", "orderNumber")
      .lean(),
    WalletTransaction.countDocuments(query),
    WalletTransaction.aggregate([
      { $match: { ...query, status: "Completed" } },
      { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);

  // Names of the account holders on this page
  const byType = new Map<string, Set<string>>();
  for (const r of rows as any[]) {
    if (!byType.has(r.userType)) byType.set(r.userType, new Set());
    byType.get(r.userType)!.add(String(r.userId));
  }
  const names = new Map<string, string>();
  for (const [t, set] of byType) {
    const Model = PARTY_MODEL[t];
    if (!Model) continue;
    const docs: any[] = await Model.find({ _id: { $in: [...set] } }).select("storeName sellerName name mobile phone").lean();
    for (const d of docs) names.set(String(d._id), d.storeName || d.sellerName || d.name || d.mobile || d.phone || "—");
  }

  const credit = sums.find((s: any) => s._id === "Credit")?.total || 0;
  const debit = sums.find((s: any) => s._id === "Debit")?.total || 0;
  return res.json({
    success: true,
    data: {
      rows: (rows as any[]).map((r) => ({
        _id: r._id,
        date: r.createdAt,
        userType: r.userType,
        userId: r.userId,
        party: names.get(String(r.userId)) || "—",
        type: r.type,
        category: r.category || "",
        amount: r.amount,
        balanceAfter: r.balanceAfter,
        description: r.description,
        reference: r.reference,
        status: r.status,
        orderNumber: r.relatedOrder?.orderNumber || "",
      })),
      totals: { credit, debit, net: credit - debit },
    },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * GET /admin/reports/earnings-ledger?from=YYYY-MM-DD&to=YYYY-MM-DD&type=&page=&limit=
 * Exnshop's own earnings, one row per event, with opening and closing balance.
 */
export const getAdminEarningsLedgerReport = asyncHandler(async (req: Request, res: Response) => {
  const { getAdminEarningsLedger } = await import("../../../services/adminEarningsLedgerService");
  const day = (v: any, end: boolean) => {
    const s = String(v || "").trim();
    if (!/^d{4}-d{2}-d{2}$/.test(s)) return undefined;
    return new Date(`${s}T${end ? "23:59:59.999" : "00:00:00.000"}+05:30`);
  };
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 20));
  const data = await getAdminEarningsLedger({
    from: day(req.query.from, false),
    to: day(req.query.to, true),
    type: req.query.type ? String(req.query.type) : undefined,
    page,
    limit,
  });
  return res.status(200).json({ success: true, data: data.rows, summary: data.summary, pagination: { page, limit, total: data.total, pages: Math.ceil(data.total / limit) } });
});

/**
 * GET /admin/reports/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
 * KPI cards, sales trend, seller / customer / commission ledgers and GST reconciliation
 * for the period (default: this month so far).
 */
export const getAdminReportsOverview = asyncHandler(async (req: Request, res: Response) => {
  const { getReportsOverview } = await import("../../../services/reportsOverviewService");
  const day = (v: any) => (/^d{4}-d{2}-d{2}$/.test(String(v || "")) ? String(v) : "");
  const todayIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fromDay = day(req.query.from) || `${todayIst.slice(0, 8)}01`;
  const toDay = day(req.query.to) || todayIst;
  const from = new Date(`${fromDay}T00:00:00.000+05:30`);
  const to = new Date(`${toDay}T23:59:59.999+05:30`);
  if (from > to) return res.status(400).json({ success: false, message: "The start date must be before the end date" });
  if (to.getTime() - from.getTime() > 400 * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ success: false, message: "Choose a period of up to 13 months" });
  }
  const data = await getReportsOverview(from, to);
  return res.status(200).json({ success: true, data: { ...data, range: { from: fromDay, to: toDay } } });
});

/**
 * GET /admin/reports/sales-orders?from&to&channel&status&search&page&limit
 * One row per order and seller: sales value, GST with CGST / SGST / IGST, returns and
 * exchanges, and a remark. Totals cover the whole filter.
 */
export const getAdminSalesOrderReport = asyncHandler(async (req: Request, res: Response) => {
  const { getSalesOrderReport } = await import("../../../services/salesOrderReportService");
  const { page, limit } = paging(req);
  const day = (v: any, end: boolean) =>
    /^d{4}-d{2}-d{2}$/.test(String(v || "")) ? new Date(`${v}T${end ? "23:59:59.999" : "00:00:00.000"}+05:30`) : undefined;
  const data = await getSalesOrderReport({
    from: day(req.query.from, false),
    to: day(req.query.to, true),
    channel: req.query.channel ? String(req.query.channel) : undefined,
    status: req.query.status ? String(req.query.status) : "",
    search: String(req.query.search || "").trim() || undefined,
    page,
    limit,
  });
  return res.status(200).json({
    success: true,
    data: data.rows,
    totals: data.totals,
    pagination: { page, limit, total: data.total, pages: Math.ceil(data.total / limit) },
  });
});
