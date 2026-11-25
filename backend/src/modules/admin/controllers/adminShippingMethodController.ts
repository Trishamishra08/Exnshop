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

/**
 * GET /admin/sellers/shipping-methods?search=&method=Self|Company|none
 * Every E-commerce seller with their shipping method, so the admin can change any of them.
 */
export const listSellerShippingMethods = asyncHandler(async (req: Request, res: Response) =>
  run(res, async () => {
    const Seller = (await import("../../../models/Seller")).default;
    const query: any = { channels: "ECommerce" };
    const method = String(req.query.method || "");
    if (method === "Self" || method === "Company") query.shippingMethod = method;
    if (method === "none") query.shippingMethod = { $exists: false };
    if (method === "requested") query["shippingMethodRequest.status"] = "Pending";
    const search = String(req.query.search || "").trim();
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ sellerName: rx }, { storeName: rx }, { mobile: rx }, { email: rx }];
    }
    const sellers = await Seller.find(query)
      .select("sellerName storeName mobile email status shippingMethod shippingMethodChosenAt shippingMethodRequest selfCodDisabled")
      .sort({ storeName: 1 })
      .limit(500)
      .lean();
    return sellers.map((s: any) => ({
      sellerId: String(s._id),
      sellerName: s.sellerName,
      storeName: s.storeName,
      mobile: s.mobile,
      email: s.email,
      status: s.status,
      method: s.shippingMethod || null,
      chosenAt: s.shippingMethodChosenAt || null,
      pendingRequest: s.shippingMethodRequest?.status === "Pending" ? s.shippingMethodRequest : null,
      // Cash on Delivery for this seller's own deliveries (off = customers must pay online).
      selfCod: s.selfCodDisabled !== true,
    }));
  }),
);

export const decideShippingMethod =asyncHandler(async (req: Request, res: Response) =>
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

/** GET / PUT /admin/sellers/:sellerId/addresses: the seller's pickup and return address (admin can fix them). */
export const getSellerAddressesAdmin = asyncHandler(async (req: Request, res: Response) =>
  run(res, async () => (await import("../../../services/sellerAddressService")).getSellerAddresses(req.params.sellerId)),
);
export const saveSellerAddressesAdmin = asyncHandler(async (req: Request, res: Response) => {
  try {
    const { saveSellerAddresses } = await import("../../../services/sellerAddressService");
    const result = await saveSellerAddresses(req.params.sellerId, req.body || {});
    return res.status(200).json({ success: true, message: result.courierMessage || "Addresses saved", warning: result.courierMessage || undefined, data: result.data });
  } catch (err: any) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Could not save the addresses" });
  }
});

/** PUT /admin/sellers/:sellerId/self-cod { enabled }: Cash on Delivery on/off for a self-delivery seller. */
export const setSellerSelfCod = asyncHandler(async (req: Request, res: Response) =>
  run(
    res,
    async () => {
      if (typeof req.body?.enabled !== "boolean") {
        throw Object.assign(new Error("enabled must be true or false"), { statusCode: 400 });
      }
      const Seller = (await import("../../../models/Seller")).default;
      const seller = await Seller.findByIdAndUpdate(
        req.params.sellerId,
        { $set: { selfCodDisabled: !req.body.enabled } },
        { new: true },
      ).select("_id");
      if (!seller) throw Object.assign(new Error("Seller not found"), { statusCode: 404 });
      return { selfCod: req.body.enabled };
    },
    req.body?.enabled ? "Cash on Delivery turned on" : "Cash on Delivery turned off",
  ),
);

/** GET /admin/payment-gateways: Razorpay / Cashfree on or off. */
export const getPaymentGateways = asyncHandler(async (_req: Request, res: Response) =>
  run(res, async () => (await import("../../../services/paymentControlService")).getOnlineGateways()),
);

/** PUT /admin/payment-gateways { razorpay?, cashfree? } */
export const updatePaymentGateways = asyncHandler(async (req: Request, res: Response) =>
  run(
    res,
    async () => (await import("../../../services/paymentControlService")).setOnlineGateways(req.body || {}),
    "Payment gateways updated",
  ),
);
