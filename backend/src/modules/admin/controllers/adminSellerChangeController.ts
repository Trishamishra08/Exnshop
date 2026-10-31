import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { adminActorOf } from "../../../services/productListingService";
import { decideSellerChange, listPendingSellerChanges, sellerHistory } from "../../../services/sellerProfileChangeService";

/** GET /sellers/change-requests — approved sellers' profile/store/bank changes waiting for approval. */
export const getSellerChangeRequests = asyncHandler(async (_req: Request, res: Response) => {
  return res.status(200).json({ success: true, data: await listPendingSellerChanges() });
});

/** POST /sellers/:id/change-request/decision  { decision: "Approved" | "Rejected", remarks } */
export const decideSellerChangeRequest = asyncHandler(async (req: Request, res: Response) => {
  try {
    const actor = await adminActorOf(req);
    await decideSellerChange(req.params.id, req.body?.decision, { id: actor.actorId, name: actor.actorName }, req.body?.remarks);
    return res.status(200).json({
      success: true,
      message: req.body?.decision === "Approved" ? "Changes approved and applied" : "Changes rejected",
    });
  } catch (err: any) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Could not save the decision" });
  }
});

/** GET /sellers/:id/history — every change and decision on this seller, old and new values. */
export const getSellerHistory = asyncHandler(async (req: Request, res: Response) => {
  return res.status(200).json({ success: true, data: await sellerHistory(req.params.id) });
});
