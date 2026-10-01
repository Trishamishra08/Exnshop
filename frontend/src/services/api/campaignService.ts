import api from "./config";

export interface CampaignMetrics {
    orders: number;
    revenue: number;
    ctr: number;
    conversionRate: number;
    roas: number;
}

export interface Campaign {
    _id: string;
    seller: string | { sellerName: string; storeName: string };
    product: string | { _id: string; productName: string; mainImage?: string; price?: number };
    dailyBudget: number;
    totalBudget: number;
    startDate: string;
    endDate: string;
    status: "Draft" | "Active" | "Paused" | "Completed";
    spend: number;
    todaySpend: number;
    impressions: number;
    clicks: number;
    createdAt: string;
    metrics: CampaignMetrics;
}

interface ApiResponse<T> {
    success: boolean;
    message: string;
    data?: T;
}

export const createCampaign = async (data: {
    productId: string;
    dailyBudget: number;
    totalBudget: number;
    startDate: string;
    endDate: string;
}): Promise<ApiResponse<Campaign>> => {
    const response = await api.post<ApiResponse<Campaign>>("/campaigns", data);
    return response.data;
};

export const getMyCampaigns = async (): Promise<ApiResponse<Campaign[]>> => {
    const response = await api.get<ApiResponse<Campaign[]>>("/campaigns/my");
    return response.data;
};

export const updateCampaignStatus = async (
    id: string,
    status: "Active" | "Paused"
): Promise<ApiResponse<Campaign>> => {
    const response = await api.patch<ApiResponse<Campaign>>(`/campaigns/${id}/status`, { status });
    return response.data;
};

export const deleteCampaign = async (id: string): Promise<ApiResponse<void>> => {
    const response = await api.delete<ApiResponse<void>>(`/campaigns/${id}`);
    return response.data;
};
