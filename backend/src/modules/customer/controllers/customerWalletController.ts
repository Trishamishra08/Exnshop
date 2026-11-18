import { Request, Response } from "express";
import mongoose from "mongoose";
import { getWalletBalance, getWalletTransactions } from "../../../services/walletManagementService";
import Customer from "../../../models/Customer";
import Order from "../../../models/Order";
import Payment from "../../../models/Payment";
import WalletTransaction from "../../../models/WalletTransaction";
import WithdrawRequest from "../../../models/WithdrawRequest";

/**
 * Get customer wallet balance
 */
export const getCustomerWalletBalance = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const balance = await getWalletBalance(userId, "CUSTOMER");

    return res.status(200).json({
      success: true,
      message: "Customer wallet balance fetched successfully",
      data: { balance },
    });
  } catch (error: any) {
    console.error("Error getting customer wallet balance:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get customer wallet balance",
    });
  }
};

/**
 * Get customer wallet transactions
 */
export const getCustomerWalletTransactions = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { page = 1, limit = 20 } = req.query;

    const result = await getWalletTransactions(
      userId,
      "CUSTOMER",
      Number(page),
      Number(limit)
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error getting customer wallet transactions:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get customer wallet transactions",
    });
  }
};

// ── Bank details, wallet → bank withdrawals, account statement ──────────────

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_REGEX = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;

/** Bank account number shown with all but the last 4 digits hidden. */
const maskAccount = (n?: string) => (n ? `${"•".repeat(Math.max(0, n.length - 4))}${n.slice(-4)}` : "");

/** The proof file (statement / cancelled cheque) as the client may know it — never a link. */
const proofInfo = (p: any) => (p?.publicId ? { originalName: p.originalName || "Uploaded file", hasProof: true } : null);

/**
 * GET /customer/bank-details
 * The approved details (the only ones used for refunds / payouts) plus any request that
 * is waiting for, or was turned down by, the admin.
 */
export const getCustomerBankDetails = async (req: Request, res: Response) => {
  const c: any = await Customer.findById(req.user!.userId).select("bankDetails pendingBankChange").lean();
  const b = c?.bankDetails || {};
  const p = c?.pendingBankChange;
  return res.status(200).json({
    success: true,
    data: {
      accountHolderName: b.accountHolderName || "",
      accountNumber: b.accountNumber || "",
      accountNumberMasked: maskAccount(b.accountNumber),
      ifscCode: b.ifscCode || "",
      bankName: b.bankName || "",
      upiId: b.upiId || "",
      updatedAt: b.updatedAt || null,
      hasBank: Boolean(b.accountNumber && b.ifscCode),
      hasUpi: Boolean(b.upiId),
      proof: proofInfo(b.proof),
      pending: p
        ? {
            status: p.status,
            remarks: p.remarks || "",
            submittedAt: p.submittedAt,
            accountHolderName: p.accountHolderName || "",
            accountNumberMasked: maskAccount(p.accountNumber),
            ifscCode: p.ifscCode || "",
            bankName: p.bankName || "",
            upiId: p.upiId || "",
            proof: proofInfo(p.proof),
          }
        : null,
    },
  });
};

/**
 * PUT /customer/bank-details (multipart: fields + optional `proof` file)
 * New or changed bank details never replace the approved ones directly: they wait for the
 * admin. A bank account needs a statement / cancelled-cheque photo; a UPI-only change doesn't.
 */
