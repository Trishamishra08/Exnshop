import mongoose from "mongoose";
import Category from "../models/Category";
import HeaderCategory from "../models/HeaderCategory";

export interface GstLineInput {
  orderItemId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId | null;
  itemTotal: number;
}

export interface GstLineResult {
  orderItemId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId | null;
  gstRate: number;
  gstAmount: number;
}

/**
 * GST % for each category id. A category without its own active tax uses its parent's
 * (then grand-parent's…), so the admin can set GST once on a top-level category for
 * everything under it. No tax anywhere up the tree = 0%.
 */
export async function gstRatesForCategories(categoryIds: string[]): Promise<Map<string, number>> {
  const rateByCategory = new Map<string, number>();
  if (categoryIds.length === 0) return rateByCategory;
  const ownRate = (cat: any): number | null => {
    const tax = cat?.taxId as any;
    return tax && tax.status === "Active" ? Number(tax.percentage) || 0 : null;
  };
  const categories: any[] = await Category.find({ _id: { $in: categoryIds } }).populate("taxId", "percentage status");
  const headerRate = new Map<string, number | null>();
  for (const cat of categories) {
    let rate = ownRate(cat);
    let headerId = cat.headerCategoryId ? String(cat.headerCategoryId) : "";
    let parentId = cat.parentId;
    for (let depth = 0; rate === null && parentId && depth < 5; depth++) {
      const parent: any = await Category.findById(parentId).select("taxId parentId headerCategoryId").populate("taxId", "percentage status");
      if (!parent) break;
      rate = ownRate(parent);
      if (!headerId && parent.headerCategoryId) headerId = String(parent.headerCategoryId);
      parentId = parent.parentId;
    }
    // Still none: the header category's GST (e.g. "Home & Kitchen"), if the admin set one.
    if (rate === null && headerId) {
      if (!headerRate.has(headerId)) {
        const header: any = await HeaderCategory.findById(headerId).select("taxId").populate("taxId", "percentage status");
        headerRate.set(headerId, ownRate(header));
      }
      rate = headerRate.get(headerId) ?? null;
    }
    rateByCategory.set((cat._id as mongoose.Types.ObjectId).toString(), rate ?? 0);
  }
  return rateByCategory;
}

/**
 * Computes per-item GST from each item's category tax rate (inherited from the
 * parent category when the category has none), instead of one flat
 * marketplace-wide rate. No tax anywhere up the tree charges 0%.
 */
export async function computeItemGst(
  lines: GstLineInput[],
  productSubtotalForCoupon: number,
  discountAmount: number,
  gstEnabled: boolean
): Promise<{ lines: GstLineResult[]; totalGst: number }> {
  if (!gstEnabled || lines.length === 0) {
    return {
      lines: lines.map((l) => ({
        orderItemId: l.orderItemId,
        categoryId: l.categoryId,
        gstRate: 0,
        gstAmount: 0,
      })),
      totalGst: 0,
    };
  }

  const categoryIds = Array.from(
    new Set(lines.filter((l) => l.categoryId).map((l) => l.categoryId!.toString()))
  );

  const rateByCategory = await gstRatesForCategories(categoryIds);

  let totalGst = 0;
  const results: GstLineResult[] = lines.map((line) => {
    // Pro-rata this line's share of the whole-cart coupon discount, so the
    // taxable base reflects what the customer actually pays for this item.
    const taxableBase =
      productSubtotalForCoupon > 0
        ? Math.max(
            0,
            line.itemTotal -
              (line.itemTotal / productSubtotalForCoupon) * discountAmount
          )
        : Math.max(0, line.itemTotal - discountAmount);

    const gstRate = line.categoryId
      ? rateByCategory.get(line.categoryId.toString()) || 0
      : 0;
    const gstAmount = Number(((taxableBase * gstRate) / 100).toFixed(2));
    totalGst += gstAmount;

    return {
      orderItemId: line.orderItemId,
      categoryId: line.categoryId,
      gstRate,
      gstAmount,
    };
  });

  return { lines: results, totalGst: Number(totalGst.toFixed(2)) };
}

/**
 * The GST % checkout will charge for a product in this category, and where it comes
 * from (the category itself, a parent category, or the header category), for the
 * seller's product form.
 */
export async function describeCategoryGst(categoryId: string): Promise<{ rate: number; source: string }> {
  if (!categoryId || !mongoose.isValidObjectId(categoryId)) return { rate: 0, source: "" };
  const own = (doc: any): number | null => {
    const tax = doc?.taxId as any;
    return tax && tax.status === "Active" ? Number(tax.percentage) || 0 : null;
  };
  let cat: any = await Category.findById(categoryId).select("name taxId parentId headerCategoryId").populate("taxId", "percentage status");
  let headerId = "";
  for (let depth = 0; cat && depth < 6; depth++) {
    const rate = own(cat);
    if (rate !== null) return { rate, source: depth === 0 ? `category "${cat.name}"` : `parent category "${cat.name}"` };
    if (!headerId && cat.headerCategoryId) headerId = String(cat.headerCategoryId);
    cat = cat.parentId
      ? await Category.findById(cat.parentId).select("name taxId parentId headerCategoryId").populate("taxId", "percentage status")
      : null;
  }
  if (headerId) {
    const header: any = await HeaderCategory.findById(headerId).select("name taxId").populate("taxId", "percentage status");
    const rate = own(header);
    if (rate !== null) return { rate, source: `header category "${header.name}"` };
  }
  return { rate: 0, source: "" };
}
