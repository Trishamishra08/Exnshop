import { Request, Response } from "express";
import Return from "../../../models/Return";
import OrderItem from "../../../models/OrderItem";
import { sendNotification } from "../../../services/notificationService";

/**
 * POST /admin/returns/:id/exchange-decision  { decision: "Replace" | "Refund" | "Reject", note? }
 * For an exchange whose returned item failed the seller's quality check: the admin
 * decides whether the customer still gets the replacement, a refund, or neither.
 */
export const decideExchangeAfterQc = async (req: Request, res: Response) => {
  try {
    const adminId = String((req as any).user.userId);
    const { decision, note } = req.body || {};
    if (!["Replace", "Refund", "Reject"].includes(decision)) {
      return res.status(400).json({ success: false, message: "Decision must be Replace, Refund or Reject" });
    }
    if (decision === "Reject" && !String(note || "").trim()) {
      return res.status(400).json({ success: false, message: "Add a note for the customer when rejecting" });
    }

    const ret: any = await Return.findById(req.params.id);
    if (!ret || ret.requestType !== "EXCHANGE" || ret.exchangeState !== "QCFailed") {
      return res.status(400).json({ success: false, message: "This request isn't waiting for a quality-check decision." });
    }
    const customerId = String(ret.customer);
    const item: any = await OrderItem.findById(ret.orderItem).select("productName seller").lean();
    const name = item?.productName || "your item";
    let message = "";

    if (decision === "Reject") {
      ret.status = "Rejected";
      ret.exchangeState = undefined;
      ret.rejectionReason = String(note).trim();
      ret.processedBy = adminId as any;
      ret.processedAt = new Date();
      await ret.save();
      message = "Exchange rejected";
      await sendNotification("Customer", customerId, "Exchange not approved", `Your exchange for ${name} was not approved. ${String(note).trim()}`, { type: "Warning", priority: "High" }).catch(() => undefined);
    } else if (decision === "Refund") {
      ret.requestType = "RETURN";
      ret.financialSettlementStatus = "Pending";
      ret.exchangeState = "RefundInitiated";
      ret.requestedVariation = undefined;
      await ret.save();
      const { executeReturnRefundAndReversal } = await import("../../../services/refundSettlementService");
      const result = await executeReturnRefundAndReversal(String(ret._id), adminId);
      if (!result.success) {
        await Return.updateOne({ _id: ret._id }, { $set: { requestType: "EXCHANGE", exchangeState: "QCFailed" } });
        return res.status(500).json({ success: false, message: `Refund could not be completed: ${result.message}` });
      }
      message = "Refund processed";
      await sendNotification("Customer", customerId, "Refund started", `We're refunding ${name}.`, { type: "Success", priority: "High" }).catch(() => undefined);
    } else {
      ret.exchangeState = undefined;
      await ret.save();
      const { triggerReturnFinancialSettlement } = await import("../../../services/returnLifecycleService");
      const settled = await triggerReturnFinancialSettlement(String(ret._id), adminId);
      if (!settled.success) {
        await Return.updateOne({ _id: ret._id }, { $set: { exchangeState: "QCFailed" } });
        return res.status(500).json({ success: false, message: settled.message });
      }
      const { createReplacementOrder } = await import("../../../services/replacementOrderService");
      const replacement = await createReplacementOrder(String(ret._id), req.app.get("io"));
      if (!replacement.success && /out of stock/i.test(replacement.message || "")) {
        await Return.updateOne({ _id: ret._id }, { $set: { exchangeState: "OutOfStock" } });
        await sendNotification("Customer", customerId, "Your replacement is out of stock", "Open your order to choose a refund or wait for the seller to restock.", { type: "Warning", priority: "High" }).catch(() => undefined);
      }
      message = replacement.success ? `Replacement order #${replacement.orderNumber} created` : `Approved, but the replacement isn't created yet: ${replacement.message}`;
      if (replacement.success) {
        await sendNotification("Customer", customerId, "Exchange approved", `Your replacement for ${name} is being prepared.`, { type: "Success", priority: "High" }).catch(() => undefined);
      }
    }

    return res.status(200).json({ success: true, message });
  } catch (error: any) {
    console.error("Error deciding exchange after QC:", error);
    return res.status(500).json({ success: false, message: error.message || "Could not save the decision" });
  }
};
