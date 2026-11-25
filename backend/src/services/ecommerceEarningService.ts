import OrderItem from "../models/OrderItem";
import Seller from "../models/Seller";
import { getOrderItemCommissionRate } from "./commissionService";
import { parcelCharge } from "./shippingChargeService";
import { getSellerShippingMethod } from "./sellerShippingService";

/**
 * What each seller keeps on an E-commerce order: item price − commission − courier charge
 * (By Company only; Exnshop pays the courier and takes it back from the seller). Before a
 * COD order is delivered no courier charge is recorded yet, so it is worked out from the
 * products' weight and size with the same rate card.
 */
export interface SellerEcomEarning {
  sellerId: string;
  sellerName: string;
  shippingMethod: "Self" | "Company";
  itemTotal: number;
  commission: number;
  courierCharge: number;
  courierEstimated: boolean;
  net: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const ecommerceSellerEarnings = async (orderId: string, onlySellerId?: string): Promise<SellerEcomEarning[]> => {
  const filter: any = { order: orderId, status: { $ne: "Cancelled" } };
  if (onlySellerId) filter.seller = onlySellerId;
  const items: any[] = await OrderItem.find(filter).select("seller product quantity total commissionRate shippingCharge").lean();
  const bySeller = new Map<string, any[]>();
  for (const it of items) bySeller.set(String(it.seller), [...(bySeller.get(String(it.seller)) || []), it]);

  const out: SellerEcomEarning[] = [];
  for (const [sellerId, list] of bySeller) {
    const seller: any = await Seller.findById(sellerId).select("storeName sellerName").lean();
    const method = await getSellerShippingMethod(sellerId);
    let itemTotal = 0;
    let commission = 0;
    let recorded = 0;
    for (const it of list) {
      const rate = it.commissionRate || (await getOrderItemCommissionRate(String(it.product), sellerId));
      itemTotal += Number(it.total) || 0;
      commission += ((Number(it.total) || 0) * rate) / 100;
      recorded += Number(it.shippingCharge) || 0;
    }
    let courierCharge = 0;
    let courierEstimated = false;
    if (method === "Company") {
      if (recorded > 0) courierCharge = recorded;
      else {
        courierCharge = await parcelCharge(list.map((i) => ({ product: i.product, quantity: i.quantity })));
        courierEstimated = true;
      }
    }
    out.push({
      sellerId,
      sellerName: seller?.storeName || seller?.sellerName || "Seller",
      shippingMethod: method,
      itemTotal: r2(itemTotal),
      commission: r2(commission),
      courierCharge: r2(courierCharge),
      courierEstimated,
      net: r2(itemTotal - commission - courierCharge),
    });
  }
  return out;
};
