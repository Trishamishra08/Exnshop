import Delivery from "../models/Delivery";
import { DELIVERY_DOCUMENT_INFO, DELIVERY_DOCUMENT_TYPES, DeliveryDocumentType } from "../constants/deliveryDocuments";
import { signedDocumentUrl, uploadPrivateDocument } from "./sellerOnboardingService";
import { auditDelivery } from "./deliveryProfileChangeService";
import { sendNotification } from "./notificationService";

const MAX_BYTES = 10 * 1024 * 1024;
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const isType = (t: any): t is DeliveryDocumentType => (DELIVERY_DOCUMENT_TYPES as readonly string[]).includes(t);

/** The document that counts for a type: the approved one, else the latest still in review / rejected. */
const currentDoc = (docs: any[], type: string) => {
  const ofType = docs.filter((d) => d.docType === type && d.status !== "Superseded");
  return ofType.find((d) => d.status === "Approved") || ofType.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt))[0] || null;
};

/** The upload waiting for review that would replace an approved document, if any. */
const pendingReplacement = (docs: any[], type: string) =>
  docs.find((d) => d.docType === type && d.status === "Pending" && d.replaces) || null;

const toView = (d: any) =>
  d && {
    _id: String(d._id),
    status: d.status,
    remarks: d.remarks || "",
    originalName: d.originalName || "",
    uploadedAt: d.uploadedAt,
  };

/** Checklist of all required documents with their status (shared by the partner and the admin). */
export const buildDocumentView = (delivery: any) => {
  const docs: any[] = delivery.documents || [];
  const items = DELIVERY_DOCUMENT_TYPES.map((type) => {
    const cur = currentDoc(docs, type);
    const repl = pendingReplacement(docs, type);
    return {
      docType: type,
      ...DELIVERY_DOCUMENT_INFO[type],
      status: cur ? cur.status : "Missing",
      document: toView(cur),
      replacement: toView(repl),
    };
  });
  const approved = items.filter((i) => i.status === "Approved").length;
  return {
    items,
    total: items.length,
    approved,
    uploaded: items.filter((i) => i.status !== "Missing").length,
    complete: approved === items.length,
  };
};

/** Required documents that are not approved yet (label list). */
export const missingApprovedDocuments = (delivery: any): string[] =>
  buildDocumentView(delivery).items.filter((i) => i.status !== "Approved").map((i) => i.label);

/** Partner uploads (or replaces) a document. Old records are kept; nothing is deleted. */
export const uploadDeliveryDocument = async (deliveryId: string, docType: string, file: any) => {
  if (!isType(docType)) throw fail("Invalid document type");
  if (!file) throw fail("Please choose a file to upload");
  if (file.size > MAX_BYTES) throw fail("File must be 10 MB or smaller");

  const delivery: any = await Delivery.findById(deliveryId);
  if (!delivery) throw fail("Delivery partner not found", 404);

  const stored = await uploadPrivateDocument(deliveryId, file.buffer, "exnshop/delivery-kyc");
  const approved = delivery.documents.find((d: any) => d.docType === docType && d.status === "Approved");

  // Earlier unreviewed or rejected uploads of this type are superseded (kept on record).
  delivery.documents.forEach((d: any) => {
    if (d.docType === docType && ["Pending", "Rejected"].includes(d.status)) d.status = "Superseded";
  });
  delivery.documents.push({
    docType,
    publicId: stored.publicId,
    resourceType: stored.resourceType,
    format: stored.format,
    bytes: stored.bytes,
    originalName: String(file.originalname || "").slice(0, 120),
    uploadedAt: new Date(),
    status: "Pending",
    // An approved document stays valid until the admin approves the new one.
    replaces: approved ? approved._id : undefined,
  });
  await delivery.save();

  await auditDelivery({
    deliveryId,
    actorType: "Delivery",
    actorId: deliveryId,
    actorName: delivery.name,
    action: approved ? "DOCUMENT_REPLACEMENT_UPLOADED" : "DOCUMENT_UPLOADED",
    changes: [{ field: DELIVERY_DOCUMENT_INFO[docType].label, to: file.originalname }],
  });

  try {
    const { sendBroadcastNotification } = await import("./notificationService");
    await sendBroadcastNotification(
      "Admin",
      "Delivery partner uploaded a document",
      `${delivery.name} uploaded ${DELIVERY_DOCUMENT_INFO[docType].label}. Review it in Manage Delivery Boy → Documents.`,
      { type: "Info", priority: "Medium", link: "/admin/delivery-boy/manage" },
    );
  } catch { /* best effort */ }
  return buildDocumentView(delivery);
};

