import mongoose from "mongoose";
import Seller from "../models/Seller";

export type CommerceChannel = "Quick" | "ECommerce";

/**
 * Parses the customer app's lowercase `mode` query param ("quick"/"ecommerce")
 * into the canonical CommerceChannel used everywhere else. Returns undefined
 * for anything else (including absent/malformed), meaning "no channel filter."
 */
export const parseChannelQueryParam = (
  mode: unknown
): CommerceChannel | undefined => {
  if (mode === "quick") return "Quick";
  if (mode === "ecommerce") return "ECommerce";
  return undefined;
};

/**
 * Narrows a location-filtered seller ID list down to only those sellers who
 * actually sell in the given channel. Without this, a seller registered only
 * for Quick (rider) delivery shows up while the customer is browsing in
 * ECommerce ("Shop All") mode, and vice versa — the two tabs are supposed to
 * be separate catalogs, not a merged one.
 */
export const filterSellerIdsByChannel = async (
  sellerIds: mongoose.Types.ObjectId[],
  channel: CommerceChannel | undefined
): Promise<mongoose.Types.ObjectId[]> => {
  if (!channel || sellerIds.length === 0) return sellerIds;
  return Seller.find({ _id: { $in: sellerIds }, channels: channel }).distinct(
    "_id"
  );
};

/**
 * Resolves which single channel a product's cart/order line belongs to, from
 * its seller's enabled channels. A seller enabled for both channels defaults
 * to Quick — this is the one rule used consistently by the cart (addToCart)
 * and by order creation (createOrder) so an item lands in the same channel
 * whether being added to cart or checked out.
 */
export const resolveSellerChannel = (
  sellerChannels: string[] | undefined | null,
  preferredChannel?: CommerceChannel | null
): CommerceChannel => {
  const channels = Array.isArray(sellerChannels) ? sellerChannels : [];
  if (channels.length === 0) return "Quick";
  // Seller supports only one channel — that's authoritative regardless of
  // what the caller prefers.
  if (channels.length === 1) return channels[0] as CommerceChannel;
  // Seller supports both — honor the caller's preference (e.g. which page/
  // cart the customer is actually acting from) when it's one of the
  // seller's enabled channels, instead of always defaulting to Quick.
  if (preferredChannel && channels.includes(preferredChannel)) {
    return preferredChannel;
  }
  return channels.includes("Quick") ? "Quick" : "ECommerce";
};
