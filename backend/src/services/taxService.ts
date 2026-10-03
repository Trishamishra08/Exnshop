import mongoose from "mongoose";
import Category from "../models/Category";

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
 * Computes per-item GST from each item's own category tax rate, instead of
 * one flat marketplace-wide rate. A category with no tax assigned, or whose
 * tax is Inactive, charges 0% — deliberately strict, so a misconfigured
 * category is immediately visible (customers pay no tax on it) rather than
 * silently papered over by a fallback rate.
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

  const categories = categoryIds.length
    ? await Category.find({ _id: { $in: categoryIds } }).populate(
        "taxId",
        "percentage status"
      )
    : [];

  const rateByCategory = new Map<string, number>();
  for (const cat of categories) {
    const tax = cat.taxId as any;
    const rate = tax && tax.status === "Active" ? Number(tax.percentage) || 0 : 0;
    rateByCategory.set((cat._id as mongoose.Types.ObjectId).toString(), rate);
  }

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
