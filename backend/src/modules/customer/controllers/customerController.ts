import { Request, Response } from "express";
import Customer from "../../../models/Customer";
import SupportedLanguage from "../../../models/SupportedLanguage";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Get customer profile
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId || (req as any).user?.userType !== "Customer") {
    return res.status(401).json({
      success: false,
      message: "Unauthorized or not a customer",
    });
  }

  const customer = await Customer.findById(userId);

  if (!customer) {
    // The token is still validly signed/unexpired, but the account it
    // points to no longer exists (e.g. after a database reset) — treat
    // this the same as an invalid session so the client logs out cleanly
    // instead of getting stuck on a bare "not found" error.
    return res.status(401).json({
      success: false,
      message: "Customer not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Profile retrieved successfully",
    data: {
      id: customer._id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      dateOfBirth: customer.dateOfBirth,
      registrationDate: customer.registrationDate,
      status: customer.status,
      refCode: customer.refCode,
      walletAmount: customer.walletAmount,
      totalOrders: customer.totalOrders,
      totalSpent: customer.totalSpent,
      latitude: customer.latitude,
      longitude: customer.longitude,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      pincode: customer.pincode,
      locationUpdatedAt: customer.locationUpdatedAt,
      preferredLanguage: customer.preferredLanguage || null,
    },
  });
});

/**
 * Update customer language preference
 * PUT /api/v1/customer/language
 */
export const updateLanguagePreference = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { language, preferredLanguage } = req.body;
    const targetLang = language || preferredLanguage;

    if (!userId || (req as any).user?.userType !== "Customer") {
      return res.status(401).json({
        success: false,
        message: "Unauthorized or not a customer",
      });
    }

    if (!targetLang || typeof targetLang !== "string" || !targetLang.trim()) {
      return res.status(400).json({
        success: false,
        message: "Language code is required",
      });
    }

    const cleanCode = targetLang.trim().toLowerCase();

    // Validate that language exists in SupportedLanguage and is active
    const activeLang = await SupportedLanguage.findOne({
      code: cleanCode,
      isActive: true,
    });

    if (!activeLang) {
      return res.status(400).json({
        success: false,
        message: "Selected language is invalid or inactive",
      });
    }

    const customer = await Customer.findById(userId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    customer.preferredLanguage = cleanCode;
    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Language preference updated successfully",
      data: {
        preferredLanguage: customer.preferredLanguage,
      },
    });
  }
);

/**
 * Update customer profile
 */
export const updateProfile = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { name, email, dateOfBirth, notificationPreferences, accountPrivacy } = req.body;


    if (!userId || (req as any).user?.userType !== "Customer") {
      return res.status(401).json({
        success: false,
        message: "Unauthorized or not a customer",
      });
    }

    const customer = await Customer.findById(userId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Update fields if provided
    if (name) customer.name = name;
    if (email) {
      // Check if email is already taken by another customer
      const existingCustomer = await Customer.findOne({
        email,
        _id: { $ne: userId },
      });

      if (existingCustomer) {
        return res.status(409).json({
          success: false,
          message: "Email already in use by another customer",
        });
      }

      customer.email = email;
    }
    if (dateOfBirth) customer.dateOfBirth = new Date(dateOfBirth);
    if (notificationPreferences) customer.notificationPreferences = { ...customer.notificationPreferences, ...notificationPreferences };
    if (accountPrivacy) customer.accountPrivacy = { ...customer.accountPrivacy, ...accountPrivacy };


    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        dateOfBirth: customer.dateOfBirth,
        registrationDate: customer.registrationDate,
        status: customer.status,
        refCode: customer.refCode,
        walletAmount: customer.walletAmount,
        totalOrders: customer.totalOrders,
        totalSpent: customer.totalSpent,
        latitude: customer.latitude,
        longitude: customer.longitude,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        pincode: customer.pincode,
        notificationPreferences: customer.notificationPreferences,
        accountPrivacy: customer.accountPrivacy,
        donationStats: customer.donationStats,
      },

    });
  }
);

/**
 * Update customer location
 */
export const updateLocation = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { latitude, longitude, address, city, state, pincode } = req.body;

    if (!userId || (req as any).user?.userType !== "Customer") {
      return res.status(401).json({
        success: false,
        message: "Unauthorized or not a customer",
      });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const customer = await Customer.findById(userId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Update location fields
    customer.latitude = latitude;
    customer.longitude = longitude;
    customer.address = address;
    customer.city = city;
    customer.state = state;
    customer.pincode = pincode;
    customer.locationUpdatedAt = new Date();

    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Location updated successfully",
      data: {
        latitude: customer.latitude,
        longitude: customer.longitude,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        pincode: customer.pincode,
        locationUpdatedAt: customer.locationUpdatedAt,
      },
    });
  }
);

/**
 * Get customer location
 */
