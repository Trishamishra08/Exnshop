import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import {
  listSellerShippingMethods,
  setSellerShippingMethod,
  type AdminSellerShippingRow,
  type ShippingMethod,
} from '../../../services/api/shippingMethodService';

/**
 * Every E-commerce seller and how their orders ship: by the company (courier booked for
 * them, like Easy Ship) or by themselves (Self ship). The admin can change any seller here.
 */
const PILL: Record<string, string> = {
  Company: 'bg-blue-50 text-blue-700 border-blue-200',
  Self: 'bg-purple-50 text-purple-700 border-purple-200',
  none: 'bg-amber-50 text-amber-700 border-amber-200',
};
const label = (m: ShippingMethod | null) => (m === 'Self' ? 'Self shipping' : m === 'Company' ? 'Ship by Company' : 'Not chosen');

export default function SellerShippingMethodsTable({ refreshKey = 0 }: { refreshKey?: number }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<AdminSellerShippingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listSellerShippingMethods({ search: search.trim() || undefined, method: filter || undefined }));
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not load sellers', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, filter, showToast]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  const change = async (row: AdminSellerShippingRow, method: ShippingMethod) => {
    if (row.method === method) return;
    if (!window.confirm(`Change ${row.storeName || row.sellerName} to "${label(method)}"? It applies to their E-commerce orders from now on.`)) return;
    setSaving(row.sellerId);
    try {
      await setSellerShippingMethod(row.sellerId, method);
      showToast('Shipping method updated', 'success');
      setRows((rs) => rs.map((r) => (r.sellerId === row.sellerId ? { ...r, method, pendingRequest: null } : r)));
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not update', 'error');
    } finally {
      setSaving(null);
    }
  };

  const counts = {
    Company: rows.filter((r) => r.method === 'Company').length,
    Self: rows.filter((r) => r.method === 'Self').length,
    none: rows.filter((r) => !r.method).length,
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 mb-6">
      <div className="px-6 py-4 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Seller Shipping Methods</h2>
          <p className="text-xs text-neutral-500">
            Ship by Company: we book the courier and pickup. Self shipping: the seller ships and adds the tracking number. Change any seller here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search seller, store, mobile"
            className="w-56 px-3 py-1.5 rounded-lg border border-neutral-300 text-sm" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm bg-white">
            <option value="">All methods</option>
            <option value="Company">Ship by Company</option>
            <option value="Self">Self shipping</option>
            <option value="none">Not chosen</option>
          </select>
        </div>
      </div>

      <div className="px-6 pt-3 flex flex-wrap gap-2 text-xs">
        <span className={`px-2.5 py-1 rounded-full border font-semibold ${PILL.Company}`}>Ship by Company: {counts.Company}</span>
        <span className={`px-2.5 py-1 rounded-full border font-semibold ${PILL.Self}`}>Self shipping: {counts.Self}</span>
        <span className={`px-2.5 py-1 rounded-full border font-semibold ${PILL.none}`}>Not chosen: {counts.none}</span>
      </div>

      {loading ? (
        <div className="p-8 text-center text-neutral-500 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-neutral-400 text-sm">No E-commerce sellers found.</div>
      ) : (
        <div className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm border border-neutral-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-neutral-50 text-xs font-bold text-neutral-700 border-b border-neutral-200">
                <th className="p-3">Seller</th>
                <th className="p-3">Current method</th>
                <th className="p-3">Change to</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sellerId} className="border-b border-neutral-100 last:border-b-0">
                  <td className="p-3">
                    <p className="font-medium text-neutral-900">{r.storeName || r.sellerName}</p>
                    <p className="text-xs text-neutral-500">{r.sellerName}{r.mobile ? ` · ${r.mobile}` : ''}{r.status ? ` · ${r.status}` : ''}</p>
                  </td>
                  <td className="p-3">
                    <span className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${PILL[r.method || 'none']}`}>{label(r.method)}</span>
                    {r.pendingRequest && (
                      <p className="text-[11px] text-amber-700 mt-1">Asked to switch to {label(r.pendingRequest.requestedMethod)} (see requests below)</p>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-50">
                      {(['Company', 'Self'] as ShippingMethod[]).map((m) => (
                        <button key={m} disabled={saving === r.sellerId} onClick={() => change(r, m)}
                          className={`px-3 py-1 rounded-md text-xs font-semibold ${r.method === m ? 'bg-white shadow-sm text-teal-700' : 'text-neutral-500 hover:text-neutral-800'} disabled:opacity-50`}>
                          {m === 'Company' ? 'By Company' : 'Self'}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
