import { Request, Response } from "express";
import Seller from "../../../models/Seller";
import PendingSellerRegistration from "../../../models/PendingSellerRegistration";
import {
  sendOTP as sendOTPService,
  verifyOTP as verifyOTPService,
  sendEmailOtp,
  verifyEmailOtp,
} from "../../../services/otpService";
import { generateToken } from "../../../services/jwtService";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendVerificationCodeEmail } from "../../../services/emailService";

/**
 * Profile completion percentage — a simple count of how many of the key
 * onboarding fields (Phase 1 spec) are actually filled in, equally weighted.
 * Computed on read rather than stored, so it's always accurate.
 */
const PROFILE_COMPLETION_FIELDS: Array<(s: any) => boolean> = [
  (s) => !!s.sellerName,
  (s) => !!s.storeName,
  (s) => !!s.mobile,
  (s) => !!s.email,
  (s) => !!s.isEmailVerified,
  (s) => !!s.panCard,
  (s) => !!s.gstin,
  (s) => !!s.businessType,
  (s) => !!s.address,
  (s) => !!s.returnAddress,
  (s) => !!s.accountNumber,
  (s) => !!s.ifsc,
  (s) => !!s.logo,
];

export const computeProfileCompletion = (seller: any): number => {
  const filled = PROFILE_COMPLETION_FIELDS.filter((check) => check(seller)).length;
  return Math.round((filled / PROFILE_COMPLETION_FIELDS.length) * 100);
};

/**
 * Send OTP to seller — by email (current default login method) or, if a
 * mobile number is sent instead, falls back to the original SMS OTP flow.
 */
export const sendOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobile, email } = req.body;

  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Valid email address is required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const seller = await Seller.findOne({ email: normalizedEmail });

    // Resend during an in-progress signup: no real Seller yet, but a staged
    // draft exists — resend against that instead of requiring an account.
    let recipientName = seller?.sellerName;
    let purpose: "register" | "login" = "login";
    if (!seller) {
      const pending = await PendingSellerRegistration.findOne({ email: normalizedEmail });
      if (!pending) {
        return res.status(404).json({
          success: false,
          message: "No seller account or pending signup found with this email",
        });
      }
      recipientName = pending.sellerName;
      purpose = "register";
    }

    const result = await sendEmailOtp(email, "Seller", recipientName, purpose, true);
    return res.status(200).json({
      success: true,
      message: result.message,
      sessionId: result.sessionId,
    });
  }

  if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid email address is required",
    });
  }

  // Check if seller exists with this mobile
  const seller = await Seller.findOne({ mobile });
  if (!seller) {
    return res.status(404).json({
      success: false,
      message: "Seller not found with this mobile number",
    });
  }

  // Send OTP - for login, always use default OTP
  const result = await sendOTPService(mobile, "Seller", true);

  return res.status(200).json({
    success: true,
    message: result.message,
  });
});

/**
 * Verify OTP and login seller — by email or mobile, matching whichever
 * sendOTP was called with.
 */
