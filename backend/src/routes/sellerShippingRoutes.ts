import { Router, Request, Response } from "express";
import { authenticate, requireUserType, requireApprovedUser } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import {
  chooseShippingMethodFirstTime,
  getShippingMethodState,
  requestShippingMethodChange,
} from "../services/sellerShippingService";
import { previewShippingCharge } from "../services/shippingChargeService";
import Seller from "../models/Seller";
import { DEFAULT_HANDLING, normalizeHandling, validateHandlingInput } from "../services/shipByService";

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

// Shipping charge for a product's weight/size, and whether this seller pays it (By Company)
router.get(
  "/charge-preview",
  handle(async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const num = (v?: string) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
    const [preview, state] = await Promise.all([
      previewShippingCharge({
        weightGrams: num(q.weightGrams),
        dimensionsCm: { length: num(q.length), width: num(q.width), height: num(q.height) },
      }),
      getShippingMethodState(sellerId(req)),
    ]);
    return { ...preview, sellerPays: state.effectiveMethod === "Company", method: state.effectiveMethod };
  }),
);

// Handling time, working days, cut-off, holidays (they set each order's ship-by date)
router.get(
  "/settings",
  handle(async (req) => {
    const seller: any = await Seller.findById(sellerId(req)).select("handlingTimeDays operatingDays holidays orderCutoffTime defaultCourier").lean();
    return { ...normalizeHandling(seller), defaultCourier: seller?.defaultCourier || "", defaults: DEFAULT_HANDLING };
  }),
);
router.put(
  "/settings",
  requireApprovedUser,
  handle(async (req) => {
    const checked = validateHandlingInput(req.body || {});
    if (!checked.ok) throw Object.assign(new Error(checked.message), { statusCode: 400 });
    await Seller.updateOne({ _id: sellerId(req) }, { $set: checked.value });
    const seller: any = await Seller.findById(sellerId(req)).select("handlingTimeDays operatingDays holidays orderCutoffTime defaultCourier").lean();
    return { ...normalizeHandling(seller), defaultCourier: seller?.defaultCourier || "", defaults: DEFAULT_HANDLING };
  }),
);

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
