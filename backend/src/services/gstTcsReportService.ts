import mongoose from "mongoose";
import AppSettings from "../models/AppSettings";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Product from "../models/Product";
import Return from "../models/Return";
import Seller from "../models/Seller";
import { stateFromText } from "./taxInvoiceService";
import { fyAndMonth, istDate, type ReportPeriod } from "./reportPeriodService";
import { buildXlsx, zipFiles, type Cell } from "../utils/xlsx";

/**
 * GST / TCS report, in the layout marketplaces hand their sellers for GST filing
 * (GSTR-1 / GSTR-8): two sheets, one row per sold item.
 *
 *  tcs_sales         — items dispatched in the period (the supply happens when the parcel leaves).
 *  tcs_sales_return  — dispatched items that were cancelled, returned or came back (RTO) in the period.
 *
 * An item cancelled before it was ever dispatched is in neither sheet: no supply took place.
 * "Dispatched" = the courier AWB was booked (E-commerce), or the order was delivered (Quick).
 * total_taxable_sale_value is the item's price before GST; tax_amount is its GST.
 */

const SALES_HEADER = [
  "identifier", "sup_name", "gstin", "sub_order_num", "order_date", "hsn_code", "quantity", "gst_rate",
  "total_taxable_sale_value", "tax_amount", "total_invoice_value", "taxable_shipping", "end_customer_state_new",
  "enrollment_no", "manifest_date", "transaction_type", "eco_tcs_gstin", "financial_year", "month_number", "supplier_id",
];
const RETURN_HEADER = [
  "identifier", "sup_name", "gstin", "sub_order_num", "order_date", "hsn_code", "quantity", "gst_rate",
  "total_taxable_sale_value", "tax_amount", "total_invoice_value", "taxable_shipping", "end_customer_state_new",
  "enrollment_no", "cancel_return_date", "manifest_date", "transaction_type", "eco_tcs_gstin", "financial_year", "month_number", "supplier_id",
];

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
/** Short, stable seller code used as supplier_id and in file names. */
export const sellerCode = (id: any) => String(id).slice(-8).toUpperCase();
const DISPATCHED_ORDER_STATUSES = new Set(["Delivered", "Returned", "RTO"]);
const UNDONE_ITEM = new Set(["Cancelled", "Returned", "RTO"]);

export interface TcsRow {
  sellerId: string;
  sellerName: string;
  gstin: string;
  subOrderNum: string;
  orderDate: string;
  hsn: string;
  quantity: number;
  gstRate: number;
  taxable: number;
  tax: number;
  invoiceValue: number;
  customerState: string;
  manifestDate: Date;
  cancelReturnDate?: Date;
  /** Why it is in the return sheet. */
  returnKind?: "Cancelled" | "Returned" | "RTO";
}

export interface TcsReport {
  sales: TcsRow[];
  returns: TcsRow[];
  ecoGstin: string;
  totals: {
    salesTaxable: number;
    salesTax: number;
    salesInvoice: number;
    returnTaxable: number;
    returnTax: number;
    returnInvoice: number;
    netTaxable: number;
    netTax: number;
  };
}

const sellerShipment = (order: any, sellerId: string) => {
  const list: any[] = order.shiprocketShipments || [];
  return list.find((s) => String(s.seller) === sellerId) || (list.length === 1 && !list[0].seller ? list[0] : undefined) || (list.length ? undefined : order.shiprocket);
};

/** When this seller's parcel left: AWB booked / picked up, or the order delivered (Quick). */
const dispatchDate = (order: any, item: any): Date | null => {
  const sh = sellerShipment(order, String(item.seller));
  const d = sh?.awbAssignedAt || sh?.pickupScheduledAt;
  if (d) return new Date(d);
  if (DISPATCHED_ORDER_STATUSES.has(order.status) || DISPATCHED_ORDER_STATUSES.has(item.status)) {
    return new Date(order.deliveredAt || order.rtoDetails?.markedAt || item.updatedAt || order.updatedAt);
  }
  return null;
};

