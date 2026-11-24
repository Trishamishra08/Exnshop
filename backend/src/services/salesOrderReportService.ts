import mongoose from "mongoose";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Return from "../models/Return";
import Seller from "../models/Seller";
import { gstStateCode, stateFromText } from "./taxInvoiceService";

/**
 * Admin Sales Report, one row per order and seller:
 * order no., date and time, seller ID, sales value, GST split into CGST + SGST (seller
 * and customer in the same state) or IGST (different states), returns and exchanges,
 * and a remark. The state rule is the same one the tax invoice uses.
 */

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// Seller state comes from the store's map location (as on the tax invoice). Looked up
// once per seller and kept for a few hours, since it needs a maps lookup.
const sellerStateCache = new Map<string, { code: string; state: string; at: number }>();
const STATE_TTL_MS = 6 * 60 * 60 * 1000;

const sellerStateCode = async (seller: any): Promise<{ code: string; state: string }> => {
  const id = String(seller._id);
  const hit = sellerStateCache.get(id);
  if (hit && Date.now() - hit.at < STATE_TTL_MS) return hit;
  let state = "";
  try {
    const { resolveSellerAddress } = await import("./shiprocketService");
    state = (await resolveSellerAddress(seller))?.state || "";
  } catch {
    /* no state: falls back to the GSTIN below */
  }
  // Same fallback as the tax invoice: the state written in the seller's address.
  if (!state) state = stateFromText([seller.searchLocation, seller.address, seller.returnAddress, seller.city].filter(Boolean).join(", "));
  const code = gstStateCode(state, seller.gstin);
  const entry = { code, state, at: Date.now() };
  sellerStateCache.set(id, entry);
  return entry;
};

export interface SalesReportFilters {
  from?: Date;
  to?: Date;
  channel?: string;
  status?: string; // "" = sales (default) | "Delivered" | "InProgress" | "Cancelled" | "Returned" | "All"
  search?: string;
  page: number;
  limit: number;
}

const IN_PROGRESS = ["Received", "Pending", "Accepted", "Processed", "Shipped", "Out for Delivery", "Out For Delivery"];

