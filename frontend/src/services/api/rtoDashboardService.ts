import api from "./config";

interface ApiResponse<T> {
    success: boolean;
    message?: string;
    data: T;
}

export interface RtoDashboardData {
    returnRate: { thisMonth: number; lastMonth: number };
    rtoRate: { thisMonth: number; lastMonth: number };
    deliveredCount: { thisMonth: number; lastMonth: number };
    returnCount: { thisMonth: number; lastMonth: number };
    rtoCount: { thisMonth: number; lastMonth: number };
    avgReverseShippingCost: { thisMonth: number; lastMonth: number };
    productPerformance: Array<{
        productId: string;
        productName: string;
        rtoCountThisMonth: number;
        rtoCountLastMonth: number;
        trendPercent: number;
    }>;
}

export interface RtoPromoBanner {
    _id: string;
    heading: string;
    bodyText?: string;
    ctaText?: string;
    ctaLink?: string;
    image?: string;
    isActive: boolean;
}

export const getRtoDashboard = async (): Promise<ApiResponse<RtoDashboardData>> => {
    const response = await api.get<ApiResponse<RtoDashboardData>>("/seller/rto/dashboard");
    return response.data;
};

export const getActiveRtoPromoBanners = async (): Promise<ApiResponse<RtoPromoBanner[]>> => {
    const response = await api.get<ApiResponse<RtoPromoBanner[]>>("/seller/rto/promo-banners");
    return response.data;
};
