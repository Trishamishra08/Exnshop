import mongoose, { Document, Schema } from "mongoose";

/**
 * Listing rules for a department or category: default HSN, and whether the
 * category is regulated (needs licences/certificates before a product can go live).
 */
export interface ICategoryListingRule extends Document {
  scopeType: "HeaderCategory" | "Category";
  scopeId: mongoose.Types.ObjectId;
  defaultHsn?: string;
  isRegulated: boolean;
  requiredDocs: Array<{ key: string; label: string }>;
  notes?: string;
}

const CategoryListingRuleSchema = new Schema<ICategoryListingRule>(
  {
    scopeType: { type: String, enum: ["HeaderCategory", "Category"], required: true },
    scopeId: { type: Schema.Types.ObjectId, required: true, refPath: "scopeType" },
    defaultHsn: { type: String, trim: true },
    isRegulated: { type: Boolean, default: false },
    requiredDocs: {
      type: [new Schema({ key: { type: String, required: true, trim: true }, label: { type: String, required: true, trim: true } }, { _id: false })],
      default: [],
    },
    notes: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

CategoryListingRuleSchema.index({ scopeType: 1, scopeId: 1 }, { unique: true });

export default mongoose.model<ICategoryListingRule>("CategoryListingRule", CategoryListingRuleSchema);
