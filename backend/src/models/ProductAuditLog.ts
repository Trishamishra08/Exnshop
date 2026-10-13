import mongoose, { Document, Schema } from "mongoose";

export interface IProductAuditLog extends Document {
  product: mongoose.Types.ObjectId;
  seller: mongoose.Types.ObjectId;
  productName?: string;
  actorType: "Seller" | "Admin" | "System";
  actorId?: mongoose.Types.ObjectId;
  actorName?: string;
  action: string;
  changes?: Array<{ field: string; from?: string; to?: string }>;
  remarks?: string;
  createdAt: Date;
}

const ProductAuditLogSchema = new Schema<IProductAuditLog>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    seller: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    productName: { type: String, trim: true },
    actorType: { type: String, enum: ["Seller", "Admin", "System"], required: true },
    actorId: { type: Schema.Types.ObjectId },
    actorName: { type: String, trim: true },
    action: { type: String, required: true, trim: true },
    changes: [{ _id: false, field: String, from: String, to: String }],
    remarks: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ProductAuditLogSchema.index({ product: 1, createdAt: -1 });

export default mongoose.model<IProductAuditLog>("ProductAuditLog", ProductAuditLogSchema);
