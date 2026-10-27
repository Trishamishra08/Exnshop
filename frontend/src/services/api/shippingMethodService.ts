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
