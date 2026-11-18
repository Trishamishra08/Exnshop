import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import Customer from "../../../models/Customer";
import Seller from "../../../models/Seller";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import SupportTicket from "../../../models/SupportTicket";
import WalletTransaction from "../../../models/WalletTransaction";

/**
 * Read-only "account view" for support: lets an admin see exactly what a customer / seller
 * sees (profile, orders, wallet statement, their tickets) so a complaint can be matched to the data.
 */

const ticketFilter = (type: "Customer" | "Seller", id: string) =>
  type === "Customer" ? { customer: id } : { seller: id };

const loadTickets = (type: "Customer" | "Seller", id: string) =>
  SupportTicket.find(ticketFilter(type, id))
    .sort({ createdAt: -1 })
    .limit(30)
    .select("ticketNumber subject category priority status escalationLevel slaBreached createdAt updatedAt")
    .lean();

const loadStatement = async (userType: "CUSTOMER" | "SELLER", id: string) => {
  const oid = new mongoose.Types.ObjectId(id);
  const [txns, totals] = await Promise.all([
    WalletTransaction.find({ userId: oid, userType })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("relatedOrder", "orderNumber")
      .lean(),
    WalletTransaction.aggregate([
      { $match: { userId: oid, userType, status: "Completed" } },
      { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);
  const sum = (t: string) => totals.find((x) => x._id === t)?.total || 0;
  return { transactions: txns, totalCredits: sum("Credit"), totalDebits: sum("Debit") };
};

/** GET /admin/customers/:id/account */
export const getCustomerAccountView = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid customer id" });

  const customer: any = await Customer.findById(id).select("-password -otp -otpExpiry").lean();
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

  const oid = new mongoose.Types.ObjectId(id);
  const [orders, byStatus, statement, tickets] = await Promise.all([
    Order.find({ customer: oid })
      .sort({ orderDate: -1 })
      .limit(30)
      .select("orderNumber orderDate status paymentMethod paymentStatus total grandTotal items")
      .lean(),
    Order.aggregate([
      { $match: { customer: oid } },
      { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: { $ifNull: ["$grandTotal", "$total"] } } } },
    ]),
    loadStatement("CUSTOMER", id),
    loadTickets("Customer", id),
  ]);

  const spent = byStatus
    .filter((s) => !["Cancelled", "Rejected", "Returned"].includes(s._id))
    .reduce((a, s) => a + (s.amount || 0), 0);

  return res.json({
    success: true,
    data: {
      profile: customer,
      wallet: { balance: customer.walletAmount || 0, ...statement },
      orderSummary: {
        total: byStatus.reduce((a, s) => a + s.count, 0),
        totalSpent: spent,
        byStatus: byStatus.map((s) => ({ status: s._id, count: s.count, amount: s.amount })),
      },
      orders: orders.map((o: any) => ({ ...o, itemCount: o.items?.length || 0, items: undefined })),
      tickets,
    },
  });
});

/** GET /admin/sellers/:id/account */
export const getSellerAccountView = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid seller id" });

  const seller: any = await Seller.findById(id)
    .select("sellerName storeName email mobile category city state address status onboardingStatus balance gstin panCard createdAt")
    .lean();
  if (!seller) return res.status(404).json({ success: false, message: "Seller not found" });

  const oid = new mongoose.Types.ObjectId(id);
  const [items, byStatus, statement, tickets] = await Promise.all([
    OrderItem.find({ seller: oid })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate("order", "orderNumber orderDate status paymentMethod")
      .select("order productName quantity total status sellerStatus commissionAmount createdAt")
      .lean(),
    OrderItem.aggregate([
      { $match: { seller: oid } },
      { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$total" }, commission: { $sum: "$commissionAmount" } } },
    ]),
    loadStatement("SELLER", id),
    loadTickets("Seller", id),
  ]);

  const delivered = byStatus.find((s) => s._id === "Delivered");
  return res.json({
    success: true,
    data: {
      profile: seller,
      wallet: { balance: seller.balance || 0, ...statement },
      orderSummary: {
        total: byStatus.reduce((a, s) => a + s.count, 0),
        deliveredSales: delivered?.amount || 0,
        commission: delivered?.commission || 0,
        byStatus: byStatus.map((s) => ({ status: s._id, count: s.count, amount: s.amount })),
      },
      orders: items,
      tickets,
    },
  });
});
