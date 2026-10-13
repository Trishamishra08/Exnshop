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

export const attributeProblems = (defs: ResolvedAttribute[], values: any): string[] =>
  defs.filter((d) => d.isRequired && isEmpty(values?.[d.key])).map((d) => d.label);
