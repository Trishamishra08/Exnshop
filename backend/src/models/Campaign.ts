import mongoose, { Document, Schema } from "mongoose";

export interface ICampaign extends Document {
  seller: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  dailyBudget: number;
  totalBudget: number;
  startDate: Date;
  endDate: Date;
  status: "Draft" | "Active" | "Paused" | "Completed";
  spend: number;
  todaySpend: number;
  lastSpendDate?: Date;
  impressions: number;
  clicks: number;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignSchema = new Schema<ICampaign>(
  {
    seller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: [true, "Seller is required"],
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
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
CampaignSchema.index({ product: 1, status: 1 });

const Campaign =
  (mongoose.models.Campaign as mongoose.Model<ICampaign>) ||
  mongoose.model<ICampaign>("Campaign", CampaignSchema);

export default Campaign;
