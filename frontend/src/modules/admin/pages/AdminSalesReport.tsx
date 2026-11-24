import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../services/api/config';

/**
 * Admin > Reports > Sales Report: one row per order and seller with the sales value,
 * GST split into CGST + SGST (same state) or IGST (different states), returns and
 * exchanges, and a remark.
 */
const money = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

interface Row {
  orderId: string;
  orderNumber: string;
  date: string;
  sellerId: string;
  sellerName: string;
  customerName: string;
  salesValue: number;
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  igst: number;
  returns: number;
  returnValue: number;
  exchanges: number;
  exchangeValue: number;
  remark: string;
}
interface Totals { orders: number; salesValue: number; gst: number; cgst: number; sgst: number; igst: number; returns: number; exchanges: number }

const STATUS = [
  ['', 'Sales (default)'],
  ['Delivered', 'Delivered'],
  ['InProgress', 'In progress'],
  ['Returned', 'Returned / RTO'],
  ['Cancelled', 'Cancelled / Rejected'],
  ['All', 'All orders'],
];

const returnsText = (r: Row) => {
  const parts: string[] = [];
  if (r.returns) parts.push(`${r.returns} return${r.returns > 1 ? 's' : ''} (${money(r.returnValue)})`);
  if (r.exchanges) parts.push(`${r.exchanges} exchange${r.exchanges > 1 ? 's' : ''} (${money(r.exchangeValue)})`);
  return parts.join(', ') || '—';
};

export default function AdminSalesReport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals>({ orders: 0, salesValue: 0, gst: 0, cgst: 0, sgst: 0, igst: 0, returns: 0, exchanges: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = useCallback(
    (extra: Record<string, any> = {}) => ({
      from: from || undefined,
      to: to || undefined,
      channel: channel || undefined,
      status: status || undefined,
      search: search || undefined,
      ...extra,
    }),
    [from, to, channel, status, search]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/reports/sales-orders', { params: params({ page, limit }) });
      setRows(res.data.data || []);
      setTotals(res.data.totals);
      setTotal(res.data.pagination?.total || 0);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load the sales report');
    } finally {
      setLoading(false);
    }
  }, [params, page, limit]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const exportCsv = async () => {
    const res = await api.get('/admin/reports/sales-orders', { params: params({ page: 1, limit: 5000 }) });
    const all: Row[] = res.data.data || [];
    const head = ['Order No.', 'Date and time', 'Seller ID', 'Seller name', 'Customer', 'Sales value', 'Taxable value', 'GST amount', 'CGST', 'SGST', 'IGST', 'Returns', 'Return value', 'Exchanges', 'Exchange value', 'Remark'];
    const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(',')]
      .concat(
        all.map((r) =>
          [r.orderNumber, fmtDate(r.date), r.sellerId, r.sellerName, r.customerName, r.salesValue, r.taxable, r.gst, r.cgst, r.sgst, r.igst, r.returns, r.returnValue, r.exchanges, r.exchangeValue, r.remark]
            .map(q)
            .join(',')
        )
      )
      .join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pages = Math.max(1, Math.ceil(total / limit));
  const card = (label: string, value: string) => (
    <div className="bg-white border border-neutral-200 rounded-lg p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-base font-semibold text-neutral-900 mt-1">{value}</p>
    </div>
  );
  const input = 'border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white';
  const head = ['Order No.', 'Date and time', 'Seller ID', 'Sales value', 'GST amount', 'CGST', 'SGST', 'IGST', 'Returns & exchanges', 'Remark'];
  const right = ['Sales value', 'GST amount', 'CGST', 'SGST', 'IGST'];

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="bg-teal-600 text-white px-5 py-4">
          <h2 className="text-lg font-semibold">Sales Report</h2>
          <p className="text-sm text-teal-100 mt-1">
            One row per order and seller. GST is split as CGST + SGST when the seller and the customer are in the same state, and as IGST
            when they are in different states.
          </p>
        </div>
        <div className="p-4 flex flex-wrap items-end gap-3 border-b border-neutral-200">
          <label className="text-xs text-neutral-600">From<br /><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={input} /></label>
          <label className="text-xs text-neutral-600">To<br /><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={input} /></label>
          <label className="text-xs text-neutral-600">Channel<br />
            <select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }} className={input}>
              <option value="">All</option>
              <option value="Quick">Quick</option>
              <option value="ECommerce">E-Commerce</option>
            </select>
          </label>
          <label className="text-xs text-neutral-600">Orders<br />
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={input}>
              {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="text-xs text-neutral-600 flex-1 min-w-[180px]">Search<br />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Order no., seller name or ID, customer" className={`${input} w-full`} />
          </label>
          <button onClick={exportCsv} className="px-4 py-2 bg-teal-600 text-white rounded text-sm font-semibold hover:bg-teal-700">Export CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {card('Orders', String(totals.orders))}
        {card('Sales value', money(totals.salesValue))}
        {card('GST amount', money(totals.gst))}
        {card('CGST', money(totals.cgst))}
        {card('SGST', money(totals.sgst))}
        {card('IGST', money(totals.igst))}
        {card('Returns', String(totals.returns))}
        {card('Exchanges', String(totals.exchanges))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              {head.map((h) => (
                <th key={h} className={`p-3 whitespace-nowrap ${right.includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={head.length} className="p-8 text-center text-neutral-500">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={head.length} className="p-8 text-center text-red-600">{error}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={head.length} className="p-8 text-center text-neutral-400">No orders for these filters.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.orderId}-${r.sellerId}`} className="border-t border-neutral-100 align-top">
                  <td className="p-3 whitespace-nowrap">
                    <Link to={`/admin/orders/${r.orderId}`} className="text-teal-700 font-medium hover:underline">{r.orderNumber}</Link>
                    {r.customerName && <div className="text-[11px] text-neutral-400">{r.customerName}</div>}
                  </td>
                  <td className="p-3 whitespace-nowrap text-neutral-600">{fmtDate(r.date)}</td>
                  <td className="p-3 whitespace-nowrap">
                    <div className="font-medium text-neutral-900">{r.sellerName}</div>
                    <div className="font-mono text-[10px] text-neutral-400">{r.sellerId}</div>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap font-semibold">{money(r.salesValue)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{money(r.gst)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{r.cgst ? money(r.cgst) : '—'}</td>
                  <td className="p-3 text-right whitespace-nowrap">{r.sgst ? money(r.sgst) : '—'}</td>
                  <td className="p-3 text-right whitespace-nowrap">{r.igst ? money(r.igst) : '—'}</td>
                  <td className={`p-3 whitespace-nowrap ${r.returns || r.exchanges ? 'text-orange-700 font-medium' : 'text-neutral-400'}`}>{returnsText(r)}</td>
                  <td className="p-3 text-xs text-neutral-600 min-w-[220px]">{r.remark}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-3 border-t border-neutral-200 text-sm">
          <span className="text-neutral-600">
            {total} rows · Show
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
