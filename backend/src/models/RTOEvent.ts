import mongoose, { Document, Schema } from "mongoose";

/**
 * A queryable record of one seller's share of an RTO (Return To Origin —
 * courier tried to deliver, customer refused or was unreachable, the parcel
 * goes back to the seller without ever being accepted). One Order can
 * produce several RTOEvents (one per seller) when it's a multi-seller order.
 * This is what the seller RTO dashboard aggregates against — Order.rtoDetails
 * is just a summary snapshot on the order itself.
 */
export interface IRTOEvent extends Document {
  order: mongoose.Types.ObjectId;
  orderItems: mongoose.Types.ObjectId[];
  seller: mongoose.Types.ObjectId;
  courierName?: string;
  reasonCode: string;
  reason?: string;
  markedBy: mongoose.Types.ObjectId;
  markedByRole: "Delivery" | "Admin";
  reverseShippingCost: number;
  status: "Initiated" | "InTransit" | "ReceivedBySeller" | "Disposed" | "Lost";
  financialSettlementStatus: "Pending" | "Completed" | "Failed";
  commissionReversalDone: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RTOEventSchema = new Schema<IRTOEvent>(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order is required"],
    },
    orderItems: [
      {
        type: Schema.Types.ObjectId,
        ref: "OrderItem",
      },
    ],
    seller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: [true, "Seller is required"],
    },
    courierName: {
      type: String,
      trim: true,
    },
    reasonCode: {
      type: String,
      required: [true, "Reason code is required"],
      trim: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    markedBy: {
      type: Schema.Types.ObjectId,
      required: [true, "markedBy is required"],
    },
    markedByRole: {
      type: String,
      enum: ["Delivery", "Admin"],
      required: true,
    },
    reverseShippingCost: {
      type: Number,
      default: 0,
      min: [0, "Reverse shipping cost cannot be negative"],
    },
    status: {
      type: String,
      enum: ["Initiated", "InTransit", "ReceivedBySeller", "Disposed", "Lost"],
      default: "Initiated",
    },
    financialSettlementStatus: {
      type: String,
      enum: ["Pending", "Completed", "Failed"],
      default: "Pending",
    },
    commissionReversalDone: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

RTOEventSchema.index({ seller: 1, createdAt: -1 });
RTOEventSchema.index({ order: 1 });
RTOEventSchema.index({ status: 1 });

const RTOEvent =
  (mongoose.models.RTOEvent as mongoose.Model<IRTOEvent>) ||
  mongoose.model<IRTOEvent>("RTOEvent", RTOEventSchema);

export default RTOEvent;
