import HeaderCategory from "../models/HeaderCategory";

/**
 * Resolve the list of HeaderCategory documents a seller is allowed to sell in.
 *
 * `Seller.categories` stores the category *names* the seller picked at signup
 * (a historical choice — not an ObjectId reference), so an admin renaming a
 * HeaderCategory afterwards breaks a naive exact `$in` match and silently
 * empties out the seller's category list. This helper matches case- and
 * whitespace-insensitively, and — if a seller has categories configured but
 * none of them resolve to a currently Published HeaderCategory (e.g. the
 * category was renamed or unpublished) — falls back to all Published
 * categories rather than leaving the seller with nothing to pick from.
 */
export const resolveSellerAllowedHeaderCategories = async (
  sellerCategoryNames: string[] | undefined | null
) => {
  const allPublished = () => HeaderCategory.find({ status: "Published" }).sort({ order: 1, name: 1 }).lean();

  if (!sellerCategoryNames || sellerCategoryNames.length === 0) {
    return allPublished();
  }

  const patterns = sellerCategoryNames
    .filter((name) => typeof name === "string" && name.trim())
    .map((name) => new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"));

  if (patterns.length === 0) {
    return allPublished();
  }

  const matched = await HeaderCategory.find({
    status: "Published",
    name: { $in: patterns },
  })
    .sort({ order: 1, name: 1 })
    .lean();

  if (matched.length > 0) {
    return matched;
  }

  // Nothing matched (likely renamed/unpublished since the seller registered) —
  // don't leave the seller stuck with an empty category picker.
  return allPublished();
};
