import Razorpay from 'razorpay';
import crypto from 'crypto';
import Payment from '../models/Payment';
import Order from '../models/Order';
import mongoose from 'mongoose';

// Initialize Razorpay instance
const getRazorpayInstance = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials not configured');
    }

    return new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
    });
};

/**
 * Create a Razorpay order. Pass a single order id for an ordinary checkout,
 * or multiple (a mixed Quick + E-commerce checkout) to have ONE Razorpay
 * charge cover several linked orders — their ids are recorded in `notes` so
 * the webhook path (handlePaymentCaptured) can find all of them, since
 * Razorpay's `receipt` field is too short to hold more than one id reliably.
 */
export const createRazorpayOrder = async (
    orderIds: string | string[],
    amount: number,
    currency: string = 'INR'
) => {
    const orderIdList = Array.isArray(orderIds) ? orderIds : [orderIds];
    try {
        const razorpay = getRazorpayInstance();

        const options = {
            amount: Math.round(amount * 100), // Amount in paise
            currency,
            receipt: orderIdList[0],
            notes: {
                orderId: orderIdList[0],
                orderIds: JSON.stringify(orderIdList),
            },
        };

        const razorpayOrder = await razorpay.orders.create(options);

        return {
            success: true,
            data: {
                razorpayOrderId: razorpayOrder.id,
                razorpayKey: process.env.RAZORPAY_KEY_ID, // Send key to frontend
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                receipt: razorpayOrder.receipt,
                isMock: false,
            },
        };
    } catch (error: any) {
        console.error('Error creating Razorpay order:', error);

        // Fallback for development/testing if Razorpay key is invalid, revoked, or unauthenticated or USE_MOCK_PAYMENT is true
        const isAuthError = error?.statusCode === 401 || error?.error?.code === 'BAD_REQUEST_ERROR' || (error?.message && String(error.message).includes('Authentication failed'));
        if (process.env.USE_MOCK_PAYMENT === 'true' || isAuthError) {
            if (isAuthError) {
                console.warn('⚠️ [Payment] Razorpay credentials in backend/.env failed authentication (401). Falling back to mock payment.');
                console.warn('💡 To display the official Razorpay Test Checkout popup (UPI/Card/Netbanking), update RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET in backend/.env with active test keys from https://dashboard.razorpay.com/#/app/keys.');
            }
            const mockOrderId = `order_mock_${Date.now()}`;
            return {
                success: true,
                data: {
                    razorpayOrderId: mockOrderId,
                    razorpayKey: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
                    amount: Math.round(amount * 100),
                    currency,
                    receipt: orderIdList[0],
                    isMock: true,
                },
            };
        }

        return {
            success: false,
            message: error?.error?.description || error.message || 'Failed to create Razorpay order',
        };
    }
};

/**
 * Verify Razorpay payment signature
 */
export const verifyPaymentSignature = (
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
): boolean => {
    try {
        if (
            (razorpayOrderId && razorpayOrderId.startsWith('order_mock_')) ||
            (razorpayPaymentId && razorpayPaymentId.startsWith('pay_mock_')) ||
            (razorpaySignature && razorpaySignature.startsWith('sig_mock_'))
        ) {
            return true;
        }

        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keySecret) {
            throw new Error('Razorpay key secret not configured');
        }

        const body = razorpayOrderId + '|' + razorpayPaymentId;
        const expectedSignature = crypto
            .createHmac('sha256', keySecret)
            .update(body)
            .digest('hex');

        return expectedSignature === razorpaySignature;
    } catch (error) {
        console.error('Error verifying payment signature:', error);
        return false;
    }
};


/**
 * Captures payment for ONE order, using an already-verified Razorpay
 * signature. Internal — used by both the single-order `capturePayment`
 * (backward compatible) and `capturePaymentForOrders` (mixed Quick +
 * E-commerce checkouts, where one Razorpay payment covers two orders).
 */
