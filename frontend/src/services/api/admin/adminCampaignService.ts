import api from "../config";
import { ApiResponse } from "./types";
import { Campaign } from "../campaignService";

export const getAllCampaignsAdmin = async (): Promise<ApiResponse<Campaign[]>> => {
    const response = await api.get<ApiResponse<Campaign[]>>("/admin/campaigns");
    return response.data;
};

export const forcePauseCampaign = async (id: string): Promise<ApiResponse<Campaign>> => {
    const response = await api.patch<ApiResponse<Campaign>>(`/admin/campaigns/${id}/pause`);
    return response.data;
};
