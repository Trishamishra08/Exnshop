import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Product from "../models/Product";
import Seller from "../models/Seller";
import { resolveSellerAddress } from "./shiprocketService";

/**
 * GST tax invoices for an order, laid out like Amazon's "Tax Invoice/Bill of
 * Supply/Cash Memo": one invoice per seller, since each seller supplies their
 * own items. Used by the customer's invoice download, the seller's invoice
 * export and the courier shipping label.
 */

const round2 = (n: number) => Math.round((n || 0) * 100) / 100;
const sameId = (a: any, b: any) => Boolean(a && b) && String(a?._id || a) === String(b?._id || b);

// GST state codes (first two digits of a GSTIN), printed as "State/UT Code".
const GST_STATE_CODES: Record<string, string> = {
  "jammu and kashmir": "01", "himachal pradesh": "02", punjab: "03", chandigarh: "04", uttarakhand: "05",
  haryana: "06", delhi: "07", rajasthan: "08", "uttar pradesh": "09", bihar: "10", sikkim: "11",
  "arunachal pradesh": "12", nagaland: "13", manipur: "14", mizoram: "15", tripura: "16", meghalaya: "17",
  assam: "18", "west bengal": "19", jharkhand: "20", odisha: "21", chhattisgarh: "22", "madhya pradesh": "23",
  gujarat: "24", "dadra and nagar haveli and daman and diu": "26", maharashtra: "27", karnataka: "29", goa: "30",
  lakshadweep: "31", kerala: "32", "tamil nadu": "33", puducherry: "34", "andaman and nicobar islands": "35",
  telangana: "36", "andhra pradesh": "37", ladakh: "38",
};
const STATE_ALIASES: Record<string, string> = {
  up: "uttar pradesh", mp: "madhya pradesh", "new delhi": "delhi", "nct of delhi": "delhi", orissa: "odisha",
  pondicherry: "puducherry", uttaranchal: "uttarakhand", "j&k": "jammu and kashmir", hr: "haryana",
};
const normalizeState = (state: string) => {
  const s = (state || "").trim().toLowerCase().replace(/\s+/g, " ");
  return STATE_ALIASES[s] || s;
};
export const gstStateCode = (state: string, gstin?: string) =>
  GST_STATE_CODES[normalizeState(state)] || (gstin && /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : "");

export interface TaxInvoiceParty {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
}

export interface TaxInvoiceItem {
  name: string;
  sku: string;
  size: string;
  color: string;
  hsn: string;
  qty: number;
  /** Price of one unit before GST. */
  unitPrice: number;
  /** Gross (unit price × qty) and this line's share of the coupon. */
  gross: number;
  discount: number;
  /** Taxable value: gross − discount. */
  netAmount: number;
  gstRate: number;
  gstAmount: number;
  total: number;
}

/** Order-level charges (shipping, platform fee …), listed below the items like Amazon's "Shipping Charges". */
export interface TaxInvoiceCharge {
  label: string;
  amount: number;
}

export interface TaxInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  orderNumber: string;
  orderDate: string;
  channel: "Quick" | "ECommerce";
  seller: {
    id: string;
    name: string;
    storeName: string;
    address: string;
    city: string;
    state: string;
    stateCode: string;
    pincode: string;
    pan: string;
    gstin: string;
  };
  billing: TaxInvoiceParty;
  shipping: TaxInvoiceParty;
  placeOfSupply: string;
  placeOfDelivery: string;
  /** IGST between states, CGST + SGST within one state. */
  taxType: "IGST" | "CGST_SGST";
  items: TaxInvoiceItem[];
  charges: TaxInvoiceCharge[];
  totals: { netAmount: number; tax: number; total: number };
  paymentMethod: string;
  /** Page 1 of N, when an order has several sellers. */
  sequence: number;
  count: number;
}

// The option a buyer picked for one axis (e.g. Size, Color), read from the ordered variant.
const variantOption = (product: any, item: any, pattern: RegExp): string => {
  const variations: any[] = product?.variations || [];
  const v = variations.find(
    (x) => String(x._id) === String(item.variation) || x.value === item.variation || x.value === item.variantTitle
  );
  if (!v) return "";
  const opt = (v.options || []).find((o: any) => pattern.test(o.name || ""));
  if (opt) return opt.value;
  return pattern.test(product?.variationType || "") ? v.value : "";
};

/**
 * The customer can download the invoice once the order is delivered — the
 * goods have been supplied, so it doesn't wait on a payment still marked
 * pending. Admin can switch it on early with `invoiceEnabled`.
 */
export const isInvoiceAvailable = (order: any) => {
  const delivered = ["Delivered", "Completed"].includes(order.status);
  const hasData = Boolean(order._id && order.items && order.items.length > 0 && order.total != null);
  return order.invoiceEnabled === true || (delivered && hasData);
};

/**
 * Tax invoices for an order: every seller's (admin, customer) or only one
 * seller's own (`sellerId`). The invoice date is when the seller's parcel was
 * handed to the courier, else the delivery date, else the order date — so
 * every download of the same invoice shows the same date.
 */
