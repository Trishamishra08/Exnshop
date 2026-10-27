import mongoose, { Document, Schema } from "mongoose";

export interface ICampaignProduct {
  product: mongoose.Types.ObjectId;
  cpcBid: number;
  spend: number;
  todaySpend: number;
  impressions: number;
  clicks: number;
}

export interface ICampaignHistoryEntry {
  at: Date;
  action: string;
  detail?: string;
}

export interface ICampaign extends Document {
  seller: mongoose.Types.ObjectId;
  /** Seller-chosen label, so campaigns are told apart without reading product lists. */
  name?: string;
  /** The campaign runs until the seller stops it (endDate is parked far in the future). */
  noEndDate?: boolean;
  /** Hidden from the default list and never served; kept for its history and numbers. */
  archived?: boolean;
  /** Newest last, capped at 100 entries. */
  history?: ICampaignHistoryEntry[];
  /** Several products/catalogs, each with its own seller-set CPC bid —
   *  like Meesho's "Create Campaign" screen. One campaign, one shared
   *  Daily/Total Budget pool, many products. */
  products: ICampaignProduct[];
  dailyBudget: number;
  totalBudget: number;
  startDate: Date;
  endDate: Date;
  status: "Draft" | "Active" | "Paused" | "Completed";
  /** Denormalized campaign-wide totals — sum of products[].spend/impressions/clicks,
   *  kept in sync on every write so budget-exhaustion checks stay a single read. */
  spend: number;
  todaySpend: number;
  lastSpendDate?: Date;
  impressions: number;
  clicks: number;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignProductSchema = new Schema<ICampaignProduct>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
    },
    cpcBid: {
      type: Number,
      required: [true, "CPC bid is required"],
      min: [0, "CPC bid cannot be negative"],
    },
    spend: { type: Number, default: 0, min: 0 },
    todaySpend: { type: Number, default: 0, min: 0 },
    impressions: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const CampaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, trim: true, maxlength: 80 },
    noEndDate: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    history: {
      type: [
        new Schema({ at: { type: Date, default: Date.now }, action: { type: String, required: true }, detail: { type: String } }, { _id: false }),
      ],
      default: [],
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: [true, "Seller is required"],
    },
    products: {
      type: [CampaignProductSchema],
      validate: {
        validator: (v: ICampaignProduct[]) => Array.isArray(v) && v.length > 0,
        message: "At least one product is required",
      },
    },
    dailyBudget: {
      type: Number,
      required: [true, "Daily budget is required"],
      min: [0, "Daily budget cannot be negative"],
    },
    totalBudget: {
      type: Number,
      required: [true, "Total budget is required"],
      min: [0, "Total budget cannot be negative"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
    status: {
      type: String,
      enum: ["Draft", "Active", "Paused", "Completed"],
      default: "Draft",
    },
    spend: {
      type: Number,
      default: 0,
      min: 0,
    },
    todaySpend: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastSpendDate: {
      type: Date,
    },
    impressions: {
      type: Number,
      default: 0,
      min: 0,
    },
    clicks: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

CampaignSchema.index({ seller: 1, status: 1 });
CampaignSchema.index({ "products.product": 1, status: 1 });

const Campaign =
  (mongoose.models.Campaign as mongoose.Model<ICampaign>) ||
  mongoose.model<ICampaign>("Campaign", CampaignSchema);

export default Campaign;
