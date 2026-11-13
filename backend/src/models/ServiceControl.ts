import mongoose, { Document, Schema } from "mongoose";

/** Current ON/OFF state of one marketplace service (one document per service key). */
export interface IServiceControl extends Document {
  key: string;
  enabled: boolean;
  note?: string;
  updatedBy?: mongoose.Types.ObjectId;
  updatedByName?: string;
  updatedAt: Date;
}

const ServiceControlSchema = new Schema<IServiceControl>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    enabled: { type: Boolean, default: true },
    note: { type: String, trim: true, maxlength: 300 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    updatedByName: { type: String, trim: true },
  },
  { timestamps: true }
);

export const ServiceControl =
  (mongoose.models.ServiceControl as mongoose.Model<IServiceControl>) ||
  mongoose.model<IServiceControl>("ServiceControl", ServiceControlSchema);

/** Audit trail: which admin changed which service, when, and why. Never deleted by the app. */
export interface IServiceControlLog extends Document {
  key: string;
  label: string;
  from: boolean;
  to: boolean;
  note?: string;
  admin?: mongoose.Types.ObjectId;
  adminName?: string;
  ip?: string;
  createdAt: Date;
}

const ServiceControlLogSchema = new Schema<IServiceControlLog>(
  {
    key: { type: String, required: true, index: true },
    label: { type: String, required: true },
    from: { type: Boolean, required: true },
    to: { type: Boolean, required: true },
    note: { type: String, trim: true, maxlength: 300 },
    admin: { type: Schema.Types.ObjectId, ref: "Admin" },
    adminName: { type: String },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
ServiceControlLogSchema.index({ createdAt: -1 });

export const ServiceControlLog =
  (mongoose.models.ServiceControlLog as mongoose.Model<IServiceControlLog>) ||
  mongoose.model<IServiceControlLog>("ServiceControlLog", ServiceControlLogSchema);
