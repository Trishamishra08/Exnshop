import { Request, Response } from "express";
import Delivery from "../../../models/Delivery";
import {
  sendSmsOtp as sendSmsOtpService,
  verifySmsOtp as verifySmsOtpService,
  sendEmailOtp,
  verifyEmailOtp,
} from "../../../services/otpService";
import { generateToken } from "../../../services/jwtService";
import { asyncHandler } from "../../../utils/asyncHandler";
// import { uploadDocument } from "../../../services/uploadService"; // File does not exist

/**
 * Send OTP to delivery partner — by email (current default login method) or,
 * if a mobile number is sent instead, falls back to the original SMS OTP flow.
 */
export const sendSmsOtp = asyncHandler(async (req: Request, res: Response) => {
  const email = req.body.email ? String(req.body.email).trim() : '';

  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Valid email address is required",
      });
    }

    const delivery = await Delivery.findOne({ email: email.toLowerCase() });
    if (!delivery) {
      return res.status(400).json({
        success: false,
        message: "Delivery partner not found with this email. Please register first.",
      });
    }

    try {
      // A delivery partner registers via a plain form (no OTP at signup) then
      // the frontend immediately calls this same endpoint to verify their
      // email — treat an account created moments ago as "just registered"
      // for a welcome-toned email instead of a plain login code.
      const isJustRegistered = Date.now() - new Date(delivery.createdAt).getTime() < 5 * 60 * 1000;
      const result = await sendEmailOtp(email, "Delivery", delivery.name, isJustRegistered ? "register" : "login");
      return res.status(200).json({
        success: true,
        message: result.message,
        sessionId: result.sessionId,
      });
    } catch (error: any) {
      console.error(`[DELIVERY_AUTH] send-email-otp error for ${email}:`, error.message);
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to send OTP. Please try again.",
      });
    }
  }

  const rawMobile = req.body.mobile;
  const mobile = rawMobile != null ? String(rawMobile).trim().replace(/\D/g, '').slice(0, 10) : '';

  if (!mobile || mobile.length !== 10) {
    return res.status(400).json({
      success: false,
      message: "Valid email address is required",
    });
  }

  // Check if delivery partner exists with this mobile
  const delivery = await Delivery.findOne({ mobile });
  if (!delivery) {
    return res.status(400).json({
      success: false,
      message:
        "Delivery partner not found with this mobile number. Please register first.",
    });
  }

  try {
    // Send SMS OTP
    const result = await sendSmsOtpService(mobile, "Delivery");

    return res.status(200).json({
      success: true,
      message: result.message,
      sessionId: result.sessionId,
    });
  } catch (error: any) {
    console.error(`[DELIVERY_AUTH] send-sms-otp error for ${mobile}:`, error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to send OTP. Please try again.",
    });
  }
});

/**
 * Verify OTP and login delivery partner — by email or mobile, matching
 * whichever sendSmsOtp was called with.
 */
export const verifySmsOtp = asyncHandler(
  async (req: Request, res: Response) => {
    const { mobile, email, otp, sessionId } = req.body;

    if (!otp || !/^[0-9]{4,6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Valid 6-digit OTP is required",
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    let delivery;

    if (email) {
      const isValid = await verifyEmailOtp(email, otp, "Delivery");
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: "OTP should be valid. Please try again.",
        });
      }
      delivery = await Delivery.findOne({ email: email.toLowerCase().trim() }).select("-password");
    } else {
      if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
        return res.status(400).json({
          success: false,
          message: "Valid email address is required",
        });
      }

      const isValid = await verifySmsOtpService(sessionId, otp, mobile, "Delivery");
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: "OTP should be valid. Please try again.",
        });
      }
      delivery = await Delivery.findOne({ mobile }).select("-password");
    }

    if (!delivery) {
      return res.status(401).json({
        success: false,
        message: "Delivery partner not found. Please Register first.",
      });
    }

    // Generate JWT token
    const token = generateToken(delivery._id.toString(), "Delivery");

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: {
          id: delivery._id,
          name: delivery.name,
          mobile: delivery.mobile,
          email: delivery.email,
          city: delivery.city,
          status: delivery.status,
        },
      },
    });
  },
);

/**
 * Register new delivery partner
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const {
    name,
    mobile,
    email,
    dateOfBirth,
    password,
    address,
    city,
    pincode,
    drivingLicense,
    nationalIdentityCard,
    accountName,
    bankName,
    accountNumber,
    ifscCode,
    bonusType,
  } = req.body;

  // Validation
  if (!name || !mobile || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Name, mobile, email, and password are required",
    });
  }

  if (!/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  // Check if delivery partner already exists
  const existingDelivery = await Delivery.findOne({
    $or: [{ mobile }, { email }],
  });

  if (existingDelivery) {
    return res.status(409).json({
      success: false,
      message: "Delivery partner already exists with this mobile or email",
    });
  }

  // Create new delivery partner
  await Delivery.create({
    name,
    mobile,
    email,
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
    password,
    address,
    city,
    pincode,
    drivingLicense,
    nationalIdentityCard,
    accountName,
    bankName,
    accountNumber,
    ifscCode,
    bonusType,
    status: "Inactive", // New delivery partners start as Inactive
    balance: 0,
    cashCollected: 0,
  } as any);

  // Generate token (Optional: usually registration doesn't login immediately if approval needed, but for seamless UX we can)
  // However, FE Flow: Register -> OTP -> Login. So we return success, then FE calls sendSmsOtp.

  return res.status(201).json({
    success: true,
    message: "Delivery partner registered successfully.",
    // No token returned here, flow continues to OTP
  });
});

/**
 * Get current delivery partner profile
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  // @ts-ignore - req.user is added by middleware
  const userId = (req.user as any).userId;

  if (!userId) {
    return res
      .status(401)
      .json({ success: false, message: "User not authenticated" });
  }

  const delivery = await Delivery.findById(userId).select("-password");

  if (!delivery) {
    // The token is still validly signed/unexpired, but the account it
    // points to no longer exists (e.g. after a database reset) — treat
    // this the same as an invalid session so the client logs out cleanly.
    return res.status(401).json({
      success: false,
      message: "Delivery partner not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: delivery,
  });
});
