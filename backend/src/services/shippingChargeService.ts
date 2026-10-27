import AppSettings from "../models/AppSettings";
import Product from "../models/Product";

/**
 * What a courier shipment costs the seller. One rate card (admin-editable in
 * AppSettings.shippingRates) drives every shipping charge: the outbound parcel
 * of a company-shipped order, and the pickup of a customer return. The charge
 * is on the chargeable weight: the larger of the real weight and the volumetric
 * weight (L × W × H ÷ divisor), as couriers bill.
 */

export interface ShippingRates {
  baseCharge: number;
  baseWeightGrams: number;
  perExtraSlabCharge: number;
  slabGrams: number;
  volumetricDivisor: number;
}

export const DEFAULT_SHIPPING_RATES: ShippingRates = {
  baseCharge: 50,
  baseWeightGrams: 500,
  perExtraSlabCharge: 25,
  slabGrams: 500,
  volumetricDivisor: 5000,
};

// Products listed before weight/size existed ship as a 500 g parcel (same fallback as the courier booking).
const FALLBACK_GRAMS = 500;

const round2 = (n: number) => Math.round(n * 100) / 100;

export const getShippingRates = async (): Promise<ShippingRates> => {
  const settings: any = await AppSettings.findOne().select("shippingRates").lean();
  return { ...DEFAULT_SHIPPING_RATES, ...(settings?.shippingRates || {}) };
};

export interface ShippingProductInfo {
  weightGrams?: number;
  dimensionsCm?: { length?: number; width?: number; height?: number };
}

/** Chargeable grams for `quantity` units of a product. */
export const chargeableGrams = (product: ShippingProductInfo | null | undefined, quantity: number, rates: ShippingRates): number => {
  const qty = Math.max(1, Number(quantity) || 1);
  const actual = (product?.weightGrams && product.weightGrams > 0 ? product.weightGrams : FALLBACK_GRAMS) * qty;
  const d = product?.dimensionsCm;
  const volumetric =
    d?.length && d?.width && d?.height ? ((d.length * d.width * d.height) / rates.volumetricDivisor) * 1000 * qty : 0;
  return Math.ceil(Math.max(actual, volumetric));
};

export const chargeForGrams = (grams: number, rates: ShippingRates): number => {
  if (grams <= 0) return 0;
  const extra = Math.max(0, grams - rates.baseWeightGrams);
  return round2(rates.baseCharge + Math.ceil(extra / rates.slabGrams) * rates.perExtraSlabCharge);
};

/** Charge for one parcel made of several items (all of one seller's items on an order). */
export const parcelCharge = async (items: Array<{ product?: any; quantity?: number }>): Promise<number> => {
  if (items.length === 0) return 0;
  const rates = await getShippingRates();
  const ids = items.map((i) => i.product).filter(Boolean);
  const products: any[] = await Product.find({ _id: { $in: ids } }).select("weightGrams dimensionsCm").lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const grams = items.reduce((sum, i) => sum + chargeableGrams(byId.get(String(i.product)), Number(i.quantity) || 1, rates), 0);
  return chargeForGrams(grams, rates);
};

/** Charge for sending back `quantity` units of one product (a customer return pickup). */
export const returnPickupCharge = async (productId: any, quantity: number): Promise<number> => {
  const rates = await getShippingRates();
  const product: any = productId ? await Product.findById(productId).select("weightGrams dimensionsCm").lean() : null;
  return chargeForGrams(chargeableGrams(product, quantity, rates), rates);
};

/** Preview for the product listing form. */
export const previewShippingCharge = async (input: {
  weightGrams?: number;
  dimensionsCm?: { length?: number; width?: number; height?: number };
}) => {
  const rates = await getShippingRates();
  const grams = chargeableGrams(input, 1, rates);
  return { chargeableGrams: grams, charge: chargeForGrams(grams, rates), rates };
};

/** Spreads a parcel charge over its items in proportion to their value, so the parts add up exactly. */
export const allocateByValue = (total: number, values: number[]): number[] => {
  const sum = values.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return values.map(() => 0);
  let allocated = 0;
  return values.map((v, i) => {
    if (i === values.length - 1) return round2(total - allocated);
    const part = round2((total * v) / sum);
    allocated += part;
    return part;
  });
};