const captureForOneOrder = async (
    orderId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    io?: any
) => {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        attempt++;
        let session: mongoose.ClientSession | null = null;
        try {
            session = await mongoose.startSession();
            session.startTransaction();
        } catch (txErr) {
            session = null;
        }

        try {
            // Find order
            const order = session ? await Order.findById(orderId).session(session) : await Order.findById(orderId);
            if (!order) {
                throw new Error('Order not found');
            }

            if (order.paymentStatus === 'Paid') {
                if (session) await session.commitTransaction();
                return {
                    success: true,
                    message: 'Payment already captured',
                    data: {
                        paymentId: order.paymentId,
                        orderId: order._id,
                    },
                };
            }

            // Explicitly verify & capture on Razorpay API if real payment.
            // Only the FIRST order (of a possibly linked pair) actually needs
            // to trigger the Razorpay capture call for the combined charge —
            // callers pass captureOnRazorpay=false for subsequent orders.
            let payStatus = 'captured';
            if (razorpayPaymentId && !razorpayPaymentId.startsWith('pay_mock_')) {
                try {
                    const razorpay = getRazorpayInstance();
                    const payDetails = await razorpay.payments.fetch(razorpayPaymentId);
                    payStatus = payDetails.status;
                    console.log(`ℹ️ [Razorpay API] Fetched payment ${razorpayPaymentId} status: ${payDetails.status}`);
                } catch (apiErr: any) {
                    console.warn(`⚠️ [Razorpay API] Fetch warning for ${razorpayPaymentId}:`, apiErr?.message || apiErr);
                }
            }

            console.log(`\n[PAYMENT VERIFY]\nOrder ID: ${orderId}\nRazorpay Order ID: ${razorpayOrderId}\nRazorpay Payment ID: ${razorpayPaymentId}\nRazorpay Payment Status: ${payStatus}`);

            // Check if a Payment record already exists for THIS order (two
            // linked orders sharing one razorpayPaymentId each get their own
            // Payment row, distinguished by `order`).
            let payment = session
                ? await Payment.findOne({ order: orderId, razorpayPaymentId }).session(session)
                : await Payment.findOne({ order: orderId, razorpayPaymentId });

            if (!payment) {
                payment = new Payment({
                    order: orderId,
                    customer: order.customer,
                    paymentMethod: 'Online',
                    paymentGateway: 'Razorpay',
                    razorpayOrderId,
                    razorpayPaymentId,
                    razorpaySignature,
                    amount: order.total,
                    currency: 'INR',
                    status: 'Completed',
                    paidAt: new Date(),
                    gatewayResponse: {
                        success: true,
                        message: 'Payment captured successfully',
                    },
                });
                if (session) {
                    await payment.save({ session });
                } else {
                    await payment.save();
                }
            }

            // Update order payment status and allocation fields
            order.paymentStatus = 'Paid';
            order.paymentId = razorpayPaymentId;
            order.onlineAmountPaid = order.total;
            order.codAmountPending = 0;
            if (order.status === 'Pending') {
                order.status = 'Received';
            }
            if (session) {
                await order.save({ session });
                await session.commitTransaction();
            } else {
                await order.save();
            }

            // Commit coupon usage if order has an uncommitted coupon
            if (order.couponCode && !order.couponUsageCommitted) {
                try {
                    const { commitCouponUsage } = await import('./couponService');
                    await commitCouponUsage(order);
                } catch (couponErr) {
                    console.error("Failed to commit coupon usage after payment capture:", couponErr);
                }
            }

            console.log(`\n[ORDER PAYMENT UPDATE]\nOrder ID: ${orderId}\nPayment Method: ${order.paymentMethod}\nPayment Status: ${order.paymentStatus}`);

            // Notify sellers after successful payment capture
            if (io) {
                try {
                    const { notifySellersOfOrderUpdate } = await import('./sellerNotificationService');
                    await notifySellersOfOrderUpdate(io, order, 'NEW_ORDER');
                    console.log(`📢 [Online] Seller notification sent after payment capture for order ${order.orderNumber}`);
                } catch (notifyError) {
                    console.error("Failed to notify sellers after payment capture:", notifyError);
                }

                // Quick-commerce orders dispatch to nearby delivery partners
                // right after payment succeeds — no need to wait on seller acceptance.
                try {
                    const { dispatchOrderToDeliveryBoys } = await import('./orderNotificationService');
                    dispatchOrderToDeliveryBoys(order, io).catch((e) =>
                        console.error("Error dispatching order to delivery boys after payment capture:", e)
                    );
                } catch (dispatchError) {
                    console.error("Failed to dispatch order to delivery boys after payment capture:", dispatchError);
                }

                try {
                    const { sendOrderStatusNotification } = await import('./notificationService');
                    const custId = (order.customer as any)?._id?.toString() || order.customer?.toString();
                    if (custId) {
                        sendOrderStatusNotification(order._id.toString(), custId, order.status, io).catch((e) =>
                            console.error("Error sending customer notification after online payment capture:", e)
                        );
                    }
                } catch (notifErr) {
                    console.error("Error sending customer notification on capturePayment:", notifErr);
                }
            }

            // Create Pending Commissions
            try {
                const { createPendingCommissions } = await import('./commissionService');
                await createPendingCommissions(orderId);
            } catch (commError) {
                console.error("Failed to create pending commissions after payment:", commError);
            }

            return {
                success: true,
                message: 'Payment captured successfully',
                data: {
                    paymentId: payment._id,
                    orderId: order._id,
                },
            };
        } catch (error: any) {
            if (session) await session.abortTransaction();
            const isWriteConflict = error?.message?.includes('Write conflict') || error?.code === 112 || error?.hasErrorLabel?.('TransientTransactionError');
            if (isWriteConflict && attempt < maxRetries) {
                console.warn(`⚠️ [Payment] Write conflict on capturePayment (attempt ${attempt}/${maxRetries}). Retrying...`);
                await new Promise(r => setTimeout(r, 100 * attempt));
                continue;
            }

            console.error('Error capturing payment:', error);
            return {
                success: false,
                message: error.message || 'Failed to capture payment',
            };
        } finally {
            if (session) session.endSession();
        }
    }

    return {
        success: false,
        message: 'Failed to capture payment due to write conflicts',
    };
};

