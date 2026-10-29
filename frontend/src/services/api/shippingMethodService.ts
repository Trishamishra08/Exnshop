import api from "./config";

export type ShippingMethod = "Self" | "Company";

export interface ShippingMethodRequest {
  requestedMethod: ShippingMethod;
  reason?: string;
  status: "Pending" | "Approved" | "Rejected";
  requestedAt: string;
  decidedAt?: string;
  adminNote?: string;
}

export interface ShippingMethodState {
  method: ShippingMethod | null;
  effectiveMethod: ShippingMethod;
  chosenAt: string | null;
  request: ShippingMethodRequest | null;
  shipsEcommerce: boolean;
  couriers: string[];
}

interface Wrapped<T> {
  success: boolean;
  data: T;
  message?: string;
}

export const getShippingMethod = async (): Promise<ShippingMethodState> =>
  (await api.get<Wrapped<ShippingMethodState>>("/seller/shipping/method")).data.data;

export const chooseShippingMethod = async (method: ShippingMethod): Promise<ShippingMethodState> =>
  (await api.put<Wrapped<ShippingMethodState>>("/seller/shipping/method", { method })).data.data;

export const requestShippingMethodChange = async (method: ShippingMethod, reason?: string): Promise<ShippingMethodState> =>
  (await api.post<Wrapped<ShippingMethodState>>("/seller/shipping/method/change-request", { method, reason })).data.data;

export const saveSelfShippingDetails = async (
  orderId: string,
  data: { courierName: string; trackingNumber: string; trackingUrl?: string },
) => (await api.put<Wrapped<unknown>>(`/orders/${orderId}/self-shipping`, data)).data;

// ── Admin ──
export interface AdminShippingRequestRow {
  sellerId: string;
  sellerName: string;
  storeName: string;
  mobile?: string;
  currentMethod: ShippingMethod | null;
  request: ShippingMethodRequest;
  openEcommerceOrders: number;
}

export const getShippingMethodRequests = async (status = "Pending"): Promise<AdminShippingRequestRow[]> =>
  (await api.get<Wrapped<AdminShippingRequestRow[]>>("/admin/shipping-method-requests", { params: { status } })).data.data;

export const decideShippingMethodRequest = async (sellerId: string, decision: "Approved" | "Rejected", note?: string) =>
  (await api.post<Wrapped<unknown>>(`/admin/sellers/${sellerId}/shipping-method/decision`, { decision, note })).data;

export const setSellerShippingMethod = async (sellerId: string, method: ShippingMethod) =>
  (await api.put<Wrapped<unknown>>(`/admin/sellers/${sellerId}/shipping-method`, { method })).data;

// ── Shipping charge ──
export interface ShippingChargePreview {
  chargeableGrams: number;
  charge: number;
  sellerPays: boolean;
  method: ShippingMethod;
}

export const getShippingChargePreview = async (input: { weightGrams?: string; length?: string; width?: string; height?: string }): Promise<ShippingChargePreview> =>
  (await api.get<Wrapped<ShippingChargePreview>>("/seller/shipping/charge-preview", { params: input })).data.data;

export interface ShippingRates {
  baseCharge: number;
  baseWeightGrams: number;
  perExtraSlabCharge: number;
  slabGrams: number;
  volumetricDivisor: number;
}

export const getShippingRates = async (): Promise<ShippingRates> =>
  (await api.get<Wrapped<ShippingRates>>("/admin/shipping-rates")).data.data;

export const updateShippingRates = async (rates: Partial<ShippingRates>): Promise<ShippingRates> =>
  (await api.put<Wrapped<ShippingRates>>("/admin/shipping-rates", rates)).data.data;

// ── Handling settings (ship-by dates) ──
export interface HandlingSettings {
  handlingTimeDays: number;
  operatingDays: number[];
  holidays: string[];
  orderCutoffTime: string;
  defaultCourier: string;
}

export const getHandlingSettings = async (): Promise<HandlingSettings> =>
  (await api.get<Wrapped<HandlingSettings>>("/seller/shipping/settings")).data.data;

export const saveHandlingSettings = async (data: Partial<HandlingSettings>): Promise<HandlingSettings> =>
  (await api.put<Wrapped<HandlingSettings>>("/seller/shipping/settings", data)).data.data;

// ── Packing slips ──
export interface PackingSlip {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  channel: string;
  paymentMethod?: string;
  shipByDate?: string;
  deliverByDate?: string;
  customer: { name?: string; phone?: string; address: string };
  seller: { name?: string; phone?: string; address: string };
  courier: string;
  trackingNumber: string;
  items: { name: string; sku: string; variation: string; quantity: number }[];
}

export const getPackingSlips = async (orderIds: string[]): Promise<PackingSlip[]> =>
  (await api.get<Wrapped<PackingSlip[]>>("/orders/packing-slips", { params: { ids: orderIds.join(",") } })).data.data;

// ── Seller refunds ──
export interface RefundableItem {
  orderItemId: string;
  productName: string;
  sku?: string;
  unitPrice: number;
  quantity: number;
  refundableQuantity: number;
}

export interface RefundRequestRow {
  _id: string;
  orderNumber?: string;
  productName?: string;
  quantity: number;
  reason: string;
  noteToBuyer?: string;
  noteToSelf?: string;
  refundAmount: number;
  status: "Pending" | "Processing" | "Approved" | "Rejected" | "Failed";
  adminNote?: string;
  failureReason?: string;
  createdAt: string;
  seller?: { sellerName?: string; storeName?: string; mobile?: string } | string;
}

export const getRefundReasons = async (): Promise<string[]> =>
  (await api.get<Wrapped<string[]>>("/refund-requests/reasons")).data.data;

export const getRefundableItems = async (orderRef: string) =>
  (await api.get<Wrapped<{ orderId: string; orderNumber: string; items: RefundableItem[] }>>(`/refund-requests/eligible/${encodeURIComponent(orderRef)}`)).data.data;

export const createRefundRequest = async (data: {
  orderId: string;
  orderItemId: string;
  quantity: number;
  reason: string;
  noteToBuyer?: string;
  noteToSelf?: string;
}) => (await api.post<Wrapped<RefundRequestRow>>("/refund-requests", data)).data.data;

export const getMyRefundRequests = async (): Promise<RefundRequestRow[]> =>
  (await api.get<Wrapped<RefundRequestRow[]>>("/refund-requests/my")).data.data;

export const getAllRefundRequests = async (status = "Pending"): Promise<RefundRequestRow[]> =>
  (await api.get<Wrapped<RefundRequestRow[]>>("/admin/refund-requests", { params: { status } })).data.data;

export const decideRefundRequest = async (id: string, decision: "Approved" | "Rejected", note?: string) =>
  (await api.post<Wrapped<RefundRequestRow>>(`/admin/refund-requests/${id}/decide`, { decision, note })).data;

export interface AdminSellerShippingRow {
  sellerId: string;
  sellerName: string;
  storeName: string;
  mobile?: string;
  email?: string;
  status?: string;
  method: ShippingMethod | null;
  chosenAt: string | null;
  pendingRequest: ShippingMethodRequest | null;
}

/** Every E-commerce seller with their shipping method (admin). */
export const listSellerShippingMethods = async (params?: { search?: string; method?: string }): Promise<AdminSellerShippingRow[]> =>
  (await api.get<Wrapped<AdminSellerShippingRow[]>>("/admin/sellers/shipping-methods", { params })).data.data;
