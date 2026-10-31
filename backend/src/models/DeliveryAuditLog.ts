import mongoose, { Document, Schema } from "mongoose";

/** Every change to a delivery partner's details (requested, approved, rejected), with old and new values. */
export interface IDeliveryAuditLog extends Document {
  delivery: mongoose.Types.ObjectId;
  actorType: "Delivery" | "Admin" | "System";
  actorId?: mongoose.Types.ObjectId;
  actorName?: string;
  action: string;
  changes?: Array<{ field: string; from?: string; to?: string }>;
  remarks?: string;
  createdAt: Date;
}

const DeliveryAuditLogSchema = new Schema<IDeliveryAuditLog>(
  {
    delivery: { type: Schema.Types.ObjectId, ref: "Delivery", required: true, index: true },
    actorType: { type: String, enum: ["Delivery", "Admin", "System"], required: true },
    actorId: { type: Schema.Types.ObjectId },
    actorName: { type: String },
    action: { type: String, required: true, trim: true },
    changes: [{ _id: false, field: String, from: String, to: String }],
    remarks: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
DeliveryAuditLogSchema.index({ delivery: 1, createdAt: -1 });

export default mongoose.models.DeliveryAuditLog ||
  mongoose.model<IDeliveryAuditLog>("DeliveryAuditLog", DeliveryAuditLogSchema);
