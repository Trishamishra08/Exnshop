import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import {
  adminSetShippingMethod,
  decideShippingMethodRequest,
  listShippingMethodRequests,
} from "../../../services/sellerShippingService";
import { getShippingRates } from "../../../services/shippingChargeService";

const run = async (res: Response, fn: () => Promise<any>, message?: string) => {
  try {
    const data = await fn();
    return res.status(200).json({ success: true, message, data });
  } catch (err: any) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Request failed" });
  }
};

export const getShippingMethodRequests = asyncHandler(async (req: Request, res: Response) =>
  run(res, () => listShippingMethodRequests(req.query.status as string | undefined)),
);

export const decideShippingMethod = asyncHandler(async (req: Request, res: Response) =>
  run(
    res,
    async () => {
      await decideShippingMethodRequest(req.params.sellerId, req.body?.decision, String((req as any).user.userId), req.body?.note);
    },
    req.body?.decision === "Approved" ? "Shipping method changed" : "Request declined",
  ),
);

export const setSellerShippingMethod = asyncHandler(async (req: Request, res: Response) =>
  run(
    res,
    async () => {
      await adminSetShippingMethod(req.params.sellerId, req.body?.method);
    },
    "Shipping method updated",
  ),
);

// ─── Shipping rate card ───────────────────────────────────────────────────────

export const getRates = asyncHandler(async (_req: Request, res: Response) =>
  run(res, () => getShippingRates()),
);

export const updateRates = asyncHandler(async (req: Request, res: Response) =>
  run(
    res,
    async () => {
      const current = await getShippingRates();
      const next: any = { ...current };
      for (const key of Object.keys(current) as (keyof typeof current)[]) {
        if (req.body?.[key] === undefined) continue;
        const value = Number(req.body[key]);
        if (!Number.isFinite(value) || value < 0) {
          throw Object.assign(new Error(`${key} must be a number of 0 or more`), { statusCode: 400 });
        }
        next[key] = value;
      }
      if (next.baseWeightGrams < 1 || next.slabGrams < 1 || next.volumetricDivisor < 1) {
        throw Object.assign(new Error("Weights and the volumetric divisor must be at least 1"), { statusCode: 400 });
      }
      const AppSettings = (await import("../../../models/AppSettings")).default;
      const settings: any = await AppSettings.getSettings();
      settings.shippingRates = next;
      await settings.save();
      return next;
    },
    "Shipping rates updated",
  ),
);
