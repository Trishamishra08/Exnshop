import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Customer from "../../../models/Customer";
import Order from "../../../models/Order";
import WithdrawRequest from "../../../models/WithdrawRequest";
import { getWalletBalance } from "../../../services/walletManagementService";

/**
 * Get all customers with filters
 */
export const getAllCustomers = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = "registrationDate",
      sortOrder = "desc",
    } = req.query;

    const query: any = {};

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search as string, $options: "i" } },
        { email: { $regex: search as string, $options: "i" } },
        { phone: { $regex: search as string, $options: "i" } },
        { refCode: { $regex: search as string, $options: "i" } },
      ];
    }

    const sort: any = {};
    sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [customers, total] = await Promise.all([
      Customer.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit as string)),
      Customer.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: "Customers fetched successfully",
      data: customers,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }
);

/**
 * Get customer by ID
 */
export const getCustomerById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const customer = await Customer.findById(id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer fetched successfully",
      data: customer,
    });
  }
);

/**
 * Update customer status
 */
export const updateCustomerStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!["Active", "Inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Active or Inactive",
      });
    }

    const customer = await Customer.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer status updated successfully",
      data: customer,
    });
  }
);

/**
 * Get customer orders
 */
export const getCustomerOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    const query: any = { customer: id };
    if (status) query.status = status;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("items")
        .populate("deliveryBoy", "name mobile")
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(parseInt(limit as string)),
      Order.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      message: "Customer orders fetched successfully",
      data: orders,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }
);


// ── Customer bank details & payouts (refunds to bank, wallet balance transfers) ──

const OPEN_PAYOUT = ["Pending", "Approved", "Processing"];

/**
 * GET /admin/customers/:id/payouts
 * The customer's saved bank account / UPI, wallet balance and their payout requests,
 * so the admin can see where to pay and what is still owed.
 */
