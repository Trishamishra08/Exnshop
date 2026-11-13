import { NextFunction, Request, Response } from "express";
import { ServiceControl } from "../models/ServiceControl";

/**
 * Catalogue of marketplace services the admin can switch ON/OFF
 * (Ecommerce_Marketplace_Admin_ON_OFF_Blueprint). Defaults to ON.
 *
 *  - locked:   critical security controls; a normal toggle can't switch them off.
 *  - enforced: the API really blocks the feature when OFF (see GUARDS below).
 *              Others are recorded only, until the feature is wired to its key.
 */
export interface ServiceDef {
  key: string;
  label: string;
  section: string;
  locked?: boolean;
  enforced?: boolean;
  /** Message customers/sellers see when it is OFF */
  offMessage?: string;
}

const s = (section: string, items: Array<[string, string, Partial<ServiceDef>?]>): ServiceDef[] =>
  items.map(([key, label, extra]) => ({ key, label, section, ...(extra || {}) }));

export const SERVICE_SECTIONS = [
  "Customer Services",
  "Order & Payment",
  "Shipping & Delivery",
  "Seller / Vendor",
  "Product & Catalogue",
  "Marketing & Promotion",
  "Website & App",
  "Security & Admin",
  "Finance & Commission",
] as const;

export const SERVICE_CATALOG: ServiceDef[] = [
  ...s("Customer Services", [
    ["customer_registration", "Customer Registration"],
    ["customer_login", "Login / Signup", { enforced: true, offMessage: "Login is temporarily unavailable." }],
    ["otp_login", "OTP Login"],
    ["google_login", "Google Login"],
    ["guest_checkout", "Guest Checkout"],
    ["wishlist", "Wishlist", { enforced: true, offMessage: "Wishlist is temporarily unavailable." }],
    ["product_reviews", "Product Reviews & Ratings", { enforced: true, offMessage: "Reviews are temporarily unavailable." }],
    ["product_qa", "Product Questions & Answers"],
    ["customer_support", "Customer Support / Chat", { enforced: true, offMessage: "Support requests are temporarily unavailable." }],
    ["push_notifications", "Push Notifications"],
    ["email_notifications", "Email Notifications"],
    ["sms_notifications", "SMS Notifications"],
  ]),
  ...s("Order & Payment", [
    ["cod", "COD (Cash on Delivery)", { enforced: true, offMessage: "Cash on Delivery is not available right now. Please pay online." }],
    ["online_payment", "Online Payment", { enforced: true, offMessage: "Online payment is not available right now." }],
    ["upi_payment", "UPI Payment"],
    ["card_payment", "Credit / Debit Card"],
    ["net_banking", "Net Banking"],
    ["wallet_payment", "Wallet Payment", { enforced: true, offMessage: "Wallet payment is not available right now." }],
    ["partial_payment", "Partial Payment"],
    ["order_cancellation", "Order Cancellation", { enforced: true, offMessage: "Order cancellation is not available right now." }],
    ["return_request", "Return Request", { enforced: true, offMessage: "Returns are not available right now." }],
    ["replacement", "Replacement"],
    ["refund", "Refund"],
    ["exchange", "Exchange"],
  ]),
  ...s("Shipping & Delivery", [
    ["free_shipping", "Free Shipping"],
    ["paid_shipping", "Paid Shipping"],
    ["express_delivery", "Express Delivery"],
    ["same_day_delivery", "Same Day Delivery"],
    ["next_day_delivery", "Next Day Delivery"],
    ["standard_delivery", "Standard Delivery"],
    ["delivery_partner_integration", "Delivery Partner Integration"],
    ["self_shipping_seller", "Self Shipping by Seller"],
    ["order_tracking", "Order Tracking"],
    ["delivery_otp", "Delivery OTP"],
    ["shipping_by_weight", "Shipping Charge by Weight"],
    ["pincode_delivery", "Pincode-wise Delivery"],
    ["international_shipping", "International Shipping"],
    ["delivery_date_estimation", "Delivery Date Estimation"],
  ]),
  ...s("Seller / Vendor", [
    ["seller_registration", "Seller Registration", { enforced: true, offMessage: "Seller registration is paused right now." }],
    ["seller_approval_required", "Seller Approval Required"],
    ["seller_kyc", "Seller KYC Verification"],
    ["seller_dashboard", "Seller Dashboard"],
    ["seller_product_upload", "Seller Product Upload"],
    ["auto_product_approval", "Auto Product Approval"],
    ["manual_product_approval", "Manual Product Approval"],
    ["seller_inventory", "Seller Inventory Management"],
    ["seller_order_management", "Seller Order Management"],
    ["seller_self_shipping", "Seller Self Shipping"],
    ["seller_commission", "Seller Commission"],
    ["seller_wallet", "Seller Wallet"],
    ["seller_payout_request", "Seller Payout Request"],
    ["seller_withdrawal", "Seller Withdrawal"],
    ["seller_chat", "Seller Chat with Customer"],
    ["seller_reviews", "Seller Rating & Reviews"],
  ]),
  ...s("Product & Catalogue", [
    ["product_listing", "Product Listing"],
    ["product_variants", "Product Variants (Size / Color)"],
    ["product_media", "Product Images & Videos"],
    ["stock_management", "Product Stock Management"],
    ["low_stock_alert", "Low Stock Alert"],
    ["out_of_stock_products", "Out of Stock Products"],
    ["product_comparison", "Product Comparison"],
    ["related_products", "Related Products"],
    ["recently_viewed", "Recently Viewed Products"],
    ["featured_products", "Featured Products"],
    ["best_selling_products", "Best Selling Products"],
    ["new_arrivals", "New Arrivals"],
    ["product_discount", "Product Discount"],
    ["bulk_product_upload", "Bulk Product Upload"],
  ]),
  ...s("Marketing & Promotion", [
    ["coupon_code", "Coupon Code", { enforced: true, offMessage: "Coupons are not available right now." }],
    ["discount_offers", "Discount Offers"],
    ["flash_sale", "Flash Sale"],
    ["festival_offers", "Festival Offers"],
    ["referral_program", "Referral Program"],
    ["loyalty_points", "Loyalty Points"],
    ["cashback", "Cashback"],
    ["welcome_discount", "Welcome Discount"],
    ["free_gift_offer", "Free Gift Offer"],
    ["affiliate_marketing", "Affiliate Marketing"],
    ["homepage_banner", "Homepage Banner"],
    ["popup_offers", "Popup Offers"],
    ["abandoned_cart_reminder", "Abandoned Cart Reminder"],
  ]),
  ...s("Website & App", [
    ["website", "Website"],
    ["android_app", "Android App"],
    ["ios_app", "iOS App"],
    ["maintenance_mode", "Maintenance Mode (use App Settings)"],
    ["new_user_registration", "New User Registration"],
    ["product_search", "Product Search"],
    ["product_filters", "Product Filters"],
    ["category_section", "Category Section"],
    ["brand_section", "Brand Section"],
    ["blog_section", "Blog Section"],
    ["faq_section", "FAQ Section"],
    ["contact_us", "Contact Us"],
    ["about_us", "About Us"],
    ["privacy_policy", "Privacy Policy"],
    ["terms_conditions", "Terms & Conditions"],
  ]),
  ...s("Security & Admin", [
    ["admin_2fa", "Admin Two-Factor Authentication", { locked: true }],
    ["login_otp", "Login OTP", { locked: true }],
    ["login_attempt_limit", "Login Attempt Limit", { locked: true }],
    ["new_device_verification", "New Device Verification"],
    ["suspicious_order_detection", "Suspicious Order Detection"],
    ["fake_seller_detection", "Fake Seller Detection"],
    ["customer_account_block", "Customer Account Block"],
    ["seller_account_suspend", "Seller Account Suspend"],
    ["ip_blocking", "IP Blocking"],
    ["admin_activity_logs", "Admin Activity Logs", { locked: true }],
    ["auto_db_backup", "Automatic Database Backup", { locked: true }],
    ["api_access", "API Access"],
  ]),
  ...s("Finance & Commission", [
    ["marketplace_commission", "Marketplace Commission"],
    ["category_commission", "Category-wise Commission"],
    ["seller_commission_rate", "Seller-wise Commission"],
    ["auto_commission_deduction", "Automatic Commission Deduction"],
    ["auto_seller_settlement", "Automatic Seller Settlement"],
    ["manual_payout", "Manual Payout"],
    ["payout_hold", "Payout Hold"],
    ["tds_calculation", "TDS Calculation"],
    ["gst_invoice", "GST Invoice"],
    ["customer_invoice", "Customer Invoice"],
    ["seller_ledger", "Seller Ledger"],
    ["transaction_reports", "Transaction Reports"],
  ]),
];

