/**
 * How an order status is shown to customers: a friendly label and its own colour.
 * "Received" (the server's first status) is shown as "Placed".
 */
export interface StatusStyle {
  label: string;
  /** Pill background, text and border classes. */
  pill: string;
  /** Colour of the small dot inside the pill. */
  dot: string;
}

const STYLES: Record<string, StatusStyle> = {
  Received: { label: 'Placed', pill: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  Pending: { label: 'Pending', pill: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  Accepted: { label: 'Confirmed', pill: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
  Processed: { label: 'Packed', pill: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  Shipped: { label: 'Shipped', pill: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
  'Picked up': { label: 'Shipped', pill: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
  'On the way': { label: 'On the way', pill: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' },
  'Out for Delivery': { label: 'Out for delivery', pill: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-500' },
  Delivered: { label: 'Delivered', pill: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  Completed: { label: 'Delivered', pill: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  Cancelled: { label: 'Cancelled', pill: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  Rejected: { label: 'Rejected', pill: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  Returned: { label: 'Returned', pill: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  RTO: { label: 'Returned to seller', pill: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
};

export const customerOrderStatus = (status: string): StatusStyle =>
  STYLES[status] || { label: status, pill: 'bg-neutral-50 text-neutral-700 border-neutral-200', dot: 'bg-neutral-400' };
