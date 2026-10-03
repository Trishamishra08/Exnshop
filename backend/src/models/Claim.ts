import mongoose, { Document, Schema } from "mongoose";

export interface IClaim extends Document {
  seller: mongoose.Types.ObjectId;
  order: mongoose.Types.ObjectId;
  orderNumber?: string;
  returnRequest?: mongoose.Types.ObjectId;
  rtoEvent?: mongoose.Types.ObjectId;
  reason: string;
  description?: string;
  photos: string[];
  claimAmount: number;
  approvedAmount?: number;
  status: "Raised" | "Under Review" | "Approved" | "Rejected";
  adminDecisionReason?: string;
  decidedBy?: mongoose.Types.ObjectId;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ClaimSchema = new Schema<IClaim>(
  {
    seller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: [true, "Seller is required"],
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order is required"],
    },
    orderNumber: {
      type: String,
      trim: true,
    },
    returnRequest: {
      type: Schema.Types.ObjectId,
      ref: "Return",
    },
    rtoEvent: {
      type: Schema.Types.ObjectId,
      ref: "RTOEvent",
    },
    reason: {
      type: String,
      required: [true, "Reason is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    photos: {
      type: [String],
      default: [],
    },
    claimAmount: {
      type: Number,
      required: [true, "Claim amount is required"],
      min: [0, "Claim amount cannot be negative"],
    },
    approvedAmount: {
      type: Number,
      min: [0, "Approved amount cannot be negative"],
    },
    status: {
      type: String,
      enum: ["Raised", "Under Review", "Approved", "Rejected"],
      default: "Raised",
    },
    adminDecisionReason: {
      type: String,
      trim: true,
    },
    decidedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    decidedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

ClaimSchema.index({ seller: 1, status: 1 });
ClaimSchema.index({ order: 1 });

const Claim =
  (mongoose.models.Claim as mongoose.Model<IClaim>) ||
  mongoose.model<IClaim>("Claim", ClaimSchema);

export default Claim;
