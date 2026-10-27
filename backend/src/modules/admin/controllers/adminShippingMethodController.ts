import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import {
  adminSetShippingMethod,
  decideShippingMethodRequest,
  listShippingMethodRequests,
} from "../../../services/sellerShippingService";

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
