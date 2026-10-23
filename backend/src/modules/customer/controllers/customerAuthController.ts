import { Request, Response } from "express";
import Customer from "../../../models/Customer";
import SupportedLanguage from "../../../models/SupportedLanguage";
import {
  sendSmsOtp as sendMobileOtpService,
  verifySmsOtp as verifyMobileOtpService,
  sendEmailOtp as sendEmailOtpService,
  verifyEmailOtp as verifyEmailOtpService,
} from "../../../services/otpService";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
import { generateToken } from "../../../services/jwtService";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Send OTP to customer mobile (real SMS, or the fixed 123456 test code
 * under OTP_UNIVERSAL_BYPASS — no live SMS provider required for that).
 * Email is still collected for the profile but no longer what the OTP is
 * verified against.
 */
export const sendSmsOtp = asyncHandler(async (req: Request, res: Response) => {
  // Email login: a real OTP is emailed (mobile OTPs stay on the 123456 test code).
  const email = req.body.email ? String(req.body.email).trim().toLowerCase() : '';
  if (email) {
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: "Valid email address is required" });
    }
    try {
      const existing = await Customer.findOne({ email }).select("name");
      const result = await sendEmailOtpService(email, "Customer", existing?.name, existing ? "login" : "register", true);
      return res.status(200).json({ success: true, message: result.message, sessionId: result.sessionId });
    } catch (error: any) {
      console.error(`[CUSTOMER_AUTH] send-email-otp error for ${email}:`, error.message);
      return res.status(400).json({ success: false, message: error.message || "Failed to send OTP. Please try again." });
    }
  }

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
    const { mobile, email, otp, sessionId, loginBy } = req.body;

    if (loginBy === "email") return verifyEmailLogin(req, res);

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

    return sendLoginResponse(res, customer, isNewUser);
  },
);

/**
 * Email login. A new customer also gives a mobile number (every account has
 * one); that number must not belong to another account, since only the email
 * was verified here.
 */
const verifyEmailLogin = async (req: Request, res: Response) => {
  const email = req.body.email ? String(req.body.email).trim().toLowerCase() : "";
  const otp = req.body.otp ? String(req.body.otp).trim() : "";
  const mobile = req.body.mobile != null ? String(req.body.mobile).replace(/\D/g, "").slice(-10) : "";

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, message: "Valid email address is required" });
  }
  if (!/^[0-9]{4,6}$/.test(otp)) {
    return res.status(400).json({ success: false, message: "Valid 6-digit OTP is required" });
  }

  let customer = await Customer.findOne({ email });
  // New customer: ask for the mobile number first, without using up the OTP.
  if (!customer && mobile.length !== 10) {
    return res.status(409).json({
      success: false,
      code: "NEEDS_MOBILE",
      message: "New here? Enter your mobile number to create your account.",
    });
  }
  if (!customer && (await Customer.exists({ phone: mobile }))) {
    return res.status(409).json({
      success: false,
      code: "MOBILE_TAKEN",
      message: "This mobile number already has an account. Log in with the mobile number, then add this email in your profile.",
    });
  }

  const isValid = await verifyEmailOtpService(email, otp, "Customer");
  if (!isValid) {
    return res.status(401).json({ success: false, message: "Invalid or expired OTP. Please try again." });
  }

  let isNewUser = false;
  if (!customer) {
    customer = await Customer.create({
      phone: mobile,
      email,
      name: "User",
      status: "Active",
      walletAmount: 0,
      totalOrders: 0,
      totalSpent: 0,
    });
    isNewUser = true;
  }
  return sendLoginResponse(res, customer, isNewUser);
};

const sendLoginResponse = async (res: Response, customer: any, isNewUser: boolean) => {
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
};
