import { useCallback, useEffect, useState } from 'react';
import api from '../../../services/api/config';

type Row = {
  date: string;
  orderNumber: string;
  type: string;
  amount: number;
  openingBalance: number;
  closingBalance: number;
  remark: string;
};
type Summary = { openingBalance: number; credit: number; debit: number; closingBalance: number };

const TYPES = ['Platform fee', 'Seller commission', 'Delivery charge', 'Rider payout', 'Ad click', 'Commission reversed'];
const money = (n: number) =>
  `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Admin ledger: Exnshop's own earnings, one row per event (platform fee, commission,
 * delivery charge, ad clicks; rider payouts and reversed commissions reduce it), with
 * the balance before and after each row.
 */
export default function AdminEarningsLedger() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ openingBalance: 0, credit: 0, debit: 0, closingBalance: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = useCallback(
    (extra: Record<string, any>) => ({ ...(type ? { type } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...extra }),
    [type, from, to]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/reports/earnings-ledger', { params: params({ page, limit }) });
      setRows(res.data.data || []);
      setSummary(res.data.summary);
      setTotal(res.data.pagination?.total || 0);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load the admin ledger');
    } finally {
      setLoading(false);
    }
  }, [params, page, limit]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    const res = await api.get('/admin/reports/earnings-ledger', { params: params({ page: 1, limit: 5000 }) });
    const all: Row[] = res.data.data || [];
    const head = ['Order No.', 'Date and time', 'Earning type', 'Credit amount', 'Opening balance', 'Closing balance', 'Remark'];
    const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(',')]
      .concat(all.map((r) => [r.orderNumber, fmtDate(r.date), r.type, r.amount, r.openingBalance, r.closingBalance, r.remark].map(q).join(',')))
      .join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
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
          <h2 className="text-lg font-semibold">Admin Ledger</h2>
          <p className="text-sm text-teal-100 mt-1">
            Exnshop&apos;s own earnings, order by order: platform fee, seller commission, delivery charge and ad clicks, less rider
            payouts and reversed commissions. Each row shows the balance before and after it.
          </p>
        </div>
        <div className="p-4 flex flex-wrap items-end gap-3 border-b border-neutral-200">
          <label className="text-xs text-neutral-600">
            Earning type
            <br />
            <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className={input}>
              <option value="">All</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-600">
            From
            <br />
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={input} />
          </label>
          <label className="text-xs text-neutral-600">
            To
            <br />
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={input} />
          </label>
          <button onClick={exportCsv} className="px-4 py-2 bg-teal-600 text-white rounded text-sm font-semibold hover:bg-teal-700">
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {card('Opening balance', money(summary.openingBalance))}
        {card('Earned (credit)', money(summary.credit), 'text-green-700')}
        {card('Paid out / reversed', money(-summary.debit), 'text-red-600')}
        {card('Closing balance', money(summary.closingBalance), summary.closingBalance < 0 ? 'text-red-600' : 'text-neutral-900')}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="p-3 text-left">Order No.</th>
              <th className="p-3 text-left">Date and time</th>
              <th className="p-3 text-left">Earning type</th>
              <th className="p-3 text-right">Credit amount</th>
              <th className="p-3 text-right">Opening balance</th>
              <th className="p-3 text-right">Closing balance</th>
              <th className="p-3 text-left">Remark</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-neutral-500">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="p-6 text-center text-red-600">{error}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-neutral-400">No earnings in this period.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.orderNumber}-${r.type}-${r.date}-${i}`} className="border-t border-neutral-100">
                  <td className="p-3 font-medium text-neutral-900 whitespace-nowrap">{r.orderNumber}</td>
                  <td className="p-3 whitespace-nowrap text-neutral-600">{fmtDate(r.date)}</td>
                  <td className="p-3 whitespace-nowrap">{r.type}</td>
                  <td className={`p-3 text-right whitespace-nowrap font-semibold ${r.amount < 0 ? 'text-red-600' : 'text-green-700'}`}>{money(r.amount)}</td>
                  <td className="p-3 text-right whitespace-nowrap text-neutral-600">{money(r.openingBalance)}</td>
                  <td className="p-3 text-right whitespace-nowrap font-medium">{money(r.closingBalance)}</td>
                  <td className="p-3 text-neutral-600 min-w-[220px]">{r.remark}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-neutral-600">
        <div className="flex items-center gap-2">
          Show
          <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} className={input}>
            {[20, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span>{total} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 border rounded disabled:opacity-40">Previous</button>
          <span>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 border rounded disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