export const getCustomerPayoutInfo = asyncHandler(async (req: Request, res: Response) => {
  const customer: any = await Customer.findById(req.params.id).select("name email phone walletAmount bankDetails pendingBankChange").lean();
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

  const [walletBalance, payouts] = await Promise.all([
    getWalletBalance(String(customer._id), "CUSTOMER"),
    WithdrawRequest.find({ userId: customer._id, userType: "CUSTOMER" }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  const pendingTotal = payouts.filter((p: any) => OPEN_PAYOUT.includes(p.status)).reduce((t: number, p: any) => t + (p.amount || 0), 0);
  const b = customer.bankDetails || {};

  return res.status(200).json({
    success: true,
    data: {
      customer: { _id: customer._id, name: customer.name, email: customer.email, phone: customer.phone },
      walletBalance,
      pendingTotal,
      availableToPay: Math.max(0, Math.round((walletBalance - pendingTotal) * 100) / 100),
      bankDetails: {
        accountHolderName: b.accountHolderName || "",
        accountNumber: b.accountNumber || "",
        ifscCode: b.ifscCode || "",
        bankName: b.bankName || "",
        upiId: b.upiId || "",
        updatedAt: b.updatedAt || null,
        hasBank: Boolean(b.accountNumber && b.ifscCode),
        hasUpi: Boolean(b.upiId),
        hasProof: Boolean(b.proof?.publicId),
        approvedAt: b.approvedAt || null,
        approvedBy: b.approvedBy || "",
      },
      pendingBankChange: customer.pendingBankChange
        ? {
            status: customer.pendingBankChange.status,
            remarks: customer.pendingBankChange.remarks || "",
            submittedAt: customer.pendingBankChange.submittedAt,
            accountHolderName: customer.pendingBankChange.accountHolderName || "",
            accountNumber: customer.pendingBankChange.accountNumber || "",
            ifscCode: customer.pendingBankChange.ifscCode || "",
            bankName: customer.pendingBankChange.bankName || "",
            upiId: customer.pendingBankChange.upiId || "",
            hasProof: Boolean(customer.pendingBankChange.proof?.publicId),
          }
        : null,
      payouts,
    },
  });
});

/**
 * POST /admin/customers/:id/payouts  { amount, method: "Bank Transfer" | "UPI" }
 * Starts a payment of the customer's wallet balance to their bank / UPI. It is created
 * already approved; the admin then pays it (RazorpayX, or manually and enters the UTR),
 * and the wallet is debited when it is marked paid — the same flow as Withdrawals.
 */
export const createCustomerPayout = asyncHandler(async (req: Request, res: Response) => {
  const customer: any = await Customer.findById(req.params.id).select("bankDetails").lean();
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  const method = req.body.method === "UPI" ? "UPI" : "Bank Transfer";
  if (!(amount >= 1)) return res.status(400).json({ success: false, message: "Enter an amount of at least ₹1" });

  const b = customer.bankDetails || {};
  if (method === "UPI" ? !b.upiId : !(b.accountNumber && b.ifscCode)) {
    return res.status(400).json({ success: false, message: `The customer hasn't saved a ${method === "UPI" ? "UPI ID" : "bank account"} yet.` });
  }

  const [balance, open] = await Promise.all([
    getWalletBalance(String(customer._id), "CUSTOMER"),
    WithdrawRequest.find({ userId: customer._id, userType: "CUSTOMER", status: { $in: OPEN_PAYOUT } }).select("amount").lean(),
  ]);
  const available = Math.max(0, balance - open.reduce((t: number, p: any) => t + (p.amount || 0), 0));
  if (amount > available + 0.001) {
    return res.status(400).json({ success: false, message: `Only ₹${available.toFixed(2)} is available (wallet balance minus payouts already in progress).` });
  }

  const request = await WithdrawRequest.create({
    userId: customer._id,
    userType: "CUSTOMER",
    amount,
    status: "Approved",
    paymentMethod: method,
    accountDetails: method === "UPI"
      ? `UPI ${b.upiId}`
      : `${b.accountHolderName || ""} · A/C ${b.accountNumber} · IFSC ${b.ifscCode}${b.bankName ? ` · ${b.bankName}` : ""}`,
    upiId: method === "UPI" ? b.upiId : undefined,
    remarks: String(req.body.note || "").trim().slice(0, 200) || "Payout started by admin",
    processedBy: (req as any).user?.userId,
    processedAt: new Date(),
  });
  return res.status(201).json({ success: true, message: "Payout created. Pay it now, then mark it paid.", data: request });
});

/** GET /admin/customers/:id/bank-proof?which=pending|approved — short-lived link to the proof file. */
export const getCustomerBankProofUrl = asyncHandler(async (req: Request, res: Response) => {
  const c: any = await Customer.findById(req.params.id).select("bankDetails pendingBankChange").lean();
  const proof = req.query.which === "approved" ? c?.bankDetails?.proof : c?.pendingBankChange?.proof;
  if (!proof?.publicId) return res.status(404).json({ success: false, message: "No proof file attached" });
  const { signedDocumentUrl } = await import("../../../services/sellerOnboardingService");
  return res.json({ success: true, data: { url: signedDocumentUrl(proof) } });
});

/**
 * POST /admin/customers/:id/bank-decision  { decision: "Approved" | "Rejected", remarks? }
 * Approving makes the requested details the ones used for refunds and payouts.
 */
export const decideCustomerBankChange = asyncHandler(async (req: Request, res: Response) => {
  const decision = req.body.decision;
  const remarks = String(req.body.remarks || "").trim().slice(0, 300);
  if (!["Approved", "Rejected"].includes(decision)) return res.status(400).json({ success: false, message: "Decision must be Approved or Rejected" });
  if (decision === "Rejected" && !remarks) return res.status(400).json({ success: false, message: "Please give a reason so the customer knows what to fix" });

  const c: any = await Customer.findById(req.params.id);
  const p = c?.pendingBankChange;
  if (!c || !p || p.status !== "Pending") return res.status(404).json({ success: false, message: "No bank details are waiting for approval" });

  const adminName = (req as any).user?.name || (req as any).user?.email || (req as any).user?.userId || "Admin";
  if (decision === "Approved") {
    if (p.accountNumber && !p.proof?.publicId) return res.status(400).json({ success: false, message: "The bank proof is missing — ask the customer to resubmit" });
    c.bankDetails = {
      accountHolderName: p.accountHolderName, accountNumber: p.accountNumber, ifscCode: p.ifscCode,
      bankName: p.bankName, upiId: p.upiId, proof: p.proof, updatedAt: new Date(), approvedAt: new Date(), approvedBy: String(adminName),
    };
    c.pendingBankChange = undefined;
  } else {
    c.pendingBankChange.status = "Rejected";
    c.pendingBankChange.remarks = remarks;
    c.pendingBankChange.reviewedAt = new Date();
  }
  await c.save();

  try {
    const { sendNotification } = await import("../../../services/notificationService");
    await sendNotification(
      "Customer", String(c._id),
      decision === "Approved" ? "Bank details approved" : "Bank details not approved",
      decision === "Approved" ? "Your bank details are approved and can now be used for refunds and wallet transfers." : `Your bank details were not approved: ${remarks}`,
      { type: decision === "Approved" ? "Success" : "Warning", link: "/account/bank-details", priority: "Medium" },
    );
  } catch { /* best effort */ }
  return res.json({ success: true, message: decision === "Approved" ? "Bank details approved" : "Bank details rejected" });
});
