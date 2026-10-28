/**
 * Product variants, stored as:
 *   Product (parent)
 *     → variantAxes      the attributes and their options, e.g. Color [Black, White], Size [S, M]
 *     → variations[]     one entry per combination: its options, SKU, MRP (price), selling price
 *                         (discPrice), stock, weight, photos and whether it is on sale (isActive)
 *
 * Used by the admin variant manager; the seller product form applies the same rules.
 */

export const MAX_VARIANT_AXES = 3;
export const MAX_VARIANTS = 100;
const MAX_OPTION_PHOTOS = 8;

export type VariantAxis = { name: string; values: string[] };
export type VariantOption = { name: string; value: string };

const cleanImages = (images: unknown): string[] | undefined =>
  Array.isArray(images) ? images.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, MAX_OPTION_PHOTOS) : undefined;

/** Attributes a product varies by: at most 3, each named with at least one option, no repeats. */
export const cleanVariantAxes = (axes: unknown): { axes?: VariantAxis[]; error?: string } => {
  if (!Array.isArray(axes) || axes.length === 0) return { axes: undefined };
  if (axes.length > MAX_VARIANT_AXES) return { error: `A product can vary by at most ${MAX_VARIANT_AXES} attributes` };
  const clean = axes.map((a: any) => ({
    name: String(a?.name || "").trim(),
    values: [...new Set<string>((Array.isArray(a?.values) ? a.values : []).map((v: any) => String(v).trim()).filter(Boolean))],
  }));
  if (clean.some((a) => !a.name || a.values.length === 0)) return { error: "Every attribute needs a name and at least one option" };
  if (new Set(clean.map((a) => a.name.toLowerCase())).size !== clean.length) return { error: "Each attribute can be used only once" };
  return { axes: clean };
};

/** A combination's own value for every attribute, in attribute order; null when one is missing or not offered. */
export const cleanVariationOptions = (options: unknown, axes: VariantAxis[]): VariantOption[] | null => {
  const given = Array.isArray(options) ? options : [];
  const picked = axes.map((axis) => {
    const match = given.find((o: any) => String(o?.name || "").trim() === axis.name);
    const value = String(match?.value || "").trim();
    return axis.values.includes(value) ? { name: axis.name, value } : null;
  });
  return picked.every(Boolean) ? (picked as VariantOption[]) : null;
};

/** Attributes shown to customers as one choice (e.g. RAM + Storage): real attributes only, at least two. */
export const cleanCombinedAxes = (raw: unknown, axes: VariantAxis[] | undefined): string[] => {
  if (!axes || !Array.isArray(raw)) return [];
  const wanted = new Set(raw.map((n) => String(n).trim()));
  const names = axes.map((a) => a.name).filter((n) => wanted.has(n));
  return names.length >= 2 ? names : [];
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export interface NormalizedVariants {
  variantAxes?: VariantAxis[];
  combinedAxes: string[];
  variationType?: string;
  variations: any[];
  /** Kept in step with the first on-sale variant, for lists and older screens. */
  price: number;
  discPrice: number;
  stock: number;
}

/**
 * Checks and cleans a whole set of variants. Returns an error message for the
 * first problem found, so the admin/seller can fix it.
 */
export const normalizeVariants = (input: {
  variantAxes?: unknown;
  combinedAxes?: unknown;
  variations?: unknown;
  variationType?: unknown;
}): { error: string } | { data: NormalizedVariants } => {
  const { axes, error } = cleanVariantAxes(input.variantAxes);
  if (error) return { error };

  const raw = Array.isArray(input.variations) ? input.variations : [];
  if (raw.length === 0) return { error: "Add at least one variant with a price" };
  if (raw.length > MAX_VARIANTS) return { error: `A product can have at most ${MAX_VARIANTS} variants` };

  const variations: any[] = [];
  for (const v of raw as any[]) {
    const options = axes ? cleanVariationOptions(v?.options, axes) : undefined;
    if (axes && !options) return { error: "Every variant needs an option for each attribute" };

    const title = options ? options.map((o) => o.value).join(" / ") : String(v?.title || v?.value || "Default").trim() || "Default";
    const price = num(v?.price);
    const discPrice = v?.discPrice === "" || v?.discPrice === undefined || v?.discPrice === null ? 0 : num(v?.discPrice);
    const stock = v?.stock === "" || v?.stock === undefined || v?.stock === null ? 0 : num(v?.stock);
    const weightGrams = v?.weightGrams === "" || v?.weightGrams === undefined || v?.weightGrams === null ? undefined : num(v?.weightGrams);

    if (!(price > 0)) return { error: `Enter the MRP for ${title}` };
    if (!(discPrice >= 0)) return { error: `The selling price for ${title} is not valid` };
    if (discPrice > price) return { error: `The selling price for ${title} can't be more than its MRP` };
    if (!(stock >= 0) || !Number.isInteger(stock)) return { error: `Stock for ${title} must be a whole number (0 = unlimited)` };
    if (weightGrams !== undefined && !(weightGrams >= 0)) return { error: `The weight for ${title} is not valid` };

    variations.push({
      ...(v?._id ? { _id: v._id } : {}),
      name: axes ? axes.map((a) => a.name).join(" / ") : String(v?.name || "Variation"),
      value: title,
      title,
      price,
      discPrice,
      stock,
      sku: String(v?.sku || "").trim() || undefined,
      weightGrams,
      isActive: v?.isActive !== false,
      status: v?.status === "Sold out" ? "Sold out" : "Available",
      images: axes ? cleanImages(v?.images) : undefined,
      options: options || undefined,
    });
  }

  if (axes) {
    const keys = variations.map((v) => v.options.map((o: VariantOption) => o.value).join("\u0000"));
    if (new Set(keys).size !== keys.length) return { error: "The same combination is listed twice" };
  }
  const skus = variations.map((v) => v.sku).filter(Boolean);
  const dupe = skus.find((s, i) => skus.indexOf(s) !== i);
  if (dupe) return { error: `SKU "${dupe}" is used by more than one variant` };
  if (!variations.some((v) => v.isActive)) return { error: "Keep at least one variant switched on" };

  const lead = variations.find((v) => v.isActive) || variations[0];
  return {
    data: {
      variantAxes: axes,
      combinedAxes: cleanCombinedAxes(input.combinedAxes, axes),
      variationType: axes ? axes.map((a) => a.name).join(" / ") : (String(input.variationType || "").trim() || undefined),
      variations,
      price: lead.price,
      discPrice: lead.discPrice || 0,
      stock: variations.filter((v) => v.isActive).reduce((sum, v) => sum + (v.stock || 0), 0),
    },
  };
};
