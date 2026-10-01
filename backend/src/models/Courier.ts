import mongoose, { Document, Schema } from "mongoose";

export interface ICourier extends Document {
  name: string;
  serviceablePinCodes: string[]; // empty array = serviceable everywhere
  weightLimitKg: number;
  baseShippingCharge: number;
  perKgCharge: number;
  codAvailable: boolean;
  pickupAvailable: boolean;
  trackingApiUrl?: string;
  trackingApiKey?: string;
  deliverySlaDays: number;
  rtoCharges: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CourierSchema = new Schema<ICourier>(
  {
    name: {
      type: String,
      required: [true, "Courier name is required"],
      trim: true,
      unique: true,
    },
    serviceablePinCodes: {
      type: [String],
      default: [],
    },
    weightLimitKg: {
      type: Number,
      default: 20,
      min: [0, "Weight limit cannot be negative"],
    },
    baseShippingCharge: {
      type: Number,
      default: 0,
      min: [0, "Shipping charge cannot be negative"],
    },
    perKgCharge: {
      type: Number,
      default: 0,
      min: [0, "Per-kg charge cannot be negative"],
    },
    codAvailable: {
      type: Boolean,
      default: true,
    },
    pickupAvailable: {
      type: Boolean,
      default: true,
    },
    trackingApiUrl: {
      type: String,
      trim: true,
    },
    trackingApiKey: {
      type: String,
      trim: true,
    },
    deliverySlaDays: {
      type: Number,
      default: 3,
      min: [0, "SLA cannot be negative"],
    },
    rtoCharges: {
      type: Number,
      default: 0,
      min: [0, "RTO charges cannot be negative"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Courier =
  (mongoose.models.Courier as mongoose.Model<ICourier>) ||
  mongoose.model<ICourier>("Courier", CourierSchema);

export default Courier;
