import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Product from "../models/Product";
import Seller from "../models/Seller";
import { assignAwbAndRequestPickup, resolveSellerAddress } from "./shiprocketService";

/**
 * Courier shipping label + tax invoice for E-commerce orders (one per seller
 * shipment). The AWB printed as the label's barcode and Data Matrix comes
 * from Shiprocket when the seller marks the order packed.
 */

const round2 = (n: number) => Math.round((n || 0) * 100) / 100;
const sameId = (a: any, b: any) => Boolean(a && b) && String(a?._id || a) === String(b?._id || b);

/** The shipment entry for one seller's items (mock and older orders may carry no seller on it). */
const findSellerShipment = (order: any, sellerId: string) => {
  const shipments: any[] = order.shiprocketShipments || [];
  const index = shipments.findIndex((s) => sameId(s.seller, sellerId));
  if (index >= 0) return { shipment: shipments[index], index };
  if (shipments.length === 1 && !shipments[0].seller) return { shipment: shipments[0], index: 0 };
  if (shipments.length === 0 && order.shiprocket?.shipmentId) return { shipment: order.shiprocket, index: -1 };
  return { shipment: undefined, index: -1 };
};

/**
 * Makes sure this seller's shipment has an AWB: asks Shiprocket to assign a
 * courier and request the pickup when it doesn't yet. Safe to call again — an
 * existing AWB is kept.
 */
export const ensureSellerAwb = async (
  orderId: string,
  sellerId: string
): Promise<{ success: boolean; awbCode?: string; message?: string }> => {
  const order: any = await Order.findById(orderId);
  if (!order) return { success: false, message: "Order not found" };
  if (order.channel !== "ECommerce") return { success: false, message: "Only E-commerce orders are shipped by courier" };

  const { shipment, index } = findSellerShipment(order, sellerId);
  if (!shipment?.shipmentId) {
    return { success: false, message: "The courier shipment for this order hasn't been created on Shiprocket yet. Please contact support." };
  }
  if (shipment.awbCode) return { success: true, awbCode: shipment.awbCode };

  const result = await assignAwbAndRequestPickup(shipment.shipmentId);
  if (!result.success || !result.awbCode) return { success: false, message: result.message };

  const update = {
    awbCode: result.awbCode,
    courierName: result.courierName || shipment.courierName,
    routingCode: result.routingCode || undefined,
    rtoRoutingCode: result.rtoRoutingCode || undefined,
    pickupScheduledAt: result.pickupScheduledAt,
    status: result.isMock ? "Mock: AWB Assigned" : "AWB Assigned",
  };
  if (index >= 0) {
    Object.assign(order.shiprocketShipments[index], update, { awbAssignedAt: new Date() });
    order.markModified("shiprocketShipments");
  }
  // `shiprocket` mirrors the first shipment.
  if (index <= 0) {
    order.shiprocket = { ...(order.shiprocket?.toObject?.() || order.shiprocket || {}), ...update };
  }
  await order.save();
  return { success: true, awbCode: result.awbCode, message: result.message };
};

export interface ShippingLabelItem {
  sku: string;
  name: string;
  size: string;
  color: string;
  hsn: string;
  qty: number;
  gross: number;
  discount: number;
  taxable: number;
  gstRate: number;
  gstAmount: number;
  total: number;
}

