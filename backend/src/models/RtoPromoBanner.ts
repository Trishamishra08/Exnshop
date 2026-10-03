import mongoose, { Document, Schema } from "mongoose";

/**
 * Admin-configurable promo banner shown on the seller RTO dashboard
 * (e.g. "Use Branded Packets & get up to 80% RTO claims approval").
 */
export interface IRtoPromoBanner extends Document {
  heading: string;
  bodyText?: string;
  ctaText?: string;
  ctaLink?: string;
  image?: string;
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const RtoPromoBannerSchema = new Schema<IRtoPromoBanner>(
  {
    heading: {
      type: String,
      required: [true, "Heading is required"],
      trim: true,
    },
    bodyText: {
      type: String,
      trim: true,
    },
    ctaText: {
      type: String,
      trim: true,
    },
    ctaLink: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

RtoPromoBannerSchema.index({ isActive: 1, order: 1 });

const RtoPromoBanner =
  (mongoose.models.RtoPromoBanner as mongoose.Model<IRtoPromoBanner>) ||
  mongoose.model<IRtoPromoBanner>("RtoPromoBanner", RtoPromoBannerSchema);

export default RtoPromoBanner;
