import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { decideRefundRequest, listAllRefundRequests } from "../../../services/sellerRefundService";
import { sendNotification } from "../../../services/notificationService";

export const getRefundRequests = asyncHandler(async (req: Request, res: Response) => {
  const data = await listAllRefundRequests(req.query.status as string | undefined);
  return res.status(200).json({ success: true, data });
});

export const decideRefund = asyncHandler(async (req: Request, res: Response) => {
  try {
    const decision = req.body?.decision;
    const result: any = await decideRefundRequest(req.params.id, decision, String((req as any).user.userId), req.body?.note);

    sendNotification(
      "Seller",
      String(result.seller),
      decision === "Approved" ? "Refund approved" : "Refund declined",
      decision === "Approved"
        ? `The ₹${result.refundAmount} refund on order ${result.orderNumber} was approved and sent to the customer.`
        : `Your refund request on order ${result.orderNumber} was declined. ${result.adminNote || ""}`,
      { type: decision === "Approved" ? "Info" : "Warning", priority: "Medium", link: "/seller/refunds" },
    ).catch((err) => console.error("Failed to notify seller of refund decision:", err?.message));

    if (decision === "Approved") {
      sendNotification(
        "Customer",
        String((await (await import("../../../models/Order")).default.findById(result.order).select("customer").lean() as any)?.customer),
        "Refund processed",
        `₹${result.refundAmount} for order ${result.orderNumber} is being refunded.${result.noteToBuyer ? ` Note from seller: ${result.noteToBuyer}` : ""}`,
        { type: "Success", priority: "Medium" },
      ).catch((err) => console.error("Failed to notify customer of refund:", err?.message));
    }

    return res.status(200).json({ success: true, message: decision === "Approved" ? "Refund processed" : "Request declined", data: result });
  } catch (err: any) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Request failed" });
  }
});
