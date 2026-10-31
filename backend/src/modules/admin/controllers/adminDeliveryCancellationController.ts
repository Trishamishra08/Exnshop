import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { decideCancellation, listCancellations } from "../../../services/deliveryCancelService";

/** GET /admin/delivery-cancellations?status=Charged|Refunded|All */
export const getDeliveryCancellations = asyncHandler(async (req: Request, res: Response) => {
  return res.status(200).json({ success: true, data: await listCancellations(req.query.status as string | undefined) });
});

/** POST /admin/delivery-cancellations/:id/decision  { decision: "Refunded" | "Charged", remarks } */
export const decideDeliveryCancellation = asyncHandler(async (req: Request, res: Response) => {
  try {
    await decideCancellation(req.params.id, req.body?.decision, { id: (req as any).user?.userId }, req.body?.remarks);
    return res.status(200).json({
      success: true,
      message: req.body?.decision === "Refunded" ? "Penalty refunded to the delivery partner" : "Penalty kept",
    });
  } catch (err: any) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Could not save the decision" });
  }
});