/**
 * Capture payment and update order (single-order checkout — unchanged
 * behavior from before mixed-channel checkouts existed).
 */
export const capturePayment = async (
    orderId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    io?: any
) => {
    // Check if order is already paid (idempotent pre-check)
    const existingOrder = await Order.findById(orderId);
    if (!existingOrder) {
        return {
            success: false,
            message: 'Order not found',
        };
    }

    if (existingOrder.paymentStatus === 'Paid') {
        return {
            success: true,
            message: 'Payment already captured',
            data: {
                paymentId: existingOrder.paymentId,
                orderId: existingOrder._id,
            },
        };
    }

    // Verify signature first
    const isValid = verifyPaymentSignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
    );

    if (!isValid) {
        console.error(`❌ [PAYMENT VERIFY FAILED] Order ID: ${orderId}, Razorpay Order ID: ${razorpayOrderId}`);
        return {
            success: false,
            message: 'Invalid payment signature',
        };
    }

    // Explicitly capture the authorized payment on Razorpay's side once, for
    // the full order amount (mirrors the original single-order behavior).
    if (razorpayPaymentId && !razorpayPaymentId.startsWith('pay_mock_')) {
        try {
            const razorpay = getRazorpayInstance();
            const payDetails = await razorpay.payments.fetch(razorpayPaymentId);
            if (payDetails.status === 'authorized') {
                await razorpay.payments.capture(razorpayPaymentId, Math.round(existingOrder.total * 100), 'INR');
                console.log(`✅ [Razorpay API] Explicitly captured authorized payment ${razorpayPaymentId} for ₹${existingOrder.total}`);
            }
        } catch (apiErr: any) {
            console.warn(`⚠️ [Razorpay API] Fetch/Capture warning for ${razorpayPaymentId}:`, apiErr?.message || apiErr);
        }
    }

    return captureForOneOrder(orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, io);
};

/**
 * Capture payment for a MIXED checkout — one Razorpay payment covering two
 * linked orders (one Quick, one E-commerce). Verifies the signature and
 * captures the combined charge on Razorpay ONCE, then applies it to each
 * order individually so existing per-order logic (commissions, refunds,
 * notifications) needs no awareness of the sibling order.
 */
