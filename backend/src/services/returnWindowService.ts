import HeaderCategory from "../models/HeaderCategory";

/**
 * How many days after delivery a customer can return or exchange a product.
 *
 * The admin sets it per header category (Admin → Header Category). A header
 * category without its own value uses the marketplace default from settings.
 * Sellers do not choose it.
 */
export const returnWindowForProduct = async (
  product: { headerCategoryId?: any } | null | undefined,
  settings?: { returnConfig?: { defaultReturnWindowDays?: number } } | null
): Promise<number> => {
  const fallback = settings?.returnConfig?.defaultReturnWindowDays ?? 7;
  if (!product?.headerCategoryId) return fallback;
  const header: any = await HeaderCategory.findById(product.headerCategoryId).select("returnWindowDays").lean();
  const days = header?.returnWindowDays;
  return typeof days === "number" && days >= 0 ? days : fallback;
};
