import mongoose, { Document, Schema } from "mongoose";

export interface IReturn extends Document {
  order: mongoose.Types.ObjectId;
  orderItem: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;

  // Request Type: Distinction between return for refund vs exchange for replacement
  requestType: "RETURN" | "EXCHANGE";

  /** COD orders: where the customer wants the refund paid — their wallet, or their saved bank account. */
  codRefundTo?: "WALLET" | "BANK";

  // Return / Exchange Info
  reason: string;
  description?: string;

  /**
   * Full 9-stage return/exchange lifecycle:
   * Pending → Approved → Pickup Pending → Delivery Partner Assigned →
   * Picked Up → In Transit → Handed To Seller → Completed
   * (Rejected is a terminal failure state)
   */
  status:
    | "Pending"
    | "Approved"
    | "Rejected"
    | "Pickup Pending"
    | "Delivery Partner Assigned"
    | "Picked Up"
    | "In Transit"
    | "Handed To Seller"
    | "Completed";

  // Items
  quantity: number;
  images?: string[]; // Images of items

  // Processing
  processedBy?: mongoose.Types.ObjectId;
  processedAt?: Date;
  rejectionReason?: string;

  // ─────── Delivery Partner Assignment (for return/exchange pickup) ───────
  deliveryBoy?: mongoose.Types.ObjectId;
  assignedAt?: Date;

  // ─────── Return/Exchange Pickup OTP ───────
  pickupOtp?: string;
  pickupOtpExpiresAt?: Date;
  pickupOtpAttempts?: number;
  pickupOtpVerified?: boolean;

  // ─────── Lifecycle Timestamps ───────
  approvedAt?: Date;
  pickedUpAt?: Date;
  inTransitAt?: Date;
  handedToSellerAt?: Date;
  completedAt?: Date;

  // Legacy pickup fields (kept for backward compat)
  pickupScheduled?: Date;
  pickupCompleted?: Date;
  pickupAddress?: {
    address: string;
    city: string;
    pincode: string;
  };

  // Refund (applicable only to RETURN, ₹0 for EXCHANGE)
  refundAmount?: number;
  refundId?: mongoose.Types.ObjectId;
  /** Exchange: the variant (size/colour) the customer wants instead; unset means the same variant. */
  requestedVariation?: { id: string; label: string };
  /** What the customer says the item is like: Unused / Defective / Used. */
  condition?: "Unused" | "Defective" | "Used";
  /** Exchange stuck waiting on a decision: no stock for the replacement, or the seller's quality check failed. */
  exchangeState?: "OutOfStock" | "QCFailed" | "RefundInitiated";
  /** The seller's check of the item that came back. */
  qc?: { result: "Passed" | "Failed"; note?: string; at: Date; by?: string };
  /** Automatic review flags, e.g. REPEAT_REQUESTS when a customer files many requests in a short time. */
  flags?: string[];
  /** Delivery charge for the exchange and who bears it, fixed when the request is made. */
  exchangeShipping?: { amount: number; payer: "Customer" | "Seller" };
  /** Quick exchange: the rider takes the old item when delivering the replacement, in one trip. */
  doorstepSwap?: boolean;
  /** "Seller" when the seller refunded the item with no pickup; otherwise the customer asked for the return. */
  initiatedBy?: "Customer" | "Seller";
  /** Courier pickup cost billed to the seller when the customer sent the item back after receiving it. */
  returnShippingCharge?: number;
  financialSettlementStatus?: "Pending" | "Completed" | "Failed";

  /** Exchange: the ₹0 order that sends the replacement unit to the customer. */
  replacementOrder?: mongoose.Types.ObjectId;

