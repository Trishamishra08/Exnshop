import Seller, { SellerPostalAddress } from "../models/Seller";

/**
 * The seller's pickup address (where couriers collect parcels) and return address
 * (where returned parcels go; the pickup address unless the seller sets another).
 * Entered by the seller, so couriers don't depend on a guess from the map pin.
 */

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

const fail = (message: string) => Object.assign(new Error(message), { statusCode: 400 });
const clean = (v: any, max = 190) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Checks one address; `label` names it in messages ("Pickup address" / "Return address"). */
export const validatePostalAddress = (input: any, label: string): SellerPostalAddress => {
  const a: SellerPostalAddress = {
    contactName: clean(input?.contactName, 80) || undefined,
    phone: clean(input?.phone, 15).replace(/\D/g, "").slice(-10) || undefined,
    line1: clean(input?.line1),
    line2: clean(input?.line2) || undefined,
    landmark: clean(input?.landmark, 120) || undefined,
    city: clean(input?.city, 80),
    state: clean(input?.state, 80),
    pincode: clean(input?.pincode, 6).replace(/\D/g, ""),
  };
  // Couriers (Shiprocket) need line 1 of 10+ characters with a shop / house / plot number.
  if (a.line1.length < 10 || !/\d/.test(a.line1)) {
    throw fail(`${label}: enter the shop / house number and street (at least 10 characters with a number), e.g. "Shop 12, Main Market Road".`);
  }
  if (!a.city) throw fail(`${label}: enter the city or town.`);
  const state = INDIAN_STATES.find((s) => s.toLowerCase() === a.state.toLowerCase());
  if (!state) throw fail(`${label}: choose the state from the list.`);
  a.state = state;
  if (!/^[1-9]\d{5}$/.test(a.pincode)) throw fail(`${label}: enter the 6-digit pincode.`);
  if (a.phone && !/^[6-9]\d{9}$/.test(a.phone)) throw fail(`${label}: enter a valid 10-digit mobile number, or leave it empty.`);
  return a;
};

export const formatPostalAddress = (a?: SellerPostalAddress | null) =>
  a ? [a.line1, a.line2, a.landmark, a.city, `${a.state} ${a.pincode}`].filter(Boolean).join(", ") : "";

export const getSellerAddresses = async (sellerId: string) => {
  const seller: any = await Seller.findById(sellerId)
    .select("storeName sellerName mobile address city searchLocation serviceableArea latitude longitude location returnAddress pickupAddress returnSameAsPickup returnAddressDetails channels shippingMethod shiprocketPickupLocation shiprocketPickupSyncError status")
    .lean();
  if (!seller) throw Object.assign(new Error("Seller not found"), { statusCode: 404 });

  // Before the seller saves one: a starting point from their profile and map pin.
  let suggested: any = null;
  if (!seller.pickupAddress) {
    try {
      const { resolveSellerAddress } = await import("./shiprocketService");
      const r = await resolveSellerAddress(seller);
      suggested = { line1: seller.address || "", city: r.city || seller.city || "", state: r.state || "", pincode: r.pincode || "" };
    } catch {
      suggested = { line1: seller.address || "", city: seller.city || "", state: "", pincode: "" };
    }
  }

  return {
    pickupAddress: seller.pickupAddress || null,
    returnSameAsPickup: seller.returnSameAsPickup !== false,
    returnAddressDetails: seller.returnAddressDetails || null,
    suggested,
    defaultContact: { contactName: seller.sellerName || seller.storeName || "", phone: seller.mobile || "" },
    courier: {
      // Shown so the seller can see whether the courier pickup point is set up.
      usesCourier: (seller.channels || []).includes("ECommerce"),
      pickupRegistered: Boolean(seller.shiprocketPickupLocation),
      error: seller.shiprocketPickupSyncError || "",
    },
    states: INDIAN_STATES,
  };
};

export const saveSellerAddresses = async (sellerId: string, body: any) => {
  const pickupAddress = validatePostalAddress(body?.pickupAddress, "Pickup address");
  const returnSameAsPickup = body?.returnSameAsPickup !== false;
  const returnAddressDetails = returnSameAsPickup ? undefined : validatePostalAddress(body?.returnAddressDetails, "Return address");

  const update: any = {
    $set: {
      pickupAddress,
      returnSameAsPickup,
      // The plain-text return address other screens still show.
      returnAddress: formatPostalAddress(returnSameAsPickup ? pickupAddress : returnAddressDetails),
    },
  };
  if (returnSameAsPickup) update.$unset = { returnAddressDetails: 1 };
  else update.$set.returnAddressDetails = returnAddressDetails;

  const seller = await Seller.findByIdAndUpdate(sellerId, update, { new: true }).select("_id");
  if (!seller) throw Object.assign(new Error("Seller not found"), { statusCode: 404 });

  // Register the new pickup point with the courier now, so a problem shows straight away.
  let courierMessage = "";
  try {
    const { syncSellerPickupLocation } = await import("./shiprocketService");
    const sync = await syncSellerPickupLocation(sellerId);
    if (!sync.success) courierMessage = `Saved, but the courier could not register the pickup address yet: ${sync.message}`;
  } catch (err: any) {
    courierMessage = `Saved, but the courier pickup could not be updated yet: ${err?.message || "try again later"}`;
  }
  return { data: await getSellerAddresses(sellerId), courierMessage };
};
