import { Request, Response } from "express";
import Customer from "../../../models/Customer";
import SupportedLanguage from "../../../models/SupportedLanguage";
import {
  sendSmsOtp as sendMobileOtpService,
  verifySmsOtp as verifyMobileOtpService,
} from "../../../services/otpService";
import { generateToken } from "../../../services/jwtService";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Send OTP to customer mobile (real SMS, or the fixed 123456 test code
 * under OTP_UNIVERSAL_BYPASS — no live SMS provider required for that).
 * Email is still collected for the profile but no longer what the OTP is
 * verified against.
 */
export const sendSmsOtp = asyncHandler(async (req: Request, res: Response) => {
  const mobile = req.body.mobile ? String(req.body.mobile).trim() : '';

  if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  try {
    const result = await sendMobileOtpService(mobile, "Customer");

    return res.status(200).json({
      success: true,
      message: result.message,
      sessionId: result.sessionId,
    });
  } catch (error: any) {
    console.error(`[CUSTOMER_AUTH] send-sms-otp error for ${mobile}:`, error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to send OTP. Please try again.",
    });
  }
});

/**
 * Verify mobile OTP and login customer. Auto-creates the customer on first
 * verification; email is optional and only attached if provided.
 */
export const verifySmsOtp = asyncHandler(
  async (req: Request, res: Response) => {
    const { mobile, email, otp, sessionId } = req.body;

    const normalizedMobile =
      mobile != null ? String(mobile).trim().replace(/\D/g, "").slice(0, 10) : "";

    if (normalizedMobile.length !== 10) {
      return res.status(400).json({
        success: false,
        message: "Valid 10-digit mobile number is required",
      });
    }

    if (!otp || !/^[0-9]{4,6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Valid 6-digit OTP is required",
      });
    }

    const isValid = await verifyMobileOtpService(sessionId, otp, normalizedMobile, "Customer");
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "OTP should be valid. Please try again.",
      });
    }

    const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;

    let customer = await Customer.findOne({ phone: normalizedMobile });
    let isNewUser = false;

    if (customer && normalizedEmail && !customer.email) {
      customer.email = normalizedEmail;
      await customer.save();
    }

    if (!customer) {
      customer = await Customer.create({
        phone: normalizedMobile,
        name: "User",
        ...(normalizedEmail && { email: normalizedEmail }),
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
