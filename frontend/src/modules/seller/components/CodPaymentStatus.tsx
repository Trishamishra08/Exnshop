import { useState } from 'react';
import { updateCodPaymentStatus, type OrderDetail } from '../../../services/api/orderService';
import { useToast } from '../../../context/ToastContext';

/**
 * Payment method + status rows for the seller's order screens, with the COD controls.
 *
 * COD the seller collects themselves (Quick self delivery, or an E-commerce parcel they ship
 * with their own courier): the seller marks the cash as received, which turns the payment
 * Paid. Any other COD order (rider, company courier) is marked paid by the admin, so the
 * seller only sees its status here.
 */
export default function CodPaymentStatus({
  order,
  onUpdated,
  rowClassName = 'flex items-center justify-between gap-3 py-1.5 text-sm',
}: {
  order: OrderDetail;
  onUpdated: (paymentStatus: string) => void;
  rowClassName?: string;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const isCod = /^cod$/i.test(order.paymentMethod || '');
  const paid = order.paymentStatus === 'Paid';
  const delivered = order.status === 'Delivered';
  const sellerCollects = isCod && order.codSettledBy === 'Seller';

  const statusText = !isCod
    ? order.paymentStatus
    : paid
      ? 'Paid (cash received)'
      : order.paymentStatus === 'Pending'
        ? delivered
          ? 'Pending (cash to confirm)'
          : 'Pending (pay on delivery)'
        : order.paymentStatus;

  const save = async (next: 'Paid' | 'Pending') => {
    if (next === 'Pending' && !window.confirm('Set the payment back to Pending? Do this only if you have not received the cash.')) return;
    setSaving(true);
    try {
      const res = await updateCodPaymentStatus(order.id, next);
      onUpdated(res.data?.paymentStatus || next);
      showToast(res.message || (next === 'Paid' ? 'Cash marked as received' : 'Payment set to Pending'), 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not update the payment status', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className={rowClassName}>
        <span className="text-neutral-500">Method</span>
        <span className="font-medium text-neutral-900">{isCod ? 'Cash on Delivery (COD)' : order.paymentMethod}</span>
      </div>
      <div className={rowClassName}>
        <span className="text-neutral-500">Status</span>
        <span className={`font-medium text-right ${paid ? 'text-green-700' : 'text-amber-700'}`}>{statusText}</span>
      </div>

      {isCod && (
        <div className="mt-2 rounded-lg bg-neutral-50 border border-neutral-200 p-2.5 text-xs text-neutral-600 space-y-2">
          {!sellerCollects ? (
            <p>The delivery partner or the courier collects this cash, so the admin updates the payment status.</p>
          ) : !order.canUpdatePaymentStatus ? (
            <p>You collect this cash. This order has items from other sellers too, so its payment turns Paid once every parcel is delivered.</p>
          ) : !delivered ? (
            <p>You deliver this order and collect the cash. After you mark it delivered, the payment turns Paid; you can change it here if needed.</p>
          ) : paid ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>You collected the cash for this order.</p>
              <button
                type="button"
                disabled={saving}
                onClick={() => save('Pending')}
                className="text-xs font-semibold text-neutral-600 underline hover:text-neutral-900 disabled:opacity-50">
                Not received? Set to Pending
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p>You delivered this order. Once you have the customer's cash, mark it as received.</p>
              <button
                type="button"
                disabled={saving}
                onClick={() => save('Paid')}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Mark cash received (Paid)'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
