import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import api from '../../../services/api/config';

/* ───────────────────────── types ───────────────────────── */
type Card = { value: number; change: number };
type Overview = {
  range: { from: string; to: string };
  cards: { totalOrders: Card; totalSales: Card; totalGst: Card; totalReturns: Card; totalExchanges: Card };
  sales: { salesValue: number; gst: number; taxable: number; salesChange: number; gstChange: number };
  salesTrend: { day: string; salesValue: number; gst: number }[];
  sellerLedger: { sellerId: string; sellerName: string; totalSales: number; commission: number; gst: number; settlement: number; balance: number }[];
  customerLedger: { customerId: string; customerName: string; totalOrders: number; purchaseValue: number; refund: number; netAmount: number }[];
  commissionLedger: { period: string; totalSales: number; commissionPercent: number; commission: number; gstOnCommission: number }[];
  gstReconciliation: {
    totalSales: number;
    taxable: number;
    totalGst: number;
    invoiceGst: number;
    itemGst: number;
    returnedGst: number;
    difference: number;
    status: 'Matched' | 'Mismatch';
    byRate: { rate: number; taxable: number; gst: number; share: number }[];
  };
};
type Col<T> = { label: string; get: (r: T) => string | number; right?: boolean };

/* ───────────────────────── helpers ───────────────────────── */
const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const num = (n: number) => (Number(n) || 0).toLocaleString('en-IN');
const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const monthStart = () => `${todayIst().slice(0, 8)}01`;
const dd = (iso: string) => iso.split('-').reverse().join('-');
const RATE_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#7c3aed', '#0891b2', '#64748b'];

