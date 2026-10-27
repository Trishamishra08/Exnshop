import { useEffect, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import {
  createRefundRequest,
  getRefundableItems,
  getRefundReasons,
  type RefundableItem,
} from '../../../services/api/shippingMethodService';

/** Seller asks to refund a delivered item. An admin approves it before the customer is paid. */
export default function RefundOrderModal({ orderRef, onClose, onDone }: { orderRef: string; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState('');
  const [orderId, setOrderId] = useState('');
  const [items, setItems] = useState<RefundableItem[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [noteToBuyer, setNoteToBuyer] = useState('');
  const [noteToSelf, setNoteToSelf] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getRefundableItems(orderRef), getRefundReasons()])
      .then(([eligible, r]) => {
        setOrderId(eligible.orderId);
        setItems(eligible.items);
        setReasons(r);
        if (eligible.items.length === 0) setBlocked('Every item on this order is already refunded, returned, or has a refund request waiting.');
        else setItemId(eligible.items[0].orderItemId);
      })
      .catch((err: any) => setBlocked(err.response?.data?.message || 'Could not load this order'))
      .finally(() => setLoading(false));
  }, [orderRef]);

  const item = items.find((i) => i.orderItemId === itemId);
  const quantity = Math.max(0, Number(qty) || 0);
  const estimate = item ? item.unitPrice * quantity : 0;

  const submit = async () => {
    if (!item) return;
    if (!reason) return showToast('Choose a reason for the refund', 'error');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.refundableQuantity) {
      return showToast(`Quantity must be between 1 and ${item.refundableQuantity}`, 'error');
    }
    setSaving(true);
    try {
      await createRefundRequest({ orderId, orderItemId: item.orderItemId, quantity, reason, noteToBuyer, noteToSelf });
      showToast('Refund request sent to admin for approval', 'success');
      onDone();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not send the request', 'error');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="bg-teal-600 text-white px-6 py-4 rounded-t-xl">
          <h3 className="text-lg font-semibold">Refund order</h3>
          <p className="text-sm text-teal-100 mt-0.5">Order {orderRef}</p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-neutral-500">Loading…</div>
        ) : blocked ? (
          <div className="p-6">
            <p className="text-sm text-neutral-700">{blocked}</p>
            <div className="mt-4 flex justify-end">
              <button onClick={onClose} className="px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50">Close</button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Item</label>
                <select value={itemId} onChange={(e) => { setItemId(e.target.value); setQty('1'); }} className={field}>
                  {items.map((i) => (
                    <option key={i.orderItemId} value={i.orderItemId}>{i.productName} (can refund {i.refundableQuantity})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Quantity</label>
                  <input type="number" min={1} max={item?.refundableQuantity} value={qty} onChange={(e) => setQty(e.target.value)} className={field} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Reason for refund</label>
                  <select value={reason} onChange={(e) => setReason(e.target.value)} className={field}>
                    <option value="">Select a reason</option>
                    {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-sm">
                <p className="text-neutral-700">Refund to customer: <b>about ₹{estimate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>
                <p className="text-xs text-neutral-500 mt-1">
                  This is the item price for these units (any coupon share is taken off). The same amount, less your commission, is taken back from your earnings. Delivery and platform fees are not refunded.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Note to the buyer <span className="text-xs text-neutral-400">(optional)</span></label>
                <textarea value={noteToBuyer} onChange={(e) => setNoteToBuyer(e.target.value)} maxLength={255} rows={2} className={field} />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Note to yourself <span className="text-xs text-neutral-400">(optional, only you see it)</span></label>
                <textarea value={noteToSelf} onChange={(e) => setNoteToSelf(e.target.value)} maxLength={255} rows={2} className={field} />
              </div>
              <p className="text-xs text-neutral-500">Admin reviews every refund before any money moves. Once approved it can&apos;t be undone.</p>
            </div>
            <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
              <button onClick={onClose} disabled={saving} className="px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
              <button onClick={submit} disabled={saving} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {saving ? 'Sending…' : 'Send for approval'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