export const buildTcsReport = async (period: ReportPeriod, sellerIds?: string[]): Promise<TcsReport> => {
  const settings: any = await AppSettings.findOne().select("companyGstin").lean();
  const ecoGstin = settings?.companyGstin || "";

  // An item dispatched or returned in the period was ordered at most a few months before it.
  const lookback = new Date(period.from.getTime() - 180 * 24 * 60 * 60 * 1000);
  const filter: any = { createdAt: { $gte: lookback, $lte: period.to } };
  if (sellerIds?.length) filter.seller = { $in: sellerIds.map((id) => new mongoose.Types.ObjectId(id)) };
  const items: any[] = await OrderItem.find(filter)
    .select("order seller product quantity total gstRate gstAmount status createdAt updatedAt")
    .lean();
  if (items.length === 0) return { sales: [], returns: [], ecoGstin, totals: emptyTotals() };

  const orderIds = [...new Set(items.map((i) => String(i.order)))];
  const [orders, products, sellers, returns] = await Promise.all([
    Order.find({ _id: { $in: orderIds } })
      .select("orderNumber orderDate createdAt items status paymentMethod paymentStatus deliveryAddress deliveredAt cancelledAt rtoDetails shiprocketShipments shiprocket updatedAt")
      .lean(),
    Product.find({ _id: { $in: [...new Set(items.map((i) => String(i.product)))] } }).select("hsnCode").lean(),
    Seller.find({ _id: { $in: [...new Set(items.map((i) => String(i.seller)))] } }).select("sellerName storeName gstin taxNumber").lean(),
    Return.find({ orderItem: { $in: items.map((i) => i._id) }, requestType: "RETURN", status: { $in: ["Handed To Seller", "Completed"] } })
      .select("orderItem completedAt handedToSellerAt updatedAt")
      .lean(),
  ]);
  const orderBy = new Map(orders.map((o: any) => [String(o._id), o]));
  const hsnBy = new Map(products.map((p: any) => [String(p._id), p.hsnCode || ""]));
  const sellerBy = new Map(sellers.map((s: any) => [String(s._id), s]));
  const returnBy = new Map(returns.map((r: any) => [String(r.orderItem), r]));

  const inPeriod = (d?: Date | null) => Boolean(d) && d!.getTime() >= period.from.getTime() && d!.getTime() <= period.to.getTime();
  const sales: TcsRow[] = [];
  const back: TcsRow[] = [];

  for (const it of items) {
    const order: any = orderBy.get(String(it.order));
    if (!order) continue;
    const manifest = dispatchDate(order, it);
    if (!manifest) continue; // never left the seller: no supply

    const seller: any = sellerBy.get(String(it.seller)) || {};
    const position = (order.items || []).findIndex((x: any) => String(x) === String(it._id));
    const taxable = r2(it.total);
    const tax = r2(it.gstAmount || 0);
    const addr = order.deliveryAddress || {};
    const row: TcsRow = {
      sellerId: String(it.seller),
      sellerName: seller.sellerName || seller.storeName || "",
      gstin: seller.gstin || "",
      subOrderNum: `${order.orderNumber}_${position >= 0 ? position + 1 : 1}`,
      orderDate: istDate(order.orderDate || order.createdAt),
      hsn: hsnBy.get(String(it.product)) || "",
      quantity: Number(it.quantity) || 0,
      gstRate: Number(it.gstRate) || 0,
      taxable,
      tax,
      invoiceValue: r2(taxable + tax),
      customerState: String(addr.state || stateFromText(`${addr.address || ""} ${addr.city || ""}`) || "").toUpperCase(),
      manifestDate: manifest,
    };
    if (inPeriod(manifest)) sales.push(row);

    // Undone after dispatch: return / RTO / cancellation date.
    const ret: any = returnBy.get(String(it._id));
    let undoneAt: Date | null = null;
    let kind: TcsRow["returnKind"];
    if (ret || it.status === "Returned" || order.status === "Returned") {
      undoneAt = new Date(ret?.completedAt || ret?.handedToSellerAt || ret?.updatedAt || it.updatedAt);
      kind = "Returned";
    } else if (it.status === "RTO" || order.status === "RTO") {
      undoneAt = new Date(order.rtoDetails?.markedAt || it.updatedAt);
      kind = "RTO";
    } else if (UNDONE_ITEM.has(it.status) || ["Cancelled", "Rejected"].includes(order.status)) {
      undoneAt = new Date(order.cancelledAt || it.updatedAt);
      kind = "Cancelled";
    }
    if (undoneAt && inPeriod(undoneAt)) back.push({ ...row, cancelReturnDate: undoneAt, returnKind: kind });
  }

  const byDate = (a: TcsRow, b: TcsRow) => a.sellerName.localeCompare(b.sellerName) || a.orderDate.localeCompare(b.orderDate);
  sales.sort(byDate);
  back.sort(byDate);
  const sum = (rows: TcsRow[], k: "taxable" | "tax" | "invoiceValue") => r2(rows.reduce((t, r) => t + r[k], 0));
  const totals = {
    salesTaxable: sum(sales, "taxable"),
    salesTax: sum(sales, "tax"),
    salesInvoice: sum(sales, "invoiceValue"),
    returnTaxable: sum(back, "taxable"),
    returnTax: sum(back, "tax"),
    returnInvoice: sum(back, "invoiceValue"),
    netTaxable: r2(sum(sales, "taxable") - sum(back, "taxable")),
    netTax: r2(sum(sales, "tax") - sum(back, "tax")),
  };
  return { sales, returns: back, ecoGstin, totals };
};

