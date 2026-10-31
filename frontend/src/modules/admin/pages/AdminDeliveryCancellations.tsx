import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import api from '../../../services/api/config';

/**
 * Quick orders a delivery partner accepted and then cancelled. The penalty is charged
 * automatically; here the admin refunds it when the reason is genuine (or keeps it).
 * Every record stays for the history.
 */
interface Row {
  _id: string;
  orderNumber: string;
  deliveryBoy?: { name?: string; mobile?: string };
  reason: string;
  note?: string;
  penalty: number;
  status: 'Charged' | 'Refunded' | 'Waived';
  adminRemarks?: string;
  createdAt: string;
  decidedAt?: string;
}

const PILL: Record<string, string> = {
  Charged: 'bg-red-50 text-red-700 border-red-200',
  Refunded: 'bg-green-50 text-green-700 border-green-200',
  Waived: 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

export default function AdminDeliveryCancellations() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('Charged');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/delivery-cancellations', { params: { status } });
      setRows(res.data?.data || []);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not load cancellations', 'error');
    } finally {
      setLoading(false);
    }
  }, [status, showToast]);

  useEffect(() => { load(); }, [load]);

  const decide = async (row: Row, decision: 'Refunded' | 'Charged') => {
    const remarks = decision === 'Charged' ? window.prompt('Note for the delivery partner (optional)') ?? undefined : undefined;
    setBusy(row._id);
    try {
      const res = await api.post(`/admin/delivery-cancellations/${row._id}/decision`, { decision, remarks });
      showToast(res.data?.message || 'Saved', 'success');
      await load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not save', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="bg-teal-600 text-white px-6 py-4 rounded-lg flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Delivery Cancellations</h2>
          <p className="text-sm text-teal-100 mt-1">
            Delivery partners who accepted a Quick order and then cancelled it. The penalty is charged automatically; refund it if the reason is genuine.
            The penalty amount is set in Billing Settings.
          </p>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-1.5 rounded text-sm bg-white text-neutral-800">
          <option value="Charged">Penalty charged</option>
          <option value="Refunded">Refunded</option>
          <option value="All">All</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border border-neutral-200 overflow-x-auto">
        {loading ? (
          <div className="p-10 text-center text-sm text-neutral-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-neutral-400">Nothing here.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 text-xs text-neutral-600 text-left">
                <th className="p-3">Order</th>
                <th className="p-3">Delivery partner</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Penalty</th>
                <th className="p-3">Status</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-t border-neutral-100 align-top">
                  <td className="p-3">
                    <p className="font-medium text-neutral-900">#{r.orderNumber}</p>
                    <p className="text-xs text-neutral-500">{new Date(r.createdAt).toLocaleString('en-IN')}</p>
                  </td>
                  <td className="p-3">
                    <p className="text-neutral-900">{r.deliveryBoy?.name || '—'}</p>
                    <p className="text-xs text-neutral-500">{r.deliveryBoy?.mobile}</p>
                  </td>
                  <td className="p-3 max-w-[260px]">
                    <p className="text-neutral-800">{r.reason}</p>
                    {r.note && <p className="text-xs text-neutral-500 mt-0.5">“{r.note}”</p>}
                  </td>
                  <td className="p-3 font-semibold">₹{r.penalty}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${PILL[r.status]}`}>{r.status}</span>
                    {r.adminRemarks && <p className="text-[11px] text-neutral-500 mt-1">{r.adminRemarks}</p>}
                  </td>
                  <td className="p-3">
                    {r.status === 'Charged' && (
                      <button disabled={busy !== null} onClick={() => decide(r, 'Refunded')}
                        className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold disabled:opacity-50">
                        Refund penalty
                      </button>
                    )}
                    {r.status === 'Refunded' && (
                      <button disabled={busy !== null} onClick={() => decide(r, 'Charged')}
                        className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold disabled:opacity-50">
                        Charge again
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
