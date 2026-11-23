import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { getAdminDeliverySlips, getSellerDeliverySlip } from '../services/api/shippingLabelService';
import { importWithRetry } from '../utils/lazyWithRetry';

/**
 * "Print Delivery Slip": a simple slip with the buyer's and seller's details, items and the
 * cash to collect, followed by the tax invoice. Needs no AWB, so it works for the seller's
 * own delivery boy and before a courier / tracking number exists.
 */
export default function DeliverySlipButton({
  orderId,
  orderRef,
  as = 'seller',
  className = 'px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-sm font-medium text-neutral-700 disabled:opacity-50',
}: {
  orderId: string;
  orderRef?: string;
  as?: 'seller' | 'admin';
  className?: string;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      const res = as === 'admin' ? await getAdminDeliverySlips(orderId) : await getSellerDeliverySlip(orderId);
      if (!res.success || !res.data?.length) {
        showToast(res.message || 'Delivery slip is not available', 'error');
        return;
      }
      const { downloadDeliverySlips } = await importWithRetry(() => import('../utils/deliverySlipPdf'));
      await downloadDeliverySlips(res.data, `Delivery_Slip_${orderRef || res.data[0].orderNumber || orderId}.pdf`);
    } catch (err: any) {
      console.error('Delivery slip failed', err);
      showToast(err.response?.data?.message || `Could not create the delivery slip${err?.message ? `: ${err.message}` : ''}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title="Buyer and seller details, items and cash to collect, with the tax invoice. No AWB needed."
      className={className}>
      {busy ? 'Please wait…' : 'Print Delivery Slip'}
    </button>
  );
}
