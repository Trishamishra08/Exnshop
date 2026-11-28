import { useState } from 'react';
import { updateCodPaymentStatus, type OrderDetail } from '../../../services/api/orderService';
import { useToast } from '../../../context/ToastContext';

/**
 * Payment method + status rows for the seller's order screens, with the COD controls. The status
 * and the note under it follow the order type (E-commerce courier / Quick rider / seller's own
 * delivery), the payment method (COD / online) and whether the order was cancelled.
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
  const refunded = order.paymentStatus === 'Refunded';
  const delivered = order.status === 'Delivered';
  const cancelled = ['Cancelled', 'Rejected'].includes(order.status);
  const sellerCollects = isCod && order.codSettledBy === 'Seller';
  // Who carries the parcel decides who takes the cash: courier (E-commerce, By Company) or rider (Quick).
  const byCourier = order.channel === 'ECommerce' && order.shippingMethod !== 'Self';
  const courier = order.shipment?.courierName || 'The courier';

  const statusText = isCod
    ? paid
      ? 'Paid (cash received)'
      : refunded
        ? 'Refunded'
        : cancelled
          ? 'Not collected (order cancelled)'
          : order.status === 'RTO'
            ? 'Not collected (parcel returned)'
            : order.paymentStatus === 'Pending'
              ? delivered
                ? 'Pending (cash to confirm)'
                : 'Pending (pay on delivery)'
              : order.paymentStatus
    : refunded
      ? 'Refunded to customer'
      : paid
        ? cancelled
          ? 'Paid online (refund due)'
          : 'Paid online'
        : order.paymentStatus === 'Failed'
          ? 'Payment failed'
          : 'Awaiting online payment';

  // One line on how this order's money moves, for its type and payment method.
  const onlineNote = cancelled
    ? refunded
      ? 'The customer paid online. This order is cancelled and the amount has been refunded to them.'
      : paid
        ? 'The customer paid online. This order is cancelled, so the amount is refunded to the customer.'
        : 'This order is cancelled. No payment was taken.'
    : paid || refunded
      ? `The customer paid online when placing the order, so there is nothing to collect at delivery${byCourier ? ' (the courier label says Prepaid)' : ''}.`
      : 'The customer has not completed the online payment yet.';
  const isGreen = paid && !cancelled;

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
        <span className="font-medium text-neutral-900">{isCod ? 'Cash on Delivery (COD)' : `${order.paymentMethod || 'Online'} (prepaid)`}</span>
      </div>
      <div className={rowClassName}>
        <span className="text-neutral-500">Status</span>
        <span
          className={`font-medium text-right ${isGreen ? 'text-green-700' : cancelled || refunded || order.status === 'RTO' ? 'text-neutral-600' : 'text-amber-700'}`}>
          {statusText}
        </span>
      </div>

      {!isCod && <p className="mt-2 rounded-lg bg-neutral-50 border border-neutral-200 p-2.5 text-xs text-neutral-600">{onlineNote}</p>}

      {isCod && (
        <div className="mt-2 rounded-lg bg-neutral-50 border border-neutral-200 p-2.5 text-xs text-neutral-600 space-y-2">
          {cancelled ? (
            <p>This order was cancelled before delivery, so no cash is collected for it.</p>
          ) : order.status === 'RTO' ? (
            <p>The customer did not take the parcel and it is coming back to you, so no cash was collected.</p>
          ) : !sellerCollects ? (
            byCourier ? (
              <p>
                {courier} collects the cash from the customer at delivery and sends it to Exnshop through Shiprocket. The admin marks the
                payment Paid once it arrives. You don&apos;t handle this cash.
              </p>
            ) : (
              <p>
                Exnshop&apos;s delivery partner collects the cash from the customer and hands it to Exnshop. The admin marks the payment Paid
                once it is received. You don&apos;t handle this cash.
              </p>
            )
          ) : !order.canUpdatePaymentStatus ? (
            <p>You collect this cash. This order has items from other sellers too, so its payment turns Paid once every parcel is delivered.</p>
          ) : !delivered ? (
            <p>
              {order.channel === 'ECommerce'
                ? 'You ship this order with your own courier and collect the cash.'
                : 'You deliver this order and collect the cash.'}{' '}
              After you mark it delivered, the payment turns Paid; you can change it here if needed.
            </p>
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
