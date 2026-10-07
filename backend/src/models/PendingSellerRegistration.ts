import mongoose, { Document, Schema } from "mongoose";

/**
 * Holds a seller signup's form data between "Create Seller Account" and OTP
 * verification. Nothing is written to the real Seller collection (and so
 * nothing shows up in Admin) until the OTP is actually verified — this
 * document is the only trace of an in-progress, unverified signup.
 * Auto-expires 30 minutes after creation so abandoned signups don't linger.
 */
export interface IPendingSellerRegistration extends Document {
  sellerName: string;
  mobile: string;
  email: string;
  storeName: string;
  category: string;
  categories: string[];
  address?: string;
  city: string;
  serviceableArea?: string;
  searchLocation?: string;
  latitude?: string;
  longitude?: string;
  location?: {
    type: "Point";
    coordinates: [number, number];
  };
  serviceRadiusKm: number;
  channels: ("Quick" | "ECommerce")[];
  createdAt: Date;
}

const PendingSellerRegistrationSchema = new Schema<IPendingSellerRegistration>({
  sellerName: { type: String, required: true },
  mobile: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  storeName: { type: String, required: true },
  category: { type: String, required: true },
  categories: { type: [String], default: [] },
  address: { type: String },
  city: { type: String, required: true },
  serviceableArea: { type: String },
  searchLocation: { type: String },
  latitude: { type: String },
  longitude: { type: String },
  location: {
    type: { type: String, enum: ["Point"] },
    coordinates: { type: [Number] },
  },
  serviceRadiusKm: { type: Number, default: 10 },
  channels: { type: [String], enum: ["Quick", "ECommerce"], default: [] },
  createdAt: { type: Date, default: Date.now, expires: 1800 }, // 30 minutes
});

PendingSellerRegistrationSchema.index({ email: 1 });
PendingSellerRegistrationSchema.index({ mobile: 1 });

const PendingSellerRegistration =
  (mongoose.models.PendingSellerRegistration as mongoose.Model<IPendingSellerRegistration>) ||
  mongoose.model<IPendingSellerRegistration>(
    "PendingSellerRegistration",
    PendingSellerRegistrationSchema
  );

export default PendingSellerRegistration;
