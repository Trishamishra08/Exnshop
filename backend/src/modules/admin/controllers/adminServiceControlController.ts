import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { ServiceControl, ServiceControlLog } from "../../../models/ServiceControl";
import { SERVICE_CATALOG, SERVICE_BY_KEY, SERVICE_SECTIONS, clearServiceControlCache } from "../../../services/serviceControls";
import Admin from "../../../models/Admin";

/** GET /admin/service-controls — every service with its state, who changed it last, and when. */
export const getServiceControls = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await ServiceControl.find({}).lean();
  const byKey = new Map((rows as any[]).map((r) => [r.key, r]));
  const services = SERVICE_CATALOG.map((d) => {
    const r: any = byKey.get(d.key);
    return {
      key: d.key,
      label: d.label,
      section: d.section,
      locked: Boolean(d.locked),
      enforced: Boolean(d.enforced),
      enabled: d.locked ? true : r ? r.enabled : true,
      note: r?.note || "",
      updatedByName: r?.updatedByName || "",
      updatedAt: r?.updatedAt || null,
    };
  });
  return res.status(200).json({ success: true, data: { sections: SERVICE_SECTIONS, services } });
});

/** PUT /admin/service-controls/:key { enabled, note? } — switch one service, with an audit entry. */
export const setServiceControl = asyncHandler(async (req: Request, res: Response) => {
  const key = req.params.key;
  const def = SERVICE_BY_KEY.get(key);
  if (!def) return res.status(404).json({ success: false, message: "Unknown service" });
  if (typeof req.body.enabled !== "boolean") return res.status(400).json({ success: false, message: "'enabled' must be true or false" });
  const enabled: boolean = req.body.enabled;
  const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 300) : "";

  if (def.locked && !enabled) {
    return res.status(403).json({
      success: false,
      message: `"${def.label}" is a critical security control and can't be switched off from here.`,
    });
  }

  const adminId = (req as any).user?.userId;
  const admin: any = adminId ? await Admin.findById(adminId).select("firstName lastName email").lean() : null;
  const adminName = admin ? `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || admin.email : "Admin";

  const before = await ServiceControl.findOne({ key }).lean();
  const from = before ? (before as any).enabled : true;

  const doc = await ServiceControl.findOneAndUpdate(
    { key },
    { $set: { enabled, note, updatedBy: adminId, updatedByName: adminName } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (from !== enabled) {
    await ServiceControlLog.create({
      key,
      label: def.label,
      from,
      to: enabled,
      note,
      admin: adminId,
      adminName,
      ip: req.ip,
    });
  }
  clearServiceControlCache();
  return res.status(200).json({ success: true, message: `${def.label} is now ${enabled ? "ON" : "OFF"}`, data: doc });
});

/** GET /admin/service-controls/logs?key=&limit= — who changed what, newest first. */
export const getServiceControlLogs = asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const filter: any = {};
  if (req.query.key) filter.key = String(req.query.key);
  const logs = await ServiceControlLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return res.status(200).json({ success: true, data: logs });
});
