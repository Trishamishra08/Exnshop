import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { adminActorOf } from "../../../services/productListingService";
import { decideDeliveryChange, deliveryHistory, listPendingDeliveryChanges } from "../../../services/deliveryProfileChangeService";

/** GET /admin/delivery-change-requests */
export const getDeliveryChangeRequests = asyncHandler(async (_req: Request, res: Response) =>
  res.status(200).json({ success: true, data: await listPendingDeliveryChanges() }),
);

/** POST /admin/delivery/:id/change-request/decision { decision, remarks } */
export const decideDeliveryChangeRequest = asyncHandler(async (req: Request, res: Response) => {
  try {
    const actor = await adminActorOf(req);
    await decideDeliveryChange(req.params.id, req.body?.decision, { id: actor.actorId, name: actor.actorName }, req.body?.remarks);
    return res.status(200).json({ success: true, message: req.body?.decision === "Approved" ? "Changes approved and applied" : "Changes rejected" });
  } catch (err: any) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Could not save the decision" });
  }
});

/** GET /admin/delivery/:id/history — every change and decision, old and new values. */
export const getDeliveryHistory = asyncHandler(async (req: Request, res: Response) =>
  res.status(200).json({ success: true, data: await deliveryHistory(req.params.id) }),
);
