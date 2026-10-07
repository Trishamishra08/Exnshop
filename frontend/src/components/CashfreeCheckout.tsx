import React, { useEffect } from 'react';
import { load } from '@cashfreepayments/cashfree-js';
import { createCashfreeOrder, verifyCashfreePayment } from '../services/api/paymentService';

interface CashfreeCheckoutProps {
    /** Single order id for an ordinary checkout, or multiple for a mixed
     *  Quick + E-commerce checkout — one Cashfree charge covers all of them. */
    orderId?: string;
    orderIds?: string[];
    amount: number;
    onSuccess: (paymentId: string) => void;
    onFailure: (error: string) => void;
    customerDetails: {
        name: string;
        email: string;
        phone: string;
    };
}

const CashfreeCheckout: React.FC<CashfreeCheckoutProps> = ({
    orderId,
    orderIds,
    amount,
    onSuccess,
    onFailure,
    customerDetails,
}) => {
    const hasInitiatedRef = React.useRef(false);
    // Normalize to a list — mirrors RazorpayCheckout's convention so the rest
    // of this component behaves identically for the single- and mixed-order case.
    const resolvedOrderIds = orderIds && orderIds.length > 0 ? orderIds : (orderId ? [orderId] : []);

    useEffect(() => {
        if (hasInitiatedRef.current) return;
        hasInitiatedRef.current = true;

        const initiatePayment = async () => {
            try {
                const orderResponse = await createCashfreeOrder(resolvedOrderIds.length > 1 ? resolvedOrderIds : resolvedOrderIds[0]);

                if (!orderResponse.success) {
                    onFailure(orderResponse.message || 'Failed to create payment order');
                    return;
                }

                const { cfOrderId, paymentSessionId, isMock } = orderResponse.data;

                // Handle mock/development fallback payment
                if (isMock || (cfOrderId && cfOrderId.startsWith('cf_mock_'))) {
                    console.log('⚡ Mock Cashfree mode active. Auto-verifying test payment...');
                    const verificationResponse = await verifyCashfreePayment({
                        orderIds: resolvedOrderIds,
                        cfOrderId,
                    });

                    if (verificationResponse.success) {
                        onSuccess(cfOrderId);
                    } else {
                        onFailure(verificationResponse.message || 'Payment verification failed');
                    }
                    return;
                }

                const cashfree = await load({
                    mode: 'production',
                });

                const checkoutResult: any = await cashfree.checkout({
                    paymentSessionId,
                    redirectTarget: '_modal',
                });

                if (checkoutResult.error) {
                    onFailure(checkoutResult.error.message || 'Payment cancelled or failed');
                    return;
                }

                // Modal closed with no error reported — confirm the real status
                // with our backend (never trust the client-side result alone).
                const verificationResponse = await verifyCashfreePayment({
                    orderIds: resolvedOrderIds,
                    cfOrderId,
                });

                if (verificationResponse.success) {
                    onSuccess(cfOrderId);
                } else {
                    onFailure(verificationResponse.message || 'Payment verification failed');
                }
            } catch (error: any) {
                console.error('Cashfree payment initiation error:', error);
                onFailure(error.response?.data?.message || 'Failed to initiate payment');
            }
        };

        initiatePayment();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId, orderIds, amount, customerDetails, onSuccess, onFailure]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <h3 className="text-lg font-semibold mb-2">Initiating Payment...</h3>
                    <p className="text-gray-600">Please wait while we redirect you to the payment gateway</p>
                </div>
            </div>
        </div>
    );
};

export default CashfreeCheckout;
