import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSettlementOrders, type SettlementOrderItem } from '../../../services/api/orderService';
import {
  getSettlementReport,
  type PaymentSummary,
  type SettlementRow,
  type SettlementStatus,
} from '../../../services/api/sellerWalletService';

const STATUS_FLOW: { status: SettlementStatus; hint: string }[] = [
  { status: 'Pending', hint: 'Order not delivered yet' },
  { status: 'Processing', hint: 'Delivered, return window open' },
  { status: 'Settled', hint: 'Credited to your wallet' },
  { status: 'Paid', hint: 'Withdrawn to your bank' },
];

const STATUS_STYLES: Record<SettlementStatus, string> = {
  Pending: 'bg-neutral-100 text-neutral-700',
  Processing: 'bg-amber-100 text-amber-800',
  Settled: 'bg-blue-100 text-blue-800',
  Paid: 'bg-green-100 text-green-800',
  Cancelled: 'bg-red-50 text-red-700',
};

const inr = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function SettlementReport() {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await getSettlementReport({ status, from: from || undefined, to: to || undefined, page, limit: 20 });
        if (res.success) {
          setSummary(res.data.summary);
          setRows(res.data.rows);
          setPages(res.data.pagination.pages);
          setTotal(res.data.pagination.total);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [status, from, to, page]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await getSettlementReport({ status, from: from || undefined, to: to || undefined, page: 1, limit: 500 });
      const header = ['Date', 'Order ID', 'Gross Amount', 'Deductions', 'Net Amount', 'Settlement ID', 'Status', 'Payment Date', 'Bank Reference'];
      const lines = res.data.rows.map((r) =>
        [
          fmtDate(r.date),
          r.orderNumber,
          r.grossAmount.toFixed(2),
          r.deductions.toFixed(2),
          r.netAmount.toFixed(2),
          r.settlementId,
          r.status,
          fmtDate(r.paymentDate),
          r.bankReference || '',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      );
      const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `settlement-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const cards: { label: string; value: number; tone: string; note?: string }[] = summary
    ? [
        { label: 'Total Sales', value: summary.totalSales, tone: 'text-neutral-900' },
        { label: 'Delivered Sales', value: summary.deliveredSales, tone: 'text-neutral-900' },
        { label: 'Pending Settlement', value: summary.pendingSettlement, tone: 'text-amber-700', note: 'Pending + Processing' },
        { label: 'Settled to Wallet', value: summary.settledToWallet, tone: 'text-blue-700', note: 'Ready to withdraw' },
        { label: 'Paid Settlement', value: summary.paidToBank, tone: 'text-green-700', note: 'Withdrawn to bank' },
        { label: 'Refunds', value: summary.refunds, tone: 'text-red-700', note: 'Customer returns' },
      ]
    : [];

  const inputCls = 'px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-neutral-200 p-4">
            <p className="text-xs text-neutral-500">{c.label}</p>
            <p className={`text-lg font-bold mt-1 ${c.tone}`}>{inr(c.value)}</p>
            {c.note && <p className="text-[11px] text-neutral-400 mt-0.5">{c.note}</p>}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Settlement status flow</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {STATUS_FLOW.map((s, i) => (
            <div key={s.status} className="flex items-center gap-2">
              <div className="flex flex-col">
                <span className={`px-2 py-0.5 rounded-full font-semibold w-fit ${STATUS_STYLES[s.status]}`}>{s.status}</span>
                <span className="text-[11px] text-neutral-400 mt-0.5">{s.hint}</span>
              </div>
              {i < STATUS_FLOW.length - 1 && <span className="text-neutral-300">→</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-neutral-500">
              Status
              <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={`${inputCls} block mt-1`}>
                <option value="All">All</option>
                {(['Pending', 'Processing', 'Settled', 'Paid', 'Cancelled'] as SettlementStatus[]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-neutral-500">
              From
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={`${inputCls} block mt-1`} />
            </label>
            <label className="text-xs text-neutral-500">
              To
              <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={`${inputCls} block mt-1`} />
            </label>
          </div>
          <button
            onClick={exportCsv}
            disabled={exporting || total === 0}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">No settlements found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr className="text-xs font-semibold text-neutral-600 uppercase">
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-left py-3 px-4">Order ID</th>
                  <th className="text-right py-3 px-4">Gross</th>
                  <th className="text-right py-3 px-4">Deductions</th>
                  <th className="text-right py-3 px-4">Net</th>
                  <th className="text-left py-3 px-4">Settlement ID</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Payment Date</th>
                  <th className="text-left py-3 px-4">Bank Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => (
                  <tr key={r.settlementId} className="hover:bg-neutral-50/50">
                    <td className="py-3 px-4 whitespace-nowrap text-neutral-600">{fmtDate(r.date)}</td>
                    <td className="py-3 px-4 font-medium text-neutral-900">{r.orderNumber}</td>
                    <td className="py-3 px-4 text-right">{inr(r.grossAmount)}</td>
                    <td className="py-3 px-4 text-right text-red-600">−{inr(r.deductions)}</td>
                    <td className="py-3 px-4 text-right font-semibold">{inr(r.netAmount)}</td>
                    <td className="py-3 px-4 font-mono text-xs text-neutral-600">{r.settlementId}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                      {r.status === 'Processing' && r.expectedSettlementDate && (
                        <p className="text-[11px] text-neutral-400 mt-0.5">Settles {fmtDate(r.expectedSettlementDate)}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-neutral-600">{fmtDate(r.paymentDate)}</td>
                    <td className="py-3 px-4 font-mono text-xs text-neutral-600">{r.bankReference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
            <p className="text-sm text-neutral-600">Page {page} of {pages} ({total} settlements)</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 border border-neutral-300 rounded-lg text-sm disabled:opacity-50">Previous</button>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="px-3 py-1 border border-neutral-300 rounded-lg text-sm disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-neutral-400">
        Deductions are the platform commission on each order. Bank withdrawals are matched to settled orders oldest-first to show which orders have been paid out.
      </p>
    </div>
  );
}

function CodOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<SettlementOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [settlementFilter, setSettlementFilter] = useState<'pending' | 'settled' | 'all'>('pending');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await getSettlementOrders({ page, limit: 15, settlementStatus: settlementFilter });
        if (res.success && res.data) {
          setOrders(res.data.orders);
          setTotal(res.data.total);
          setPages(res.data.pages);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [page, settlementFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-neutral-600">
          Delivered COD orders. Pending = admin hasn&apos;t confirmed receiving this COD cash yet.
        </p>
        <select
          value={settlementFilter}
          onChange={(e) => { setSettlementFilter(e.target.value as 'pending' | 'settled' | 'all'); setPage(1); }}
          className="px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
        >
          <option value="pending">Pending payment (COD not paid to admin)</option>
          <option value="settled">Settled (COD already paid to admin)</option>
          <option value="all">All COD</option>
        </select>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-neutral-500">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">No delivered COD orders found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase">Order</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-neutral-600 uppercase">Date</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-neutral-600 uppercase">Total</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-neutral-600 uppercase">Pay admin (COD)</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-neutral-600 uppercase">Your earning</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-neutral-600 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {orders.map(({ order, codBreakdown }) => (
                  <tr key={order._id} className="hover:bg-neutral-50/50">
                    <td className="py-3 px-4 font-medium text-neutral-900">{order.orderNumber}</td>
                    <td className="py-3 px-4 text-sm text-neutral-600">{fmtDate(order.orderDate)}</td>
                    <td className="py-3 px-4 text-right font-medium">₹{order.total?.toFixed(2) ?? '0.00'}</td>
                    <td className="py-3 px-4 text-right">
                      {codBreakdown ? <span className="font-semibold text-teal-700">₹{(codBreakdown.totalAdminEarning ?? 0).toFixed(2)}</span> : <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {codBreakdown ? <span className="font-semibold text-green-700">₹{(codBreakdown.yourEarning ?? 0).toFixed(2)}</span> : <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => navigate(`/seller/orders/${order._id}`)} className="text-teal-600 hover:text-teal-700 text-sm font-medium">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
            <p className="text-sm text-neutral-600">Page {page} of {pages} ({total} orders)</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 border border-neutral-300 rounded-lg text-sm disabled:opacity-50">Previous</button>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="px-3 py-1 border border-neutral-300 rounded-lg text-sm disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SellerSettlement() {
  const [tab, setTab] = useState<'report' | 'cod'>('report');
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-neutral-900">Payments & Settlement</h1>
        <p className="text-neutral-600 mt-1 text-sm">Your sales, deductions and where each order&apos;s payout stands.</p>
      </div>
      <div className="flex gap-1 mb-5 border-b border-neutral-200">
        {([['report', 'Settlement Report'], ['cod', 'COD Orders']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${tab === key ? 'border-teal-600 text-teal-700' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'report' ? <SettlementReport /> : <CodOrders />}
    </div>
  );
}
