import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../../context/ToastContext';
import api from '../../../services/api/config';

/**
 * Approved sellers' profile, store and bank changes waiting for approval. The approved
 * details stay live until the admin decides; every request and decision is kept in the
 * seller's activity log (old and new value), linked from each row.
 */
interface ChangeRow {
  sellerId: string;
  sellerName: string;
  storeName: string;
  mobile?: string;
  email?: string;
  submittedAt: string;
  changes: { field: string; label: string; from: any; to: any }[];
}

const show = (v: any) => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};
const isImage = (v: any) => typeof v === 'string' && /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?|$)/i.test(v);

export default function AdminSellerChangeRequests() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ChangeRow | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/sellers/change-requests');
      setRows(res.data?.data || []);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not load change requests', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const decide = async (row: ChangeRow, decision: 'Approved' | 'Rejected', remarks?: string) => {
    setBusy(row.sellerId);
    try {
      const res = await api.post(`/sellers/${row.sellerId}/change-request/decision`, { decision, remarks });
      showToast(res.data?.message || 'Saved', 'success');
      setRejecting(null);
      setReason('');
      await load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not save the decision', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="bg-teal-600 text-white px-6 py-4 rounded-lg">
        <h2 className="text-lg font-semibold">Seller Change Requests</h2>
        <p className="text-sm text-teal-100 mt-1">
          When an approved seller changes their profile, store or bank details, the change waits here. Their current details stay live until you approve.
          Every request and decision is kept in the seller's activity log.
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border p-10 text-center text-neutral-500 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-lg border p-10 text-center text-neutral-400 text-sm">No changes waiting for approval.</div>
      ) : (
        rows.map((row) => (
          <div key={row.sellerId} className="bg-white rounded-lg border border-neutral-200 shadow-sm">
            <div className="px-5 py-3 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-neutral-900">{row.storeName || row.sellerName}</p>
                <p className="text-xs text-neutral-500">
                  {row.sellerName}{row.mobile ? ` · ${row.mobile}` : ''}{row.email ? ` · ${row.email}` : ''} · requested {new Date(row.submittedAt).toLocaleString('en-IN')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link to={`/admin/manage-seller/review/${row.sellerId}`} className="text-xs font-semibold text-blue-700 hover:underline">Full history →</Link>
                <button disabled={busy !== null} onClick={() => { setRejecting(row); setReason(''); }}
                  className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-50">Reject</button>
                <button disabled={busy !== null} onClick={() => decide(row, 'Approved')}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50">
                  {busy === row.sellerId ? 'Saving…' : 'Approve'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-xs text-neutral-600">
                    <th className="p-2.5 text-left w-48">Field</th>
                    <th className="p-2.5 text-left">Current (live)</th>
                    <th className="p-2.5 text-left">Seller wants</th>
                  </tr>
                </thead>
                <tbody>
                  {row.changes.map((c) => (
                    <tr key={c.field} className="border-t border-neutral-100 align-top">
                      <td className="p-2.5 font-medium text-neutral-700">{c.label}</td>
                      <td className="p-2.5 text-neutral-500 break-all">
                        {isImage(c.from) ? <img src={c.from} alt="" className="w-14 h-14 object-cover rounded border" /> : show(c.from)}
                      </td>
                      <td className="p-2.5 text-neutral-900 font-medium break-all bg-amber-50/40">
                        {isImage(c.to) ? <img src={c.to} alt="" className="w-14 h-14 object-cover rounded border" /> : show(c.to)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {rejecting && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setRejecting(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-neutral-900">Reject changes from {rejecting.storeName || rejecting.sellerName}</h3>
            <p className="text-xs text-neutral-500">The seller keeps their current details and sees this reason.</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason, e.g. Bank account name doesn't match the PAN"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejecting(null)} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm">Cancel</button>
              <button disabled={!reason.trim() || busy !== null} onClick={() => decide(rejecting, 'Rejected', reason.trim())}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
