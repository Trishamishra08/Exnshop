import { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../../utils/asyncHandler";
import Claim from "../../../models/Claim";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import Return from "../../../models/Return";
import RTOEvent from "../../../models/RTOEvent";
import { sendNotification } from "../../../services/notificationService";
import { creditWallet } from "../../../services/walletManagementService";

/** Seller must raise a claim within this many days of receiving the RTO/return (or delivery, for a general order claim). */
const CLAIM_WINDOW_DAYS = 7;

/**
 * Raise a dispute/claim on an order (e.g. damaged RTO, missing return item,
 * wrongly deducted settlement) — the seller's evidence + requested amount,
 * for admin to review and decide.
 */
export const raiseClaim = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { reason, description, claimAmount, photos, videos, documents, returnRequestId, rtoEventId } = req.body;
  const orderRef = typeof req.body.orderId === "string" ? req.body.orderId.trim().replace(/^#/, "") : req.body.orderId;

  if (!orderRef || !reason || claimAmount === undefined) {
    return res.status(400).json({
      success: false,
      message: "orderId, reason and claimAmount are required",
    });
  }

  // Sellers usually type the visible order number (ORD...), not the internal id.
  const order = await Order.findOne(
    mongoose.isValidObjectId(orderRef) ? { _id: orderRef } : { orderNumber: orderRef }
  ).select("orderNumber deliveredAt createdAt");
  if (!order) {
    return res.status(404).json({ success: false, message: "Order not found. Check the order number." });
  }
  const orderId = order._id;

  // Confirm this seller actually has items in the order being claimed against.
  const sellerItem = await OrderItem.findOne({ order: orderId, seller: sellerId });
  if (!sellerItem) {
    return res.status(403).json({
      success: false,
      message: "You don't have any items in this order",
    });
  }

  // Figure out when the seller actually received the item back — that's what the
  // claim window counts from, not order creation. RTO/return each have their own
  // "received by seller" milestone; a general order-level claim falls back to delivery.
  let receivedAt: Date | null = null;

  if (returnRequestId) {
    const returnDoc = await Return.findOne({ _id: returnRequestId, order: orderId });
    if (!returnDoc) {
      return res.status(404).json({ success: false, message: "Return request not found for this order" });
    }
    receivedAt = returnDoc.handedToSellerAt || returnDoc.completedAt || (returnDoc as any).createdAt;
  } else if (rtoEventId) {
    const rtoDoc = await RTOEvent.findOne({ _id: rtoEventId, order: orderId, seller: sellerId });
    if (!rtoDoc) {
      return res.status(404).json({ success: false, message: "RTO event not found for this order" });
    }
    receivedAt = rtoDoc.status === "ReceivedBySeller" ? (rtoDoc as any).updatedAt : (rtoDoc as any).createdAt;
  } else {
    receivedAt = order.deliveredAt || (order as any).createdAt || null;
  }

  let claimDeadline: Date | undefined;
  if (receivedAt) {
    claimDeadline = new Date(receivedAt.getTime() + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (Date.now() > claimDeadline.getTime()) {
      return res.status(400).json({
        success: false,
        message: `Claim window has closed. Claims must be raised within ${CLAIM_WINDOW_DAYS} days of receiving the item (deadline was ${claimDeadline.toLocaleDateString()}).`,
      });
    }
  }

  const claim = await Claim.create({
    seller: sellerId,
    order: orderId,
    orderNumber: order.orderNumber,
    returnRequest: returnRequestId || undefined,
    rtoEvent: rtoEventId || undefined,
    reason,
    description,
    claimAmount: Number(claimAmount),
    photos: Array.isArray(photos) ? photos : [],
    videos: Array.isArray(videos) ? videos : [],
    documents: Array.isArray(documents) ? documents : [],
    status: "Raised",
    claimDeadline,
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

  const claim = await Claim.findById(id);
  if (!claim) {
    return res.status(404).json({ success: false, message: "Claim not found" });
  }
  if (claim.status === "Approved" || claim.status === "Rejected") {
    return res.status(409).json({ success: false, message: `This claim was already ${claim.status.toLowerCase()}` });
  }

  claim.status = status;
  if (status === "Approved" || status === "Rejected") {
    claim.decidedBy = (req as any).user?.userId;
    claim.decidedAt = new Date();
    if (adminDecisionReason) claim.adminDecisionReason = adminDecisionReason;
  }
  if (status === "Approved") {
    const amount = approvedAmount !== undefined && approvedAmount !== "" ? Number(approvedAmount) : claim.claimAmount;
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ success: false, message: "Approved amount must be a valid non-negative number" });
    }
    claim.approvedAmount = amount;
  }
  await claim.save();

  // Pay the approved amount into the seller's wallet. The claim-scoped reference
  // makes this idempotent, so a retried request can't credit twice.
  if (status === "Approved" && (claim.approvedAmount ?? 0) > 0) {
    await creditWallet(
      claim.seller.toString(),
      "SELLER",
      claim.approvedAmount!,
      `Claim approved for order ${claim.orderNumber || claim.order}`,
      claim.order.toString(),
      undefined,
      undefined,
      `CLAIM-${claim._id}`,
      "MANUAL_ADMIN_CREDIT",
    );
  }

  sendNotification(
    "Seller",
    claim.seller.toString(),
    status === "Approved" ? "Claim Approved" : status === "Rejected" ? "Claim Rejected" : "Claim Under Review",
    status === "Approved"
      ? `Your claim for order ${claim.orderNumber || ""} was approved for ₹${claim.approvedAmount ?? claim.claimAmount}. The amount has been added to your wallet.`
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
