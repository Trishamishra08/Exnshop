import axios from "axios";
import crypto from "crypto";
import { IOrder } from "../models/Order";
import OrderItem from "../models/OrderItem";
import Product from "../models/Product";
import Seller, { ISeller } from "../models/Seller";

const FALLBACK_ITEM = { grams: 500, length: 10, width: 10, height: 10 };

/**
 * Parcel for one seller's items, from the weight and dimensions listed on each
 * product (falling back to 500 g / 10 cm for products listed before those fields
 * existed). Items are treated as stacked: footprint of the largest, heights add up.
 */
export const parcelForItems = async (items: Array<{ product?: any; quantity?: number }>) => {
  const ids = items.map((i) => i.product).filter(Boolean);
  const products: any[] = await Product.find({ _id: { $in: ids } }).select("weightGrams dimensionsCm").lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  let grams = 0;
  let length = 0;
  let width = 0;
  let height = 0;
  for (const item of items) {
    const p = byId.get(String(item.product));
    const qty = Math.max(1, Number(item.quantity) || 1);
    const d = p?.dimensionsCm || {};
    grams += (p?.weightGrams || FALLBACK_ITEM.grams) * qty;
    length = Math.max(length, d.length || FALLBACK_ITEM.length);
    width = Math.max(width, d.width || FALLBACK_ITEM.width);
    height += (d.height || FALLBACK_ITEM.height) * qty;
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    weight: Math.max(0.05, Math.round(grams) / 1000),
    length: round(Math.max(0.5, length)),
    breadth: round(Math.max(0.5, width)),
    height: round(Math.max(0.5, Math.min(height, 200))),
  };
};

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

let cachedToken: { token: string; expiresAt: number } | null = null;

const isMockMode = () =>
  !process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD;

/**
 * Lazily authenticates with Shiprocket and caches the bearer token
 * (Shiprocket tokens are valid ~10 days; we refresh every 9 to be safe).
 * Falls back to a mock token when credentials aren't configured, mirroring
 * the paymentService.ts mock-mode pattern for Razorpay.
 */
const getAuthToken = async (): Promise<string> => {
  if (isMockMode()) {
    return "mock-shiprocket-token";
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
    email: process.env.SHIPROCKET_EMAIL,
    password: process.env.SHIPROCKET_PASSWORD,
  });

  const token = response.data?.token;
  if (!token) {
    throw new Error("Shiprocket authentication did not return a token");
  }

  cachedToken = {
    token,
    expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000,
  };
  return token;
};

const DEFAULT_PICKUP_LOCATION = () => process.env.SHIPROCKET_PICKUP_LOCATION || "Primary";

const describeShiprocketError = (error: any): string => {
  const data = error?.response?.data;
  if (data?.errors && typeof data.errors === "object") {
    return Object.values(data.errors).flat().join("; ");
  }
  return data?.message || error?.message || "Unknown Shiprocket error";
};

export interface ResolvedAddress {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

/**
 * Sellers store a free-text address plus a map pin, but Shiprocket needs a
 * state and pincode — derive them by reverse-geocoding the pin.
 */
export const resolveSellerAddress = async (seller: ISeller): Promise<ResolvedAddress> => {
  const lat = seller.location?.coordinates?.[1] ?? parseFloat(seller.latitude || "");
  const lng = seller.location?.coordinates?.[0] ?? parseFloat(seller.longitude || "");
  const key = process.env.GOOGLE_MAPS_API_KEY;

  let formatted = "";
  let city = "";
  let state = "";
  let pincode = "";

  if (key && !isNaN(lat) && !isNaN(lng)) {
    const { data } = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: { latlng: `${lat},${lng}`, key },
    });
    const result = data?.results?.[0];
    if (result) {
      const part = (type: string) =>
        result.address_components?.find((c: any) => c.types?.includes(type))?.long_name || "";
      formatted = result.formatted_address || "";
      city = part("locality") || part("administrative_area_level_3") || part("administrative_area_level_2");
      state = part("administrative_area_level_1");
      pincode = part("postal_code");
    }
  }

  const typed = (seller.address || "").trim();
  if (!pincode) {
    pincode = `${typed} ${seller.searchLocation || ""}`.match(/\b\d{6}\b/)?.[0] || "";
  }

  // Shiprocket rejects line 1 unless it is 10+ chars and contains a house/flat/road number.
  const typedIsUsable = typed.length >= 10 && /\d/.test(typed);
  const fallback = formatted || seller.searchLocation || "";
  const line1 = typedIsUsable ? typed : fallback || typed;
  const line2 = typedIsUsable ? fallback : typed;

  return {
    line1: line1.slice(0, 190),
    line2: line2 === line1 ? "" : line2.slice(0, 190),
    city: city || seller.city || "",
    state,
    pincode,
  };
};

