import { useEffect, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import { decideRefundRequest, getAllRefundRequests, type RefundRequestRow } from '../../../services/api/shippingMethodService';

const STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-amber-100 text-amber-800',
  Processing: 'bg-blue-100 text-blue-800',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-700',
  Failed: 'bg-red-100 text-red-700',
};

const sellerLabel = (s: RefundRequestRow['seller']) => (typeof s === 'string' || !s ? '—' : s.storeName || s.sellerName || '—');

export default function AdminRefundRequests() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<RefundRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Pending');
  const [target, setTarget] = useState<RefundRequestRow | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setRows(await getAllRefundRequests(status));
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to load refund requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const decide = async (decision: 'Approved' | 'Rejected') => {
    if (!target) return;
    if (decision === 'Rejected' && !note.trim()) return showToast('Add a note for the seller when declining', 'error');
    setBusy(true);
    try {
      const res = await decideRefundRequest(target._id, decision, note.trim() || undefined);
      showToast(res.message || 'Done', 'success');
      setTarget(null);
      setNote('');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not complete', 'error');
    } finally {
      setBusy(false);
      load();
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
        <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">Seller Refund Requests</h2>
            <p className="text-sm text-teal-100 mt-1">Refunds sellers want to give on delivered orders. Approving pays the customer and takes the amount back from the seller.</p>
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-1.5 rounded text-sm bg-white text-neutral-800">
            {['Pending', 'Approved', 'Rejected', 'Failed', 'All'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="p-8 text-center text-neutral-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-neutral-400">No requests.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-neutral-50 text-xs font-bold text-neutral-800 border-b border-neutral-200">
                  <th className="p-4">Seller</th>
                  <th className="p-4">Order</th>
                  <th className="p-4">Item</th>
                  <th className="p-4">Reason</th>
                  <th className="p-4">Refund</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="border-b border-neutral-200 align-top text-neutral-700">
                    <td className="p-4">{sellerLabel(r.seller)}</td>
                    <td className="p-4 font-medium text-neutral-900">{r.orderNumber}</td>
                    <td className="p-4">{r.productName} <span className="text-neutral-400">× {r.quantity}</span></td>
                    <td className="p-4 max-w-[220px]">
                      {r.reason}
                      {r.noteToBuyer && <p className="text-xs text-neutral-500 mt-1">To buyer: {r.noteToBuyer}</p>}
                    </td>
                    <td className="p-4 whitespace-nowrap font-medium">₹{r.refundAmount.toFixed(2)}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                      {r.failureReason && <p className="text-xs text-red-600 mt-1 max-w-[200px]">{r.failureReason}</p>}
                      {r.adminNote && <p className="text-xs text-neutral-500 mt-1 max-w-[200px]">{r.adminNote}</p>}
                    </td>
                    <td className="p-4">
                      {r.status === 'Pending' ? (
                        <button onClick={() => { setTarget(r); setNote(''); }} className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded">Review</button>
                      ) : (
                        <span className="text-xs text-neutral-400">Decided</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setTarget(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg">
              <h3 className="text-lg font-semibold">Review refund</h3>
              <p className="text-sm text-teal-100 mt-1">Order {target.orderNumber} · {sellerLabel(target.seller)}</p>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <p><b>{target.productName}</b> × {target.quantity}</p>
              <p>Reason: {target.reason}</p>
              <p className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs">
                Approving refunds <b>₹{target.refundAmount.toFixed(2)}</b> to the customer (wallet first, then the original payment) and takes the seller&apos;s earning for these units back. This can&apos;t be undone.
              </p>
              <div>
                <label className="block font-medium text-neutral-700 mb-1">Note to seller <span className="text-xs text-neutral-400">(required when declining)</span></label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-teal-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
              <button onClick={() => setTarget(null)} disabled={busy} className="px-4 py-2 border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded text-sm font-medium">Cancel</button>
              <button onClick={() => decide('Rejected')} disabled={busy} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium disabled:opacity-50">Decline</button>
              <button onClick={() => decide('Approved')} disabled={busy} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium disabled:opacity-50">{busy ? 'Processing…' : 'Approve & refund'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
