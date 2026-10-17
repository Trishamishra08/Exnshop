import mongoose, { Document, Schema } from "mongoose";

export const ATTRIBUTE_TYPES = ["text", "number", "select", "multiselect", "boolean", "date"] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

/**
 * An admin-defined listing attribute for a department (header category) or a
 * category at any level. Products in that branch show these fields in the
 * listing flow; more specific levels add to (or override by key) broader ones.
 */
export interface ICategoryAttribute extends Document {
  scopeType: "HeaderCategory" | "Category";
  scopeId: mongoose.Types.ObjectId;
  key: string;
  label: string;
  type: AttributeType;
  isRequired: boolean;
  /** Offered as a variation dimension (e.g. Size, Colour) in the Variants step. */
  isVariantAttribute: boolean;
  isFilterable: boolean;
  isSearchable: boolean;
  allowedValues: string[];
  unit?: string;
  validation?: { min?: number; max?: number; pattern?: string };
  helpText?: string;
  /** Section heading on the product page, e.g. "Display" or "Rear Camera". */
  group?: string;
  /** Also listed as a short bullet in the product page's "Key specs" summary. */
  keySpec: boolean;
  /** Wording of that bullet, e.g. "{value} RAM". Defaults to "{label}: {value}". */
  keySpecFormat?: string;
  displayOrder: number;
  isActive: boolean;
}

const CategoryAttributeSchema = new Schema<ICategoryAttribute>(
  {
    scopeType: { type: String, enum: ["HeaderCategory", "Category"], required: true },
    scopeId: { type: Schema.Types.ObjectId, required: true, refPath: "scopeType" },
    key: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z][a-z0-9_]{1,40}$/ },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    type: { type: String, enum: ATTRIBUTE_TYPES, default: "text" },
    isRequired: { type: Boolean, default: false },
    isVariantAttribute: { type: Boolean, default: false },
    isFilterable: { type: Boolean, default: false },
    isSearchable: { type: Boolean, default: false },
    allowedValues: { type: [String], default: [] },
    unit: { type: String, trim: true, maxlength: 12 },
    validation: {
      type: new Schema({ min: Number, max: Number, pattern: String }, { _id: false }),
      default: undefined,
    },
    helpText: { type: String, trim: true, maxlength: 140 },
    group: { type: String, trim: true, maxlength: 40 },
    keySpec: { type: Boolean, default: false },
    keySpecFormat: { type: String, trim: true, maxlength: 60 },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CategoryAttributeSchema.index({ scopeType: 1, scopeId: 1, key: 1 }, { unique: true });

export default mongoose.model<ICategoryAttribute>("CategoryAttribute", CategoryAttributeSchema);
