import { Request, Response } from "express";
import Customer from "../../../models/Customer";
import SupportedLanguage from "../../../models/SupportedLanguage";
import {
  sendEmailOtp,
  verifyEmailOtp,
} from "../../../services/otpService";
import { generateToken } from "../../../services/jwtService";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Send OTP to customer email. Mobile is still collected (for the profile /
 * delivery contact field) but is no longer what the OTP is verified against —
 * there's no live SMS OTP provider yet, so login runs on email+OTP instead.
 */
export const sendSmsOtp = asyncHandler(async (req: Request, res: Response) => {
  const email = req.body.email ? String(req.body.email).trim() : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Valid email address is required",
    });
  }

  try {
    const existing = await Customer.findOne({ email: email.toLowerCase() }).select("name");
    const result = await sendEmailOtp(email, "Customer", existing?.name);

    return res.status(200).json({
      success: true,
      message: result.message,
      sessionId: result.sessionId,
    });
  } catch (error: any) {
    console.error(`[CUSTOMER_AUTH] send-email-otp error for ${email}:`, error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to send OTP. Please try again.",
    });
  }
});

/**
 * Verify email OTP and login customer. Auto-creates the customer on first
 * verification (brand-new signups need mobile too); if a legacy account
 * already exists under this mobile number (from the old mobile-OTP days, with
 * a placeholder email), this real email gets attached to that same account
 * instead of creating a duplicate.
 */
export const verifySmsOtp = asyncHandler(
  async (req: Request, res: Response) => {
    const { mobile, email, otp } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Valid email address is required",
      });
    }

    if (!otp || !/^[0-9]{4,6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Valid 6-digit OTP is required",
      });
    }

    const isValid = await verifyEmailOtp(email, otp, "Customer");
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "OTP should be valid. Please try again.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedMobile =
      mobile != null ? String(mobile).trim().replace(/\D/g, "").slice(0, 10) : "";

    let customer = await Customer.findOne({ email: normalizedEmail });
    let isNewUser = false;

    if (!customer && normalizedMobile) {
      // A legacy mobile-OTP-era account may already exist under this phone
      // number with a placeholder email — attach the real email to it rather
      // than creating a duplicate (which would collide on the unique phone index).
      customer = await Customer.findOne({ phone: normalizedMobile });
      if (customer) {
        customer.email = normalizedEmail;
        await customer.save();
      }
    }

    if (!customer) {
      if (!normalizedMobile || normalizedMobile.length !== 10) {
        return res.status(400).json({
          success: false,
          message: "A valid 10-digit mobile number is required to create your account",
        });
      }

      customer = await Customer.create({
        phone: normalizedMobile,
        name: "User",
        email: normalizedEmail,
        status: "Active",
        walletAmount: 0,
        totalOrders: 0,
        totalSpent: 0,
      });
      isNewUser = true;
    }

    // Generate JWT token
    const token = generateToken(customer._id.toString(), "Customer");

    // Check preferred language active status
    let languageSelected = false;
    let preferredLanguage: string | null = customer.preferredLanguage || null;

    if (preferredLanguage) {
      const activeLang = await SupportedLanguage.findOne({
        code: preferredLanguage.toLowerCase(),
        isActive: true,
      });
      if (activeLang) {
        languageSelected = true;
      } else {
        languageSelected = false;
      }
    }

    return res.status(200).json({
      success: true,
      message: isNewUser
        ? "Account created and login successful"
        : "Login successful",
      data: {
        token,
        user: {
          id: customer._id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          walletAmount: customer.walletAmount,
          refCode: customer.refCode,
          status: customer.status,
          preferredLanguage,
        },
        isNewUser,
        languageSelected,
      },
    });
  },
);
