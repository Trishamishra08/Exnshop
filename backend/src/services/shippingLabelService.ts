import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Seller from "../models/Seller";
import { assignAwbAndRequestPickup, createShiprocketOrder } from "./shiprocketService";
import { companyShippedSellerIds, getSellerShippingMethod } from "./sellerShippingService";
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

// Orders whose Shiprocket shipments are being created right now (payment
// capture and its webhook can both fire for the same order).
const creatingShipments = new Set<string>();

/**
 * Creates the order's Shiprocket shipments (one per seller) if it has none
 * yet. Called when a COD order is placed, when an online order's payment is
 * captured, and again when a seller packs an order whose earlier attempt
 * failed. An order that already has shipments is left alone, so it's safe to
 * call repeatedly.
 */
export const ensureOrderShipments = async (orderId: string): Promise<{ success: boolean; message?: string }> => {
  const key = String(orderId);
  if (creatingShipments.has(key)) {
    return { success: false, message: "The courier shipment is being created — please try again in a moment." };
  }
  creatingShipments.add(key);
  try {
    const order: any = await Order.findById(orderId);
    if (!order) return { success: false, message: "Order not found" };
    if (order.channel !== "ECommerce") return { success: false, message: "Only E-commerce orders are shipped by courier" };
    // Shipments a self-shipping seller entered don't count: those aren't on Shiprocket.
    const selfEntries: any[] = (order.shiprocketShipments || []).filter((s: any) => s.provider === "Self");
    const hasShiprocketShipment =
      (order.shiprocketShipments || []).some((s: any) => s.provider !== "Self") || order.shiprocket?.shipmentId;
    if (hasShiprocketShipment) return { success: true };
    if (order.paymentStatus !== "Paid" && order.paymentMethod !== "COD") {
      return { success: false, message: "The order's payment isn't complete yet." };
    }

    // Sellers who ship themselves get no Shiprocket shipment; only the rest do.
    const sellerIds = [...new Set((await OrderItem.find({ order: order._id }).select("seller").lean()).map((i: any) => String(i.seller)))];
    const companySellerIds = await companyShippedSellerIds(sellerIds);
    if (companySellerIds.length === 0) return { success: true };

    const result = await createShiprocketOrder(order, companySellerIds);
    if (result.success) {
      const status = result.isMock ? "Mock: Order Created" : "Order Created";
      const [primary] = result.shipments;
      // $set only these fields so a status change made meanwhile isn't overwritten.
      await Order.updateOne(
        { _id: order._id },
        {
          $set: {
            shiprocket: { orderId: primary.orderId, shipmentId: primary.shipmentId, status },
            shiprocketShipments: [
              ...selfEntries,
              ...result.shipments.map((s) => ({
                seller: s.seller,
                channelOrderId: s.channelOrderId,
                pickupLocation: s.pickupLocation,
                orderId: s.orderId,
                shipmentId: s.shipmentId,
                status,
                provider: "Shiprocket",
              })),
            ],
          },
        }
      );
    }
    if (result.message) {
      console.error(`[Shiprocket] Failed to create shipment(s) for order ${order.orderNumber}:`, result.message);
    }
    return { success: result.success, message: result.message };
  } catch (err: any) {
    console.error("[Shiprocket] Unexpected error creating shipment:", err);
    return { success: false, message: err?.message || "Could not create the courier shipment" };
  } finally {
    creatingShipments.delete(key);
  }
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
  let order: any = await Order.findById(orderId);
  if (!order) return { success: false, message: "Order not found" };
  if (order.channel !== "ECommerce") return { success: false, message: "Only E-commerce orders are shipped by courier" };
  if ((await getSellerShippingMethod(sellerId)) === "Self") {
    return { success: false, message: "You ship your orders yourself. Enter the courier and tracking number instead." };
  }

  let { shipment, index } = findSellerShipment(order, sellerId);
  if (!shipment?.shipmentId) {
    // The shipment wasn't created when the order was placed/paid (e.g. Shiprocket was down) — try now.
    const created = await ensureOrderShipments(orderId);
    order = await Order.findById(orderId);
    ({ shipment, index } = findSellerShipment(order, sellerId));
    if (!shipment?.shipmentId) {
      return {
        success: false,
        message: created.message || "The courier shipment for this order hasn't been created on Shiprocket yet. Please contact support.",
      };
    }
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
