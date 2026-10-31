import mongoose, { Document, Schema } from "mongoose";

/**
 * A delivery partner accepted a Quick order and then cancelled it. The penalty is
 * charged to their wallet at once; if their reason is genuine the admin refunds it.
 * The record is kept either way, so the history can always be traced.
 */
export interface IDeliveryCancellation extends Document {
  order: mongoose.Types.ObjectId;
  orderNumber: string;
  deliveryBoy: mongoose.Types.ObjectId;
  seller?: mongoose.Types.ObjectId;
  reason: string;
  note?: string;
  penalty: number;
  /** Charged = penalty taken; Refunded = admin accepted the reason and gave it back; Waived = no penalty. */
  status: "Charged" | "Refunded" | "Waived";
  chargeReference?: string;
  decidedBy?: mongoose.Types.ObjectId;
  decidedAt?: Date;
  adminRemarks?: string;
  createdAt: Date;
}

const DeliveryCancellationSchema = new Schema<IDeliveryCancellation>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderNumber: { type: String, required: true },
    deliveryBoy: { type: Schema.Types.ObjectId, ref: "Delivery", required: true, index: true },
    seller: { type: Schema.Types.ObjectId, ref: "Seller" },
    reason: { type: String, required: true, trim: true, maxlength: 200 },
    note: { type: String, trim: true, maxlength: 500 },
    penalty: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["Charged", "Refunded", "Waived"], default: "Charged", index: true },
    chargeReference: { type: String },
    decidedBy: { type: Schema.Types.ObjectId },
    decidedAt: { type: Date },
    adminRemarks: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.models.DeliveryCancellation ||
  mongoose.model<IDeliveryCancellation>("DeliveryCancellation", DeliveryCancellationSchema);
