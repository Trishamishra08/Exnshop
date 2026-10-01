import { Router } from "express";
import { raiseClaim, getMyClaims } from "../modules/seller/controllers/claimController";
import { authenticate, requireUserType, requireApprovedUser } from "../middleware/auth";

const router = Router();

router.use(authenticate);
router.use(requireUserType("Seller"));
router.use(requireApprovedUser);

router.post("/", raiseClaim);
router.get("/my", getMyClaims);

export default router;
