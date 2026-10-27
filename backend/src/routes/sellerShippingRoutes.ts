import { Router, Request, Response } from "express";
import { authenticate, requireUserType, requireApprovedUser } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import {
  chooseShippingMethodFirstTime,
  getShippingMethodState,
  requestShippingMethodChange,
} from "../services/sellerShippingService";

const router = Router();

router.use(authenticate, requireUserType("Seller"));

const handle = (fn: (req: Request) => Promise<any>, successStatus = 200) =>
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const data = await fn(req);
      return res.status(successStatus).json({ success: true, data });
    } catch (err: any) {
      return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Request failed" });
    }
  });

const sellerId = (req: Request) => String((req as any).user.userId);

// Current method, any pending change request, and the courier companies to pick from
router.get("/method", handle((req) => getShippingMethodState(sellerId(req))));

// First choice only — applies immediately and becomes fixed
router.put(
  "/method",
  requireApprovedUser,
  handle(async (req) => {
    await chooseShippingMethodFirstTime(sellerId(req), req.body?.method);
    return getShippingMethodState(sellerId(req));
  }),
);

// Any later change needs admin approval
router.post(
  "/method/change-request",
  requireApprovedUser,
  handle(async (req) => {
    await requestShippingMethodChange(sellerId(req), req.body?.method, req.body?.reason);
    return getShippingMethodState(sellerId(req));
  }, 201),
);

export default router;
