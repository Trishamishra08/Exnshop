import api from "./config";

export interface Claim {
  _id: string;
  seller: string | { sellerName: string; storeName: string };
  order: string;
  orderNumber?: string;
  returnRequest?: string;
  reason: string;
  description?: string;
  photos: string[];
  claimAmount: number;
  approvedAmount?: number;
  status: "Raised" | "Under Review" | "Approved" | "Rejected";
  adminDecisionReason?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface RaiseClaimData {
  orderId: string;
  reason: string;
  description?: string;
  claimAmount: number;
  photos?: string[];
  returnRequestId?: string;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

export const raiseClaim = async (data: RaiseClaimData): Promise<ApiResponse<Claim>> => {
  const response = await api.post<ApiResponse<Claim>>("/claims", data);
  return response.data;
};

export const getMyClaims = async (status?: string): Promise<ApiResponse<Claim[]>> => {
  const response = await api.get<ApiResponse<Claim[]>>("/claims/my", {
    params: status ? { status } : undefined,
  });
  return response.data;
};
