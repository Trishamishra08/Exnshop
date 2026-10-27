import mongoose, { Document, Schema } from "mongoose";

/** One row per campaign per India day, so performance can be charted over a date range. */
export interface ICampaignDailyStat extends Document {
  campaign: mongoose.Types.ObjectId;
  day: string; // YYYY-MM-DD (India date)
  impressions: number;
  clicks: number;
  spend: number;
}

const CampaignDailyStatSchema = new Schema<ICampaignDailyStat>({
  campaign: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
  day: { type: String, required: true },
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  spend: { type: Number, default: 0 },
});

CampaignDailyStatSchema.index({ campaign: 1, day: 1 }, { unique: true });

const CampaignDailyStat =
  (mongoose.models.CampaignDailyStat as mongoose.Model<ICampaignDailyStat>) ||
  mongoose.model<ICampaignDailyStat>("CampaignDailyStat", CampaignDailyStatSchema);

export default CampaignDailyStat;
