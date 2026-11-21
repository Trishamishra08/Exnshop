import { useCallback, useEffect, useState } from 'react';
import api from '../../../services/api/config';

/** Admin > Finance > Ledger: every wallet credit / debit of sellers, delivery partners and customers. */
const money = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const PARTY: Record<string, string> = { SELLER: 'Seller', DELIVERY_BOY: 'Delivery partner', CUSTOMER: 'Customer' };
const CATEGORY: Record<string, string> = {
  ORDER_PAYMENT: 'Order payment',
  COD_RETURN_REFUND: 'COD return refund',
  ORDER_CANCELLATION_REFUND: 'Cancellation refund',
  MANUAL_ADMIN_CREDIT: 'Admin credit',
  MANUAL_ADMIN_DEBIT: 'Admin debit',
  RTO_REVERSE_SHIPPING_DEBIT: 'RTO shipping',
  AD_SPEND: 'Ad spend',
  RETURN_SHIPPING_DEBIT: 'Return shipping',
  PLATFORM_FEE_DEBIT: 'Platform fee / commission',
  DELIVERY_CANCEL_PENALTY: 'Cancellation penalty',
  PENALTY_REFUND: 'Penalty refund',
  WALLET_TOPUP: 'Wallet top-up',
};

interface Row {
  _id: string; date: string; userType: string; party: string; type: 'Credit' | 'Debit'; category: string; amount: number;
  balanceAfter?: number; description: string; reference: string; status: string; orderNumber: string;
}

export default function AdminLedger() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState({ credit: 0, debit: 0, net: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [userType, setUserType] = useState('');
  const [party, setParty] = useState('');
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = useCallback(
    (extra: Record<string, any> = {}) => ({
      userType: userType || undefined, party: party || undefined, type: type || undefined, category: category || undefined,
      from: from || undefined, to: to || undefined, ...extra,
    }),
    [userType, party, type, category, from, to]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/reports/ledger', { params: params({ page, limit }) });
      setRows(res.data.data.rows);
      setTotals(res.data.data.totals);
      setTotal(res.data.pagination.total);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load the ledger');
    } finally {
      setLoading(false);
    }
  }, [params, page, limit]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    const res = await api.get('/admin/reports/ledger', { params: params({ page: 1, limit: 5000 }) });
    const all: Row[] = res.data.data.rows;
    const head = ['Date', 'Account type', 'Account', 'Type', 'Category', 'Amount', 'Balance after', 'Order', 'Description', 'Reference', 'Status'];
    const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(',')]
      .concat(all.map((r) => [fmtDate(r.date), PARTY[r.userType] || r.userType, r.party, r.type, CATEGORY[r.category] || r.category, r.amount, r.balanceAfter ?? '', r.orderNumber, r.description, r.reference, r.status].map(q).join(',')))
      .join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pages = Math.max(1, Math.ceil(total / limit));
  const input = 'border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white';
  const card = (label: string, value: string, cls = '') => (
    <div className="bg-white border border-neutral-200 rounded-lg p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-lg font-semibold mt-1 ${cls}`}>{value}</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="bg-teal-600 text-white px-5 py-4">
          <h2 className="text-lg font-semibold">Ledger</h2>
          <p className="text-sm text-teal-100 mt-1">Every wallet credit and debit for sellers, delivery partners and customers, with the balance after each entry.</p>
        </div>
        <div className="p-4 flex flex-wrap items-end gap-3 border-b border-neutral-200">
          <label className="text-xs text-neutral-600">Account type<br />
            <select value={userType} onChange={(e) => { setUserType(e.target.value); setPage(1); }} className={input}>
              <option value="">All</option>
              {Object.entries(PARTY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs text-neutral-600 min-w-[180px]">Account<br />
            <input value={party} onChange={(e) => { setParty(e.target.value); setPage(1); }} placeholder="Name, store, mobile or email" className={`${input} w-full`} />
          </label>
          <label className="text-xs text-neutral-600">Type<br />
            <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className={input}>
              <option value="">Credit & Debit</option><option value="Credit">Credit</option><option value="Debit">Debit</option>
            </select>
          </label>
          <label className="text-xs text-neutral-600">Category<br />
            <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className={input}>
              <option value="">All</option>
              {Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs text-neutral-600">From<br /><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={input} /></label>
          <label className="text-xs text-neutral-600">To<br /><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={input} /></label>
          <button onClick={exportCsv} className="px-4 py-2 bg-teal-600 text-white rounded text-sm font-semibold hover:bg-teal-700">Export CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {card('Total credits', money(totals.credit), 'text-green-700')}
        {card('Total debits', money(totals.debit), 'text-red-600')}
        {card('Net', money(totals.net), totals.net < 0 ? 'text-red-600' : 'text-neutral-900')}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="p-3 text-left">Date</th>
              <th className="p-3 text-left">Account</th>
              <th className="p-3 text-left">Description</th>
              <th className="p-3 text-left">Order</th>
              <th className="p-3 text-right">Debit</th>
              <th className="p-3 text-right">Credit</th>
              <th className="p-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-8 text-center text-neutral-500">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="p-8 text-center text-red-600">{error}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-neutral-400">No ledger entries for these filters.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r._id} className="border-t border-neutral-100">
                  <td className="p-3 whitespace-nowrap text-neutral-600">{fmtDate(r.date)}</td>
                  <td className="p-3">{r.party}<div className="text-[11px] text-neutral-400">{PARTY[r.userType] || r.userType}</div></td>
                  <td className="p-3">
                    {r.description}
                    <div className="text-[11px] text-neutral-400">{CATEGORY[r.category] || r.category}{r.status !== 'Completed' ? ` · ${r.status}` : ''}</div>
                  </td>
                  <td className="p-3 whitespace-nowrap">{r.orderNumber || '—'}</td>
                  <td className="p-3 text-right text-red-600">{r.type === 'Debit' ? money(r.amount) : ''}</td>
                  <td className="p-3 text-right text-green-700">{r.type === 'Credit' ? money(r.amount) : ''}</td>
                  <td className="p-3 text-right">{r.balanceAfter != null ? money(r.balanceAfter) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-3 border-t border-neutral-200 text-sm">
          <span className="text-neutral-600">
            {total} entries · Rows
            <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className="ml-2 border border-neutral-300 rounded px-1 py-0.5">
              {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </span>
          <span className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">‹</button>
            {page} / {pages}
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40">›</button>
          </span>
        </div>
      </div>
    </div>
  );
}
