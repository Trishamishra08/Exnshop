import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import api from '../../../services/api/config';
import DeliveryHistoryModal from '../components/DeliveryHistoryModal';

/**
 * An approved delivery partner's profile, vehicle and bank changes wait here. The approved
 * details stay in use until the admin decides; every request and decision is kept in the
 * partner's history (old and new values).
 */
interface Row {
  deliveryId: string;
  name: string;
  mobile?: string;
  submittedAt: string;
  changes: { field: string; label: string; from: any; to: any }[];
}

const show = (v: any) => (v === null || v === undefined || v === '' ? '—' : String(v));

export default function AdminDeliveryChangeRequests() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api.get('/admin/delivery-change-requests')).data?.data || []);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not load requests', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const decide = async (row: Row, decision: 'Approved' | 'Rejected') => {
    let remarks: string | undefined;
    if (decision === 'Rejected') {
      remarks = window.prompt('Reason for rejecting (the partner will see it)') || undefined;
      if (!remarks) return;
    }
    setBusy(row.deliveryId);
    try {
      const res = await api.post(`/admin/delivery/${row.deliveryId}/change-request/decision`, { decision, remarks });
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
      <div className="bg-teal-600 text-white px-6 py-4 rounded-lg">
        <h2 className="text-lg font-semibold">Delivery Change Requests</h2>
        <p className="text-sm text-teal-100 mt-1">
          When an approved delivery partner changes their profile, vehicle or bank details, the change waits here. Their current details stay in use until you approve.
          Every request and decision is kept in their history.
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border p-10 text-center text-sm text-neutral-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-lg border p-10 text-center text-sm text-neutral-400">No changes waiting for approval.</div>
      ) : (
        rows.map((row) => (
          <div key={row.deliveryId} className="bg-white rounded-lg border border-neutral-200 shadow-sm">
            <div className="px-5 py-3 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-neutral-900">{row.name}</p>
                <p className="text-xs text-neutral-500">{row.mobile} · requested {new Date(row.submittedAt).toLocaleString('en-IN')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setHistory(row)} className="text-xs font-semibold text-blue-700 hover:underline">History</button>
                <button disabled={busy !== null} onClick={() => decide(row, 'Rejected')}
                  className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 disabled:opacity-50">Reject</button>
                <button disabled={busy !== null} onClick={() => decide(row, 'Approved')}
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50">Approve</button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 text-xs text-neutral-600">
                  <th className="p-2.5 text-left w-44">Field</th>
                  <th className="p-2.5 text-left">Current</th>
                  <th className="p-2.5 text-left">Partner wants</th>
                </tr>
              </thead>
              <tbody>
                {row.changes.map((c) => (
                  <tr key={c.field} className="border-t border-neutral-100">
                    <td className="p-2.5 font-medium text-neutral-700">{c.label}</td>
                    <td className="p-2.5 text-neutral-500 break-all">{show(c.from)}</td>
                    <td className="p-2.5 text-neutral-900 font-medium break-all bg-amber-50/40">{show(c.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
      {history && <DeliveryHistoryModal deliveryId={history.deliveryId} name={history.name} onClose={() => setHistory(null)} />}
    </div>
  );
}
