import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { adminActorOf } from "../../../services/productListingService";
import { adminDocumentView, documentUrlForAdmin, reviewDeliveryDocument } from "../../../services/deliveryDocumentService";

const send = (res: Response, err: any, fallback: string) =>
  res.status(err?.statusCode || 500).json({ success: false, message: err?.message || fallback });
const who = async (req: Request) => {
  const a = await adminActorOf(req);
  return { id: a.actorId, name: a.actorName };
};

/** GET /admin/delivery/:id/documents */
export const getDeliveryDocuments = asyncHandler(async (req: Request, res: Response) => {
  try { return res.json({ success: true, data: await adminDocumentView(req.params.id) }); }
  catch (err: any) { return send(res, err, "Could not load documents"); }
});

/** GET /admin/delivery/:id/documents/:docId/url */
export const getDeliveryDocumentUrl = asyncHandler(async (req: Request, res: Response) => {
  try { return res.json({ success: true, data: { url: await documentUrlForAdmin(req.params.id, req.params.docId, await who(req)) } }); }
  catch (err: any) { return send(res, err, "Could not open the document"); }
});

/** PATCH /admin/delivery/:id/documents/:docId { status: Approved|Rejected, remarks } */
export const reviewDocument = asyncHandler(async (req: Request, res: Response) => {
  try {
    const view = await reviewDeliveryDocument(req.params.id, req.params.docId, req.body?.status, req.body?.remarks, await who(req));
    return res.json({ success: true, message: `Document ${String(req.body?.status).toLowerCase()}`, data: view });
  } catch (err: any) { return send(res, err, "Could not save the review"); }
});
