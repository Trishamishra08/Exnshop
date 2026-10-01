import api from "../config";
import { ApiResponse } from "./types";
import { Claim } from "../claimService";

export const getAllClaims = async (status?: string): Promise<ApiResponse<Claim[]>> => {
  const response = await api.get<ApiResponse<Claim[]>>("/admin/claims", {
    params: status ? { status } : undefined,
  });
  return response.data;
};

export const decideClaim = async (
  id: string,
  status: "Approved" | "Rejected" | "Under Review",
  approvedAmount?: number,
  adminDecisionReason?: string
): Promise<ApiResponse<Claim>> => {
  const response = await api.patch<ApiResponse<Claim>>(`/admin/claims/${id}/decide`, {
    status,
    approvedAmount,
    adminDecisionReason,
  });
  return response.data;
};
