import mongoose from "mongoose";
import CategoryAttribute, { ICategoryAttribute } from "../models/CategoryAttribute";
import CategoryListingRule from "../models/CategoryListingRule";

export interface ListingScope {
  headerCategoryId?: any;
  category?: any;
  subcategory?: any;
  subSubCategory?: any;
}

export interface ResolvedAttribute {
  key: string;
  label: string;
  type: ICategoryAttribute["type"];
  isRequired: boolean;
  isVariantAttribute: boolean;
  isFilterable: boolean;
  isSearchable: boolean;
  allowedValues: string[];
  unit?: string;
  validation?: { min?: number; max?: number; pattern?: string };
  helpText?: string;
  group?: string;
  keySpec: boolean;
  keySpecFormat?: string;
  displayOrder: number;
}

export interface ResolvedRule {
  defaultHsn?: string;
  isRegulated: boolean;
  requiredDocs: Array<{ key: string; label: string }>;
}

export const idOf = (v: any): string | undefined => {
  if (!v) return undefined;
  const raw = typeof v === "object" && v._id ? v._id : v;
  const s = String(raw);
  return mongoose.isValidObjectId(s) ? s : undefined;
};

/** Broadest → most specific. A deeper level adds to, or overrides by key, the broader ones. */
const levels = (scope: ListingScope) =>
  [
    { type: "HeaderCategory" as const, id: idOf(scope.headerCategoryId) },
    { type: "Category" as const, id: idOf(scope.category) },
    { type: "Category" as const, id: idOf(scope.subcategory) },
    { type: "Category" as const, id: idOf(scope.subSubCategory) },
  ].filter((l): l is { type: "HeaderCategory" | "Category"; id: string } => Boolean(l.id));

export const resolveListingConfig = async (
  scope: ListingScope
): Promise<{ attributes: ResolvedAttribute[]; rule: ResolvedRule }> => {
  const lv = levels(scope);
  if (lv.length === 0) return { attributes: [], rule: { isRegulated: false, requiredDocs: [] } };

  const match = { $or: lv.map((l) => ({ scopeType: l.type, scopeId: l.id })) };
  const [attrDocs, ruleDocs] = await Promise.all([
    CategoryAttribute.find({ ...match, isActive: true }).lean(),
    CategoryListingRule.find(match).lean(),
  ]);

  const rank = (d: { scopeType: string; scopeId: any }) => lv.findIndex((l) => l.type === d.scopeType && l.id === String(d.scopeId));

  const byKey = new Map<string, any>();
  [...attrDocs].sort((a, b) => rank(a) - rank(b)).forEach((a) => byKey.set(a.key, a));
  const attributes: ResolvedAttribute[] = [...byKey.values()]
    .sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label))
    .map((a) => ({
      key: a.key,
      label: a.label,
      type: a.type,
      isRequired: a.isRequired,
      isVariantAttribute: a.isVariantAttribute,
      isFilterable: a.isFilterable,
      isSearchable: a.isSearchable,
      allowedValues: a.allowedValues || [],
      unit: a.unit,
      validation: a.validation,
      helpText: a.helpText,
      group: a.group,
      keySpec: a.keySpec === true,
      keySpecFormat: a.keySpecFormat,
      displayOrder: a.displayOrder,
    }));

  const rule: ResolvedRule = { isRegulated: false, requiredDocs: [] };
  const docs = new Map<string, string>();
  [...ruleDocs].sort((a, b) => rank(a) - rank(b)).forEach((r) => {
    if (r.defaultHsn) rule.defaultHsn = r.defaultHsn;
    if (r.isRegulated) rule.isRegulated = true;
    (r.requiredDocs || []).forEach((d: any) => docs.set(d.key, d.label));
  });
  rule.requiredDocs = rule.isRegulated ? [...docs.entries()].map(([key, label]) => ({ key, label })) : [];
  return { attributes, rule };
};

// ── Attribute values ────────────────────────────────────────

const isEmpty = (v: any) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Normalises the seller's values to the configured attributes (unknown keys are
 * dropped) and reports values that are present but invalid. Missing required
 * values are NOT reported here — drafts may be incomplete (see attributeProblems).
 */
