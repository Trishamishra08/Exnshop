import axios from "axios";
import { IOrder } from "../models/Order";
import OrderItem from "../models/OrderItem";

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

interface ShiprocketOrderResult {
  success: boolean;
  isMock: boolean;
  orderId?: string;
  shipmentId?: string;
  message?: string;
}

/**
 * Pushes a confirmed E-Commerce order to Shiprocket to create a shipment.
 * In mock mode (no SHIPROCKET_EMAIL/PASSWORD configured) this simulates a
 * successful response without calling the real API, so the rest of the
 * order flow can be built/tested before real credentials are available.
 */
export const createShiprocketOrder = async (
  order: IOrder & { _id: any }
): Promise<ShiprocketOrderResult> => {
  try {
    if (isMockMode()) {
      console.warn(
        "⚠️ [Shiprocket] SHIPROCKET_EMAIL/SHIPROCKET_PASSWORD not configured — using mock shipment response."
      );
      return {
        success: true,
        isMock: true,
        orderId: `mock_sr_order_${order._id}`,
        shipmentId: `mock_sr_shipment_${order._id}`,
      };
    }

    const token = await getAuthToken();

    const orderItems = await OrderItem.find({ _id: { $in: order.items } });

    const lineItems = orderItems.map((item) => ({
      name: item.productName || "Item",
      sku: item.sku || item.product?.toString() || "SKU",
      units: item.quantity,
      selling_price: item.unitPrice,
    }));

    const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION || "Primary";

    const payload = {
      order_id: order.orderNumber,
      order_date: new Date(order.orderDate).toISOString().slice(0, 19).replace("T", " "),
      pickup_location: pickupLocation,
      billing_customer_name: order.customerName,
      billing_last_name: "",
      billing_address: order.deliveryAddress.address,
      billing_city: order.deliveryAddress.city,
      billing_pincode: order.deliveryAddress.pincode,
      billing_state: order.deliveryAddress.state || order.deliveryAddress.city,
      billing_country: "India",
      billing_email: order.customerEmail,
      billing_phone: order.customerPhone,
      shipping_is_billing: true,
      order_items: lineItems,
      payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
      sub_total: order.subtotal,
      length: 10,
      breadth: 10,
      height: 10,
      weight: 0.5,
    };

    const response = await axios.post(`${SHIPROCKET_BASE_URL}/orders/create/adhoc`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return {
      success: true,
      isMock: false,
      orderId: response.data?.order_id?.toString(),
      shipmentId: response.data?.shipment_id?.toString(),
    };
  } catch (error: any) {
    console.error("Error creating Shiprocket order:", error?.response?.data || error.message);
    return {
      success: false,
      isMock: false,
      message: error?.response?.data?.message || error.message,
    };
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