export const SERVICE_BY_KEY = new Map(SERVICE_CATALOG.map((d) => [d.key, d]));

// ── State (cached for 15 s so the guard adds no database round-trip per request) ──
let cache: { at: number; off: Map<string, string | undefined> } | null = null;
const TTL_MS = 15_000;

async function loadOff() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.off;
  const rows = await ServiceControl.find({ enabled: false }).select("key note").lean();
  const off = new Map<string, string | undefined>();
  for (const r of rows as any[]) {
    // Locked controls are always ON, even if a row says otherwise
    if (!SERVICE_BY_KEY.get(r.key)?.locked) off.set(r.key, r.note);
  }
  cache = { at: Date.now(), off };
  return off;
}

export const clearServiceControlCache = () => {
  cache = null;
};

export async function isServiceEnabled(key: string): Promise<boolean> {
  try {
    return !(await loadOff()).has(key);
  } catch {
    return true; // never lock customers out because the settings read failed
  }
}

/** Map of every service → enabled, for the storefront. */
export async function getServiceStates(): Promise<Record<string, boolean>> {
  let off: Map<string, string | undefined>;
  try {
    off = await loadOff();
  } catch {
    off = new Map();
  }
  return Object.fromEntries(SERVICE_CATALOG.map((d) => [d.key, !off.has(d.key)]));
}