export const verifyOTP = asyncHandler(async (req: Request, res: Response) => {
  const { mobile, email, otp } = req.body;

  if (!otp || !/^[0-9]{4,6}$/.test(otp)) {
    return res.status(400).json({
      success: false,
      message: "Valid 6-digit OTP is required",
    });
  }

  let seller;

  if (email) {
    const isValid = await verifyEmailOtp(email, otp, "Seller");
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "OTP should be valid. Please try again.",
      });
    }
    const normalizedEmail = email.toLowerCase().trim();
    seller = await Seller.findOne({ email: normalizedEmail }).select("-password");

    // No existing account yet — this verification is completing a signup,
    // not a login. Promote the staged draft into the real Seller collection
    // now that the OTP has actually been confirmed.
    if (!seller) {
      const pending = await PendingSellerRegistration.findOne({ email: normalizedEmail });
      if (!pending) {
        return res.status(404).json({
          success: false,
          message: "Your signup session expired. Please sign up again.",
        });
      }

      seller = await Seller.create({
        sellerName: pending.sellerName,
        mobile: pending.mobile,
        email: pending.email,
        storeName: pending.storeName,
        category: pending.category,
        address: pending.address,
        city: pending.city,
        ...(pending.serviceableArea && { serviceableArea: pending.serviceableArea }),
        searchLocation: pending.searchLocation,
        latitude: pending.latitude,
        longitude: pending.longitude,
        location: pending.location,
        serviceRadiusKm: pending.serviceRadiusKm,
        status: "Pending",
        requireProductApproval: false,
        viewCustomerDetails: false,
        commission: 0,
        balance: 0,
        categories: pending.categories,
        channels: pending.channels,
      });

      await PendingSellerRegistration.deleteOne({ _id: pending._id });
    }
  } else {
    if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: "Valid email address is required",
      });
    }

    const isValid = await verifyOTPService(mobile, otp, "Seller");
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "OTP should be valid. Please try again.",
      });
    }
    seller = await Seller.findOne({ mobile }).select("-password");
  }

  if (!seller) {
    return res.status(404).json({
      success: false,
      message: "Seller not found",
    });
  }

  // Generate JWT token
  const token = generateToken(seller._id.toString(), "Seller");

  return res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      token,
      user: {
        id: seller._id,
        sellerName: seller.sellerName,
        mobile: seller.mobile,
        email: seller.email,
        storeName: seller.storeName,
        status: seller.status,
        logo: seller.logo,
        address: seller.address,
        city: seller.city,
      },
    },
  });
});