export const saveCustomerBankDetails = async (req: Request, res: Response) => {
  const s = (v: any) => String(v ?? "").trim();
  const accountHolderName = s(req.body.accountHolderName).slice(0, 100);
  const accountNumber = s(req.body.accountNumber).replace(/s/g, "");
  const ifscCode = s(req.body.ifscCode).toUpperCase();
  const bankName = s(req.body.bankName).slice(0, 100);
  const upiId = s(req.body.upiId);
  const file = (req as any).file;
  const bad = (message: string) => res.status(400).json({ success: false, message });

  const anyBank = accountHolderName || accountNumber || ifscCode;
  if (anyBank) {
    if (!accountHolderName) return bad("Enter the account holder's name");
    if (!/^[0-9]{9,18}$/.test(accountNumber)) return bad("Account number must be 9 to 18 digits");
    if (!IFSC_REGEX.test(ifscCode)) return bad("Enter a valid IFSC code, e.g. SBIN0001234");
  }
  if (upiId && !UPI_REGEX.test(upiId)) return bad("Enter a valid UPI ID, e.g. name@okbank");
  if (!anyBank && !upiId) return bad("Add a bank account or a UPI ID");
  if (file && file.size > 10 * 1024 * 1024) return bad("The proof must be 10 MB or smaller");

  const customer: any = await Customer.findById(req.user!.userId).select("name bankDetails pendingBankChange");
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
  const cur = customer.bankDetails || {};

  // A bank account that is new or different from the approved one must come with proof.
  const bankChanged = Boolean(anyBank) && (accountNumber !== (cur.accountNumber || "") || ifscCode !== (cur.ifscCode || "") || accountHolderName !== (cur.accountHolderName || ""));
  if (bankChanged && !file) return bad("Attach a photo of your bank account statement or cancelled cheque");
  if (!bankChanged && upiId === (cur.upiId || "") && bankName === (cur.bankName || "") && !file) return bad("Nothing has changed");

  let proof: any;
  if (file) {
    try {
      const { uploadPrivateDocument } = await import("../../../services/sellerOnboardingService");
      const stored = await uploadPrivateDocument(String(customer._id), file.buffer, "exnshop/customer-bank-proof");
      proof = { publicId: stored.publicId, resourceType: stored.resourceType, format: stored.format, originalName: String(file.originalname || "").slice(0, 120) };
    } catch {
      return res.status(502).json({ success: false, message: "Could not upload the proof. Please try again." });
    }
  } else {
    proof = customer.bankDetails?.proof; // unchanged account: keep the approved proof with the request
  }

  customer.pendingBankChange = {
    accountHolderName, accountNumber, ifscCode, bankName, upiId, proof,
    status: "Pending", submittedAt: new Date(),
  };
  await customer.save();

  try {
    const { sendBroadcastNotification } = await import("../../../services/notificationService");
    await sendBroadcastNotification(
      "Admin",
      "Customer bank details — approval needed",
      `${customer.name || "A customer"} submitted bank details. Review them in Customers → Bank & Pay.`,
      { type: "Info", priority: "Medium", link: "/admin/customers" },
    );
  } catch { /* best effort */ }

  return getCustomerBankDetails(req, res);
};

/** DELETE /customer/bank-details/pending — withdraw a request (or dismiss a rejected one). */
export const cancelPendingBankChange = async (req: Request, res: Response) => {
  await Customer.updateOne({ _id: req.user!.userId }, { $unset: { pendingBankChange: 1 } });
  return getCustomerBankDetails(req, res);
};

/** Wallet money already promised to bank transfers that haven't been paid yet. */
const pendingWithdrawalTotal = async (userId: string) => {
  const rows = await WithdrawRequest.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), userType: "CUSTOMER", status: { $in: ["Pending", "Approved", "Processing"] } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return rows[0]?.total || 0;
};

/** POST /customer/wallet/withdraw — move wallet balance to the saved bank account / UPI. */
export const requestCustomerWithdrawal = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  const method = req.body.method === "UPI" ? "UPI" : "Bank Transfer";
  if (!(amount >= 1)) return res.status(400).json({ success: false, message: "Enter an amount of at least ₹1" });

  const c: any = await Customer.findById(userId).select("bankDetails").lean();
  const b = c?.bankDetails || {};
  if (method === "UPI" ? !b.upiId : !(b.accountNumber && b.ifscCode)) {
    return res.status(400).json({ success: false, message: `Add your ${method === "UPI" ? "UPI ID" : "bank account"} in Bank Details first.` });
  }

  const balance = await getWalletBalance(userId, "CUSTOMER");
  const available = Math.max(0, balance - (await pendingWithdrawalTotal(userId)));
  if (amount > available) {
    return res.status(400).json({ success: false, message: `You can transfer up to ₹${available.toFixed(2)} (wallet balance minus transfers already in progress).` });
  }

  const request = await WithdrawRequest.create({
    userId,
    userType: "CUSTOMER",
    amount,
    status: "Pending",
    paymentMethod: method,
    accountDetails: method === "UPI"
      ? `UPI ${b.upiId}`
      : `${b.accountHolderName || ""} · A/C ${b.accountNumber} · IFSC ${b.ifscCode}${b.bankName ? ` · ${b.bankName}` : ""}`,
    upiId: method === "UPI" ? b.upiId : undefined,
    remarks: "Wallet balance transfer to bank",
  });
  return res.status(201).json({ success: true, message: "Transfer requested. It usually reaches your account in 2–3 working days.", data: request });
};

/** GET /customer/wallet/withdrawals */
export const getCustomerWithdrawals = async (req: Request, res: Response) => {
  const rows = await WithdrawRequest.find({ userId: req.user!.userId, userType: "CUSTOMER" }).sort({ createdAt: -1 }).limit(50).lean();
  return res.status(200).json({ success: true, data: rows });
};

/**
 * GET /customer/statement — one ledger of everything money-related on the account:
 * order payments (online / cash on delivery / wallet), refunds (to the original payment
 * or the wallet), wallet credits & debits, and transfers to the bank.
 */
