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
/** "Waiting" = the support team asked the requester for more information (SLA clock paused). */
export const TICKET_STATUSES = ["Open", "Assigned", "In Progress", "Waiting", "Resolved", "Closed"] as const;
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
  priority: "Low" | "Medium" | "High" | "Critical";
  /** Human-readable id shown to the customer, e.g. TKT-261116-A7K2. */
  ticketNumber?: string;
  /** 0 Support Executive · 1 Support Manager · 2 Senior Admin · 3 Grievance Officer */
  escalationLevel: number;
  escalationHistory: Array<{ level: number; by: "Customer" | "Admin" | "System"; reason?: string; at: Date }>;
  /** Resolution target from the priority SLA. */
  slaDueAt?: Date;
  /** Deadline of the current escalation level; passing it escalates the ticket. */
  levelDueAt?: Date;
  slaBreached: boolean;
  resolvedAt?: Date;
  closedAt?: Date;
  rating?: { stars: number; feedback?: string; at: Date };
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
      enum: ["Low", "Medium", "High", "Critical"],
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
    ticketNumber: { type: String, index: { unique: true, sparse: true } },
    escalationLevel: { type: Number, min: 0, max: 3, default: 0 },
    escalationHistory: {
      type: [
        new Schema(
          {
            level: { type: Number, required: true },
            by: { type: String, enum: ["Customer", "Admin", "System"], required: true },
            reason: { type: String, trim: true },
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    slaDueAt: { type: Date },
    levelDueAt: { type: Date },
    slaBreached: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    closedAt: { type: Date },
    rating: {
      type: new Schema(
        { stars: { type: Number, min: 1, max: 5, required: true }, feedback: { type: String, trim: true, maxlength: 500 }, at: { type: Date, default: Date.now } },
        { _id: false }
      ),
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

/** Resolution target (minutes) by priority. */
export const SLA_MINUTES: Record<string, number> = { Critical: 30, High: 120, Medium: 360, Low: 1440 };

// New tickets get a readable number and their SLA deadline.
SupportTicketSchema.pre("validate", function (next) {
  if (this.isNew) {
    if (!this.ticketNumber) {
      const d = new Date();
      const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
      this.ticketNumber = `TKT-${ymd}-${rand}`;
    }
    if (!this.slaDueAt) {
      this.slaDueAt = new Date(Date.now() + (SLA_MINUTES[this.priority] || SLA_MINUTES.Medium) * 60000);
      this.levelDueAt = this.slaDueAt;
    }
  }
  next();
});

SupportTicketSchema.index({ seller: 1, status: 1 });
SupportTicketSchema.index({ status: 1, levelDueAt: 1 });
SupportTicketSchema.index({ customer: 1, status: 1 });

const SupportTicket =
  (mongoose.models.SupportTicket as mongoose.Model<ISupportTicket>) ||
  mongoose.model<ISupportTicket>("SupportTicket", SupportTicketSchema);

export default SupportTicket;
