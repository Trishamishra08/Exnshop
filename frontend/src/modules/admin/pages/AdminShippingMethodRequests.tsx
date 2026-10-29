import { useEffect, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import SellerShippingMethodsTable from '../components/SellerShippingMethodsTable';
import {
  decideShippingMethodRequest,
  getShippingMethodRequests,
  type AdminShippingRequestRow,
  type ShippingMethod,
} from '../../../services/api/shippingMethodService';

const label = (m: ShippingMethod | null) => (m === 'Self' ? 'Self shipping' : m === 'Company' ? 'By Company' : 'Not chosen');

const STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-amber-100 text-amber-800',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-700',
};

export default function AdminShippingMethodRequests() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<AdminShippingRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Pending');
  const [target, setTarget] = useState<AdminShippingRequestRow | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Bumped after a request is decided so the all-sellers table shows the new method.
  const [refreshKey, setRefreshKey] = useState(0);

  const load = async () => {
    try {
      setLoading(true);
      setRows(await getShippingMethodRequests(status));
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to load requests', 'error');
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
    if (decision === 'Rejected' && !note.trim()) return showToast('Add a short note for the seller when declining', 'error');
    setBusy(true);
    try {
      await decideShippingMethodRequest(target.sellerId, decision, note.trim() || undefined);
      showToast(decision === 'Approved' ? 'Shipping method changed' : 'Request declined', 'success');
      setTarget(null);
      setNote('');
      load();
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not update', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <SellerShippingMethodsTable refreshKey={refreshKey} />
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
        <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">Shipping Method Change Requests</h2>
            <p className="text-sm text-teal-100 mt-1">Sellers choose Self shipping or By Company once. Later changes come here for approval.</p>
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-1.5 rounded text-sm bg-white text-neutral-800">
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="All">All</option>
          </select>
        </div>

        {loading ? (
          <div className="p-8 text-center text-neutral-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-neutral-400">No {status === 'All' ? '' : status.toLowerCase() + ' '}requests.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-neutral-50 text-xs font-bold text-neutral-800 border-b border-neutral-200">
                  <th className="p-4">Seller</th>
                  <th className="p-4">Current</th>
                  <th className="p-4">Wants</th>
                  <th className="p-4">Reason</th>
                  <th className="p-4">Open E-com orders</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sellerId} className="border-b border-neutral-200 text-neutral-700 align-top">
                    <td className="p-4">
                      <p className="font-medium text-neutral-900">{r.storeName || r.sellerName}</p>
                      <p className="text-xs text-neutral-500">{r.sellerName}{r.mobile ? ` · ${r.mobile}` : ''}</p>
                    </td>
                    <td className="p-4 whitespace-nowrap">{label(r.currentMethod)}</td>
                    <td className="p-4 whitespace-nowrap font-medium">{label(r.request.requestedMethod)}</td>
                    <td className="p-4 max-w-[240px]">
                      {r.request.reason || <span className="text-neutral-400">—</span>}
                      <p className="text-[11px] text-neutral-400 mt-1">{new Date(r.request.requestedAt).toLocaleDateString('en-GB')}</p>
                    </td>
                    <td className="p-4">{r.openEcommerceOrders}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.request.status]}`}>{r.request.status}</span>
                      {r.request.adminNote && <p className="text-[11px] text-neutral-500 mt-1 max-w-[160px]">{r.request.adminNote}</p>}
                    </td>
                    <td className="p-4">
                      {r.request.status === 'Pending' ? (
                        <button onClick={() => { setTarget(r); setNote(''); }} className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded">
                          Review
                        </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setTarget(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg">
              <h3 className="text-lg font-semibold">Review request</h3>
              <p className="text-sm text-teal-100 mt-1">{target.storeName || target.sellerName}</p>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <p>
                Switch from <b>{label(target.currentMethod)}</b> to <b>{label(target.request.requestedMethod)}</b>.
              </p>
              {target.request.reason && <p className="text-neutral-600">Seller says: “{target.request.reason}”</p>}
              {target.openEcommerceOrders > 0 && (
                <p className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs">
                  This seller has {target.openEcommerceOrders} open E-commerce order(s). Orders already booked keep their current shipping; the new method applies to orders packed after the change.
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Note to seller <span className="text-xs text-neutral-400">(required when declining)</span></label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
              <button onClick={() => setTarget(null)} className="px-4 py-2 border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded text-sm font-medium">Cancel</button>
              <button onClick={() => decide('Rejected')} disabled={busy} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium disabled:opacity-50">Decline</button>
              <button onClick={() => decide('Approved')} disabled={busy} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium disabled:opacity-50">Approve</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
