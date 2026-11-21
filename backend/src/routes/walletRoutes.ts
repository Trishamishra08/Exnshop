import { Router } from 'express';
import * as walletController from '../modules/seller/controllers/walletController';
import { createWalletTopup, verifyWalletTopup } from '../modules/seller/controllers/sellerWalletTopupController';
import { authenticate, requireUserType, requireApprovedUser } from '../middleware/auth';

const router = Router();

// All wallet routes require seller authentication and operational approval
router.use(authenticate);
router.use(requireUserType('Seller'));
router.use(requireApprovedUser);

router.get('/stats', walletController.getWalletStats);
router.get('/transactions', walletController.getTransactions);
router.get('/withdrawals', walletController.getWithdrawalRequests);
router.post('/withdrawals', walletController.createWithdrawalRequest);
router.get('/earnings', walletController.getOrderEarnings);

// Add money to the wallet (Razorpay) - needed by sellers who deliver orders themselves
router.post('/topup/create', createWalletTopup);
router.post('/topup/verify', verifyWalletTopup);

export default router;