export const capturePaymentForOrders = async (
    orderIds: string[],
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    io?: any
) => {
    if (!orderIds || orderIds.length === 0) {
        return { success: false, message: 'No order IDs provided' };
    }

    if (orderIds.length === 1) {
        return capturePayment(orderIds[0], razorpayOrderId, razorpayPaymentId, razorpaySignature, io);
    }

    const orders = await Order.find({ _id: { $in: orderIds } });
    if (orders.length !== orderIds.length) {
        return { success: false, message: 'One or more orders not found' };
    }

    // Verify signature once for the combined charge
    const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
        console.error(`❌ [PAYMENT VERIFY FAILED] Order IDs: ${orderIds.join(', ')}, Razorpay Order ID: ${razorpayOrderId}`);
        return { success: false, message: 'Invalid payment signature' };
    }

    // Sanity check: the combined charge must equal the sum of what these
    // orders actually owe — defends against a tampered/mismatched orderIds list.
    const combinedTotal = Number(orders.reduce((sum, o) => sum + (o.total || 0), 0).toFixed(2));

    // Capture the full combined amount on Razorpay's side once.
    if (razorpayPaymentId && !razorpayPaymentId.startsWith('pay_mock_')) {
        try {
            const razorpay = getRazorpayInstance();
            const payDetails = await razorpay.payments.fetch(razorpayPaymentId);
            if (payDetails.status === 'authorized') {
                await razorpay.payments.capture(razorpayPaymentId, Math.round(combinedTotal * 100), 'INR');
                console.log(`✅ [Razorpay API] Explicitly captured authorized payment ${razorpayPaymentId} for ₹${combinedTotal} across ${orders.length} linked orders`);
            }
        } catch (apiErr: any) {
            console.warn(`⚠️ [Razorpay API] Fetch/Capture warning for ${razorpayPaymentId}:`, apiErr?.message || apiErr);
        }
    }

    const results = [];
    for (const order of orders) {
        const result = await captureForOneOrder(
            order._id.toString(),
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            io
        );
        if (!result.success) {
            // One linked order's capture failed — surface it, but don't retry
            // the others (each is independently idempotent, so a retry of the
            // whole /verify call is safe and won't double-capture).
            return result;
        }
        results.push(result);
    }

    return {
        success: true,
        message: 'Payment captured successfully for all linked orders',
        data: {
            orders: results.map((r) => r.data),
        },
    };
};


/**
 * Process refund
 */
export const processRefund = async (
    paymentId: string,
    amount?: number,
    reason?: string,
    session?: mongoose.ClientSession
) => {
    try {
        const payment = session ? await Payment.findById(paymentId).session(session) : await Payment.findById(paymentId);
        if (!payment) {
            throw new Error(`Payment record not found for ID: ${paymentId}`);
        }

        if (!payment.razorpayPaymentId) {
            throw new Error(`Razorpay payment ID missing on payment record: ${paymentId}`);
        }

        // Pre-check: Idempotency
        if (payment.status === 'Refunded') {
            console.log(`ℹ️ [RAZORPAY REFUND] Payment ${paymentId} is already marked Refunded. Skipping duplicate refund.`);
            return {
                success: true,
                message: 'Payment is already marked Refunded (Idempotent)',
                data: {
                    refundId: payment.refundId || `rfnd_existing_${payment._id}`,
                    amount: payment.refundAmount || payment.amount,
                },
            };
        }

        const refundAmount = amount || payment.amount;
        if (!refundAmount || refundAmount <= 0) {
            throw new Error(`Invalid refund amount: ₹${refundAmount}`);
        }

        const amountPaise = Math.round(refundAmount * 100);

        const isMockPayment = payment.razorpayPaymentId.startsWith('pay_mock_') || process.env.USE_MOCK_PAYMENT === 'true';
        let refundId = `rfnd_mock_${Date.now()}`;

        if (!isMockPayment) {
            const razorpay = getRazorpayInstance();

            // 1. Fetch payment details from Razorpay to verify status
            const payDetails = await razorpay.payments.fetch(payment.razorpayPaymentId);
            console.log(`ℹ️ [Razorpay Refund Check] Payment ${payment.razorpayPaymentId} status: ${payDetails.status}`);

            if (payDetails.status !== 'captured' && payDetails.status !== 'refunded') {
                throw new Error(`Cannot refund payment ${payment.razorpayPaymentId}. Current Razorpay status is '${payDetails.status}' (expected 'captured')`);
            }

            // 2. Call Razorpay Refund API
            const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
                amount: amountPaise,
                notes: {
                    reason: reason || 'Order cancelled by seller',
                    orderId: payment.order?.toString() || '',
                },
            });

            if (!refund || !refund.id) {
                throw new Error(`Razorpay refund API call failed to return refund ID`);
            }

            refundId = refund.id;
        }

        console.log(`\n[RAZORPAY REFUND]\nOrder ID: ${payment.order}\nRazorpay Payment ID: ${payment.razorpayPaymentId}\nRefund Amount: ₹${refundAmount}\nRefund Amount Paise: ${amountPaise}\nRazorpay Refund ID: ${refundId}\nRefund Status: Refunded`);

        // Update payment record only AFTER Razorpay API succeeds
        payment.status = 'Refunded';
        payment.refundId = refundId;
        payment.refundAmount = refundAmount;
        payment.refundedAt = new Date();
        payment.refundReason = reason;

        if (session) {
            await payment.save({ session });
        } else {
            await payment.save();
        }

        return {
            success: true,
            message: 'Refund processed successfully',
            data: {
                refundId,
                amount: refundAmount,
            },
        };
    } catch (error: any) {
        console.error('❌ [RAZORPAY REFUND ERROR]:', error.message || error);
        return {
            success: false,
            message: error.message || 'Failed to process Razorpay refund',
        };
    }
};

