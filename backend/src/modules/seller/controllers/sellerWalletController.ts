import { Request, Response } from 'express';
import {
    getWalletBalance,
    getWalletTransactions,
    createWithdrawalRequest,
    getWithdrawalRequests,
} from '../../../services/walletManagementService';
import { getCommissionSummary } from '../../../services/commissionService';

/**
 * Get seller wallet balance
 */
export const getBalance = async (req: Request, res: Response) => {
    try {
        const sellerId = (req as any).user!.userId;
        
        // Auto-release expired escrows
        const { releaseExpiredEscrow } = await import('../../../services/commissionService');
        await releaseExpiredEscrow();

        const Seller = (await import('../../../models/Seller')).default;
        const seller = await Seller.findById(sellerId).select('balance onHoldBalance');

        return res.status(200).json({
            success: true,
            data: {
                balance: seller?.balance || 0,
                onHoldBalance: seller?.onHoldBalance || 0,
            },
        });
    } catch (error: any) {
        console.error('Error getting wallet balance:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to get wallet balance',
        });
    }
};

/**
 * Get seller wallet transactions
 */
export const getTransactions = async (req: Request, res: Response) => {
    try {
        const sellerId = (req as any).user!.userId;
        const { page = 1, limit = 20 } = req.query;

        const result = await getWalletTransactions(
            sellerId,
            'SELLER',
            Number(page),
            Number(limit)
        );

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error getting wallet transactions:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to get wallet transactions',
        });
    }
};

/**
 * Request withdrawal
 */
export const requestWithdrawal = async (req: Request, res: Response) => {
    try {
        const sellerId = (req as any).user!.userId;
        const { amount, paymentMethod } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid withdrawal amount',
            });
        }

        if (!paymentMethod || !['Bank Transfer', 'UPI'].includes(paymentMethod)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment method',
            });
        }

        const result = await createWithdrawalRequest(
            sellerId,
            'SELLER',
            amount,
            paymentMethod
        );

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(201).json(result);
    } catch (error: any) {
        console.error('Error requesting withdrawal:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to request withdrawal',
        });
    }
};

/**
 * Get seller withdrawal requests
 */
export const getWithdrawals = async (req: Request, res: Response) => {
    try {
        const sellerId = (req as any).user!.userId;
        const { status } = req.query;

        const result = await getWithdrawalRequests(
            sellerId,
            'SELLER',
            status as string
        );

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error getting withdrawal requests:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to get withdrawal requests',
        });
    }
};

/**
 * Settlement report: payment summary + one settlement row per order.
 * Query: status (Pending|Processing|Settled|Paid|Cancelled), from, to (ISO dates), page, limit
 */
export const getSettlementReport = async (req: Request, res: Response) => {
    try {
        const sellerId = (req as any).user!.userId;
        const { status, from, to } = req.query as Record<string, string | undefined>;
        const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
        const limit = Math.min(500, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));

        const { buildSellerSettlementReport } = await import('../../../services/sellerSettlementReportService');
        const { summary, rows } = await buildSellerSettlementReport(sellerId);

        const fromTime = from ? new Date(from).getTime() : null;
        const toTime = to ? new Date(to).setHours(23, 59, 59, 999) : null;
        const filtered = rows.filter((r) => {
            if (status && status !== 'All' && r.status !== status) return false;
            const t = new Date(r.date).getTime();
            if (fromTime && t < fromTime) return false;
            if (toTime && t > toTime) return false;
            return true;
        });

        return res.status(200).json({
            success: true,
            data: {
                summary,
                rows: filtered.slice((page - 1) * limit, page * limit),
                pagination: { page, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) },
            },
        });
    } catch (error: any) {
        console.error('Error building settlement report:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to build settlement report',
        });
    }
};

/**
 * Get seller commission earnings
 */
export const getCommissions = async (req: Request, res: Response) => {
    try {
        const sellerId = (req as any).user!.userId;

        const result = await getCommissionSummary(sellerId, 'SELLER');

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error getting commission earnings:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to get commission earnings',
        });
    }
};
