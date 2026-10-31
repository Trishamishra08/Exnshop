import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Delivery from "../../../models/Delivery";
import { buildDocumentView, documentUrlForPartner, uploadDeliveryDocument } from "../../../services/deliveryDocumentService";

const send = (res: Response, err: any, fallback: string) =>
  res.status(err?.statusCode || 500).json({ success: false, message: err?.message || fallback });

/** GET /delivery/documents — the checklist with each document's status. */
export const getMyDocuments = asyncHandler(async (req: Request, res: Response) => {
  const delivery: any = await Delivery.findById(req.user!.userId).select("documents status");
  if (!delivery) return res.status(404).json({ success: false, message: "Delivery partner not found" });
  return res.json({ success: true, data: { accountStatus: delivery.status, ...buildDocumentView(delivery) } });
});

/** POST /delivery/documents (multipart: file, docType) */
export const uploadMyDocument = asyncHandler(async (req: Request, res: Response) => {
  try {
    const view = await uploadDeliveryDocument(req.user!.userId, String(req.body.docType || ""), (req as any).file);
    return res.json({ success: true, message: "Document uploaded. It will be reviewed by the admin.", data: view });
  } catch (err: any) {
    return send(res, err, "Could not upload the document");
  }
});

/** GET /delivery/documents/:docId/url */
export const getMyDocumentUrl = asyncHandler(async (req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: { url: await documentUrlForPartner(req.user!.userId, req.params.docId) } });
  } catch (err: any) {
    return send(res, err, "Could not open the document");
  }
});