export const getSalesOrderReport = async (f: SalesReportFilters) => {
  const match: any = {};
  if (f.from || f.to) match.createdAt = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
  if (f.channel === "Quick" || f.channel === "ECommerce") match.channel = f.channel;
  switch (f.status) {
    case "All":
      break;
    case "Delivered":
      match.status = "Delivered";
      break;
    case "InProgress":
      match.status = { $in: IN_PROGRESS };
      break;
    case "Cancelled":
      match.status = { $in: ["Cancelled", "Rejected"] };
      break;
    case "Returned":
      match.status = { $in: ["Returned", "RTO"] };
      break;
    default:
      // Sales: everything that went through (online orders only once paid).
      match.status = { $nin: ["Cancelled", "Rejected"] };
      match.$or = [{ paymentMethod: { $nin: ["Online", "razorpay"] } }, { paymentStatus: { $in: ["Paid", "Refunded"] } }];
  }

  const orders: any[] = await Order.find(match)
    .select("orderNumber createdAt status paymentMethod paymentStatus channel customerName deliveryAddress")
    .sort({ createdAt: -1 })
    .limit(20000)
    .lean();
  if (orders.length === 0) {
    return { rows: [], total: 0, totals: { orders: 0, salesValue: 0, gst: 0, cgst: 0, sgst: 0, igst: 0, returns: 0, exchanges: 0 } };
  }
  const orderIds = orders.map((o) => o._id);

  const items: any[] = await OrderItem.find({ order: { $in: orderIds }, status: { $ne: "Cancelled" }, sellerStatus: { $ne: "Rejected" } })
    .select("order seller total gstAmount quantity status")
    .lean();
  const returns: any[] = await Return.find({ order: { $in: orderIds }, status: { $ne: "Rejected" } })
    .select("order orderItem requestType quantity status")
    .lean();

  const itemById = new Map(items.map((i) => [String(i._id), i]));
  const sellerIds = [...new Set(items.map((i) => String(i.seller)))];
  const sellers: any[] = await Seller.find({ _id: { $in: sellerIds.map((id) => new mongoose.Types.ObjectId(id)) } })
    .select("storeName sellerName gstin location latitude longitude address searchLocation returnAddress city")
    .lean();
  const sellerById = new Map(sellers.map((s) => [String(s._id), s]));
  const stateBySeller = new Map<string, { code: string; state: string }>();
  await Promise.all(sellers.map(async (s) => stateBySeller.set(String(s._id), await sellerStateCode(s))));

  // Search also matches the seller's store name or ID.
  const rx = f.search ? new RegExp(f.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

  const rows: any[] = [];
  for (const o of orders) {
    const its = items.filter((i) => String(i.order) === String(o._id));
    const bySeller = new Map<string, any[]>();
    for (const it of its) bySeller.set(String(it.seller), [...(bySeller.get(String(it.seller)) || []), it]);

    const customerState = o.deliveryAddress?.state || "";
    const customerCode = gstStateCode(customerState);

    for (const [sid, list] of bySeller) {
      const seller = sellerById.get(sid) || {};
      const taxable = list.reduce((t, i) => t + (Number(i.total) || 0), 0);
      const gst = list.reduce((t, i) => t + (Number(i.gstAmount) || 0), 0);
      const sellerState = stateBySeller.get(sid) || { code: "", state: "" };
      const intraState = Boolean(sellerState.code && customerCode && sellerState.code === customerCode);
      const cgst = intraState ? r2(gst / 2) : 0;
      const sgst = intraState ? r2(gst - cgst) : 0;
      const igst = intraState ? 0 : r2(gst);

      const sellerReturns = returns.filter(
        (r) => String(r.order) === String(o._id) && String(itemById.get(String(r.orderItem))?.seller) === sid,
      );
      const retValue = (type: "RETURN" | "EXCHANGE") =>
        sellerReturns
          .filter((r) => (r.requestType || "RETURN") === type)
          .reduce((t, r) => {
            const it = itemById.get(String(r.orderItem));
            if (!it) return t;
            const share = Math.min(1, (Number(r.quantity) || 1) / (Number(it.quantity) || 1));
            return t + ((Number(it.total) || 0) + (Number(it.gstAmount) || 0)) * share;
          }, 0);
      const returnCount = sellerReturns.filter((r) => (r.requestType || "RETURN") === "RETURN").length;
      const exchangeCount = sellerReturns.filter((r) => r.requestType === "EXCHANGE").length;

      const remark = [
        o.status,
        `${o.paymentMethod || "—"}${o.paymentStatus ? ` (${o.paymentStatus})` : ""}`,
        o.channel === "ECommerce" ? "E-commerce" : o.channel || "",
        intraState ? `Same state: ${sellerState.state || customerState}` : sellerState.code && customerCode ? `${sellerState.state} → ${customerState}` : "State not known: shown as IGST",
      ]
        .filter(Boolean)
        .join(" · ");

      const row = {
        orderId: String(o._id),
        orderNumber: o.orderNumber,
        date: o.createdAt,
        sellerId: sid,
        sellerName: seller.storeName || seller.sellerName || "Seller",
        customerName: o.customerName || "",
        salesValue: r2(taxable + gst),
        taxable: r2(taxable),
        gst: r2(gst),
        cgst,
        sgst,
        igst,
        returns: returnCount,
        returnValue: r2(retValue("RETURN")),
        exchanges: exchangeCount,
        exchangeValue: r2(retValue("EXCHANGE")),
        remark,
      };
      if (rx && !(rx.test(row.orderNumber) || rx.test(row.customerName) || rx.test(row.sellerName) || rx.test(row.sellerId))) continue;
      rows.push(row);
    }
  }

  const sum = (k: string) => r2(rows.reduce((t, r) => t + (Number(r[k]) || 0), 0));
  const totals = {
    orders: new Set(rows.map((r) => r.orderId)).size,
    salesValue: sum("salesValue"),
    gst: sum("gst"),
    cgst: sum("cgst"),
    sgst: sum("sgst"),
    igst: sum("igst"),
    returns: sum("returns"),
    exchanges: sum("exchanges"),
  };
  const start = (f.page - 1) * f.limit;
  return { rows: rows.slice(start, start + f.limit), total: rows.length, totals };
};