export const cleanAttributes = (defs: ResolvedAttribute[], input: any): { values: Record<string, any>; errors: string[] } => {
  const values: Record<string, any> = {};
  const errors: string[] = [];
  if (!input || typeof input !== "object") return { values, errors };

  for (const d of defs) {
    const raw = input[d.key];
    if (isEmpty(raw)) continue;
    const bad = (why: string) => errors.push(`${d.label}: ${why}`);

    switch (d.type) {
      case "number": {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          bad("enter a number");
          break;
        }
        if (d.validation?.min !== undefined && n < d.validation.min) bad(`must be at least ${d.validation.min}`);
        else if (d.validation?.max !== undefined && n > d.validation.max) bad(`must be at most ${d.validation.max}`);
        else values[d.key] = n;
        break;
      }
      case "boolean":
        values[d.key] = raw === true || raw === "true";
        break;
      case "date": {
        const t = new Date(raw);
        if (isNaN(t.getTime())) bad("enter a valid date");
        else values[d.key] = t.toISOString().slice(0, 10);
        break;
      }
      case "select": {
        const v = String(raw).trim();
        if (d.allowedValues.length && !d.allowedValues.includes(v)) bad(`choose one of ${d.allowedValues.join(", ")}`);
        else values[d.key] = v;
        break;
      }
      case "multiselect": {
        const arr = (Array.isArray(raw) ? raw : [raw]).map((x) => String(x).trim()).filter(Boolean);
        const outside = arr.filter((x) => d.allowedValues.length && !d.allowedValues.includes(x));
        if (outside.length) bad(`"${outside[0]}" isn't an allowed value`);
        else values[d.key] = arr;
        break;
      }
      default: {
        const v = String(raw).trim();
        if (d.validation?.pattern) {
          try {
            if (!new RegExp(d.validation.pattern).test(v)) {
              bad("doesn't match the expected format");
              break;
            }
          } catch {
            /* an invalid admin-entered pattern must not block sellers */
          }
        }
        values[d.key] = v.slice(0, 300);
      }
    }
  }
  return { values, errors };
};

const DEFAULT_GROUP = "Details";

const formatValue = (a: ResolvedAttribute, v: any): string => {
  let text: string;
  if (Array.isArray(v)) text = v.join(", ");
  else if (typeof v === "boolean") text = v ? "Yes" : "No";
  else if (a.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
    text = new Date(`${v}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  } else text = String(v);
  return a.unit ? `${text} ${a.unit}` : text;
};

export interface SpecGroup {
  title: string;
  items: Array<{ label: string; value: string; keySpec: boolean; keyText?: string }>;
}

/**
 * Turns a product's attribute values into the sections shown on the product page
 * (full specifications, and the "Key specs" bullets). Sections follow the order of
 * their first attribute; variant options are excluded because they belong to the
 * selected variant.
 */
export const buildSpecGroups = (defs: ResolvedAttribute[], values: any): SpecGroup[] => {
  const groups = new Map<string, SpecGroup>();
  for (const a of defs) {
    if (a.isVariantAttribute) continue;
    const v = values?.[a.key];
    if (isEmpty(v)) continue;
    const title = (a.group || "").trim() || DEFAULT_GROUP;
    const value = formatValue(a, v);
    let format = a.keySpecFormat && a.keySpecFormat.includes("{value}") ? a.keySpecFormat : "{label}: {value}";
    // The value already carries its unit; don't repeat it when the admin's
    // wording also spells it out ("{value} ml pack").
    if (a.unit) format = format.replace(`{value} ${a.unit}`, "{value}");
    const keyText = a.keySpec ? format.replace("{label}", a.label).replace("{value}", value) : undefined;
    if (!groups.has(title)) groups.set(title, { title, items: [] });
    groups.get(title)!.items.push({ label: a.label, value, keySpec: a.keySpec, keyText });
  }
  return [...groups.values()];
};

/**
 * Required attributes still missing. Variant attributes (Size, Colour…) are not filled in the
 * attribute form but chosen per variant, so a required one counts as filled when the product's
 * variants use it (variantAxes holds the attribute names the variants are made of).
 */
export const attributeProblems = (defs: ResolvedAttribute[], values: any, variantAxes: string[] = []): string[] => {
  const axes = variantAxes.map((n) => String(n).toLowerCase());
  return defs
    .filter((d) => d.isRequired && (d.isVariantAttribute ? !axes.includes(d.label.toLowerCase()) : isEmpty(values?.[d.key])))
    .map((d) => d.label);
};
