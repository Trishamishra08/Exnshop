import mongoose, { Document, Schema } from "mongoose";

export interface ISellerAuditLog extends Document {
  seller: mongoose.Types.ObjectId;
  actorType: "Seller" | "Admin" | "System";
  actorId?: mongoose.Types.ObjectId;
  actorName?: string;
  action: string;
  section?: string;
  changes?: Array<{ field: string; from?: string; to?: string }>;
  remarks?: string;
  createdAt: Date;
}

const SellerAuditLogSchema = new Schema<ISellerAuditLog>(
  {
    seller: { type: Schema.Types.ObjectId, ref: "Seller", required: true, index: true },
    actorType: { type: String, enum: ["Seller", "Admin", "System"], required: true },
    actorId: { type: Schema.Types.ObjectId },
    actorName: { type: String, trim: true },
    action: { type: String, required: true, trim: true },
    section: { type: String, trim: true },
    changes: [{ _id: false, field: String, from: String, to: String }],
    remarks: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

SellerAuditLogSchema.index({ seller: 1, createdAt: -1 });

export default mongoose.model<ISellerAuditLog>("SellerAuditLog", SellerAuditLogSchema);
