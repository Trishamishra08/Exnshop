import { Request, Response } from "express";
import Admin from "../../../models/Admin";
import {
  sendEmailOtp as sendEmailOtpService,
  verifyEmailOtp as verifyEmailOtpService,
} from "../../../services/otpService";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Default admin login until the admin sets a real email in Admin Profile:
// this one email takes a fixed OTP and no email is sent. Every other admin
// email gets a real emailed code.
const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_DEFAULT_EMAIL || "exnshop@gmail.com").trim().toLowerCase();
const DEFAULT_ADMIN_OTP = process.env.ADMIN_DEFAULT_OTP || "123456";
import { generateToken } from "../../../services/jwtService";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Send a login OTP to an admin's email. Admins log in by email + OTP only.
 */
export const sendOTP = asyncHandler(async (req: Request, res: Response) => {
  // A real OTP is emailed to an existing admin.
  if (req.body.email) {
    const email = String(req.body.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: "Valid email address is required" });
    }
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found with this email" });
    }
    if (email === DEFAULT_ADMIN_EMAIL) {
      return res.status(200).json({ success: true, message: "Enter the default admin OTP" });
    }
    try {
      const result = await sendEmailOtpService(email, "Admin", admin.firstName, "login", true);
      return res.status(200).json({ success: true, message: result.message });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error.message || "Failed to send OTP" });
    }
  }

  return res.status(400).json({ success: false, message: "Admin login is by email only. Enter your admin email." });
});

/**
 * Verify OTP and login admin
 */
export const verifyOTP = asyncHandler(async (req: Request, res: Response) => {
  const { otp } = req.body;

  if (req.body.email) {
    const email = String(req.body.email).trim().toLowerCase();
    if (!otp || !/^[0-9]{4,6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: "Valid 6-digit OTP is required" });
    }
    const admin = await Admin.findOne({ email }).select("-password");
    const otpOk = email === DEFAULT_ADMIN_EMAIL
      ? String(otp) === DEFAULT_ADMIN_OTP
      : await verifyEmailOtpService(email, otp, "Admin");
    if (!admin || !otpOk) {
      return res.status(401).json({ success: false, message: "Invalid or expired OTP. Please try again." });
    }
    return sendAdminLogin(res, admin);
  }

  return res.status(400).json({ success: false, message: "Admin login is by email only. Enter your admin email." });
});

const sendAdminLogin = (res: Response, admin: any) => {
  // Generate JWT token
  const token = generateToken(admin._id.toString(), "Admin", admin.role);

  return res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      token,
      user: {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        mobile: admin.mobile,
        email: admin.email,
        role: admin.role,
      },
    },
  });
};

/**
 * Register new admin (optional - typically admins are created by super admin)
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  // Creating admins is for a signed-in Super Admin only (admins log in by email, so an
  // open route would let anyone make themselves an admin).
  if ((req as any).user?.role !== "Super Admin") {
    return res.status(403).json({ success: false, message: "Only a Super Admin can create admin accounts" });
  }
  const { firstName, lastName, mobile, email, password, role } = req.body;

  // Validation
  if (!firstName || !lastName || !mobile || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "All fields are required",
    });
  }

  if (!/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  // Check if admin already exists
  const existingAdmin = await Admin.findOne({
    $or: [{ mobile }, { email }],
  });

  if (existingAdmin) {
    return res.status(409).json({
      success: false,
      message: "Admin already exists with this mobile or email",
    });
  }

  // Create new admin
  const admin = await Admin.create({
    firstName,
    lastName,
    mobile,
    email,
    password,
    role: role || "Admin",
  });

  // Generate token
  const token = generateToken(admin._id.toString(), "Admin", admin.role);

  return res.status(201).json({
    success: true,
    message: "Admin registered successfully",
    data: {
      token,
      user: {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        mobile: admin.mobile,
        email: admin.email,
        role: admin.role,
      },
    },
  });
});
