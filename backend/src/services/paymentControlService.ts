import AppSettings from "../models/AppSettings";
import Seller from "../models/Seller";

/**
 * Admin switches for how customers can pay:
 * - Online gateways (Razorpay, Cashfree) on/off for the whole app. Unset = on.
 * - Cash on Delivery off for a seller who delivers/ships their own orders ("Self").
 */

export type OnlineGateway = "razorpay" | "cashfree";

export const getOnlineGateways = async (): Promise<Record<OnlineGateway, boolean>> => {
  const s: any = await AppSettings.findOne().select("paymentGateways").lean();
  return {
    razorpay: s?.paymentGateways?.razorpay?.enabled !== false,
    cashfree: s?.paymentGateways?.cashfree?.enabled !== false,
  };
};

export const setOnlineGateways = async (input: Partial<Record<OnlineGateway, boolean>>) => {
  const set: Record<string, boolean> = {};
  for (const g of ["razorpay", "cashfree"] as const) {
    if (typeof input[g] === "boolean") set[`paymentGateways.${g}.enabled`] = input[g] as boolean;
  }
  if (Object.keys(set).length === 0) {
    throw Object.assign(new Error("Send razorpay and/or cashfree as true or false"), { statusCode: 400 });
  }
  await AppSettings.updateOne({}, { $set: set }, { upsert: true });
  return getOnlineGateways();
};

/** Throws when the customer picked a gateway the admin has switched off. */
export const assertGatewayEnabled = async (gateway: OnlineGateway) => {
  const on = await getOnlineGateways();
  if (!on[gateway]) {
    const name = gateway === "razorpay" ? "Razorpay" : "Cashfree";
    throw Object.assign(new Error(`${name} payments are switched off right now. Please choose another payment option.`), { statusCode: 400 });
  }
};

/** Sellers on self delivery for whom the admin switched Cash on Delivery off. */
export const codOffSellerIds = async (): Promise<string[]> =>
  (await Seller.find({ shippingMethod: "Self", selfCodDisabled: true }).distinct("_id")).map(String);

/** Throws when Cash on Delivery isn't allowed for any of these sellers' items. */
export const assertCodAllowedForSellers = async (sellerIds: string[]) => {
  const ids = [...new Set(sellerIds.filter(Boolean).map(String))];
  if (ids.length === 0) return;
  const blocked: any[] = await Seller.find({ _id: { $in: ids }, shippingMethod: "Self", selfCodDisabled: true })
    .select("storeName")
    .lean();
  if (blocked.length) {
    const names = blocked.map((s) => s.storeName || "this seller").join(", ");
    throw Object.assign(
      new Error(`Cash on Delivery isn't available for items from ${names}. Please pay online.`),
      { statusCode: 400 },
    );
  }
};
