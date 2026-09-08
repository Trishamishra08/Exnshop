import { Router } from "express";
import * as customerController from "../modules/customer/controllers/customerController";
import { authenticate } from "../middleware/auth";
import AppSettings from "../models/AppSettings";
import FAQ from "../models/FAQ";
import Policy from "../models/Policy";
import { EXNSHOP_TERMS_AND_CONDITIONS, EXNSHOP_REFUND_POLICY } from "../constants/exnshopTermsPolicy";

const router = Router();

// Get public app settings (app name, logo, delivery time, etc.)
router.get("/app-settings", async (_req, res) => {
  try {
    let settings = await AppSettings.findOne();
    if (!settings) {
      settings = await AppSettings.create({
        appName: "Exnshop",
        appLogo: "/exnshop_logo.png",
        appFavicon: "/exnshop_logo.png",
        estimatedDeliveryTime: "12-15 mins",
        contactEmail: "support@exnshop.in",
        contactPhone: "6399376602",
        termsOfService: EXNSHOP_TERMS_AND_CONDITIONS,
        returnPolicy: EXNSHOP_REFUND_POLICY,
        refundPolicy: EXNSHOP_REFUND_POLICY,
        customerAppPolicy: EXNSHOP_TERMS_AND_CONDITIONS,
      });
    }
    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Get customer profile (protected route)
router.get("/profile", authenticate, customerController.getProfile);

// Update customer profile (protected route)
router.put("/profile", authenticate, customerController.updateProfile);

// Update customer location (protected route)
router.post("/location", authenticate, customerController.updateLocation);

// Update customer language preference (protected route)
router.put("/language", authenticate, customerController.updateLanguagePreference);

import * as walletController from "../modules/customer/controllers/customerWalletController";
import * as supportController from "../modules/customer/controllers/customerSupportController";

// Customer Wallet routes (protected)
router.get("/wallet/balance", authenticate, walletController.getCustomerWalletBalance);
router.get("/wallet/transactions", authenticate, walletController.getCustomerWalletTransactions);

// Customer Support Contact route (optional authentication)
const optionalAuthenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next();
  return authenticate(req, res, next);
};

router.post("/support/contact", optionalAuthenticate, supportController.submitCustomerSupport);

// Get active FAQs for customer app
router.get("/faqs", async (_req, res) => {
  try {
    const faqs = await FAQ.find({ status: "Active" }).sort({ order: 1, createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: faqs,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Get active Customer Terms & Conditions (auto-seed ExnShop terms if missing/outdated)
router.get("/policy", async (_req, res) => {
  try {
    let policy = await Policy.findOne({ type: "customer", isActive: true }).sort({ createdAt: -1 });

    const needsSeed =
      !policy ||
      !policy.content ||
      /Olovely|10 Minute App/i.test(policy.content) ||
      policy.version !== "2.1" ||
      policy.title !== "Terms & Conditions";

    if (needsSeed) {
      if (policy) {
        policy.title = "Terms & Conditions";
        policy.content = EXNSHOP_TERMS_AND_CONDITIONS;
        policy.version = "2.1";
        policy.isActive = true;
        await policy.save();
      } else {
        policy = await Policy.create({
          type: "customer",
          title: "Terms & Conditions",
          content: EXNSHOP_TERMS_AND_CONDITIONS,
          version: "2.1",
          isActive: true,
        });
      }

      // Keep AppSettings terms fields in sync (do not overwrite refund policy here)
      const settings = await AppSettings.findOne();
      if (settings) {
        settings.termsOfService = EXNSHOP_TERMS_AND_CONDITIONS;
        settings.customerAppPolicy = EXNSHOP_TERMS_AND_CONDITIONS;
        if (!settings.refundPolicy || /Olovely|10 Minute App/i.test(settings.refundPolicy) || settings.refundPolicy === EXNSHOP_TERMS_AND_CONDITIONS) {
          settings.refundPolicy = EXNSHOP_REFUND_POLICY;
          settings.returnPolicy = EXNSHOP_REFUND_POLICY;
        }
        await settings.save();
      }
    }

    return res.status(200).json({
      success: true,
      data: policy,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Get Refund & Cancellation Policy
router.get("/refund-policy", async (_req, res) => {
  try {
    let settings = await AppSettings.findOne();
    const needsSeed =
      !settings?.refundPolicy ||
      /Olovely|10 Minute App/i.test(settings.refundPolicy) ||
      settings.refundPolicy === EXNSHOP_TERMS_AND_CONDITIONS ||
      (!settings.refundPolicy.includes("1. Overview") &&
        !settings.refundPolicy.includes("Refund Eligibility"));

    if (!settings) {
      settings = await AppSettings.create({
        appName: "Exnshop",
        appLogo: "/exnshop_logo.png",
        contactEmail: "support@exnshop.in",
        contactPhone: "6399376602",
        termsOfService: EXNSHOP_TERMS_AND_CONDITIONS,
        returnPolicy: EXNSHOP_REFUND_POLICY,
        refundPolicy: EXNSHOP_REFUND_POLICY,
        customerAppPolicy: EXNSHOP_TERMS_AND_CONDITIONS,
      });
    } else if (needsSeed) {
      settings.refundPolicy = EXNSHOP_REFUND_POLICY;
      settings.returnPolicy = EXNSHOP_REFUND_POLICY;
      await settings.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        title: "Refund & Cancellation Policy",
        content: settings.refundPolicy || EXNSHOP_REFUND_POLICY,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

export default router;

