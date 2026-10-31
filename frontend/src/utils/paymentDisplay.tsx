/**
 * What to show in an order's "Payment" badge. The stored paymentStatus alone is misleading
 * ("Pending" on a cancelled or delivered order), so the order status decides:
 *  - cancelled / rejected / RTO: nothing was collected (or the money was refunded)
 *  - delivered: cash orders were paid on delivery
 *  - otherwise: the payment's own state ("Pay on delivery" for COD)
 */
export interface PaymentOrderLike {
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  onlineAmountPaid?: number;
  walletAmountUsed?: number;
}

const tone = {
  green: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  blue: 'bg-blue-50 text-blue-700 border border-blue-200',
  amber: 'bg-amber-50 text-amber-700 border border-amber-200',
  grey: 'bg-neutral-100 text-neutral-600 border border-neutral-200',
  red: 'bg-red-50 text-red-700 border border-red-200',
};

export const paymentDisplay = (order: PaymentOrderLike): { label: string; className: string } => {
  const status = order.status || '';
  const pay = order.paymentStatus || 'Pending';
  const isCod = /^cod$/i.test(order.paymentMethod || 'COD');
  const paidOnline = pay === 'Paid' || (order.onlineAmountPaid || 0) > 0 || (order.walletAmountUsed || 0) > 0;

  if (pay === 'Refunded') return { label: 'Refunded', className: tone.blue };
  if (pay === 'Failed') return { label: 'Failed', className: tone.red };

  if (['Cancelled', 'Rejected', 'RTO'].includes(status)) {
    // Money was taken online but not returned yet.
    if (paidOnline && !isCod) return { label: 'Refund due', className: tone.amber };
    return { label: 'Not collected', className: tone.grey };
  }
  if (status === 'Returned') return paidOnline || isCod ? { label: 'Refund due', className: tone.amber } : { label: 'Refunded', className: tone.blue };
  if (status === 'Delivered') return { label: isCod ? 'Paid (cash)' : 'Paid', className: tone.green };

  if (pay === 'Paid') return { label: 'Paid', className: tone.green };
  return { label: isCod ? 'Pay on delivery' : 'Pending', className: tone.amber };
};

export const paymentLabel = (order: PaymentOrderLike) => paymentDisplay(order).label;

export function PaymentBadge({ order }: { order: PaymentOrderLike }) {
  const { label, className } = paymentDisplay(order);
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${className}`}>{label}</span>;
}
