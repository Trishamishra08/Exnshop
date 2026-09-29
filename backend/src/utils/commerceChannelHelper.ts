export type CommerceChannel = "Quick" | "ECommerce";

/**
 * Resolves which single channel a product's cart/order line belongs to, from
 * its seller's enabled channels. A seller enabled for both channels defaults
 * to Quick — this is the one rule used consistently by the cart (addToCart)
 * and by order creation (createOrder) so an item lands in the same channel
 * whether being added to cart or checked out.
 */
export const resolveSellerChannel = (
  sellerChannels: string[] | undefined | null
): CommerceChannel => {
  const channels = Array.isArray(sellerChannels) ? sellerChannels : [];
  if (channels.length === 0) return "Quick";
  return channels.includes("Quick") ? "Quick" : "ECommerce";
};