  // E-commerce returns: courier reverse pickup (Shiprocket) instead of a rider
  shiprocketReturn?: {
    channelOrderId?: string;
    orderId?: string;
    shipmentId?: string;
    awbCode?: string;
    courierName?: string;
    trackingUrl?: string;
    status?: string;
    error?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

const ReturnSchema = new Schema<IReturn>(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order is required"],
    },
    orderItem: {
      type: Schema.Types.ObjectId,
      ref: "OrderItem",
      required: [true, "Order item is required"],
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },

    // Request Type
    requestType: {
      type: String,
      enum: ["RETURN", "EXCHANGE"],
      default: "RETURN",
      required: true,
    },

    codRefundTo: {
      type: String,
      enum: ["WALLET", "BANK"],
      default: "WALLET",
    },

    // Return Info
    reason: {
      type: String,
      required: [true, "Return reason is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "Pending",
        "Approved",
        "Rejected",
        "Pickup Pending",
        "Delivery Partner Assigned",
        "Picked Up",
        "In Transit",
        "Handed To Seller",
        "Completed",
      ],
      default: "Pending",
    },

    // Items
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    images: {
      type: [String],
      default: [],
    },

    // Processing
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
    processedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },

    // ─────── Delivery Partner Assignment ───────
    deliveryBoy: {
      type: Schema.Types.ObjectId,
      ref: "Delivery",
    },
    assignedAt: {
      type: Date,
    },

    // ─────── Return Pickup OTP ───────
    pickupOtp: {
      type: String,
      select: false, // Never expose OTP in regular queries
    },
    pickupOtpExpiresAt: {
      type: Date,
    },
    pickupOtpAttempts: {
      type: Number,
      default: 0,
    },
    pickupOtpVerified: {
      type: Boolean,
      default: false,
    },

    // ─────── Lifecycle Timestamps ───────
    approvedAt: { type: Date },
    pickedUpAt: { type: Date },
    inTransitAt: { type: Date },
    handedToSellerAt: { type: Date },
    completedAt: { type: Date },

    // Legacy pickup fields
    pickupScheduled: {
      type: Date,
    },
    pickupCompleted: {
      type: Date,
    },
    pickupAddress: {
      address: String,
      city: String,
      pincode: String,
    },

    // Refund
    refundAmount: {
      type: Number,
      min: [0, "Refund amount cannot be negative"],
    },
    refundId: {
      type: Schema.Types.ObjectId,
      ref: "Refund",
    },
    replacementOrder: { type: Schema.Types.ObjectId, ref: "Order" },
    initiatedBy: { type: String, enum: ["Customer", "Seller"], default: "Customer" },
    exchangeShipping: { type: new Schema({ amount: { type: Number, default: 0 }, payer: { type: String, enum: ["Customer", "Seller"] } }, { _id: false }), default: undefined },
    doorstepSwap: { type: Boolean, default: false },
    requestedVariation: { type: new Schema({ id: { type: String }, label: { type: String } }, { _id: false }), default: undefined },
    condition: { type: String, enum: ["Unused", "Defective", "Used"] },
    exchangeState: { type: String, enum: ["OutOfStock", "QCFailed", "RefundInitiated"] },
    qc: {
      type: new Schema(
        { result: { type: String, enum: ["Passed", "Failed"], required: true }, note: { type: String, trim: true }, at: { type: Date, default: Date.now }, by: { type: String } },
        { _id: false }
      ),
      default: undefined,
    },
    flags: { type: [String], default: undefined },
    returnShippingCharge: { type: Number, min: 0 },
    shiprocketReturn: {
      channelOrderId: { type: String },
      orderId: { type: String },
      shipmentId: { type: String },
      awbCode: { type: String },
      courierName: { type: String },
      trackingUrl: { type: String },
      status: { type: String },
      error: { type: String },
    },
    financialSettlementStatus: {
      type: String,
      enum: ["Pending", "Completed", "Failed"],
      default: "Pending",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ReturnSchema.index({ order: 1 });
ReturnSchema.index({ customer: 1 });
ReturnSchema.index({ status: 1 });
ReturnSchema.index({ requestType: 1 });
ReturnSchema.index({ deliveryBoy: 1 }); // For DP return pickup queries

const Return =
  (mongoose.models.Return as mongoose.Model<IReturn>) ||
  mongoose.model<IReturn>("Return", ReturnSchema);

export default Return;