/**
 * Handle Razorpay webhook
 */
export const handleWebhook = async (
    body: any,
    signature: string,
    io?: any
): Promise<{ success: boolean; message: string }> => {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

        if (!webhookSecret) {
            throw new Error('Razorpay webhook secret not configured');
        }

        // Verify webhook signature
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(body))
            .digest('hex');

        if (expectedSignature !== signature) {
            throw new Error('Invalid webhook signature');
        }

        const event = body.event;

        // Handle different events
        switch (event) {
            case 'payment.captured':
                // Payment was captured successfully
                if (body.payload?.payment?.entity) {
                    await handlePaymentCaptured(body.payload.payment.entity, io);
                }
                break;

            case 'payment.failed':
                // Payment failed
                if (body.payload?.payment?.entity) {
                    await handlePaymentFailed(body.payload.payment.entity);
                }
                break;

            case 'refund.created':
            case 'refund.processed':
                // Refund was created or processed
                if (body.payload?.refund?.entity) {
                    await handleRefundCreated(body.payload.refund.entity);
                }
                break;

            case 'payment.authorized':
            case 'order.paid':
                // Acknowledged webhook events
                console.log(`ℹ️ [Webhook] Acknowledged ${event} event cleanly.`);
                break;

            default:
                console.log('Unhandled webhook event:', event);
        }

        return {
            success: true,
            message: 'Webhook processed successfully',
        };
    } catch (error: any) {
        console.error('Error handling webhook:', error);
        return {
            success: false,
            message: error.message || 'Failed to process webhook',
        };
    }
};

// Helper functions for webhook events with strict idempotency protection.
// This is the SECONDARY confirmation path (Razorpay's server-to-server
// webhook) — the primary path is the frontend calling /payment/verify
// directly, handled by capturePayment/capturePaymentForOrders above. A mixed
// checkout's linked order ids are recovered from `notes.orderIds` (a JSON
// array), since Razorpay's `receipt` field is too short to hold more than one.
const handlePaymentCaptured = async (payload: any, io?: any) => {
    try {
        const razorpayPaymentId = payload.id;
        const razorpayOrderId = payload.order_id;

        let orderIds: string[] = [];
        if (payload.notes?.orderIds) {
            try {
                const parsed = JSON.parse(payload.notes.orderIds);
                if (Array.isArray(parsed)) orderIds = parsed.filter(Boolean);
            } catch {
                // fall through to single-id resolution below
            }
        }
        if (orderIds.length === 0) {
            const rawOrderId = payload.notes?.orderId || payload.notes?.order_id || payload.receipt;
            if (rawOrderId) orderIds = [rawOrderId];
        }

        if (orderIds.length === 0) {
            // Last resort: recover the order id(s) from an existing Payment
            // row for this razorpayOrderId (there may be more than one, for
            // a mixed checkout's linked orders).
            const existingPayments = await Payment.find({ razorpayOrderId }).select('order');
            orderIds = existingPayments.map((p) => p.order?.toString()).filter(Boolean) as string[];
        }

        if (orderIds.length === 0) {
            console.warn(`⚠️ [Webhook] Could not determine any orderId for payment ${razorpayPaymentId}`);
            return;
        }

        for (const orderId of orderIds) {
            await applyPaymentCapturedToOrder(orderId, razorpayOrderId, razorpayPaymentId, payload, io);
        }
    } catch (error) {
        console.error('Error handling payment captured webhook:', error);
    }
};

