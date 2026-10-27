import api from './config';

/**
 * Get wallet balance (for sellers)
 */
export const getSellerWalletBalance = async () => {
    try {
        const response = await api.get('/seller/wallet-new/balance');
        return response.data;
    } catch (error: any) {
        console.error('Error getting wallet balance:', error);
        throw error;
    }
};

/**
 * Get wallet transactions (for sellers)
 */
export const getSellerWalletTransactions = async (page: number = 1, limit: number = 20) => {
    try {
        const response = await api.get('/seller/wallet-new/transactions', {
            params: { page, limit },
        });
        return response.data;
    } catch (error: any) {
        console.error('Error getting wallet transactions:', error);
        throw error;
    }
};

/**
 * Request withdrawal (for sellers)
 */
export const requestSellerWithdrawal = async (amount: number, paymentMethod: 'Bank Transfer' | 'UPI') => {
    try {
        const response = await api.post('/seller/wallet-new/withdraw', {
            amount,
            paymentMethod,
        });
        return response.data;
    } catch (error: any) {
        console.error('Error requesting withdrawal:', error);
        throw error;
    }
};

/**
 * Get withdrawal requests (for sellers)
 */
export const getSellerWithdrawals = async (status?: string) => {
    try {
        const response = await api.get('/seller/wallet-new/withdrawals', {
            params: status ? { status } : {},
        });
        return response.data;
    } catch (error: any) {
        console.error('Error getting withdrawals:', error);
        throw error;
    }
};

/**
 * Get commission earnings (for sellers)
 */
export const getSellerCommissions = async () => {
    try {
        const response = await api.get('/seller/wallet-new/commissions');
        return response.data;
    } catch (error: any) {
        console.error('Error getting commissions:', error);
        throw error;
    }
};

export type SettlementStatus = 'Pending' | 'Processing' | 'Settled' | 'Paid' | 'Cancelled';

export interface SettlementRow {
    settlementId: string;
    orderId: string;
    orderNumber: string;
    date: string;
    grossAmount: number;
    deductions: number;
    commissionAmount: number;
    shippingCharge: number;
    netAmount: number;
    status: SettlementStatus;
    expectedSettlementDate: string | null;
    paymentDate: string | null;
    bankReference: string | null;
}

export interface PaymentSummary {
    totalSales: number;
    deliveredSales: number;
    pendingSettlement: number;
    settledToWallet: number;
    paidToBank: number;
    refunds: number;
    platformDeductions: number;
    returnShippingCharges: number;
}

export const getSettlementReport = async (params: {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
}): Promise<{
    success: boolean;
    data: {
        summary: PaymentSummary;
        rows: SettlementRow[];
        pagination: { page: number; limit: number; total: number; pages: number };
    };
}> => {
    const response = await api.get('/seller/wallet-new/settlement-report', { params });
    return response.data;
};
