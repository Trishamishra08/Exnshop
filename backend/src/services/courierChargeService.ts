import Commission from "../models/Commission";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Seller from "../models/Seller";
import { parcelForItems, quoteCouriers, resolveSellerAddress, type CourierQuote } from "./shiprocketService";
import { allocateByValue, parcelCharge } from "./shippingChargeService";

/**
 * The courier charge a "By Company" seller pays for their parcel on an E-commerce order,
 * from one place so the seller panel, the admin panel and the earning records agree:
 *
 * 1. Once the AWB is booked: what Shiprocket charges for the courier it booked (saved on the shipment).
 * 2. Before that: Shiprocket's live price for the courier we will book (cheapest surface courier).
 * 3. Only when Shiprocket can't quote (test mode, API down): the admin rate card.
 */

const sameId = (a: any, b: any) => Boolean(a && b) && String(a?._id || a) === String(b?._id || b);

/** The shipment entry for one seller's items (mock and older orders may carry no seller on it). */
export const findSellerShipment = (order: any, sellerId: string) => {
  const shipments: any[] = order.shiprocketShipments || [];
  const index = shipments.findIndex((s) => sameId(s.seller, sellerId));
  if (index >= 0) return { shipment: shipments[index], index };
  if (shipments.length === 1 && !shipments[0].seller) return { shipment: shipments[0], index: 0 };
  if (shipments.length === 0 && order.shiprocket?.shipmentId) return { shipment: order.shiprocket, index: -1 };
  return { shipment: undefined, index: -1 };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

// Quotes per order+seller for a while, so opening an order doesn't call Shiprocket every time.
const QUOTE_TTL_MS = 30 * 60 * 1000;
const quoteCache = new Map<string, { at: number; quotes: CourierQuote[] }>();

/** Shiprocket's couriers for this seller's parcel on this order, cheapest surface courier first. */
export const quoteSellerParcel = async (
  orderId: string,
  sellerId: string,
  opts: { fresh?: boolean } = {}
): Promise<CourierQuote[]> => {
  const key = `${orderId}:${sellerId}`;
  const hit = quoteCache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < QUOTE_TTL_MS) return hit.quotes;

  const order: any = await Order.findById(orderId).select("deliveryAddress paymentMethod").lean();
  const seller: any = await Seller.findById(sellerId);
  const items: any[] = await OrderItem.find({ order: orderId, seller: sellerId, status: { $ne: "Cancelled" } })
    .select("product quantity total")
    .lean();
  if (!order || !seller || items.length === 0) return [];

  const pickup = await resolveSellerAddress(seller).catch(() => null);
  const quotes = await quoteCouriers({
    pickupPincode: pickup?.pincode || "",
    deliveryPincode: String(order.deliveryAddress?.pincode || ""),
    parcel: await parcelForItems(items),
    cod: String(order.paymentMethod || "").toUpperCase() === "COD",
    declaredValue: items.reduce((t, i) => t + (Number(i.total) || 0), 0),
  });
  if (quotes.length) quoteCache.set(key, { at: Date.now(), quotes });
  return quotes;
};

export interface SellerCourierCharge {
  charge: number;
  /** False once the AWB is booked and the figure is what Shiprocket charged. */
  estimated: boolean;
  source: "shiprocket" | "shiprocket-quote" | "rate-card";
  courierName?: string;
  courierMode?: "Surface" | "Air";
}

/** The courier charge for this seller's parcel on this order (see the file comment for the order of sources). */
export const sellerCourierCharge = async (orderId: string, sellerId: string): Promise<SellerCourierCharge> => {
  const order: any = await Order.findById(orderId).select("shiprocketShipments shiprocket").lean();
  const { shipment } = order ? findSellerShipment(order, sellerId) : { shipment: undefined };
  if (shipment && typeof shipment.courierCharge === "number") {
    return {
      charge: r2(shipment.courierCharge),
      estimated: false,
      source: "shiprocket",
      courierName: shipment.courierName,
      courierMode: shipment.courierMode,
    };
  }

  const [best] = await quoteSellerParcel(orderId, sellerId);
  if (best) {
    return { charge: best.charge, estimated: true, source: "shiprocket-quote", courierName: best.courierName, courierMode: best.mode };
  }

  const items: any[] = await OrderItem.find({ order: orderId, seller: sellerId, status: { $ne: "Cancelled" } })
    .select("product quantity")
    .lean();
  return { charge: await parcelCharge(items), estimated: true, source: "rate-card" };
};

/**
 * Saves what Shiprocket charged for this seller's parcel onto the seller's items and their
 * not-yet-settled earning records, so the amount taken from the seller is the same amount
 * Shiprocket took from the Exnshop wallet.
 */
export const applyCourierChargeToEarnings = async (orderId: string, sellerId: string, charge: number) => {
  const items: any[] = await OrderItem.find({ order: orderId, seller: sellerId, status: { $ne: "Cancelled" } });
  if (items.length === 0) return;
  const parts = allocateByValue(r2(charge), items.map((i) => Number(i.total) || 0));
  for (let i = 0; i < items.length; i++) {
    items[i].shippingCharge = parts[i];
    await items[i].save();
    // Only records still Pending: anything on hold or paid has already moved money.
    await Commission.updateMany(
      { orderItem: items[i]._id, type: "SELLER", status: "Pending" },
      { $set: { shippingCharge: parts[i] } }
    );
  }
};