export interface ShippingLabel {
  awbCode: string;
  courierName: string;
  routingCode: string;
  rtoRoutingCode: string;
  paymentMethod: "COD" | "Prepaid";
  codAmount: number;
  orderNumber: string;
  shipmentRef: string;
  invoiceNumber: string;
  orderDate: string;
  invoiceDate: string;
  customer: { name: string; phone: string; address: string; city: string; state: string; pincode: string };
  seller: { name: string; contactName: string; address: string; city: string; state: string; pincode: string; gstin: string };
  placeOfSupply: string;
  /** IGST between states, CGST + SGST within one state. */
  taxType: "IGST" | "CGST_SGST";
  items: ShippingLabelItem[];
  otherCharges: number;
  totals: { taxable: number; tax: number; total: number };
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
 * Label data for an order's courier shipments. A seller gets only their own
 * shipment; admin (no sellerId) gets every shipment of the order.
 */
export const buildShippingLabels = async (orderId: string, sellerId?: string): Promise<ShippingLabel[]> => {
  const order: any = await Order.findById(orderId).lean();
  if (!order || order.channel !== "ECommerce") return [];

  const allItems: any[] = await OrderItem.find({ order: order._id }).lean();
  const live = allItems.filter((i) => i.status !== "Cancelled");
  const sellerIds = [...new Set(live.map((i) => String(i.seller)))].filter((id) => !sellerId || id === String(sellerId));

  const products = await Product.find({ _id: { $in: live.map((i) => i.product) } })
    .select("variations variationType hsnCode")
    .lean();
  const productById = new Map(products.map((p: any) => [String(p._id), p]));

  // The coupon applies to the whole cart: each line carries its share.
  const cartSubtotal = live.reduce((sum, i) => sum + (i.total || 0), 0);
  const discountShare = (lineTotal: number) => (cartSubtotal > 0 ? ((order.discount || 0) * lineTotal) / cartSubtotal : 0);
  const allLinesTotal = live.reduce((sum, i) => sum + (i.total || 0) - discountShare(i.total || 0) + (i.gstAmount || 0), 0);
  const sharedCharges = Math.max(0, round2((order.total || 0) - allLinesTotal));
  const firstSellerId = String(live[0]?.seller || "");

  const labels: ShippingLabel[] = [];
  for (const sid of sellerIds) {
    const seller: any = await Seller.findById(sid);
    if (!seller) continue;
    const { shipment } = findSellerShipment(order, sid);
    if (!shipment?.awbCode) continue;

    const address = await resolveSellerAddress(seller).catch(() => null);
    const sellerState = address?.state || "";
    const customerState = order.deliveryAddress?.state || "";
    const taxType: ShippingLabel["taxType"] =
      sellerState && customerState && sellerState.trim().toLowerCase() === customerState.trim().toLowerCase() ? "CGST_SGST" : "IGST";

    const items: ShippingLabelItem[] = live
      .filter((i) => String(i.seller) === sid)
      .map((i) => {
        const product = productById.get(String(i.product));
        const gross = round2(i.total || 0);
        const discount = round2(discountShare(i.total || 0));
        const taxable = round2(gross - discount);
        const gstAmount = round2(i.gstAmount || 0);
        return {
          sku: i.sku || "",
          name: i.variantTitle && i.variantTitle !== "Default" ? `${i.productName} - ${i.variantTitle}` : i.productName,
          size: variantOption(product, i, /size/i) || "NA",
          color: variantOption(product, i, /colou?r/i) || "NA",
          hsn: product?.hsnCode || "",
          qty: i.quantity || 0,
          gross,
          discount,
          taxable,
          gstRate: i.gstRate || 0,
          gstAmount,
          total: round2(taxable + gstAmount),
        };
      });

    // Platform fee, delivery and packaging are order-level: they travel on the first shipment.
    const otherCharges = sid === firstSellerId ? sharedCharges : 0;
    const taxableTotal = round2(items.reduce((s, i) => s + i.taxable, 0));
    const taxTotal = round2(items.reduce((s, i) => s + i.gstAmount, 0));
    const total = round2(taxableTotal + taxTotal + otherCharges);
    const isCod = order.paymentMethod === "COD";

    labels.push({
      awbCode: shipment.awbCode,
      courierName: shipment.courierName || "",
      routingCode: shipment.routingCode || "",
      rtoRoutingCode: shipment.rtoRoutingCode || "",
      paymentMethod: isCod ? "COD" : "Prepaid",
      // A single-shipment COD order collects what is still pending after any wallet use.
      codAmount: isCod
        ? sellerIds.length === 1 && typeof order.codAmountPending === "number" && order.codAmountPending > 0
          ? round2(order.codAmountPending)
          : total
        : 0,
      orderNumber: order.orderNumber,
      shipmentRef: shipment.channelOrderId || order.orderNumber,
      invoiceNumber: order.invoiceNumber || order.orderNumber,
      orderDate: new Date(order.orderDate || order.createdAt).toISOString(),
      invoiceDate: new Date(shipment.awbAssignedAt || Date.now()).toISOString(),
      customer: {
        name: order.customerName || "",
        phone: order.customerPhone || "",
        address: order.deliveryAddress?.address || "",
        city: order.deliveryAddress?.city || "",
        state: customerState,
        pincode: order.deliveryAddress?.pincode || "",
      },
      seller: {
        name: seller.legalBusinessName || seller.storeName || seller.sellerName,
        contactName: seller.sellerName || "",
        address: seller.returnAddress || address?.line1 || seller.address || "",
        city: address?.city || seller.city || "",
        state: sellerState,
        pincode: address?.pincode || "",
        gstin: seller.gstin || "",
      },
      placeOfSupply: customerState,
      taxType,
      items,
      otherCharges,
      totals: { taxable: taxableTotal, tax: taxTotal, total },
    });
  }
  return labels;
};
