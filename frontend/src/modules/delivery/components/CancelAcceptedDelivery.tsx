import { useEffect, useState } from 'react';
import api from '../../../services/api/config';
import { useToast } from '../../../context/ToastContext';

/**
 * Lets a delivery partner give back a Quick order they accepted but can't deliver
 * (before pickup). A penalty is charged to their wallet; if the reason is genuine the
 * admin can refund it. The order is rung to other nearby partners straight away.
 */
export default function CancelAcceptedDelivery({ orderId, onCancelled }: { orderId: string; onCancelled: () => void }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [penalty, setPenalty] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || reasons.length) return;
    api.get('/delivery/cancel-info')
      .then((res) => {
        setReasons(res.data?.data?.reasons || []);
        setPenalty(res.data?.data?.penalty ?? null);
      })
      .catch(() => setReasons(['Vehicle breakdown', 'Medical or family emergency', 'Other']));
  }, [open, reasons.length]);

  const submit = async () => {
    if (!reason) return showToast('Choose a reason', 'error');
    if (reason === 'Other' && !note.trim()) return showToast('Please write the reason', 'error');
    setBusy(true);
    try {
      const res = await api.post(`/delivery/orders/${orderId}/cancel-accepted`, { reason, note });
      showToast(res.data?.message || 'Order cancelled', 'info');
      setOpen(false);
      onCancelled();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not cancel', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 pt-2">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="w-full py-2.5 rounded-xl border border-red-200 bg-white text-red-600 text-sm font-semibold">
          Can't deliver this order? Cancel it
        </button>
      ) : (
        <div className="bg-white rounded-2xl p-4 border border-red-200 space-y-3">
          <p className="font-semibold text-neutral-900">Cancel this delivery</p>
          <p className="text-xs text-red-700 bg-red-50 rounded-lg p-2">
            A penalty{penalty !== null ? ` of ₹${penalty}` : ''} will be charged to your wallet. If your reason is genuine, the admin can refund it.
            The order will be given to another delivery partner.
          </p>
          <div className="space-y-1.5">
            {reasons.map((r) => (
              <label key={r} className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm ${reason === r ? 'border-red-400 bg-red-50' : 'border-neutral-200'}`}>
                <input type="radio" name="cancel-reason" checked={reason === r} onChange={() => setReason(r)} />
                {r}
              </label>
            ))}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Details (helps the admin refund the penalty)"
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-neutral-100 text-neutral-700 text-sm font-semibold">Keep order</button>
            <button type="button" onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-60">
              {busy ? 'Cancelling…' : 'Cancel delivery'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