export const getCustomerStatement = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const [orders, walletTx, payments, withdrawals, balance] = await Promise.all([
    Order.find({ customer: userId })
      .select("orderNumber total paymentMethod paymentStatus status walletAmountUsed onlineAmountPaid createdAt orderDate")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    WalletTransaction.find({ userId, userType: "CUSTOMER" }).sort({ createdAt: -1 }).limit(500).lean(),
    Payment.find({ customer: userId, refundAmount: { $gt: 0 } }).select("order refundAmount refundedAt refundReason updatedAt").populate("order", "orderNumber").lean(),
    WithdrawRequest.find({ userId, userType: "CUSTOMER" }).sort({ createdAt: -1 }).limit(100).lean(),
    getWalletBalance(userId, "CUSTOMER"),
  ]);

  type Entry = {
    id: string; date: Date; type: "Credit" | "Debit"; kind: string; mode: string; description: string;
    amount: number; status: string; orderNumber?: string; orderId?: string;
  };
  const entries: Entry[] = [];
  const isOnline = (m?: string) => /online|razorpay|cashfree|upi|card/i.test(m || "");

  for (const o of orders as any[]) {
    const date = o.orderDate || o.createdAt;
    const wallet = Number(o.walletAmountUsed) || 0;
    if (isOnline(o.paymentMethod)) {
      const paid = Number(o.onlineAmountPaid) || Math.max(0, (Number(o.total) || 0) - wallet);
      if (["Paid", "Refunded"].includes(o.paymentStatus) && paid > 0) {
        entries.push({ id: `ord-${o._id}`, date, type: "Debit", kind: "Order payment", mode: "Online", description: `Paid for order #${o.orderNumber}`, amount: paid, status: "Completed", orderNumber: o.orderNumber, orderId: String(o._id) });
      }
    } else {
      // Cash on delivery is paid when the parcel is handed over.
      const cash = Math.max(0, (Number(o.total) || 0) - wallet);
      const paid = ["Paid", "Refunded"].includes(o.paymentStatus) || ["Delivered", "Returned"].includes(o.status);
      if (cash > 0 && !["Cancelled", "Rejected"].includes(o.status)) {
        entries.push({ id: `ord-${o._id}`, date, type: "Debit", kind: "Order payment", mode: "Cash on delivery", description: `Order #${o.orderNumber}${paid ? "" : " (pay on delivery)"}`, amount: cash, status: paid ? "Completed" : "Pending", orderNumber: o.orderNumber, orderId: String(o._id) });
      }
    }
  }

  const walletKind = (t: any) => {
    switch (t.category) {
      case "COD_RETURN_REFUND": return "Return refund";
      case "ORDER_CANCELLATION_REFUND": return "Cancellation refund";
      case "ORDER_PAYMENT": return "Order payment";
      case "MANUAL_ADMIN_CREDIT": return "Credit from Exnshop";
      case "MANUAL_ADMIN_DEBIT": return "Adjustment";
      default: return /withdraw/i.test(t.description || "") ? "Transfer to bank" : t.type === "Credit" ? "Wallet credit" : "Wallet debit";
    }
  };
  for (const t of walletTx as any[]) {
    entries.push({ id: `wal-${t._id}`, date: t.createdAt, type: t.type, kind: walletKind(t), mode: "Wallet", description: t.description, amount: Number(t.amount) || 0, status: t.status || "Completed", orderId: t.relatedOrder ? String(t.relatedOrder) : undefined });
  }

  for (const p of payments as any[]) {
    const num = p.order?.orderNumber;
    entries.push({ id: `ref-${p._id}`, date: p.refundedAt || p.updatedAt, type: "Credit", kind: "Refund", mode: "Original payment", description: `Refunded to your card / UPI${num ? ` for order #${num}` : ""}${p.refundReason ? ` — ${p.refundReason}` : ""}`, amount: Number(p.refundAmount) || 0, status: "Completed", orderNumber: num, orderId: p.order?._id ? String(p.order._id) : undefined });
  }

  // Bank transfers still on their way (a paid one already shows as a wallet debit).
  for (const w of withdrawals as any[]) {
    if (!["Pending", "Approved", "Processing", "Rejected"].includes(w.status)) continue;
    entries.push({ id: `wd-${w._id}`, date: w.createdAt, type: "Debit", kind: "Transfer to bank", mode: w.paymentMethod === "UPI" ? "UPI" : "Bank", description: w.remarks || "Wallet balance transfer to bank", amount: Number(w.amount) || 0, status: w.status === "Rejected" ? "Failed" : "Pending" });
  }

  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const done = entries.filter((e) => e.status === "Completed");
  const sum = (xs: Entry[]) => Math.round(xs.reduce((t, e) => t + e.amount, 0) * 100) / 100;
  const summary = {
    walletBalance: balance,
    totalPaid: sum(done.filter((e) => e.kind === "Order payment")),
    totalRefunded: sum(done.filter((e) => e.type === "Credit" && /refund/i.test(e.kind))),
    totalCredits: sum(done.filter((e) => e.type === "Credit")),
    totalDebits: sum(done.filter((e) => e.type === "Debit")),
    pendingBankTransfers: await pendingWithdrawalTotal(userId),
  };
  return res.status(200).json({ success: true, data: { summary, entries } });
};