const emptyTotals = () => ({ salesTaxable: 0, salesTax: 0, salesInvoice: 0, returnTaxable: 0, returnTax: 0, returnInvoice: 0, netTaxable: 0, netTax: 0 });

const commonCells = (r: TcsRow): Cell[] => [
  "exnshop", r.sellerName, r.gstin, r.subOrderNum, r.orderDate, r.hsn, r.quantity, r.gstRate.toFixed(2),
  r.taxable, r.tax, r.invoiceValue, 0, r.customerState, "",
];

export const tcsSalesSheet = (rep: TcsReport) => ({
  name: "tcs_sales",
  widths: [11, 24, 18, 26, 12, 10, 9, 9, 14, 12, 14, 12, 22, 12, 13, 14, 18, 13, 13, 12],
  rows: [
    SALES_HEADER,
    ...rep.sales.map((r) => {
      const { financialYear, month } = fyAndMonth(r.manifestDate);
      return [...commonCells(r), istDate(r.manifestDate), "", rep.ecoGstin, financialYear, month, sellerCode(r.sellerId)];
    }),
  ],
});

export const tcsReturnSheet = (rep: TcsReport) => ({
  name: "tcs_sales_return",
  widths: [11, 24, 18, 26, 12, 10, 9, 9, 14, 12, 14, 12, 22, 12, 16, 13, 14, 18, 13, 13, 12],
  rows: [
    RETURN_HEADER,
    ...rep.returns.map((r) => {
      const { financialYear, month } = fyAndMonth(r.cancelReturnDate!);
      return [...commonCells(r), istDate(r.cancelReturnDate), istDate(r.manifestDate), r.returnKind || "", rep.ecoGstin, financialYear, month, sellerCode(r.sellerId)];
    }),
  ],
});

/** The download: a zip with tcs_sales.xlsx and tcs_sales_return.xlsx, like marketplaces give it. */
export const buildTcsZip = async (period: ReportPeriod, sellerIds?: string[]) => {
  const rep = await buildTcsReport(period, sellerIds);
  const who = sellerIds?.length === 1 ? sellerCode(sellerIds[0]) : "all_sellers";
  return {
    report: rep,
    fileName: `gst_${who}_${period.fileTag}.zip`,
    buffer: zipFiles([
      { name: "tcs_sales.xlsx", data: buildXlsx([tcsSalesSheet(rep)]) },
      { name: "tcs_sales_return.xlsx", data: buildXlsx([tcsReturnSheet(rep)]) },
    ]),
  };
};
