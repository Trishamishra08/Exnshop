import Product from "../models/Product";

/**
 * Helpers for exchange requests. An exchange swaps an item for another variant
 * (size/colour) of the SAME product from the SAME seller. To avoid price
 * differences to collect or refund, only variants priced the same as the one
 * bought are offered.
 */

export const variantLabel = (v: any): string => [v?.name, v?.value].filter(Boolean).join(": ") || String(v?._id || "");
const priceOf = (v: any): number => (Number(v?.discPrice) > 0 ? Number(v.discPrice) : Number(v?.price) || 0);

/** Index of the variation an order item was bought as (matched by id, value or title, like the replacement order does). */
export const boughtVariationIndex = (product: any, itemVariation?: string): number =>
  (product?.variations || []).findIndex(
    (v: any) => itemVariation && (String(v._id) === String(itemVariation) || v.value === itemVariation || v.title === itemVariation),
  );

export interface ExchangeOption {
  id: string;
  label: string;
  stock: number;
}

export interface ExchangeOptions {
  current: string | null;
  canChooseVariant: boolean;
  options: ExchangeOption[];
}

/** Variants a customer can switch to: other variants of the product with the same price and units in stock. */
export const exchangeOptionsFor = async (item: { product: any; variation?: string }): Promise<ExchangeOptions> => {
  const product: any = await Product.findById(item.product?._id || item.product).select("variations").lean();
  const variations: any[] = product?.variations || [];
  if (variations.length < 2) return { current: null, canChooseVariant: false, options: [] };

  const idx = boughtVariationIndex(product, item.variation);
  const bought = idx >= 0 ? variations[idx] : null;
  const options = variations
    .filter((v, i) => i !== idx && (Number(v.stock) || 0) > 0 && v.status !== "Sold out" && (!bought || Math.abs(priceOf(v) - priceOf(bought)) < 0.01))
    .map((v) => ({ id: String(v._id), label: variantLabel(v), stock: Number(v.stock) || 0 }));
  return { current: bought ? variantLabel(bought) : null, canChooseVariant: true, options };
};

/** Seller-fault reasons: the seller bears the return pickup cost when the exchange is valid. */
export const isSellerFaultReason = (reason?: string) => /defect|damag|wrong|quality/i.test(reason || "");

/** Reasons that need photo proof before the request can be filed. */
export const needsPhotoProof = (reason?: string) => /defect|damag|wrong/i.test(reason || "");