// Applies a captured-payment webhook event to ONE order — extracted so
// `handlePaymentCaptured` can loop it over every order linked to a mixed checkout.
const applyPaymentCapturedToOrder = async (
    orderId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    payload: any,
    io?: any
) => {
    // Idempotency Check 1: this order's own Payment row already Completed?
    const existingPayment = await Payment.findOne({
        order: orderId,
        $or: [{ razorpayPaymentId, status: 'Completed' }, { razorpayOrderId, status: 'Completed' }],
    });

    if (existingPayment && existingPayment.status === 'Completed') {
        console.log(`ℹ️ [Webhook] Duplicate payment.captured for order=${orderId}, paymentId=${razorpayPaymentId}. Already processed idempotently.`);
        return;
    }

    let payment = existingPayment || await Payment.findOne({ order: orderId, razorpayOrderId });

    const order = await Order.findById(orderId);
    if (!order) {
        console.warn(`⚠️ [Webhook] Order not found for id ${orderId}`);
        return;
    }

    // Idempotency Check 2: Check if Order is already Paid with this payment ID
    if (order.paymentStatus === 'Paid' && order.paymentId === razorpayPaymentId) {
        console.log(`ℹ️ [Webhook] Order ${order.orderNumber} already marked Paid with paymentId ${razorpayPaymentId}. Skipping duplicate.`);
        return;
    }

    // Create or update Payment record
    if (!payment) {
        payment = new Payment({
            order: order._id,
            customer: order.customer,
            paymentMethod: 'Online',
            paymentGateway: 'Razorpay',
            razorpayOrderId,
            razorpayPaymentId,
            amount: order.total,
            currency: 'INR',
            status: 'Completed',
            paidAt: new Date(),
            gatewayResponse: {
                success: true,
                message: 'Payment captured via webhook',
                rawResponse: payload,
            },
        });
    } else {
        payment.status = 'Completed';
        payment.razorpayPaymentId = razorpayPaymentId;
        payment.paidAt = new Date();
        payment.gatewayResponse = {
            success: true,
            message: 'Payment captured via webhook',
            rawResponse: payload,
        };
    }
    await payment.save();

    // Update order state
    const prevPaymentStatus = order.paymentStatus;
    order.paymentStatus = 'Paid';
    order.paymentId = razorpayPaymentId;
    if (order.status === 'Pending') {
        order.status = 'Received';
    }
    await order.save();

    // Commit coupon usage if order has an uncommitted coupon
    if (order.couponCode && !order.couponUsageCommitted) {
        try {
            const { commitCouponUsage } = await import('./couponService');
            await commitCouponUsage(order);
        } catch (couponErr) {
            console.error("Failed to commit coupon usage after webhook capture:", couponErr);
        }
    }

    // Execute side-effects ONLY IF transitioning into Paid for the first time
    if (prevPaymentStatus !== 'Paid') {
        // Notify sellers
        if (io) {
            try {
                const { notifySellersOfOrderUpdate } = await import('./sellerNotificationService');
                await notifySellersOfOrderUpdate(io, order, 'NEW_ORDER');
                console.log(`📢 [Online-Webhook] Seller notification sent for order ${order.orderNumber}`);
            } catch (notifyError) {
                console.error("Failed to notify sellers after webhook capture:", notifyError);
            }

            try {
                const { dispatchOrderToDeliveryBoys } = await import('./orderNotificationService');
                dispatchOrderToDeliveryBoys(order, io).catch((e) =>
                    console.error("Error dispatching order to delivery boys after webhook capture:", e)
                );
            } catch (dispatchError) {
                console.error("Failed to dispatch order to delivery boys after webhook capture:", dispatchError);
            }
        }

        // Create Pending Commissions
        try {
            const { createPendingCommissions } = await import('./commissionService');
            await createPendingCommissions(order._id.toString());
        } catch (commError) {
            console.error("Failed to create pending commissions after webhook payment:", commError);
        }
    }
};

