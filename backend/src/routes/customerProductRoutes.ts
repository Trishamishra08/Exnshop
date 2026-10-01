import { Router } from "express";
import { getProducts, getProductById, logAdClick } from "../modules/customer/controllers/customerProductController";

const router = Router();

// Public routes (no auth required for viewing products)
router.get("/", getProducts);
router.post("/:id/ad-click", logAdClick);
router.get("/:id", getProductById);

export default router;
