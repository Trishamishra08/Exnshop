import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Claim from "../../../models/Claim";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import { sendNotification } from "../../../services/notificationService";

/**
 * Raise a dispute/claim on an order (e.g. damaged RTO, missing return item,
 * wrongly deducted settlement) — the seller's evidence + requested amount,
 * for admin to review and decide.
 */
export const raiseClaim = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { orderId, reason, description, claimAmount, photos, returnRequestId } = req.body;

  if (!orderId || !reason || claimAmount === undefined) {
    return res.status(400).json({
      success: false,
      message: "orderId, reason and claimAmount are required",
    });
  }

  // Confirm this seller actually has items in the order being claimed against.
  const sellerItem = await OrderItem.findOne({ order: orderId, seller: sellerId });
  if (!sellerItem) {
    return res.status(403).json({
      success: false,
      message: "You don't have any items in this order",
    });
  }

  const order = await Order.findById(orderId).select("orderNumber");

  const claim = await Claim.create({
    seller: sellerId,
    order: orderId,
    orderNumber: order?.orderNumber,
    returnRequest: returnRequestId || undefined,
    reason,
    description,
    claimAmount: Number(claimAmount),
    photos: Array.isArray(photos) ? photos : [],
    status: "Raised",
  });

  return res.status(201).json({
    success: true,
    message: "Claim raised successfully. Admin will review it shortly.",
    data: claim,
  });
});

/**
 * Get this seller's own claims, newest first.
 */
export const getMyClaims = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { status } = req.query;

  const query: any = { seller: sellerId };
  if (status) query.status = status;

  const claims = await Claim.find(query).sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    message: "Claims fetched successfully",
    data: claims,
  });
});

/**
 * Admin: list all claims, optionally filtered by status.
 */
export const getAllClaims = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query;
  const query: any = {};
  if (status) query.status = status;

  const claims = await Claim.find(query)
    .populate("seller", "sellerName storeName")
    .sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    message: "Claims fetched successfully",
    data: claims,
  });
});

/**
 * Admin: approve or reject a claim, optionally with an approved amount
 * (may differ from what the seller requested) and a decision reason.
 */
export const decideClaim = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, approvedAmount, adminDecisionReason } = req.body;

  if (!["Approved", "Rejected", "Under Review"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be Approved, Rejected or Under Review",
    });
  }

  const updateData: any = { status };
  if (status === "Approved" || status === "Rejected") {
    updateData.decidedBy = (req as any).user?.userId;
    updateData.decidedAt = new Date();
    if (adminDecisionReason) updateData.adminDecisionReason = adminDecisionReason;
    if (status === "Approved" && approvedAmount !== undefined) {
      updateData.approvedAmount = Number(approvedAmount);
    }
  }

  const claim = await Claim.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!claim) {
    return res.status(404).json({ success: false, message: "Claim not found" });
  }

  sendNotification(
    "Seller",
    claim.seller.toString(),
    status === "Approved" ? "Claim Approved" : status === "Rejected" ? "Claim Rejected" : "Claim Under Review",
    status === "Approved"
      ? `Your claim for order ${claim.orderNumber || ""} was approved for ₹${claim.approvedAmount ?? claim.claimAmount}.`
      : status === "Rejected"
        ? `Your claim for order ${claim.orderNumber || ""} was rejected. ${adminDecisionReason || ""}`
        : `Your claim for order ${claim.orderNumber || ""} is now under review.`,
    { type: status === "Approved" ? "Success" : status === "Rejected" ? "Error" : "Info", priority: "Medium" }
  ).catch((err) => console.error("Failed to send claim decision notification:", err));

  return res.status(200).json({
    success: true,
    message: `Claim ${status.toLowerCase()} successfully`,
    data: claim,
  });
});