const offResponse = (res: Response, key: string) => {
  const def = SERVICE_BY_KEY.get(key);
  return res.status(403).json({
    success: false,
    code: "SERVICE_DISABLED",
    service: key,
    message: def?.offMessage || "This service is temporarily unavailable.",
  });
};

/** Route-level guard: `router.post("/", requireService("wishlist"), handler)`. */
export const requireService = (key: string) => async (_req: Request, res: Response, next: NextFunction) => {
  if (await isServiceEnabled(key)) return next();
  return offResponse(res, key);
};

/**
 * One central guard in front of every API route: maps the request to a service
 * key, so switching a service OFF really stops it in the backend — not just
 * the button in the UI. Only new actions are blocked (reads, and orders that
 * already exist, keep working).
 */
interface Guard {
  method: string;
  path: RegExp;
  key: string;
  /** Extra condition on the request (e.g. only when paying by COD) */
  when?: (req: Request) => boolean;
}
const GUARDS: Guard[] = [
  { method: "POST", path: /^\/auth\/customer\/(send-sms-otp|verify-sms-otp)$/, key: "customer_login" },
  { method: "POST", path: /^\/auth\/seller\/register$/, key: "seller_registration" },
  { method: "POST", path: /^\/customer\/wishlist\/?$/, key: "wishlist" },
  { method: "POST", path: /^\/customer\/reviews\/?$/, key: "product_reviews" },
  { method: "POST", path: /^\/customer\/support\/contact\/?$/, key: "customer_support" },
  { method: "POST", path: /^\/customer\/orders\/[^/]+\/return\/?$/, key: "return_request" },
  { method: "POST", path: /^\/customer\/orders\/?$/, key: "cod", when: (r) => String(r.body?.paymentMethod || "COD").toUpperCase() === "COD" },
  { method: "POST", path: /^\/customer\/orders\/?$/, key: "online_payment", when: (r) => ["ONLINE", "RAZORPAY"].includes(String(r.body?.paymentMethod || "").toUpperCase()) },
  { method: "POST", path: /^\/customer\/orders\/?$/, key: "wallet_payment", when: (r) => String(r.body?.paymentMethod || "").toUpperCase() === "WALLET" },
  { method: "POST", path: /^\/customer\/orders\/[^/]+\/cancel\/?$/, key: "order_cancellation" },
  { method: "POST", path: /^\/customer\/coupons\/validate\/?$/, key: "coupon_code" },
];

export const serviceControlGuard = async (req: Request, res: Response, next: NextFunction) => {
  const guard = GUARDS.find((g) => g.method === req.method && g.path.test(req.path) && (!g.when || g.when(req)));
  if (!guard) return next();
  if (await isServiceEnabled(guard.key)) return next();
  return offResponse(res, guard.key);
};
