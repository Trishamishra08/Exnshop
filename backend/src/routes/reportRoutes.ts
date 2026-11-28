import { Router } from "express";
import { getSalesReport } from "../modules/seller/controllers/reportController";
import { getMyIncomeReport, downloadMyIncomeReport, downloadMyGstReport } from "../modules/seller/controllers/sellerReportsController";
import { authenticate, requireUserType, requireApprovedUser } from "../middleware/auth";

const router = Router();

// All routes require authentication, seller user type, and operational approval
router.use(authenticate);
router.use(requireUserType("Seller"));
router.use(requireApprovedUser);

// Get seller's sales report
router.get("/sales", getSalesReport);

// Income statement and GST/TCS report for a period (preset or custom dates)
router.get("/income", getMyIncomeReport);
router.get("/income/download", downloadMyIncomeReport);
router.get("/gst/download", downloadMyGstReport);

export default router;
