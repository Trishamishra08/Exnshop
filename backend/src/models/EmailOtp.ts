import mongoose, { Document, Schema } from 'mongoose';

export type EmailOtpUserType = 'Admin' | 'Seller' | 'Customer' | 'Delivery';

export interface IEmailOtp extends Document {
  email: string;
  otp: string;
  userType: EmailOtpUserType;
  expiresAt: Date;
  createdAt: Date;
}

const EmailOtpSchema = new Schema<IEmailOtp>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
    },
    otp: {
      type: String,
      required: [true, 'OTP is required'],
      trim: true,
    },
    userType: {
      type: String,
      required: [true, 'User type is required'],
      enum: ['Admin', 'Seller', 'Customer', 'Delivery'],
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiry date is required'],
      index: { expireAfterSeconds: 0 }, // Auto-delete expired documents
    },
  },
  {
    timestamps: true,
  }
);

EmailOtpSchema.index({ email: 1, userType: 1 });

const EmailOtp =
  (mongoose.models.EmailOtp as mongoose.Model<IEmailOtp>) ||
  mongoose.model<IEmailOtp>('EmailOtp', EmailOtpSchema);

export default EmailOtp;