/** Admin: short-lived signed link to view a document. */
export const documentUrlForAdmin = async (deliveryId: string, docId: string, admin: { id?: string; name?: string }) => {
  const delivery: any = await Delivery.findById(deliveryId).select("documents name");
  const doc = delivery?.documents.id(docId);
  if (!doc) throw fail("Document not found", 404);
  await auditDelivery({
    deliveryId, actorType: "Admin", actorId: admin.id, actorName: admin.name,
    action: "DOCUMENT_VIEWED", changes: [{ field: DELIVERY_DOCUMENT_INFO[doc.docType as DeliveryDocumentType]?.label || doc.docType }],
  });
  return signedDocumentUrl(doc);
};

/** Partner views their own document. */
export const documentUrlForPartner = async (deliveryId: string, docId: string) => {
  const delivery: any = await Delivery.findById(deliveryId).select("documents");
  const doc = delivery?.documents.id(docId);
  if (!doc) throw fail("Document not found", 404);
  return signedDocumentUrl(doc);
};

/** Admin approves or rejects one document. Approving a replacement retires the one it replaces. */
export const reviewDeliveryDocument = async (
  deliveryId: string, docId: string, status: string, remarks: string | undefined, admin: { id?: string; name?: string },
) => {
  if (!["Approved", "Rejected"].includes(status)) throw fail("Status must be Approved or Rejected");
  const note = String(remarks || "").trim().slice(0, 300);
  if (status === "Rejected" && !note) throw fail("Please give a reason so the partner knows what to fix");

  const delivery: any = await Delivery.findById(deliveryId);
  const doc = delivery?.documents.id(docId);
  if (!delivery || !doc) throw fail("Document not found", 404);
  if (doc.status === "Superseded") throw fail("This document was replaced by a newer upload");

  const label = DELIVERY_DOCUMENT_INFO[doc.docType as DeliveryDocumentType]?.label || doc.docType;
  doc.status = status;
  doc.remarks = note || undefined;
  doc.reviewedAt = new Date();
  doc.reviewedBy = admin.name || admin.id;
  if (status === "Approved" && doc.replaces) {
    const old = delivery.documents.id(doc.replaces);
    if (old && old.status === "Approved") old.status = "Superseded"; // kept on record
    doc.replaces = undefined;
  }
  await delivery.save();

  await auditDelivery({
    deliveryId, actorType: "Admin", actorId: admin.id, actorName: admin.name,
    action: status === "Approved" ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED",
    changes: [{ field: label, to: status }], remarks: note || undefined,
  });
  await sendNotification(
    "Delivery", deliveryId,
    status === "Approved" ? "Document approved" : "Document needs attention",
    status === "Approved" ? `Your ${label} was approved.` : `Your ${label} was not accepted: ${note}. Please upload it again.`,
    { type: status === "Approved" ? "Success" : "Warning", link: "/delivery/documents", priority: "Medium" },
  ).catch(() => undefined);
  return buildDocumentView(delivery);
};

/** Admin view: checklist plus every upload ever made (the full record). */
export const adminDocumentView = async (deliveryId: string) => {
  const delivery: any = await Delivery.findById(deliveryId).select("name mobile status documents");
  if (!delivery) throw fail("Delivery partner not found", 404);
  const history = [...delivery.documents]
    .sort((a: any, b: any) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt))
    .map((d: any) => ({
      _id: String(d._id), docType: d.docType, label: DELIVERY_DOCUMENT_INFO[d.docType as DeliveryDocumentType]?.label || d.docType,
      status: d.status, remarks: d.remarks || "", originalName: d.originalName || "", uploadedAt: d.uploadedAt,
      reviewedAt: d.reviewedAt, reviewedBy: d.reviewedBy, isReplacement: Boolean(d.replaces),
    }));
  return { name: delivery.name, mobile: delivery.mobile, status: delivery.status, ...buildDocumentView(delivery), history };
};
