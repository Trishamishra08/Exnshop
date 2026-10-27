import mongoose, { Document, Schema } from "mongoose";

export const REFUND_REASONS = [
  "Customer return",
  "Damaged or defective",
  "Wrong item sent",
  "Delivered late",
  "Item not as described",
  "Other",
] as const;

/**
 * A seller asking to refund a delivered item (Amazon's "Refund order"). It
 * costs the seller the item's earning (the same as a customer return without a
 * courier pickup), so an admin approves it before any money moves.
 */
export interface IRefundRequest extends Document {
  seller: mongoose.Types.ObjectId;
  order: mongoose.Types.ObjectId;
  orderNumber?: string;
  orderItem: mongoose.Types.ObjectId;
  productName?: string;
  quantity: number;
  reason: string;
  noteToBuyer?: string;
  noteToSelf?: string;
  /** What the customer will be refunded (price of the units, minus any coupon share). */
  refundAmount: number;
  status: "Pending" | "Processing" | "Approved" | "Rejected" | "Failed";
  adminNote?: string;
  decidedBy?: mongoose.Types.ObjectId;
  decidedAt?: Date;
  returnId?: mongoose.Types.ObjectId;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RefundRequestSchema = new Schema<IRefundRequest>(
  {
    seller: { type: Schema.Types.ObjectId, ref: "Seller", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderNumber: { type: String, trim: true },
    orderItem: { type: Schema.Types.ObjectId, ref: "OrderItem", required: true },
    productName: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true, trim: true },
    noteToBuyer: { type: String, trim: true, maxlength: 255 },
    noteToSelf: { type: String, trim: true, maxlength: 255 },
    refundAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["Pending", "Processing", "Approved", "Rejected", "Failed"], default: "Pending" },
    adminNote: { type: String, trim: true, maxlength: 500 },
    decidedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    decidedAt: { type: Date },
    returnId: { type: Schema.Types.ObjectId, ref: "Return" },
    failureReason: { type: String, trim: true },
  },
  { timestamps: true },
);

RefundRequestSchema.index({ seller: 1, status: 1 });
RefundRequestSchema.index({ orderItem: 1, status: 1 });

const RefundRequest =
  (mongoose.models.RefundRequest as mongoose.Model<IRefundRequest>) ||
  mongoose.model<IRefundRequest>("RefundRequest", RefundRequestSchema);

export default RefundRequest;
