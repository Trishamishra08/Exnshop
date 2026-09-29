import api from './config';

/**
 * Create Razorpay order for payment. Pass a single order id for an ordinary
 * checkout, or an array (a mixed Quick + E-commerce checkout) to have one
 * Razorpay charge cover both linked orders.
 */
export const createRazorpayOrder = async (orderIdOrIds: string | string[]) => {
    try {
        const body = Array.isArray(orderIdOrIds) ? { orderIds: orderIdOrIds } : { orderId: orderIdOrIds };
        const response = await api.post('/payment/create-order', body);
        return response.data;
    } catch (error: any) {
        console.error('Error creating Razorpay order:', error);
        throw error;
    }
};

/**
 * Verify payment after Razorpay checkout. Pass `orderId` for a single order,
 * or `orderIds` for a mixed checkout's linked orders.
 */
export const verifyPayment = async (paymentData: {
    orderId?: string;
    orderIds?: string[];
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
}) => {
    try {
        const response = await api.post('/payment/verify', paymentData);
        return response.data;
    } catch (error: any) {
        console.error('Error verifying payment:', error);
        throw error;
    }
};

/**
 * Get payment history (if needed)
 */
export const getPaymentHistory = async () => {
    try {
        const response = await api.get('/customer/payments');
        return response.data;
    } catch (error: any) {
        console.error('Error getting payment history:', error);
        throw error;
    }
};
