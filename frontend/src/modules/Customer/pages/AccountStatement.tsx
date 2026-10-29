import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../../context/ToastContext';
import { getCustomerStatement, StatementEntry, StatementSummary } from '../../../services/api/customerWalletService';

/**
 * Account statement: a ledger of every payment, refund, wallet credit/debit and
 * bank transfer on the customer's account, with a summary and filters.
 */
type Filter = 'all' | 'payments' | 'refunds' | 'wallet' | 'bank';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'payments', label: 'Payments' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'bank', label: 'Bank transfers' },
];

const money = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const matches = (e: StatementEntry, f: Filter) => {
  if (f === 'payments') return e.kind === 'Order payment';
  if (f === 'refunds') return /refund/i.test(e.kind);
  if (f === 'wallet') return e.mode === 'Wallet';
  if (f === 'bank') return e.kind === 'Transfer to bank';
  return true;
};

const statusPill: Record<string, string> = {
  Completed: 'bg-green-50 text-green-700 border-green-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
};

export default function AccountStatement() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<StatementSummary | null>(null);
  const [entries, setEntries] = useState<StatementEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    (async () => {
      try {
        const res = await getCustomerStatement();
        if (res.success) {
          setSummary(res.data.summary);
          setEntries(res.data.entries);
        }
      } catch (err: any) {
        showToast(err?.response?.data?.message || 'Could not load your statement', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const shown = useMemo(() => entries.filter((e) => matches(e, filter)), [entries, filter]);

  // Group rows by month, newest first.
  const groups = useMemo(() => {
    const out: { month: string; rows: StatementEntry[] }[] = [];
    shown.forEach((e) => {
      const month = new Date(e.date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const last = out[out.length - 1];
      if (last && last.month === month) last.rows.push(e);
      else out.push({ month, rows: [e] });
    });
    return out;
  }, [shown]);

  const downloadCsv = () => {
    const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const head = ['Date', 'Type', 'Category', 'Mode', 'Description', 'Debit', 'Credit', 'Status'];
    const lines = shown.map((e) => [
      new Date(e.date).toLocaleString('en-IN'),
      e.type,
      e.kind,
      e.mode,
      e.description,
      e.type === 'Debit' ? e.amount.toFixed(2) : '',
      e.type === 'Credit' ? e.amount.toFixed(2) : '',
      e.status,
    ]);
    const csv = [head, ...lines].map((l) => l.map((c) => cell(String(c))).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `exnshop-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3.5 flex items-center gap-3 max-w-3xl mx-auto">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-gray-100 rounded-full" aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1">Account Statement</h1>
          {entries.length > 0 && (
            <button onClick={downloadCsv} className="text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg">Download</button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4">
        {/* Summary */}
        {summary && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Wallet balance', value: summary.walletBalance, cls: 'text-emerald-700', to: '/account/wallet' },
              { label: 'Total paid', value: summary.totalPaid, cls: 'text-gray-900' },
              { label: 'Total refunded', value: summary.totalRefunded, cls: 'text-green-700' },
              { label: 'Bank transfers pending', value: summary.pendingBankTransfers, cls: 'text-amber-700' },
            ].map((c) => {
              const body = (
                <>
                  <p className="text-[11px] text-gray-500">{c.label}</p>
                  <p className={`text-base font-bold mt-0.5 ${c.cls}`}>{money(c.value)}</p>
                </>
              );
              return c.to ? (
                <Link key={c.label} to={c.to} className="bg-white rounded-xl border border-gray-200 p-3 hover:border-emerald-300">{body}</Link>
              ) : (
                <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-3">{body}</div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === f.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Ledger */}
        {loading ? (
          <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>
        ) : shown.length === 0 ? (
          <div className="mt-4 bg-white rounded-xl border p-10 text-center text-sm text-gray-500">No transactions here yet.</div>
        ) : (
          groups.map((g) => (
            <div key={g.month} className="mt-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{g.month}</p>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {g.rows.map((e) => {
                  const credit = e.type === 'Credit';
                  return (
                    <div key={e.id} className="p-3 flex items-start gap-3">
                      <div className={`mt-0.5 w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${credit ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {credit ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="7" y1="7" x2="17" y2="17" /><polyline points="17 7 17 17 7 17" /></svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{e.kind}</p>
                        <p className="text-xs text-gray-600 truncate">
                          {e.orderId ? <Link to={`/orders/${e.orderId}`} className="hover:underline">{e.description}</Link> : e.description}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="text-gray-400">{new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{e.mode}</span>
                          {e.status !== 'Completed' && (
                            <span className={`px-1.5 py-0.5 rounded-full border font-semibold ${statusPill[e.status] || statusPill.Pending}`}>{e.status}</span>
                          )}
                        </div>
                      </div>
                      <p className={`text-sm font-bold whitespace-nowrap ${credit ? 'text-green-600' : 'text-gray-900'}`}>
                        {credit ? '+' : '−'}{money(e.amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