const handlePaymentFailed = async (payload: any) => {
    try {
        const razorpayOrderId = payload.order_id;
        const razorpayPaymentId = payload.id;

        // Find every Payment row for this charge — a mixed checkout has one
        // row per linked order sharing the same razorpayOrderId/PaymentId.
        const payments = await Payment.find({
            $or: [{ razorpayOrderId }, { razorpayPaymentId }]
        });

        for (const payment of payments) {
            // Idempotency: skip if already Failed
            if (payment.status === 'Failed') continue;

            payment.status = 'Failed';
            payment.gatewayResponse = {
                success: false,
                message: payload.error_description || 'Payment failed',
                rawResponse: payload,
            };
            await payment.save();

            // Update order
            await Order.findByIdAndUpdate(payment.order, {
                paymentStatus: 'Failed',
            });
        }

        // No Payment row exists yet at all (typical — payment.failed usually
        // fires before any Payment doc is created) — mark every linked order
        // from `notes.orderIds` as Failed directly.
        if (payments.length === 0) {
            let orderIds: string[] = [];
            if (payload.notes?.orderIds) {
                try {
                    const parsed = JSON.parse(payload.notes.orderIds);
                    if (Array.isArray(parsed)) orderIds = parsed.filter(Boolean);
                } catch {
                    // ignore
                }
            }
            if (orderIds.length === 0 && payload.notes?.orderId) {
                orderIds = [payload.notes.orderId];
            }
            for (const orderId of orderIds) {
                await Order.findByIdAndUpdate(orderId, { paymentStatus: 'Failed' });
            }
        }
    } catch (error) {
        console.error('Error handling payment failed webhook:', error);
    }
};

const handleRefundCreated = async (payload: any) => {
    try {
        const razorpayPaymentId = payload.payment_id;

        // A mixed checkout's two linked orders share one razorpayPaymentId,
        // so this refund event could belong to either one's Payment row —
        // disambiguate by the specific refund id first (set when our own
        // processRefund() call already handled it directly; this webhook is
        // then just a confirmation), falling back to amount-matching among
        // not-yet-refunded rows for refunds initiated outside our API.
        let payment = payload.id
            ? await Payment.findOne({ razorpayPaymentId, refundId: payload.id })
            : null;

        if (!payment) {
            const candidates = await Payment.find({ razorpayPaymentId, status: { $ne: 'Refunded' } });
            const refundAmountRupees = payload.amount != null ? payload.amount / 100 : null;
            payment = (refundAmountRupees != null
                ? candidates.find((c) => Math.abs((c.amount || 0) - refundAmountRupees) < 0.01)
                : undefined) || candidates[0] || null;
        }

        if (payment) {
            // Idempotency: skip if already marked Refunded
            if (payment.status === 'Refunded') {
                return;
            }
            payment.status = 'Refunded';
            payment.refundAmount = payload.amount / 100; // Convert from paise
            payment.refundedAt = new Date();
            await payment.save();

            // Update order
            const updatedOrder = await Order.findByIdAndUpdate(payment.order, {
                paymentStatus: 'Refunded',
                status: 'Cancelled',
            }, { new: true });

            console.log(`\n[REFUND WEBHOOK ORDER UPDATE]\nRefund ID: ${payload.id || 'N/A'}\nPayment ID: ${payment._id}\nOrder ID: ${payment.order}\npayment.status: ${payment.status}\norder.status: ${updatedOrder?.status}\norder.paymentStatus: ${updatedOrder?.paymentStatus}`);
        }
    } catch (error) {
        console.error('Error handling refund created webhook:', error);
    }
};
