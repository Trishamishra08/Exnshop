import mongoose, { Document, Schema } from "mongoose";

export interface ITicketMessage {
  sender: "Seller" | "Customer" | "Admin";
  message: string;
  attachments: string[];
  createdAt: Date;
}

/**
 * Open (ticket created) → Assigned (with support team) → In Progress
 * (investigation) → Resolved → Closed
 */
export const TICKET_STATUSES = ["Open", "Assigned", "In Progress", "Resolved", "Closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface ITicketStatusChange {
  status: TicketStatus;
  by: "Seller" | "Customer" | "Admin" | "System";
  note?: string;
  at: Date;
}

export interface ISupportTicket extends Document {
  /** Set for seller tickets. Customer tickets carry customer / requester* instead. */
  seller?: mongoose.Types.ObjectId;
  customer?: mongoose.Types.ObjectId;
  requesterType: "Seller" | "Customer";
  requesterName?: string;
  requesterEmail?: string;
  category: "Payment" | "Product" | "Order" | "Technical" | "Account" | "Other" | "Delivery" | "Return" | "General";
  priority: "Low" | "Medium" | "High";
  subject: string;
  description: string;
  attachments: string[];
  status: TicketStatus;
  statusHistory: ITicketStatusChange[];
  messages: ITicketMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const TicketMessageSchema = new Schema<ITicketMessage>(
  {
    sender: { type: String, enum: ["Seller", "Customer", "Admin"], required: true },
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
    },
    customer: { type: Schema.Types.ObjectId, ref: "Customer" },
    requesterType: { type: String, enum: ["Seller", "Customer"], default: "Seller" },
    requesterName: { type: String, trim: true },
    requesterEmail: { type: String, trim: true, lowercase: true },
    category: {
      type: String,
      enum: ["Payment", "Product", "Order", "Technical", "Account", "Other", "Delivery", "Return", "General"],
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
    attachments: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: TICKET_STATUSES,
      default: "Open",
    },
    statusHistory: {
      type: [
        new Schema<ITicketStatusChange>(
          {
            status: { type: String, enum: TICKET_STATUSES, required: true },
            by: { type: String, enum: ["Seller", "Customer", "Admin", "System"], required: true },
            note: { type: String, trim: true },
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
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
SupportTicketSchema.index({ customer: 1, status: 1 });

const SupportTicket =
  (mongoose.models.SupportTicket as mongoose.Model<ISupportTicket>) ||
  mongoose.model<ISupportTicket>("SupportTicket", SupportTicketSchema);

export default SupportTicket;