const csvOf = <T,>(title: string, cols: Col<T>[], rows: T[]) => {
  const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [q(title), cols.map((c) => q(c.label)).join(','), ...rows.map((r) => cols.map((c) => q(c.get(r))).join(','))].join('\n');
};
const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};
/** "Export PDF": opens the table in a print window; choose "Save as PDF" there. */
const printTable = <T,>(title: string, subtitle: string, cols: Col<T>[], rows: T[]) => {
  const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>body{font-family:system-ui,Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0}p{color:#555;font-size:12px;margin:4px 0 16px}
  table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f3f4f6}td.r,th.r{text-align:right}</style></head><body>
  <h1>${esc(title)}</h1><p>${esc(subtitle)}</p><table><thead><tr>${cols.map((c) => `<th class="${c.right ? 'r' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.right ? 'r' : ''}">${esc(c.get(r))}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
};

/* ───────────────────────── small UI pieces ───────────────────────── */
function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  if (!value) return <span className="text-xs text-neutral-400">— vs last period</span>;
  const up = value > 0;
  const good = invert ? !up : up;
  return (
    <span className={`text-xs font-semibold ${good ? 'text-green-600' : 'text-red-600'}`}>
      {up ? '↑' : '↓'} {Math.abs(value)}% <span className="font-normal text-neutral-400">vs last period</span>
    </span>
  );
}

function Kpi({ title, value, change, icon, tint, invert }: { title: string; value: string; change: number; icon: ReactNode; tint: string; invert?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${tint}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-neutral-500">{title}</p>
        <p className="text-xl font-bold text-neutral-900 truncate">{value}</p>
        <Delta value={change} invert={invert} />
      </div>
    </div>
  );
}

function Section({ n, title, subtitle, color, onView, children, actions }: { n: number; title: string; subtitle: string; color: string; onView?: () => void; children: ReactNode; actions: ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden flex flex-col">
      <div className={`${color} text-white px-4 py-3 flex items-center justify-between gap-2`}>
        <h2 className="text-base font-bold">{n}. {title}</h2>
        {onView && (
          <button onClick={onView} className="text-xs font-semibold hover:underline whitespace-nowrap">View Report →</button>
        )}
      </div>
      <p className="px-4 pt-3 text-sm font-semibold text-neutral-800">{subtitle}</p>
      <div className="p-4 pt-2 flex-1">{children}</div>
      <div className="px-4 pb-4 flex flex-wrap justify-center gap-2">{actions}</div>
    </section>
  );
}

const btn = 'px-3 py-1.5 rounded-md border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-xs font-semibold text-neutral-700';

function Table<T>({ cols, rows, empty, max }: { cols: Col<T>[]; rows: T[]; empty: string; max: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-neutral-200">
        <thead className="bg-neutral-50 text-xs text-neutral-600">
          <tr>{cols.map((c) => <th key={c.label} className={`px-3 py-2 border-b border-neutral-200 whitespace-nowrap ${c.right ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={cols.length} className="px-3 py-6 text-center text-neutral-400">{empty}</td></tr>
          ) : (
            rows.slice(0, max).map((r, i) => (
              <tr key={i} className="border-b border-neutral-100 last:border-b-0">
                {cols.map((c) => <td key={c.label} className={`px-3 py-2 whitespace-nowrap ${c.right ? 'text-right' : ''}`}>{c.get(r)}</td>)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── page ───────────────────────── */
export default function AdminReportsHub() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIst());
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sellerQ, setSellerQ] = useState('');
  const [customerQ, setCustomerQ] = useState('');
  const [showAll, setShowAll] = useState<{ sellers: boolean; customers: boolean }>({ sellers: false, customers: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/reports/overview', { params: { from, to } });
      setData(res.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load the reports');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const period = data ? `${dd(data.range.from)} to ${dd(data.range.to)}` : '';

  /* columns shared by the tables, CSV and PDF */
  const sellerCols: Col<Overview['sellerLedger'][number]>[] = [
    { label: 'Seller name', get: (r) => r.sellerName },
    { label: 'Total sales (₹)', get: (r) => num(r.totalSales), right: true },
    { label: 'Commission (₹)', get: (r) => num(r.commission), right: true },
    { label: 'GST (₹)', get: (r) => num(r.gst), right: true },
    { label: 'Settlement (₹)', get: (r) => num(r.settlement), right: true },
    { label: 'Balance now (₹)', get: (r) => num(r.balance), right: true },
  ];
  const customerCols: Col<Overview['customerLedger'][number]>[] = [
    { label: 'Customer name', get: (r) => r.customerName },
    { label: 'Total orders', get: (r) => r.totalOrders, right: true },
    { label: 'Purchase value (₹)', get: (r) => num(r.purchaseValue), right: true },
    { label: 'Refund (₹)', get: (r) => num(r.refund), right: true },
    { label: 'Net amount (₹)', get: (r) => num(r.netAmount), right: true },
  ];
  const commissionCols: Col<Overview['commissionLedger'][number]>[] = [
    { label: 'Period', get: (r) => r.period },
    { label: 'Total sales (₹)', get: (r) => num(r.totalSales), right: true },
    { label: 'Commission %', get: (r) => `${r.commissionPercent}%`, right: true },
    { label: 'Commission (₹)', get: (r) => num(r.commission), right: true },
    { label: 'GST on commission (₹)', get: (r) => num(r.gstOnCommission), right: true },
  ];
  const salesCols: Col<Overview['salesTrend'][number]>[] = [
    { label: 'Date', get: (r) => dd(r.day) },
    { label: 'Sales value (₹)', get: (r) => num(r.salesValue), right: true },
    { label: 'GST (₹)', get: (r) => num(r.gst), right: true },
  ];
  const gstCols: Col<Overview['gstReconciliation']['byRate'][number]>[] = [
    { label: 'GST rate', get: (r) => `${r.rate}%` },
    { label: 'Taxable value (₹)', get: (r) => num(r.taxable), right: true },
    { label: 'GST (₹)', get: (r) => num(r.gst), right: true },
    { label: 'Share of GST', get: (r) => `${r.share}%`, right: true },
  ];

  const sellers = useMemo(
    () => (data?.sellerLedger || []).filter((r) => r.sellerName.toLowerCase().includes(sellerQ.trim().toLowerCase())),
    [data, sellerQ]
  );
  const customers = useMemo(
    () => (data?.customerLedger || []).filter((r) => r.customerName.toLowerCase().includes(customerQ.trim().toLowerCase())),
    [data, customerQ]
  );

  const downloadAll = () => {
    if (!data) return;
    const g = data.gstReconciliation;
    const parts = [
      `"EXN Marketplace reports",${JSON.stringify(period)}`,
      csvOf('Summary', [{ label: 'Metric', get: (r: any) => r[0] }, { label: 'Value', get: (r: any) => r[1] }, { label: 'Change vs last period', get: (r: any) => r[2] }], [
        ['Total orders', data.cards.totalOrders.value, `${data.cards.totalOrders.change}%`],
        ['Total sales value (₹)', data.cards.totalSales.value, `${data.cards.totalSales.change}%`],
        ['Total GST (₹)', data.cards.totalGst.value, `${data.cards.totalGst.change}%`],
        ['Total returns', data.cards.totalReturns.value, `${data.cards.totalReturns.change}%`],
        ['Total exchanges', data.cards.totalExchanges.value, `${data.cards.totalExchanges.change}%`],
      ]),
      csvOf('1. Sales report (day by day)', salesCols, data.salesTrend),
      csvOf('2. Seller ledger', sellerCols, data.sellerLedger),
      csvOf('3. Customer ledger', customerCols, data.customerLedger),
      csvOf('4. Commission ledger', commissionCols, data.commissionLedger),
      csvOf('5. GST by rate', gstCols, g.byRate),
      csvOf('5. GST reconciliation', [{ label: 'Item', get: (r: any) => r[0] }, { label: 'Value', get: (r: any) => r[1] }], [
        ['Status', g.status],
        ['Total sales (₹)', g.totalSales],
        ['Taxable value (₹)', g.taxable],
        ['GST on sales (₹)', g.totalGst],
        ['GST on invoices (₹)', g.invoiceGst],
        ['GST on all invoiced items (₹)', g.itemGst],
        ['GST of returned / cancelled items (₹)', g.returnedGst],
        ['Difference (₹)', g.difference],
      ]),
    ];
    download(`exn-reports-${data.range.from}-to-${data.range.to}.csv`, parts.join('\n\n'));
  };

  const input = 'border border-neutral-300 rounded-md px-2 py-1.5 text-sm bg-white text-neutral-800';

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full space-y-4">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-blue-900 to-blue-700 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">EXN Marketplace – Admin Reports</h1>
          <p className="text-sm text-blue-100">Complete business &amp; GST compliance reports</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-blue-100">From<br /><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={input} /></label>
          <label className="text-[11px] text-blue-100">To<br /><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={input} /></label>
          <button onClick={downloadAll} disabled={!data} className="px-4 py-2 rounded-md bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold disabled:opacity-50">
            ⬇ Download All
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
      {loading && !data && <div className="text-center text-neutral-500 py-10">Loading reports…</div>}

      {data && (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi title="Total Orders" value={num(data.cards.totalOrders.value)} change={data.cards.totalOrders.change} tint="bg-blue-50 text-blue-600" icon={<span className="text-lg">🛒</span>} />
            <Kpi title="Total Sales Value" value={inr(data.cards.totalSales.value)} change={data.cards.totalSales.change} tint="bg-green-50 text-green-600" icon={<span className="text-lg font-bold">₹</span>} />
            <Kpi title="Total GST Amount" value={inr(data.cards.totalGst.value)} change={data.cards.totalGst.change} tint="bg-purple-50 text-purple-600" icon={<span className="text-lg font-bold">₹</span>} />
            <Kpi title="Total Returns" value={num(data.cards.totalReturns.value)} change={data.cards.totalReturns.change} invert tint="bg-orange-50 text-orange-600" icon={<span className="text-lg">↩</span>} />
            <Kpi title="Total Exchanges" value={num(data.cards.totalExchanges.value)} change={data.cards.totalExchanges.change} invert tint="bg-sky-50 text-sky-600" icon={<span className="text-lg">⇄</span>} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* 1. Sales report */}
            <Section
              n={1}
              title="Sales Report"
              subtitle="Complete sales summary with GST details"
              color="bg-blue-900"
              onView={() => navigate('/admin/reports/sales')}
              actions={
                <>
                  <button className={btn} onClick={() => download(`sales-${data.range.from}-to-${data.range.to}.csv`, csvOf('Sales report', salesCols, data.salesTrend))}>Export Excel</button>
                  <button className={btn} onClick={() => printTable('Sales report', period, salesCols, data.salesTrend)}>Export PDF</button>
                </>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.salesTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(8) + '/' + d.slice(5, 7)} tick={{ fontSize: 10 }} minTickGap={16} />
                      <YAxis tick={{ fontSize: 10 }} width={48} />
                      <Tooltip formatter={(v: any) => inr(Number(v))} labelFormatter={(d: any) => dd(String(d))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="salesValue" name="Sales value" stroke="#2563eb" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="gst" name="GST amount" stroke="#16a34a" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 space-y-3">
                  <div><p className="text-xs text-neutral-600">Sales value</p><p className="text-lg font-bold">{inr(data.sales.salesValue)}</p><Delta value={data.sales.salesChange} /></div>
                  <div className="border-t border-blue-100 pt-2"><p className="text-xs text-neutral-600">GST amount</p><p className="text-lg font-bold">{inr(data.sales.gst)}</p><Delta value={data.sales.gstChange} /></div>
                  <div className="border-t border-blue-100 pt-2"><p className="text-xs text-neutral-600">Taxable value</p><p className="text-lg font-bold">{inr(data.sales.taxable)}</p></div>
                </div>
              </div>
            </Section>

            {/* 2. Seller ledger */}
            <Section
              n={2}
              title="Seller Ledger"
              subtitle="Seller-wise sales, settlement and balance"
              color="bg-green-700"
              onView={() => navigate('/admin/reports/ledger')}
              actions={
                <>
                  <input value={sellerQ} onChange={(e) => setSellerQ(e.target.value)} placeholder="Filter seller" className="px-2 py-1.5 rounded-md border border-neutral-200 text-xs w-32" />
                  {sellers.length > 5 && <button className={btn} onClick={() => setShowAll((s) => ({ ...s, sellers: !s.sellers }))}>{showAll.sellers ? 'Show top 5' : `Show all ${sellers.length}`}</button>}
                  <button className={btn} onClick={() => download(`seller-ledger-${data.range.from}-to-${data.range.to}.csv`, csvOf('Seller ledger', sellerCols, sellers))}>Export Excel</button>
                  <button className={btn} onClick={() => printTable('Seller ledger', period, sellerCols, sellers)}>Export PDF</button>
                </>
              }
            >
              <Table cols={sellerCols} rows={sellers} empty="No seller sales in this period." max={showAll.sellers ? 1000 : 5} />
              <p className="mt-2 text-[11px] text-neutral-500">Settlement = sales before GST − commission − courier charge. Balance is the seller&apos;s wallet now (available + on hold).</p>
            </Section>

            {/* 3. Customer ledger */}
            <Section
              n={3}
              title="Customer Ledger"
              subtitle="Customer-wise purchase and refund history"
              color="bg-purple-700"
              onView={() => navigate('/admin/reports/ledger')}
              actions={
                <>
                  <input value={customerQ} onChange={(e) => setCustomerQ(e.target.value)} placeholder="Filter customer" className="px-2 py-1.5 rounded-md border border-neutral-200 text-xs w-32" />
                  {customers.length > 5 && <button className={btn} onClick={() => setShowAll((s) => ({ ...s, customers: !s.customers }))}>{showAll.customers ? 'Show top 5' : `Show all ${customers.length}`}</button>}
                  <button className={btn} onClick={() => download(`customer-ledger-${data.range.from}-to-${data.range.to}.csv`, csvOf('Customer ledger', customerCols, customers))}>Export Excel</button>
                  <button className={btn} onClick={() => printTable('Customer ledger', period, customerCols, customers)}>Export PDF</button>
                </>
              }
            >
              <Table cols={customerCols} rows={customers} empty="No customer purchases in this period." max={showAll.customers ? 1000 : 5} />
            </Section>

            {/* 4. Commission ledger */}
            <Section
              n={4}
              title="Commission Ledger"
              subtitle="Marketplace commission details (last 6 months up to the end date)"
              color="bg-orange-600"
              onView={() => navigate('/admin/reports/admin-ledger')}
              actions={
                <>
                  <button className={btn} onClick={() => download(`commission-ledger-${data.range.to}.csv`, csvOf('Commission ledger', commissionCols, data.commissionLedger))}>Export Excel</button>
                  <button className={btn} onClick={() => printTable('Commission ledger', `6 months up to ${dd(data.range.to)}`, commissionCols, data.commissionLedger)}>Export PDF</button>
                </>
              }
            >
              <Table cols={commissionCols} rows={data.commissionLedger} empty="No commission yet." max={6} />
              <p className="mt-2 text-[11px] text-neutral-500">Total sales are before GST. GST on commission is 18% of the commission.</p>
            </Section>
          </div>

          {/* 5. GST reconciliation */}
          <Section
            n={5}
            title="GST Reconciliation"
            subtitle="GST on sales checked against the GST charged on order invoices (use for GSTR-1 / GSTR-3B)"
            color="bg-teal-700"
            onView={() => navigate('/admin/reports/sales')}
            actions={
              <>
                <button className={btn} onClick={() => download(`gst-${data.range.from}-to-${data.range.to}.csv`, csvOf('GST by rate', gstCols, data.gstReconciliation.byRate))}>Export Excel</button>
                <button className={btn} onClick={() => printTable('GST by rate', period, gstCols, data.gstReconciliation.byRate)}>Export PDF</button>
              </>
            }
          >
            {(() => {
              const g = data.gstReconciliation;
              const ok = g.status === 'Matched';
              return (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                  <div className={`lg:col-span-3 rounded-lg border p-4 ${ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-sm text-neutral-700">Reconciliation status</p>
                    <p className={`text-2xl font-bold mt-1 ${ok ? 'text-green-700' : 'text-red-700'}`}>{ok ? '✓ Matched' : '✗ Mismatch'}</p>
                    <p className="text-xs text-neutral-600 mt-1">
                      {ok ? 'GST on the invoices equals the GST of their items.' : `Invoices and items differ by ${inr(g.difference)}. Check those orders.`}
                    </p>
                  </div>
                  <div className="lg:col-span-5 grid grid-cols-2 gap-2">
                    {[
                      ['Total sales', g.totalSales],
                      ['GST on sales', g.totalGst],
                      ['GST on invoices', g.invoiceGst],
                      ['Difference', g.difference],
                    ].map(([label, v]) => (
                      <div key={String(label)} className="rounded-lg border border-neutral-200 p-3">
                        <p className="text-xs text-neutral-500">{label}</p>
                        <p className="text-lg font-bold">{inr(Number(v))}</p>
                      </div>
                    ))}
                    {g.returnedGst > 0 && (
                      <p className="col-span-2 text-[11px] text-neutral-500">GST of returned / cancelled items on these invoices: {inr(g.returnedGst)} (issue credit notes for these).</p>
                    )}
                  </div>
                  <div className="lg:col-span-4 rounded-lg border border-neutral-200 p-3">
                    <p className="text-sm font-semibold text-neutral-800">GST summary by rate</p>
                    {g.byRate.length === 0 ? (
                      <p className="text-xs text-neutral-400 mt-4">No sales in this period.</p>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-32 flex-shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={g.byRate.map((r) => ({ name: `${r.rate}%`, value: r.gst > 0 ? r.gst : r.taxable }))} dataKey="value" innerRadius={34} outerRadius={56} paddingAngle={1}>
                                {g.byRate.map((_, i) => <Cell key={i} fill={RATE_COLORS[i % RATE_COLORS.length]} />)}
                              </Pie>
                              <Tooltip formatter={(v: any) => inr(Number(v))} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <ul className="text-xs space-y-1">
                          {g.byRate.map((r, i) => (
                            <li key={r.rate} className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: RATE_COLORS[i % RATE_COLORS.length] }} />
                              <span className="w-10 font-semibold">{r.rate}%</span>
                              <span className="text-neutral-600">{inr(r.gst)} · {r.share}%</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </Section>
        </div>
      )}
    </div>
  );
}
