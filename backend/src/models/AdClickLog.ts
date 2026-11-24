import mongoose, { Schema } from "mongoose";

/**
 * One row per viewer per sponsored product, kept for 24 hours. A seller is charged
 * only for a viewer's first click on their ad in that time, so repeated clicks by the
 * same person (or a competitor/bot) don't drain the ad budget.
 */
const AdClickLogSchema = new Schema({
  key: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

export default mongoose.models.AdClickLog || mongoose.model("AdClickLog", AdClickLogSchema);
