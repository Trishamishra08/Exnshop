import { Router } from "express";
import { getProducts, getProductById, logAdClick, getUnavailableSellers } from "../modules/customer/controllers/customerProductController";

const router = Router();

// Public routes (no auth required for viewing products)
router.get("/", getProducts);
router.get("/unavailable-sellers", getUnavailableSellers);
// Self-delivery sellers whose Cash on Delivery the admin switched off (checkout hides COD for them).
router.get("/cod-off-sellers", async (_req, res) => {
  try {
    const { codOffSellerIds } = await import("../services/paymentControlService");
    return res.status(200).json({ success: true, data: await codOffSellerIds() });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || "Could not load" });
  }
});
router.post("/:id/ad-click", logAdClick);
router.get("/:id", getProductById);

export default router;
