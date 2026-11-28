import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Seller from "../models/Seller";
import { getOrderItemCommissionRate } from "./commissionService";
import { sellerCourierCharge } from "./courierChargeService";
import { getSellerShippingMethod } from "./sellerShippingService";

/**
 * What each seller keeps on an E-commerce order: item price − commission − courier charge
 * (By Company only; Exnshop pays the courier and takes it back from the seller). The courier
 * charge is what Shiprocket charges once the courier is booked, and Shiprocket's live price
 * before that (see courierChargeService). A cancelled order earns nothing and costs nothing.
 */
export interface SellerEcomEarning {
  sellerId: string;
  sellerName: string;
  shippingMethod: "Self" | "Company";
  itemTotal: number;
  commission: number;
  courierCharge: number;
  courierEstimated: boolean;
  courierSource: "shiprocket" | "shiprocket-quote" | "rate-card" | "none";
  courierName?: string;
  courierMode?: "Surface" | "Air";
  cancelled: boolean;
  net: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const CANCELLED_ORDER = new Set(["Cancelled", "Rejected"]);

export const ecommerceSellerEarnings = async (orderId: string, onlySellerId?: string): Promise<SellerEcomEarning[]> => {
  const order: any = await Order.findById(orderId).select("status").lean();
  const orderCancelled = CANCELLED_ORDER.has(order?.status);

  const filter: any = { order: orderId };
  if (onlySellerId) filter.seller = onlySellerId;
  const items: any[] = await OrderItem.find(filter).select("seller product quantity total commissionRate status").lean();
  const bySeller = new Map<string, any[]>();
  for (const it of items) bySeller.set(String(it.seller), [...(bySeller.get(String(it.seller)) || []), it]);

  const out: SellerEcomEarning[] = [];
  for (const [sellerId, all] of bySeller) {
    const seller: any = await Seller.findById(sellerId).select("storeName sellerName").lean();
    const method = await getSellerShippingMethod(sellerId);
    const list = orderCancelled ? [] : all.filter((i) => i.status !== "Cancelled");
    let itemTotal = 0;
    let commission = 0;
    for (const it of list) {
      const rate = it.commissionRate || (await getOrderItemCommissionRate(String(it.product), sellerId));
      itemTotal += Number(it.total) || 0;
      commission += ((Number(it.total) || 0) * rate) / 100;
    }
    const courier =
      method === "Company" && list.length > 0
        ? await sellerCourierCharge(orderId, sellerId)
        : { charge: 0, estimated: false, source: "none" as const, courierName: undefined, courierMode: undefined };
    out.push({
      sellerId,
      sellerName: seller?.storeName || seller?.sellerName || "Seller",
      shippingMethod: method,
      itemTotal: r2(itemTotal),
      commission: r2(commission),
      courierCharge: r2(courier.charge),
      courierEstimated: courier.estimated,
      courierSource: courier.source,
      courierName: courier.courierName,
      courierMode: courier.courierMode,
      cancelled: list.length === 0,
      net: r2(itemTotal - commission - courier.charge),
    });
  }
  return out;
};