const pickupSignature = (seller: ISeller) =>
  crypto
    .createHash("sha1")
    .update(
      JSON.stringify([
        seller.address,
        seller.searchLocation,
        seller.city,
        seller.latitude,
        seller.longitude,
        seller.location?.coordinates,
        seller.mobile,
        seller.email,
        seller.sellerName,
      ])
    )
    .digest("hex");

const isPickupEligible = (seller: ISeller) =>
  seller.status === "Approved" && (seller.channels || []).includes("ECommerce");

/**
 * Registers the seller's shop address as a Shiprocket pickup location, or
 * registers a fresh one when the address has changed since the last sync.
 * Shiprocket's API cannot edit an existing pickup address, so a change always
 * creates a new location under a new name and the seller is switched to it.
 * Safe to call after any seller update — it no-ops when nothing relevant changed.
 */
export const syncSellerPickupLocation = async (
  sellerId: string
): Promise<{ success: boolean; pickupLocation?: string; skipped?: string; message?: string }> => {
  const seller = await Seller.findById(sellerId);
  if (!seller) return { success: false, message: "Seller not found" };

  if (isMockMode()) return { success: true, skipped: "Shiprocket credentials not configured" };
  if (!isPickupEligible(seller)) {
    return { success: true, skipped: "Seller is not an approved E-Commerce seller" };
  }

  const signature = pickupSignature(seller);
  if (seller.shiprocketPickupLocation && seller.shiprocketPickupSignature === signature) {
    return { success: true, pickupLocation: seller.shiprocketPickupLocation, skipped: "Address unchanged" };
  }

  const fail = async (message: string) => {
    await Seller.updateOne({ _id: seller._id }, { $set: { shiprocketPickupSyncError: message } });
    console.error(`[Shiprocket] Pickup sync failed for seller ${seller._id} (${seller.storeName}): ${message}`);
    return { success: false, message };
  };

  try {
    const address = await resolveSellerAddress(seller);
    if (!address.pincode || !address.state) {
      return await fail("Could not determine the shop's pincode/state from its map location");
    }

    // Unique and short (Shiprocket nicknames are limited in length).
    const pickupLocation = `EXN-${seller._id.toString().slice(-6)}-${Date.now().toString(36)}`;
    const token = await getAuthToken();
    await axios.post(
      `${SHIPROCKET_BASE_URL}/settings/company/addpickup`,
      {
        pickup_location: pickupLocation,
        name: seller.sellerName || seller.storeName,
        email: seller.email,
        phone: (seller.mobile || "").replace(/\D/g, "").slice(-10),
        address: address.line1,
        address_2: address.line2,
        city: address.city,
        state: address.state,
        country: "India",
        pin_code: address.pincode,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    await Seller.updateOne(
      { _id: seller._id },
      {
        $set: {
          shiprocketPickupLocation: pickupLocation,
          shiprocketPickupSignature: signature,
          shiprocketPickupSyncedAt: new Date(),
        },
        $unset: { shiprocketPickupSyncError: 1 },
      }
    );
    console.log(`[Shiprocket] Registered pickup location ${pickupLocation} for seller ${seller.storeName}`);
    return { success: true, pickupLocation };
  } catch (error: any) {
    return await fail(describeShiprocketError(error));
  }
};

/** Fire-and-forget wrapper for use right after a seller is created/updated. */
export const queueSellerPickupSync = (sellerId: string) => {
  syncSellerPickupLocation(sellerId).catch((err) =>
    console.error(`[Shiprocket] Unexpected pickup sync error for seller ${sellerId}:`, err)
  );
};

export interface ShiprocketShipmentResult {
  seller?: string;
  channelOrderId: string;
  pickupLocation: string;
  orderId?: string;
  shipmentId?: string;
}

interface ShiprocketOrderResult {
  success: boolean;
  isMock: boolean;
  shipments: ShiprocketShipmentResult[];
  message?: string;
}

/**
 * Pushes a confirmed E-Commerce order to Shiprocket, as one shipment per
 * seller so each courier is sent to that seller's own pickup address.
 * In mock mode (no SHIPROCKET_EMAIL/PASSWORD configured) this simulates a
 * successful response without calling the real API.
 */
export const createShiprocketOrder = async (
  order: IOrder & { _id: any }
): Promise<ShiprocketOrderResult> => {
  if (isMockMode()) {
    console.warn(
      "⚠️ [Shiprocket] SHIPROCKET_EMAIL/SHIPROCKET_PASSWORD not configured — using mock shipment response."
    );
    return {
      success: true,
      isMock: true,
      shipments: [
        {
          channelOrderId: order.orderNumber,
          pickupLocation: DEFAULT_PICKUP_LOCATION(),
          orderId: `mock_sr_order_${order._id}`,
          shipmentId: `mock_sr_shipment_${order._id}`,
        },
      ],
    };
  }

  const orderItems = await OrderItem.find({ _id: { $in: order.items } });
  const groups = new Map<string, typeof orderItems>();
  for (const item of orderItems) {
    const key = item.seller?.toString() || "unknown";
    groups.set(key, [...(groups.get(key) || []), item]);
  }

  const shipments: ShiprocketShipmentResult[] = [];
  const errors: string[] = [];
  let index = 0;

  for (const [sellerId, items] of groups) {
    index += 1;
    const channelOrderId = groups.size === 1 ? order.orderNumber : `${order.orderNumber}-${index}`;

    let pickupLocation = DEFAULT_PICKUP_LOCATION();
    if (sellerId !== "unknown") {
      const sync = await syncSellerPickupLocation(sellerId);
      if (sync.pickupLocation) {
        pickupLocation = sync.pickupLocation;
      } else {
        console.warn(
          `[Shiprocket] Seller ${sellerId} has no registered pickup location (${sync.message || sync.skipped}); using default "${pickupLocation}".`
        );
      }
    }

    try {
      const token = await getAuthToken();
      const parcel = await parcelForItems(items);
      const payload = {
        order_id: channelOrderId,
        order_date: new Date(order.orderDate).toISOString().slice(0, 19).replace("T", " "),
        pickup_location: pickupLocation,
        billing_customer_name: order.customerName,
        billing_last_name: "",
        billing_address: order.deliveryAddress.address,
        billing_city: order.deliveryAddress.city,
        billing_pincode: order.deliveryAddress.pincode,
        billing_state: order.deliveryAddress.state || order.deliveryAddress.city,
        billing_country: "India",
        // Customer email is optional (mobile-first signup) but Shiprocket requires one.
        billing_email: order.customerEmail || "support@exnshop.in",
        billing_phone: order.customerPhone,
        shipping_is_billing: true,
        order_items: items.map((item) => ({
          name: item.productName || "Item",
          sku: item.sku || item.product?.toString() || "SKU",
          units: item.quantity,
          selling_price: item.unitPrice,
        })),
        payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
        sub_total:
          groups.size === 1
            ? order.subtotal
            : items.reduce((sum, item) => sum + (item.unitPrice || 0) * (item.quantity || 0), 0),
        ...parcel,
      };

      const response = await axios.post(`${SHIPROCKET_BASE_URL}/orders/create/adhoc`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      shipments.push({
        seller: sellerId === "unknown" ? undefined : sellerId,
        channelOrderId,
        pickupLocation,
        orderId: response.data?.order_id?.toString(),
        shipmentId: response.data?.shipment_id?.toString(),
      });
    } catch (error: any) {
      const message = describeShiprocketError(error);
      console.error(`Error creating Shiprocket order ${channelOrderId}:`, error?.response?.data || error.message);
      errors.push(`${channelOrderId}: ${message}`);
    }
  }

  return {
    success: shipments.length > 0,
    isMock: false,
    shipments,
    message: errors.length ? errors.join(" | ") : undefined,
  };
};

export interface ReturnPickupParams {
  /** Our id for the return shipment, kept distinct from the order number. */
  channelOrderId: string;
  customer: { name: string; phone: string; email?: string; address: string; city: string; state: string; pincode: string };
  seller: { name: string; phone: string; email?: string; address: string; city: string; state: string; pincode: string };
  item: { name: string; sku: string; units: number; sellingPrice: number; product?: any };
}

/**
 * Books a courier reverse pickup: from the customer's address back to the
 * seller, then assigns its AWB. In mock mode a test shipment and AWB are returned.
 */
export const createShiprocketReturn = async (
  params: ReturnPickupParams
): Promise<{ success: boolean; isMock: boolean; orderId?: string; shipmentId?: string; awbCode?: string; courierName?: string; message?: string }> => {
  if (isMockMode()) {
    return {
      success: true,
      isMock: true,
      orderId: `mock_sr_return_${params.channelOrderId}`,
      shipmentId: `mock_sr_return_shipment_${params.channelOrderId}`,
      awbCode: `8${crypto.createHash("sha1").update(params.channelOrderId).digest("hex").replace(/\D/g, "").padEnd(13, "0").slice(0, 13)}`,
      courierName: "Test Courier (return)",
    };
  }

  try {
    const token = await getAuthToken();
    const headers = { Authorization: `Bearer ${token}` };
    const parcel = await parcelForItems([{ product: params.item.product, quantity: params.item.units }]);
    const { customer, seller, item } = params;
    const payload = {
      order_id: params.channelOrderId,
      order_date: new Date().toISOString().slice(0, 10),
      pickup_customer_name: customer.name,
      pickup_last_name: "",
      pickup_address: customer.address,
      pickup_city: customer.city,
      pickup_state: customer.state || customer.city,
      pickup_country: "India",
      pickup_pincode: customer.pincode,
      pickup_email: customer.email || "support@exnshop.in",
      pickup_phone: customer.phone,
      shipping_customer_name: seller.name,
      shipping_last_name: "",
      shipping_address: seller.address,
      shipping_city: seller.city,
      shipping_state: seller.state || seller.city,
      shipping_country: "India",
      shipping_pincode: seller.pincode,
      shipping_email: seller.email || "support@exnshop.in",
      shipping_phone: seller.phone,
      order_items: [{ name: item.name, sku: item.sku, units: item.units, selling_price: item.sellingPrice }],
      payment_method: "Prepaid",
      sub_total: item.sellingPrice * item.units,
      ...parcel,
    };
    const { data } = await axios.post(`${SHIPROCKET_BASE_URL}/orders/create/return`, payload, { headers });
    const orderId = data?.order_id?.toString();
    const shipmentId = data?.shipment_id?.toString();
    if (!shipmentId) {
      return { success: false, isMock: false, orderId, message: data?.message || "Shiprocket did not create the return shipment" };
    }

    const awb = await assignReturnAwb(shipmentId);
    return { ...awb, orderId, shipmentId };
  } catch (error: any) {
    console.error(`[Shiprocket] Return pickup failed for ${params.channelOrderId}:`, error?.response?.data || error.message);
    return { success: false, isMock: false, message: describeShiprocketError(error) };
  }
};

/** Assigns the courier AWB for an already-created return shipment (also used to retry). */
export const assignReturnAwb = async (
  shipmentId: string
): Promise<{ success: boolean; isMock: boolean; awbCode?: string; courierName?: string; message?: string }> => {
  if (isMockMode()) {
    return { success: true, isMock: true, awbCode: `8${String(shipmentId).replace(/\D/g, "").padEnd(13, "0").slice(0, 13)}`, courierName: "Test Courier (return)" };
  }
  try {
    const token = await getAuthToken();
    // Reverse pickups get their AWB the same way, flagged as a return.
    const { data } = await axios.post(
      `${SHIPROCKET_BASE_URL}/courier/assign/awb`,
      { shipment_id: Number(shipmentId) || shipmentId, is_return: 1 },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const assigned = data?.response?.data || {};
    if (data?.awb_assign_status !== 1 || !assigned.awb_code) {
      return { success: false, isMock: false, message: assigned.awb_assign_error || data?.message || "No courier was assigned to the return yet" };
    }
    return { success: true, isMock: false, awbCode: String(assigned.awb_code), courierName: assigned.courier_name || "" };
  } catch (error: any) {
    console.error(`[Shiprocket] Return AWB failed for shipment ${shipmentId}:`, error?.response?.data || error.message);
    return { success: false, isMock: false, message: describeShiprocketError(error) };
  }
};

/**
 * Checks Shiprocket courier serviceability for a delivery pincode.
 */
export const checkShiprocketServiceability = async (
  pickupPincode: string,
  deliveryPincode: string,
  weightKg = 0.5,
  codOrder = false
) => {
  if (isMockMode()) {
    return { success: true, isMock: true, serviceable: true, couriers: [] };
  }

  try {
    const token = await getAuthToken();
    const response = await axios.get(`${SHIPROCKET_BASE_URL}/courier/serviceability`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        pickup_postcode: pickupPincode,
        delivery_postcode: deliveryPincode,
        weight: weightKg,
        cod: codOrder ? 1 : 0,
      },
    });
    const couriers = response.data?.data?.available_courier_companies || [];
    return { success: true, isMock: false, serviceable: couriers.length > 0, couriers };
  } catch (error: any) {
    console.error("Error checking Shiprocket serviceability:", error?.response?.data || error.message);
    return { success: false, isMock: false, serviceable: false, couriers: [] };
  }
};

/**
 * Fetches live tracking info for an AWB (airway bill) code.
 */
export const trackShiprocketShipment = async (awbCode: string) => {
  if (isMockMode()) {
    return { success: true, isMock: true, status: "Mock: Order Confirmed", trackingUrl: "" };
  }

  try {
    const token = await getAuthToken();
    const response = await axios.get(`${SHIPROCKET_BASE_URL}/courier/track/awb/${awbCode}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const trackData = response.data?.tracking_data;
    return {
      success: true,
      isMock: false,
      status: trackData?.shipment_status || trackData?.current_status,
      trackingUrl: trackData?.track_url || "",
    };
  } catch (error: any) {
    console.error("Error tracking Shiprocket shipment:", error?.response?.data || error.message);
    return { success: false, isMock: false, status: undefined, trackingUrl: "" };
  }
};

export interface AwbAssignment {
  success: boolean;
  isMock: boolean;
  awbCode?: string;
  courierName?: string;
  routingCode?: string;
  rtoRoutingCode?: string;
  pickupScheduledAt?: Date;
  message?: string;
}

/**
 * Asks Shiprocket to pick a courier for a created shipment and issue its AWB
 * (the number the label's barcode and Data Matrix carry), then requests the
 * courier pickup. Shiprocket charges the courier fee to the account's wallet
 * at this point. In mock mode a test AWB is returned instead.
 */
export const assignAwbAndRequestPickup = async (shipmentId: string): Promise<AwbAssignment> => {
  if (isMockMode()) {
    // Deterministic 14-digit test AWB so the label can be tried without Shiprocket.
    const digits = crypto.createHash("sha1").update(shipmentId).digest("hex").replace(/\D/g, "");
    return {
      success: true,
      isMock: true,
      awbCode: `9${(digits + "0000000000000").slice(0, 13)}`,
      courierName: "Test Courier",
      routingCode: "TEST/DEST",
      rtoRoutingCode: "TEST/RTO",
      pickupScheduledAt: new Date(),
    };
  }

  try {
    const token = await getAuthToken();
    const headers = { Authorization: `Bearer ${token}` };
    const { data } = await axios.post(
      `${SHIPROCKET_BASE_URL}/courier/assign/awb`,
      { shipment_id: Number(shipmentId) || shipmentId },
      { headers }
    );
    const assigned = data?.response?.data || {};
    if (data?.awb_assign_status !== 1 || !assigned.awb_code) {
      return {
        success: false,
        isMock: false,
        message: assigned.awb_assign_error || data?.message || "Shiprocket could not assign a courier to this shipment",
      };
    }

    const result: AwbAssignment = {
      success: true,
      isMock: false,
      awbCode: String(assigned.awb_code),
      courierName: assigned.courier_name || "",
      // Not every courier returns sorting codes; the label leaves them blank then.
      routingCode: assigned.routing_code || assigned.routingCode || "",
      rtoRoutingCode: assigned.rto_routing_code || assigned.rtoRoutingCode || "",
    };

    // Pickup request: the AWB is already valid, so a failure here is reported but not fatal.
    try {
      const pickup = await axios.post(
        `${SHIPROCKET_BASE_URL}/courier/generate/pickup`,
        { shipment_id: [Number(shipmentId) || shipmentId] },
        { headers }
      );
      const scheduled = pickup.data?.response?.pickup_scheduled_date;
      if (scheduled) result.pickupScheduledAt = new Date(scheduled);
    } catch (pickupError: any) {
      result.message = `AWB assigned, but the pickup request failed: ${describeShiprocketError(pickupError)}`;
      console.error(`[Shiprocket] Pickup request failed for shipment ${shipmentId}:`, pickupError?.response?.data || pickupError.message);
    }
    return result;
  } catch (error: any) {
    console.error(`[Shiprocket] AWB assignment failed for shipment ${shipmentId}:`, error?.response?.data || error.message);
    return { success: false, isMock: false, message: describeShiprocketError(error) };
  }
};
