import api from "./config";

export interface CampaignMetrics {
    orders: number;
    revenue: number;
    ctr: number;
    conversionRate: number;
    roas: number;
}

export interface CampaignProductMetrics extends CampaignMetrics {
    product: string;
    cpcBid: number;
}

export interface CampaignMetricsResult {
    overall: CampaignMetrics;
    byProduct: CampaignProductMetrics[];
}

export interface CampaignProduct {
    product: string | { _id: string; productName: string; mainImage?: string; price?: number };
    cpcBid: number;
    spend: number;
    todaySpend: number;
    impressions: number;
    clicks: number;
}

export interface CampaignHistoryEntry {
    at: string;
    action: string;
    detail?: string;
}

export interface Campaign {
    _id: string;
    name?: string;
    noEndDate?: boolean;
    archived?: boolean;
    history?: CampaignHistoryEntry[];
    seller: string | { sellerName: string; storeName: string };
    products: CampaignProduct[];
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
    metrics: CampaignMetricsResult;
    servingState?: ServingState;
}

export type ServingState =
    | "Running"
    | "Scheduled"
    | "DailyBudgetReached"
    | "TotalBudgetReached"
    | "LowPayoutBalance"
    | "NotRunning";

export interface ProductBidInput {
    productId: string;
    cpcBid: number;
}

interface ApiResponse<T> {
    success: boolean;
    message: string;
    data?: T;
}

export const createCampaign = async (data: {
    name?: string;
    noEndDate?: boolean;
    products: ProductBidInput[];
    dailyBudget: number;
    totalBudget: number;
    startDate: string;
    endDate?: string;
}): Promise<ApiResponse<Campaign>> => {
    const response = await api.post<ApiResponse<Campaign>>("/campaigns", data);
    return response.data;
};

export const getMyCampaigns = async (archived?: "only" | "all"): Promise<ApiResponse<Campaign[]> & { adFunds?: number }> => {
    const response = await api.get<ApiResponse<Campaign[]> & { adFunds?: number }>("/campaigns/my", { params: archived ? { archived } : undefined });
    return response.data;
};

export const updateCampaign = async (
    id: string,
    data: Partial<{
        products: ProductBidInput[];
        dailyBudget: number;
        totalBudget: number;
        startDate: string;
        endDate: string;
    }>
): Promise<ApiResponse<Campaign>> => {
    const response = await api.put<ApiResponse<Campaign>>(`/campaigns/${id}`, data);
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

export interface BidFeedback {
    percentile: number;
    label: "Low" | "Fair" | "Good" | "Great";
    suggestedMinimum: number;
}

export const getBidFeedback = async (categoryId: string, cpcBid: number): Promise<ApiResponse<BidFeedback>> => {
    const response = await api.get<ApiResponse<BidFeedback>>("/campaigns/bid-feedback", {
        params: { categoryId, cpcBid },
    });
    return response.data;
};

export const archiveCampaign = async (id: string, archived: boolean): Promise<ApiResponse<Campaign>> => {
    const response = await api.patch<ApiResponse<Campaign>>(`/campaigns/${id}/archive`, { archived });
    return response.data;
};

export interface AnalyticsRow {
    day: string;
    impressions: number;
    clicks: number;
    spend: number;
    orders: number;
    revenue: number;
}

export interface CampaignAnalytics {
    days: number;
    series: AnalyticsRow[];
    totals: {
        impressions: number;
        clicks: number;
        spend: number;
        orders: number;
        revenue: number;
        ctr: number;
        conversionRate: number;
        roas: number;
    };
}

export const getCampaignAnalytics = async (days: number, campaignId?: string): Promise<CampaignAnalytics> => {
    const response = await api.get<{ success: boolean; data: CampaignAnalytics }>("/campaigns/analytics", { params: { days, campaignId } });
    return response.data.data;
};
