import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../services/api/config';

/** Admin > Finance > Sales Report: every order line across all sellers, with GST and commission. */
const money = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

interface Row {
  _id: string; date: string; orderId?: string; orderNumber?: string; channel?: string; paymentMethod?: string; paymentStatus?: string;
  orderStatus?: string; customerName?: string; seller?: string; productName: string; sku?: string; variation?: string;
  quantity: number; total: number; gstAmount?: number; commissionAmount?: number; status: string;
}
interface Totals { grossSales: number; gst: number; commission: number; shipping: number; units: number; orders: number }

export default function AdminSalesReport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals>({ grossSales: 0, gst: 0, commission: 0, shipping: 0, units: 0, orders: 0 });
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
    (extra: Record<string, any> = {}) => ({ from: from || undefined, to: to || undefined, channel: channel || undefined, status: status || undefined, search: search || undefined, ...extra }),
    [from, to, channel, status, search]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/reports/sales', { params: params({ page, limit }) });
      setRows(res.data.data.rows);
      setTotals(res.data.data.totals);
      setTotal(res.data.pagination.total);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load the sales report');
    } finally {
      setLoading(false);
    }
  }, [params, page, limit]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    const res = await api.get('/admin/reports/sales', { params: params({ page: 1, limit: 5000 }) });
    const all: Row[] = res.data.data.rows;
    const head = ['Date', 'Order', 'Channel', 'Seller', 'Customer', 'Product', 'SKU', 'Variation', 'Qty', 'Amount', 'GST', 'Commission', 'Payment', 'Payment status', 'Item status'];
    const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(',')]
      .concat(all.map((r) => [fmtDate(r.date), r.orderNumber, r.channel, r.seller, r.customerName, r.productName, r.sku, r.variation, r.quantity, r.total, r.gstAmount || 0, r.commissionAmount || 0, r.paymentMethod, r.paymentStatus, r.status].map(q).join(',')))
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
    <div className="bg-white border border-neutral-200 rounded-lg p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-lg font-semibold text-neutral-900 mt-1">{value}</p>
    </div>
  );
  const input = 'border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white';

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="bg-teal-600 text-white px-5 py-4">
          <h2 className="text-lg font-semibold">Sales Report</h2>
          <p className="text-sm text-teal-100 mt-1">Every order line across all sellers. Totals leave out cancelled, returned and RTO items.</p>
        </div>
        <div className="p-4 flex flex-wrap items-end gap-3 border-b border-neutral-200">
          <label className="text-xs text-neutral-600">From<br /><input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={input} /></label>
          <label className="text-xs text-neutral-600">To<br /><input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={input} /></label>
          <label className="text-xs text-neutral-600">Channel<br />
            <select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }} className={input}>
              <option value="">All</option><option value="Quick">Quick</option><option value="ECommerce">E-Commerce</option>
            </select>
          </label>
          <label className="text-xs text-neutral-600">Item status<br />
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={input}>
              <option value="">All</option>
              {['Pending', 'Shipped', 'Delivered', 'Cancelled', 'Returned', 'RTO'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs text-neutral-600 flex-1 min-w-[180px]">Search<br />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Order no., product, SKU, seller" className={`${input} w-full`} />
          </label>
          <button onClick={exportCsv} className="px-4 py-2 bg-teal-600 text-white rounded text-sm font-semibold hover:bg-teal-700">Export CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {card('Gross sales', money(totals.grossSales))}
        {card('Orders', String(totals.orders))}
        {card('Units sold', String(totals.units))}
        {card('GST', money(totals.gst))}
        {card('Commission', money(totals.commission))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              {['Date', 'Order', 'Seller', 'Product', 'SKU', 'Qty', 'Amount', 'GST', 'Commission', 'Payment', 'Status'].map((h) => (
                <th key={h} className={`p-3 ${['Qty', 'Amount', 'GST', 'Commission'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="p-8 text-center text-neutral-500">Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={11} className="p-8 text-center text-red-600">{error}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} className="p-8 text-center text-neutral-400">No sales for these filters.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r._id} className="border-t border-neutral-100">
                  <td className="p-3 whitespace-nowrap text-neutral-600">{fmtDate(r.date)}</td>
                  <td className="p-3 whitespace-nowrap">
                    {r.orderId ? <Link to={`/admin/orders/${r.orderId}`} className="text-teal-700 hover:underline">{r.orderNumber}</Link> : r.orderNumber}
                    <div className="text-[11px] text-neutral-400">{r.channel === 'ECommerce' ? 'E-Commerce' : r.channel}</div>
                  </td>
                  <td className="p-3">{r.seller || '—'}</td>
                  <td className="p-3">{r.productName}{r.variation ? <span className="text-neutral-400"> · {r.variation}</span> : null}</td>
                  <td className="p-3 font-mono text-xs whitespace-nowrap">{r.sku || '—'}</td>
                  <td className="p-3 text-right">{r.quantity}</td>
                  <td className="p-3 text-right">{money(r.total)}</td>
                  <td className="p-3 text-right">{money(r.gstAmount || 0)}</td>
                  <td className="p-3 text-right">{money(r.commissionAmount || 0)}</td>
                  <td className="p-3 whitespace-nowrap">{r.paymentMethod}<div className="text-[11px] text-neutral-400">{r.paymentMethod === 'COD' && r.paymentStatus !== 'Paid' ? 'cash on delivery' : r.paymentStatus}</div></td>
                  <td className="p-3">{r.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-3 border-t border-neutral-200 text-sm">
          <span className="text-neutral-600">
            {total} lines · Rows
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
