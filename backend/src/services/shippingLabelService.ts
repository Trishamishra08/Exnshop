import Order from "../models/Order";
import Seller from "../models/Seller";
import { assignAwbAndRequestPickup } from "./shiprocketService";
import { buildTaxInvoices, type TaxInvoice } from "./taxInvoiceService";

/**
 * Courier shipping label + tax invoice for E-commerce orders (one per seller
 * shipment). The AWB printed as the label's barcode and Data Matrix comes
 * from Shiprocket when the seller marks the order packed.
 */

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

/** One seller shipment: the courier label on top of that seller's tax invoice. */
export interface ShippingLabel {
  awbCode: string;
  courierName: string;
  routingCode: string;
  rtoRoutingCode: string;
  paymentMethod: "COD" | "Prepaid";
  codAmount: number;
  shipmentRef: string;
  /** "If undelivered, return to" — the seller's return address. */
  returnTo: { name: string; address: string; city: string; state: string; pincode: string };
  invoice: TaxInvoice;
}

/**
 * Label data for an order's courier shipments. A seller gets only their own
 * shipment; admin (no sellerId) gets every shipment of the order.
 */
export const buildShippingLabels = async (orderId: string, sellerId?: string): Promise<ShippingLabel[]> => {
  const order: any = await Order.findById(orderId).lean();
  if (!order || order.channel !== "ECommerce") return [];

  const invoices = await buildTaxInvoices(orderId, sellerId);
  const isCod = order.paymentMethod === "COD";

  const labels: ShippingLabel[] = [];
  for (const invoice of invoices) {
    const { shipment } = findSellerShipment(order, invoice.seller.id);
    if (!shipment?.awbCode) continue;
    const seller: any = await Seller.findById(invoice.seller.id).select("returnAddress");

    labels.push({
      awbCode: shipment.awbCode,
      courierName: shipment.courierName || "",
      routingCode: shipment.routingCode || "",
      rtoRoutingCode: shipment.rtoRoutingCode || "",
      paymentMethod: isCod ? "COD" : "Prepaid",
      // A single-shipment COD order collects what is still pending after any wallet use.
      codAmount: isCod
        ? invoice.count === 1 && typeof order.codAmountPending === "number" && order.codAmountPending > 0
          ? Math.round(order.codAmountPending * 100) / 100
          : invoice.totals.total
        : 0,
      shipmentRef: shipment.channelOrderId || order.orderNumber,
      returnTo: {
        name: invoice.seller.name,
        address: seller?.returnAddress || invoice.seller.address,
        city: invoice.seller.city,
        state: invoice.seller.state,
        pincode: invoice.seller.pincode,
      },
      invoice,
    });
  }
  return labels;
};
