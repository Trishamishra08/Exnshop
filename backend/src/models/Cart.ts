import mongoose, { Document, Schema } from "mongoose";

export interface ICart extends Document {
  customer: mongoose.Types.ObjectId;
  channel: "Quick" | "ECommerce";
  items: mongoose.Types.ObjectId[]; // References to CartItem
  total: number;
  createdAt: Date;
  updatedAt: Date;
}

const CartSchema = new Schema<ICart>(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },
    channel: {
      type: String,
      enum: ["Quick", "ECommerce"],
      default: "Quick",
    },
    items: [
      {
        type: Schema.Types.ObjectId,
        ref: "CartItem",
      },
    ],
    total: {
      type: Number,
      default: 0,
      min: [0, "Total cannot be negative"],
    },
  },
  {
    timestamps: true,
  }
);

// One cart per customer PER commerce channel (replaces old single-cart-per-customer unique index)
CartSchema.index({ customer: 1, channel: 1 }, { unique: true });

const Cart = (mongoose.models.Cart as mongoose.Model<ICart>) || mongoose.model<ICart>("Cart", CartSchema);

export default Cart;
