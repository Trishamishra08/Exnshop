import { Router } from "express";
import { getProducts, getProductById, logAdClick, getUnavailableSellers } from "../modules/customer/controllers/customerProductController";

const router = Router();

// Public routes (no auth required for viewing products)
router.get("/", getProducts);
router.get("/unavailable-sellers", getUnavailableSellers);
router.post("/:id/ad-click", logAdClick);
router.get("/:id", getProductById);

export default router;