export const getLocation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId || (req as any).user?.userType !== "Customer") {
    return res.status(401).json({
      success: false,
      message: "Unauthorized or not a customer",
    });
  }

  const customer = await Customer.findById(userId).select(
    "latitude longitude address city state pincode locationUpdatedAt"
  );

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: "Customer not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Location retrieved successfully",
    data: {
      latitude: customer.latitude,
      longitude: customer.longitude,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      pincode: customer.pincode,
      locationUpdatedAt: customer.locationUpdatedAt,
    },
  });
});

/**
 * Delete the customer's own account.
 *
 * Refused while there is something still in progress (an undelivered order, an open
 * return/exchange, or a withdrawal being paid out). A wallet balance is forfeited only
 * when the customer confirms it (`forfeitWallet: true`). The request must carry
 * `confirm: "DELETE"`.
 *
 * Removed: the account, addresses, wishlist, carts, notifications and OTP records.
 * Kept for accounting/GST records: past orders, payments, refunds and returns, with the
 * customer's phone and email removed from those orders.
 */
export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId || (req as any).user?.userType !== "Customer") {
    return res.status(401).json({ success: false, message: "Unauthorized or not a customer" });
  }
  if (String(req.body?.confirm || "").trim().toUpperCase() !== "DELETE") {
    return res.status(400).json({ success: false, message: 'Type DELETE to confirm deleting your account.' });
  }

  const customer: any = await Customer.findById(userId);
  if (!customer) {
    return res.status(404).json({ success: false, message: "Account not found" });
  }

  const [Order, Return, WithdrawRequest, Address, Wishlist, Cart, CartItem, Notification, Otp, EmailOtp] = await Promise.all([
    import("../../../models/Order").then((m) => m.default),
    import("../../../models/Return").then((m) => m.default),
    import("../../../models/WithdrawRequest").then((m) => m.default),
    import("../../../models/Address").then((m) => m.default),
    import("../../../models/Wishlist").then((m) => m.default),
    import("../../../models/Cart").then((m) => m.default),
    import("../../../models/CartItem").then((m) => m.default),
    import("../../../models/Notification").then((m) => m.default),
    import("../../../models/Otp").then((m) => m.default),
    import("../../../models/EmailOtp").then((m) => m.default),
  ]);

  // Nothing may be left half-way.
  const activeOrders = await (Order as any).countDocuments({
    customer: userId,
    status: { $nin: ["Delivered", "Completed", "Cancelled", "Rejected", "Returned", "RTO"] },
  });
  if (activeOrders > 0) {
    return res.status(409).json({
      success: false,
      code: "ACTIVE_ORDERS",
      message: `You have ${activeOrders} order${activeOrders === 1 ? "" : "s"} still in progress. Delete your account after ${activeOrders === 1 ? "it is" : "they are"} delivered or cancelled.`,
    });
  }
  const openReturns = await (Return as any).countDocuments({ customer: userId, status: { $nin: ["Rejected", "Completed"] } });
  if (openReturns > 0) {
    return res.status(409).json({
      success: false,
      code: "OPEN_RETURNS",
      message: "You have a return or exchange in progress. Delete your account after it is completed.",
    });
  }
  const pendingWithdrawals = await (WithdrawRequest as any).countDocuments({
    userId,
    userType: "CUSTOMER",
    status: { $in: ["Pending", "Approved", "Processing"] },
  });
  if (pendingWithdrawals > 0) {
    return res.status(409).json({
      success: false,
      code: "PENDING_WITHDRAWAL",
      message: "A withdrawal from your wallet is still being processed. Delete your account after it is paid out.",
    });
  }
  const wallet = Number(customer.walletAmount || 0);
  if (wallet > 0 && req.body?.forfeitWallet !== true) {
    return res.status(409).json({
      success: false,
      code: "WALLET_BALANCE",
      walletAmount: wallet,
      message: `Your wallet has ₹${wallet.toFixed(2)}. Withdraw it first, or confirm that you give it up.`,
    });
  }

  const phone = String(customer.phone || "").trim();
  const email = String(customer.email || "").trim().toLowerCase();
  const carts = await (Cart as any).find({ customer: userId }).select("_id").lean();

  await Promise.all([
    (Address as any).deleteMany({ customer: userId }),
    (Wishlist as any).deleteMany({ customer: userId }),
    carts.length ? (CartItem as any).deleteMany({ cart: { $in: carts.map((c: any) => c._id) } }) : null,
    (Cart as any).deleteMany({ customer: userId }),
    (Notification as any).deleteMany({ recipientType: "Customer", recipientId: userId }),
    phone ? (Otp as any).deleteMany({ mobile: phone, userType: "Customer" }) : null,
    email ? (EmailOtp as any).deleteMany({ email, userType: "Customer" }) : null,
    // Past orders stay for accounting/GST, without the customer's contact details.
    (Order as any).updateMany({ customer: userId }, { $set: { customerPhone: "", customerEmail: "" } }),
  ]);
  await Customer.deleteOne({ _id: userId });

  return res.status(200).json({ success: true, message: "Your account has been deleted." });
});
