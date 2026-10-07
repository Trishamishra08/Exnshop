import { Router } from 'express';
import { authenticate, requireUserType } from '../middleware/auth';
import { Request, Response } from 'express';
import { createRazorpayOrder, capturePayment, capturePaymentForOrders, handleWebhook } from '../services/paymentService';
import { createCashfreeOrder, captureCashfreeOrderForOrders, handleCashfreeWebhook } from '../services/cashfreeService';
import Order from '../models/Order';
import Customer from '../models/Customer';

const router = Router();

/**
 * Create Razorpay order for payment. Accepts either a single `orderId` (an
 * ordinary checkout) or `orderIds` (a mixed Quick + E-commerce checkout,
 * where one Razorpay charge covers both linked orders).
 */
router.post('/create-order', authenticate, requireUserType('Customer'), async (req: Request, res: Response) => {
    try {
        const orderIds: string[] = Array.isArray(req.body.orderIds)
            ? req.body.orderIds
            : req.body.orderId
                ? [req.body.orderId]
                : [];

        if (orderIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required',
            });
        }

        const orders = await Order.find({ _id: { $in: orderIds } });
        if (orders.length !== orderIds.length) {
            return res.status(404).json({
                success: false,
                message: 'Order not found',
            });
        }

        // Verify every order belongs to this customer
        if (orders.some((o) => o.customer.toString() !== req.user!.userId)) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access to order',
            });
        }

        const combinedAmount = orders.reduce((sum, o) => sum + (o.total || 0), 0);
        const result = await createRazorpayOrder(orderIds, combinedAmount);

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error creating Razorpay order:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to create payment order',
        });
    }
});

/**
 * Verify payment after Razorpay checkout. Accepts either a single `orderId`
 * or `orderIds` (mixed checkout — one payment applied to both linked orders).
 */
router.post('/verify', authenticate, requireUserType('Customer'), async (req: Request, res: Response) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
        const orderIds: string[] = Array.isArray(req.body.orderIds)
            ? req.body.orderIds
            : req.body.orderId
                ? [req.body.orderId]
                : [];

        if (orderIds.length === 0 || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({
                success: false,
                message: 'Missing required payment verification parameters',
            });
        }

        const orders = await Order.find({ _id: { $in: orderIds } });
        if (orders.length !== orderIds.length) {
            return res.status(404).json({
                success: false,
                message: 'Order not found',
            });
        }

        // Verify every order belongs to this customer
        if (orders.some((o) => o.customer.toString() !== req.user!.userId)) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access to order',
            });
        }

        const io = req.app.get('io');
        const result = await capturePaymentForOrders(
            orderIds,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            io
        );

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error verifying payment:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to verify payment',
        });
    }
});

/**
 * Razorpay webhook endpoint
 */
router.post('/webhook', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-razorpay-signature'] as string;

        if (!signature) {
            return res.status(400).json({
                success: false,
                message: 'Missing webhook signature',
            });
        }

        const io = req.app.get('io');
        const result = await handleWebhook(req.body, signature, io);

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error handling webhook:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to handle webhook',
        });
    }
});

/**
 * Create Cashfree order for payment. Accepts either a single `orderId` or
 * `orderIds` (mixed Quick + E-commerce checkout) — same contract as the
 * Razorpay create-order route above.
 */
router.post('/cashfree/create-order', authenticate, requireUserType('Customer'), async (req: Request, res: Response) => {
    try {
        const orderIds: string[] = Array.isArray(req.body.orderIds)
            ? req.body.orderIds
            : req.body.orderId
                ? [req.body.orderId]
                : [];

        if (orderIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required',
            });
        }

        const orders = await Order.find({ _id: { $in: orderIds } });
        if (orders.length !== orderIds.length) {
            return res.status(404).json({
                success: false,
                message: 'Order not found',
            });
        }

        if (orders.some((o) => o.customer.toString() !== req.user!.userId)) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access to order',
            });
        }

        const customer = await Customer.findById(req.user!.userId);
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }

        const combinedAmount = orders.reduce((sum, o) => sum + (o.total || 0), 0);
        const result = await createCashfreeOrder(orderIds, combinedAmount, {
            customerId: customer._id.toString(),
            customerPhone: customer.phone,
            customerEmail: customer.email,
            customerName: customer.name,
        });

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error creating Cashfree order:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to create payment order',
        });
    }
});

/**
 * Verify payment after Cashfree checkout closes. Accepts either a single
 * `orderId` or `orderIds` plus the `cfOrderId` returned by create-order.
 */
router.post('/cashfree/verify', authenticate, requireUserType('Customer'), async (req: Request, res: Response) => {
    try {
        const { cfOrderId } = req.body;
        const orderIds: string[] = Array.isArray(req.body.orderIds)
            ? req.body.orderIds
            : req.body.orderId
                ? [req.body.orderId]
                : [];

        if (orderIds.length === 0 || !cfOrderId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required payment verification parameters',
            });
        }

        const orders = await Order.find({ _id: { $in: orderIds } });
        if (orders.length !== orderIds.length) {
            return res.status(404).json({
                success: false,
                message: 'Order not found',
            });
        }

        if (orders.some((o) => o.customer.toString() !== req.user!.userId)) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized access to order',
            });
        }

        const io = req.app.get('io');
        const result = await captureCashfreeOrderForOrders(orderIds, cfOrderId, io);

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error verifying Cashfree payment:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to verify payment',
        });
    }
});

/**
 * Cashfree webhook endpoint. Signature covers the EXACT raw bytes Cashfree
 * sent, so this reads req.rawBody (captured globally in server.ts) rather
 * than re-serializing the parsed req.body.
 */
router.post('/cashfree/webhook', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-webhook-signature'] as string;
        const timestamp = req.headers['x-webhook-timestamp'] as string;
        const rawBody = (req as any).rawBody?.toString() || JSON.stringify(req.body);

        if (!signature || !timestamp) {
            return res.status(400).json({
                success: false,
                message: 'Missing webhook signature',
            });
        }

        const io = req.app.get('io');
        const result = await handleCashfreeWebhook(rawBody, signature, timestamp, io);

        if (!result.success) {
            return res.status(400).json(result);
        }

        return res.status(200).json(result);
    } catch (error: any) {
        console.error('Error handling Cashfree webhook:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to handle webhook',
        });
    }
});

export default router;
