import api from './config';

export interface DashboardStats {
    totalUser: number;
    totalCategory: number;
    sellingCategories?: number;
    totalSubcategory: number;
    totalProduct: number;
    totalOrders: number;
    completedOrders: number;
    pendingOrders: number;
    processingOrders: number;
    shippedOrders: number;
    cancelledOrders: number;
    returnOrders: number;
    soldOutProducts: number;
    lowStockProducts: number;
    // Revenue
    totalSales: number;
    todaySales: number;
    weekSales: number;
    monthSales: number;
    // Settlement / Wallet
    pendingSettlement: number;
    totalSettlementPaid: number;
    availableBalance: number;
    onHoldBalance: number;
    nextSettlementDate: string | null;
    advertisementSpend: number;
    // Charts
    yearlyOrderData: { date: string; value: number }[];
    dailyOrderData: { date: string; value: number }[];
    yearlySalesData: { date: string; value: number }[];
    dailySalesData: { date: string; value: number }[];
}

export interface NewOrder {
    id: string;
    orderDate: string;
    status: string;
    amount: number;
    items?: any[];
}

export interface DashboardResponse {
    success: boolean;
    message: string;
    data: {
        stats: DashboardStats;
        newOrders: NewOrder[];
    };
}

/**
 * Get seller's dashboard statistics
 */
export const getSellerDashboardStats = async (): Promise<DashboardResponse> => {
    const response = await api.get<DashboardResponse>('/seller/dashboard/stats');
    return response.data;
};