export const buildTaxInvoices = async (orderId: string, sellerId?: string): Promise<TaxInvoice[]> => {
  const order: any = await Order.findById(orderId).lean();
  if (!order) return [];

  const allItems: any[] = await OrderItem.find({ order: order._id }).lean();
  const live = allItems.filter((i) => !["Cancelled", "Rejected"].includes(i.status) && i.sellerStatus !== "Rejected");
  const allSellerIds = [...new Set(live.map((i) => String(i.seller)))];
  const sellerIds = allSellerIds.filter((id) => !sellerId || id === String(sellerId));

  const products = await Product.find({ _id: { $in: live.map((i) => i.product) } })
    .select("variations variationType hsnCode")
    .lean();
  const productById = new Map(products.map((p: any) => [String(p._id), p]));

  // The coupon applies to the whole cart: each line carries its share.
  const cartSubtotal = live.reduce((sum, i) => sum + (i.total || 0), 0);
  const discountShare = (lineTotal: number) => (cartSubtotal > 0 ? ((order.discount || 0) * lineTotal) / cartSubtotal : 0);

  // Order-level charges travel on the first seller's invoice.
  const charges: TaxInvoiceCharge[] = [];
  if (order.shipping > 0) charges.push({ label: "Shipping Charges", amount: round2(order.shipping) });
  if (order.platformFee > 0) charges.push({ label: "Platform Fee", amount: round2(order.platformFee) });
  if (order.tipAmount > 0) charges.push({ label: "Delivery Partner Tip", amount: round2(order.tipAmount) });
  const allLinesTotal = live.reduce((sum, i) => sum + (i.total || 0) - discountShare(i.total || 0) + (i.gstAmount || 0), 0);
  const listed = charges.reduce((s, c) => s + c.amount, 0);
  const leftover = round2((order.total || 0) - allLinesTotal - listed);
  if (leftover > 0.5) charges.push({ label: "Other Charges", amount: leftover });

  const address = order.deliveryAddress || {};
  const customerState = address.state || "";
  const customer: TaxInvoiceParty = {
    name: order.customerName || "",
    phone: order.customerPhone || "",
    address: [address.address, address.landmark].filter(Boolean).join(", "),
    city: address.city || "",
    state: customerState,
    stateCode: gstStateCode(customerState),
    pincode: address.pincode || "",
  };

  const baseInvoiceNumber = order.invoiceNumber || order.orderNumber;
  const invoices: TaxInvoice[] = [];
  for (const sid of sellerIds) {
    const seller: any = await Seller.findById(sid);
    if (!seller) continue;
    const resolved = await resolveSellerAddress(seller).catch(() => null);
    const sellerState = resolved?.state || "";
    const taxType: TaxInvoice["taxType"] =
      sellerState && customerState && normalizeState(sellerState) === normalizeState(customerState) ? "CGST_SGST" : "IGST";

    const items: TaxInvoiceItem[] = live
      .filter((i) => String(i.seller) === sid)
      .map((i) => {
        const product = productById.get(String(i.product));
        const qty = i.quantity || 0;
        const gross = round2(i.total || 0);
        const discount = round2(discountShare(i.total || 0));
        const netAmount = round2(gross - discount);
        const gstAmount = round2(i.gstAmount || 0);
        return {
          name: i.variantTitle && i.variantTitle !== "Default" ? `${i.productName} - ${i.variantTitle}` : i.productName,
          sku: i.sku || "",
          size: variantOption(product, i, /size/i) || "NA",
          color: variantOption(product, i, /colou?r/i) || "NA",
          hsn: product?.hsnCode || "",
          qty,
          unitPrice: round2(i.unitPrice || (qty ? gross / qty : 0)),
          gross,
          discount,
          netAmount,
          gstRate: i.gstRate || 0,
          gstAmount,
          total: round2(netAmount + gstAmount),
        };
      });

    const sequence = allSellerIds.indexOf(sid) + 1;
    const sellerCharges = sequence === 1 ? charges : [];
    const netTotal = round2(items.reduce((s, i) => s + i.netAmount, 0));
    const taxTotal = round2(items.reduce((s, i) => s + i.gstAmount, 0));
    const chargesTotal = round2(sellerCharges.reduce((s, c) => s + c.amount, 0));

    const shipment =
      (order.shiprocketShipments || []).find((s: any) => sameId(s.seller, sid)) ||
      ((order.shiprocketShipments || []).length === 1 ? order.shiprocketShipments[0] : undefined);
    const invoiceDate = shipment?.awbAssignedAt || order.deliveredAt || order.orderDate || order.createdAt;

    invoices.push({
      invoiceNumber: allSellerIds.length > 1 ? `${baseInvoiceNumber}-${sequence}` : baseInvoiceNumber,
      invoiceDate: new Date(invoiceDate).toISOString(),
      orderNumber: order.orderNumber,
      orderDate: new Date(order.orderDate || order.createdAt).toISOString(),
      channel: order.channel === "ECommerce" ? "ECommerce" : "Quick",
      seller: {
        id: sid,
        name: seller.legalBusinessName || seller.storeName || seller.sellerName,
        storeName: seller.storeName || "",
        address: resolved?.line1 || seller.address || "",
        city: resolved?.city || seller.city || "",
        state: sellerState,
        stateCode: gstStateCode(sellerState, seller.gstin),
        pincode: resolved?.pincode || "",
        pan: seller.panCard || "",
        gstin: seller.gstin || "",
      },
      billing: customer,
      shipping: customer,
      placeOfSupply: customerState,
      placeOfDelivery: customerState,
      taxType,
      items,
      charges: sellerCharges,
      totals: { netAmount: netTotal, tax: taxTotal, total: round2(netTotal + taxTotal + chargesTotal) },
      paymentMethod: order.paymentMethod || "",
      sequence,
      count: allSellerIds.length,
    });
  }
  return invoices;
};
