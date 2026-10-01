import api from "../config";
import { ApiResponse } from "./types";

export interface Courier {
  _id: string;
  name: string;
  serviceablePinCodes: string[];
  weightLimitKg: number;
  baseShippingCharge: number;
  perKgCharge: number;
  codAvailable: boolean;
  pickupAvailable: boolean;
  trackingApiUrl?: string;
  trackingApiKey?: string;
  deliverySlaDays: number;
  rtoCharges: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CourierFormData = Omit<Courier, "_id" | "createdAt" | "updatedAt">;

export const getCouriers = async (): Promise<ApiResponse<Courier[]>> => {
  const response = await api.get<ApiResponse<Courier[]>>("/admin/couriers");
  return response.data;
};

export const createCourier = async (
  data: Partial<CourierFormData>
): Promise<ApiResponse<Courier>> => {
  const response = await api.post<ApiResponse<Courier>>("/admin/couriers", data);
  return response.data;
};

export const updateCourier = async (
  id: string,
  data: Partial<CourierFormData>
): Promise<ApiResponse<Courier>> => {
  const response = await api.put<ApiResponse<Courier>>(`/admin/couriers/${id}`, data);
  return response.data;
};

export const deleteCourier = async (id: string): Promise<ApiResponse<void>> => {
  const response = await api.delete<ApiResponse<void>>(`/admin/couriers/${id}`);
  return response.data;
};