/**
 * Register new seller
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const {
    sellerName,
    mobile,
    email,
    storeName,
    category,
    address,
    city,
    serviceableArea,
  } = req.body;

  // Validation (password removed - sellers don't need password during signup)
  if (!sellerName || !mobile || !email || !storeName || !category) {
    return res.status(400).json({
      success: false,
      message:
        "Required fields (Name, Mobile, Email, Store Name, Category) must be provided",
    });
  }

  if (!/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Valid 10-digit mobile number is required",
    });
  }

  // Validate commerce channel(s) — seller must sell through Quick, E-Commerce, or both
  const validChannels = ["Quick", "ECommerce"];
  const channels: string[] =
    Array.isArray(req.body.channels) &&
    req.body.channels.length > 0 &&
    req.body.channels.every((c: string) => validChannels.includes(c))
      ? req.body.channels
      : [];

  if (channels.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Please select at least one commerce channel (Quick Commerce or E-Commerce)",
    });
  }

  // Validate location is provided. Treat 0,0 as "not provided" — it's never a
  // legitimate store location here and can otherwise slip through as a truthy
  // string ("0") from the frontend when a location wasn't actually resolved.
  let latitude = req.body.latitude ? parseFloat(req.body.latitude) : null;
  let longitude = req.body.longitude ? parseFloat(req.body.longitude) : null;
  if (latitude === 0 && longitude === 0) {
    latitude = null;
    longitude = null;
  }

  // Parse and validate service radius
  let serviceRadiusKm = 10; // Default 10km
  if (
    req.body.serviceRadiusKm !== undefined &&
    req.body.serviceRadiusKm !== null &&
    req.body.serviceRadiusKm !== ""
  ) {
    const parsedRadius =
      typeof req.body.serviceRadiusKm === "string"
        ? parseFloat(req.body.serviceRadiusKm)
        : Number(req.body.serviceRadiusKm);

    if (!isNaN(parsedRadius) && parsedRadius >= 0.1 && parsedRadius <= 300) {
      serviceRadiusKm = parsedRadius;
    } else {
      return res.status(400).json({
        success: false,
        message: "Service radius must be between 0.1 and 300 kilometers",
      });
    }
  }

  if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
    // Location is optional now to allow dynamic setting later
    // Just proceed without setting location if not provided
  }

  // Validate latitude and longitude ranges if provided
  if (
    latitude &&
    longitude &&
    (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid location coordinates",
    });
  }

  // Check if a real (verified) seller already exists
  const existingSeller = await Seller.findOne({
    $or: [{ mobile }, { email }],
  });

  if (existingSeller) {
    return res.status(409).json({
      success: false,
      message: "Seller already exists with this mobile or email",
    });
  }

  // Create GeoJSON location point [longitude, latitude] if provided
  const location =
    longitude && latitude
      ? {
          type: "Point" as const,
          coordinates: [longitude, latitude],
        }
      : undefined;

  const normalizedEmail = email.toLowerCase().trim();

  // Nothing touches the real Seller collection yet — stage the signup as a
  // draft keyed by email, so re-submitting (e.g. after a failed OTP send)
  // just replaces the previous draft instead of erroring.
  const pendingData = {
    sellerName,
    mobile,
    email: normalizedEmail,
    storeName,
    category,
    address,
    city,
    ...(serviceableArea && { serviceableArea }),
    searchLocation: req.body.searchLocation,
    latitude: latitude != null ? latitude.toString() : undefined,
    longitude: longitude != null ? longitude.toString() : undefined,
    location,
    serviceRadiusKm,
    categories:
      Array.isArray(req.body.categories) && req.body.categories.length > 0
        ? req.body.categories
        : [category],
    channels,
  };

  await PendingSellerRegistration.findOneAndUpdate(
    { email: normalizedEmail },
    pendingData,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Draft is saved — now try to actually deliver the OTP. If this fails, the
  // draft stays (so "Resend OTP" can retry) but we tell the caller honestly
  // instead of claiming success.
  try {
    await sendEmailOtp(email, "Seller", sellerName, "register", true);
  } catch (otpErr: any) {
    return res.status(502).json({
      success: false,
      message:
        otpErr.message ||
        "Couldn't send the verification email. Please check your email address and try again.",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Verification code sent. Please check your email to complete signup.",
  });
});

/**
 * Get seller's profile
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;

  const seller = await Seller.findById(sellerId).select("-password");
  if (!seller) {
    // The token is still validly signed/unexpired, but the account it
    // points to no longer exists (e.g. after a database reset) — treat
    // this the same as an invalid session so the client logs out cleanly.
    return res.status(401).json({
      success: false,
      message: "Seller not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      ...seller.toObject(),
      profileCompletionPercentage: computeProfileCompletion(seller),
    },
  });
});

/**
 * Send a 6-digit verification code to the seller's registered email.
 */
export const sendEmailVerification = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const seller = await Seller.findById(sellerId);
  if (!seller) {
    return res.status(404).json({ success: false, message: "Seller not found" });
  }
  if (seller.isEmailVerified) {
    return res.status(400).json({ success: false, message: "Email is already verified" });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  seller.emailVerificationCode = code;
  seller.emailVerificationExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await seller.save();

  const result = await sendVerificationCodeEmail(seller.email, seller.sellerName, code);

  return res.status(200).json({
    success: true,
    message: result.success
      ? "Verification code sent to your email"
      : "Could not send the email right now, please try again shortly",
    // Dev convenience only — never leak the code in production.
    ...(process.env.NODE_ENV !== "production" ? { data: { devCode: code } } : {}),
  });
});

/**
 * Verify the seller's email using the code sent by sendEmailVerification.
 */
export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, message: "Verification code is required" });
  }

  const seller = await Seller.findById(sellerId).select("+emailVerificationCode +emailVerificationExpiry");
  if (!seller) {
    return res.status(404).json({ success: false, message: "Seller not found" });
  }
  if (seller.isEmailVerified) {
    return res.status(400).json({ success: false, message: "Email is already verified" });
  }
  if (!seller.emailVerificationCode || !seller.emailVerificationExpiry) {
    return res.status(400).json({ success: false, message: "Please request a verification code first" });
  }
  if (new Date() > seller.emailVerificationExpiry) {
    return res.status(400).json({ success: false, message: "Verification code has expired. Please request a new one." });
  }
  if (seller.emailVerificationCode !== code) {
    return res.status(400).json({ success: false, message: "Invalid verification code" });
  }

  seller.isEmailVerified = true;
  seller.emailVerificationCode = undefined;
  seller.emailVerificationExpiry = undefined;
  await seller.save();

  return res.status(200).json({ success: true, message: "Email verified successfully" });
});

