import mongoose, { Document, Schema } from "mongoose";

export interface ITicketMessage {
  sender: "Seller" | "Admin";
  message: string;
  attachments: string[];
  createdAt: Date;
}

export interface ISupportTicket extends Document {
  seller: mongoose.Types.ObjectId;
  category: "Payment" | "Product" | "Order" | "Technical" | "Account" | "Other";
  priority: "Low" | "Medium" | "High";
  subject: string;
  description: string;
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  messages: ITicketMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const TicketMessageSchema = new Schema<ITicketMessage>(
  {
    sender: { type: String, enum: ["Seller", "Admin"], required: true },
    message: { type: String, required: true, trim: true },
    attachments: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    seller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: [true, "Seller is required"],
    },
    category: {
      type: String,
      enum: ["Payment", "Product", "Order", "Technical", "Account", "Other"],
      default: "Other",
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["Open", "In Progress", "Resolved", "Closed"],
      default: "Open",
    },
    messages: {
      type: [TicketMessageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

SupportTicketSchema.index({ seller: 1, status: 1 });

const SupportTicket =
  (mongoose.models.SupportTicket as mongoose.Model<ISupportTicket>) ||
  mongoose.model<ISupportTicket>("SupportTicket", SupportTicketSchema);

export default SupportTicket;