/**
 * Update seller's profile
 */
export const updateProfile = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const updates = req.body;

    // Prevent updating sensitive fields directly
    const restrictedFields = [
      "password",
      "mobile",
      "email",
      "status",
      "balance",
      "isEmailVerified",
      "emailVerificationCode",
      "emailVerificationExpiry",
    ];
    restrictedFields.forEach((field) => delete updates[field]);

    // Handle location update (convert lat/lng to GeoJSON)
    // Note: use truthy-string-safe checks — "0" is a non-empty string so
    // `updates.latitude && updates.longitude` alone would incorrectly accept
    // an unresolved/garbage 0,0 coordinate pair as valid.
    if (updates.latitude !== undefined && updates.longitude !== undefined) {
      const latitude = parseFloat(updates.latitude);
      const longitude = parseFloat(updates.longitude);
      const isRealCoordinate =
        !isNaN(latitude) && !isNaN(longitude) && !(latitude === 0 && longitude === 0);

      if (isRealCoordinate) {
        // Update GeoJSON location for geospatial queries
        updates.location = {
          type: "Point",
          coordinates: [longitude, latitude], // MongoDB GeoJSON: [longitude, latitude]
        };
        // Ensure string fields are also synchronized
        updates.latitude = latitude.toString();
        updates.longitude = longitude.toString();
      } else {
        // Don't persist an unresolved 0,0 placeholder over a previously valid location
        delete updates.latitude;
        delete updates.longitude;
      }
    }

    // Handle serviceRadiusKm update
    if (
      updates.serviceRadiusKm !== undefined &&
      updates.serviceRadiusKm !== null &&
      updates.serviceRadiusKm !== ""
    ) {
      const radius =
        typeof updates.serviceRadiusKm === "string"
          ? parseFloat(updates.serviceRadiusKm)
          : Number(updates.serviceRadiusKm);

      if (!isNaN(radius) && radius >= 0.1 && radius <= 300) {
        updates.serviceRadiusKm = radius; // Ensure it's saved as a number
      } else {
        return res.status(400).json({
          success: false,
          message: "Service radius must be between 0.1 and 300 kilometers",
        });
      }
    } else if (
      updates.serviceRadiusKm === "" ||
      updates.serviceRadiusKm === null
    ) {
      // If empty string or null is sent, remove it from updates to keep existing value
      delete updates.serviceRadiusKm;
    }

    const seller = await Seller.findByIdAndUpdate(sellerId, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: seller,
    });
  },
);

/**
 * Toggle shop status (Open/Close)
 */
export const toggleShopStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;

    const seller = await Seller.findById(sellerId);

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Handle undefined case - if isShopOpen is undefined, default to true (open) then toggle to false
    // This ensures backward compatibility with sellers created before this field was added
    if (seller.isShopOpen === undefined) {
      seller.isShopOpen = false; // Toggle from default "open" to "closed"
    } else {
      seller.isShopOpen = !seller.isShopOpen; // Normal toggle
    }

    // Fix invalid GeoJSON location objects
    // MongoDB requires that if location.type is "Point", coordinates must be a valid array
    if (seller.location && seller.location.type === "Point") {
      if (
        !seller.location.coordinates ||
        !Array.isArray(seller.location.coordinates) ||
        seller.location.coordinates.length !== 2
      ) {
        // Invalid location object - remove it to prevent validation error
        seller.location = undefined;
      }
    }

    await seller.save();

    return res.status(200).json({
      success: true,
      message: `Shop is now ${seller.isShopOpen ? "Open" : "Closed"}`,
      data: { isShopOpen: seller.isShopOpen },
    });
  },
);
