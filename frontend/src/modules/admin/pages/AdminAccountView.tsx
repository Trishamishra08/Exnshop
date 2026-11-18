import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AccountView, getAccountView } from '../../../services/api/admin/adminCustomerService';

/**
 * Read-only view of a customer's / seller's account for support: profile, orders,
 * wallet statement and the tickets they raised, so a complaint can be matched to the data.
 */
const money = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d?: string) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

type Tab = 'orders' | 'statement' | 'tickets';

export default function AdminAccountView({ kind }: { kind: 'Customer' | 'Seller' }) {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AccountView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('orders');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getAccountView(kind, id)
      .then((r) => { if (r.success) setData(r.data); else setError(r.message || 'Could not load account'); })
      .catch((e: any) => setError(e?.response?.data?.message || 'Could not load account'))
      .finally(() => setLoading(false));
  }, [id, kind]);

  const backTo = kind === 'Customer' ? '/admin/customers' : '/admin/manage-seller/list';
  const supportTo = kind === 'Customer' ? '/admin/customer-support' : '/admin/seller-support';

  if (loading) return <div className="p-8 text-neutral-500">Loading account…</div>;
  if (error || !data) return <div className="p-8"><p className="text-red-600">{error || 'Not found'}</p><Link to={backTo} className="text-teal-700 underline text-sm">← Back</Link></div>;

  const p = data.profile;
  const name = kind === 'Customer' ? p.name : p.storeName || p.sellerName;
  const phone = kind === 'Customer' ? p.phone : p.mobile;
  const card = (label: string, value: string, sub?: string) => (
    <div className="bg-white border border-neutral-200 rounded-lg p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-xl font-semibold text-neutral-900 mt-1">{value}</p>
      {sub && <p className="text-[11px] text-neutral-400 mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full space-y-4">
      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <div className="bg-teal-600 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to={backTo} className="text-teal-100 hover:text-white text-xs">← Back to {kind === 'Customer' ? 'customers' : 'sellers'}</Link>
            <h2 className="text-lg font-semibold mt-1">{name} <span className="text-xs font-normal text-teal-100">· {kind} account (read-only)</span></h2>
          </div>
          <Link to={supportTo} className="px-3 py-1.5 bg-white text-teal-700 rounded text-xs font-semibold hover:bg-teal-50">{kind} support tickets →</Link>
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 p-5 text-sm">
          <div><dt className="text-xs text-neutral-500">Email</dt><dd className="break-all">{p.email || '—'}</dd></div>
          <div><dt className="text-xs text-neutral-500">Phone</dt><dd>{phone || '—'}</dd></div>
          {kind === 'Seller' && <div><dt className="text-xs text-neutral-500">Owner</dt><dd>{p.sellerName || '—'}</dd></div>}
          {kind === 'Seller' && <div><dt className="text-xs text-neutral-500">Category</dt><dd>{p.category || '—'}</dd></div>}
          <div><dt className="text-xs text-neutral-500">Location</dt><dd>{[p.city, p.state].filter(Boolean).join(', ') || p.address || '—'}</dd></div>
          <div><dt className="text-xs text-neutral-500">Status</dt><dd>{p.status || p.onboardingStatus || '—'}</dd></div>
          <div><dt className="text-xs text-neutral-500">Joined</dt><dd>{date(p.registrationDate || p.createdAt)}</dd></div>
          <div><dt className="text-xs text-neutral-500">Account ID</dt><dd className="font-mono text-xs break-all">{p._id}</dd></div>
        </dl>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {card('Wallet balance', money(data.wallet.balance))}
        {card('Total orders', String(data.orderSummary.total))}
        {kind === 'Customer'
          ? card('Total spent', money(data.orderSummary.totalSpent || 0), 'excl. cancelled / returned')
          : card('Delivered sales', money(data.orderSummary.deliveredSales || 0), `Commission ${money(data.orderSummary.commission || 0)}`)}
        {card('Credits / Debits', `${money(data.wallet.totalCredits)} / ${money(data.wallet.totalDebits)}`, 'completed wallet entries')}
      </div>

      {data.orderSummary.byStatus.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.orderSummary.byStatus.map((s) => (
            <span key={s.status} className="px-2.5 py-1 bg-white border border-neutral-200 rounded-full text-xs text-neutral-700">{s.status}: <b>{s.count}</b></span>
          ))}
        </div>
      )}

      <div className="bg-white border border-neutral-200 rounded-lg">
        <div className="flex border-b border-neutral-200 text-sm overflow-x-auto">
          {([['orders', `Orders (${data.orders.length})`], ['statement', 'Wallet statement'], ['tickets', `Tickets (${data.tickets.length})`]] as [Tab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-3 font-medium whitespace-nowrap ${tab === k ? 'text-teal-700 border-b-2 border-teal-600' : 'text-neutral-500 hover:text-neutral-800'}`}>{label}</button>
          ))}
        </div>
        <div className="overflow-x-auto">
          {tab === 'orders' && (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500"><tr>
                <th className="text-left p-3">Order</th><th className="text-left p-3">Date</th>
                {kind === 'Seller' && <th className="text-left p-3">Item</th>}
                <th className="text-left p-3">Status</th><th className="text-right p-3">Amount</th>
              </tr></thead>
              <tbody>
                {data.orders.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-neutral-400">No orders yet.</td></tr>}
                {data.orders.map((o: any) => (
                  <tr key={o._id} className="border-t border-neutral-100">
                    <td className="p-3 font-medium">{kind === 'Customer' ? o.orderNumber : o.order?.orderNumber || '—'}</td>
                    <td className="p-3 text-neutral-600">{date(kind === 'Customer' ? o.orderDate : o.createdAt)}</td>
                    {kind === 'Seller' && <td className="p-3">{o.productName} × {o.quantity}</td>}
                    <td className="p-3">{o.status}{kind === 'Customer' && o.paymentStatus ? <span className="text-xs text-neutral-400"> · {o.paymentMethod} {o.paymentStatus}</span> : null}</td>
                    <td className="p-3 text-right">{money(kind === 'Customer' ? o.grandTotal || o.total : o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'statement' && (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500"><tr>
                <th className="text-left p-3">Date</th><th className="text-left p-3">Description</th><th className="text-left p-3">Order</th>
                <th className="text-right p-3">Amount</th><th className="text-right p-3">Balance</th>
              </tr></thead>
              <tbody>
                {data.wallet.transactions.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-neutral-400">No wallet entries.</td></tr>}
                {data.wallet.transactions.map((t: any) => (
                  <tr key={t._id} className="border-t border-neutral-100">
                    <td className="p-3 text-neutral-600 whitespace-nowrap">{date(t.createdAt)}</td>
                    <td className="p-3">{t.description}{t.status !== 'Completed' && <span className="ml-1 text-xs text-amber-600">({t.status})</span>}</td>
                    <td className="p-3 text-neutral-500">{t.relatedOrder?.orderNumber || '—'}</td>
                    <td className={`p-3 text-right font-medium ${t.type === 'Credit' ? 'text-green-700' : 'text-red-600'}`}>{t.type === 'Credit' ? '+' : '−'}{money(t.amount)}</td>
                    <td className="p-3 text-right text-neutral-600">{t.balanceAfter != null ? money(t.balanceAfter) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'tickets' && (
            <div className="divide-y divide-neutral-100">
              {data.tickets.length === 0 && <p className="p-8 text-center text-neutral-400 text-sm">No tickets raised.</p>}
              {data.tickets.map((t: any) => (
                <Link key={t._id} to={supportTo} className="flex items-center justify-between gap-3 p-3 hover:bg-neutral-50 text-sm">
                  <div>
                    <p className="font-medium text-neutral-800"><span className="font-mono text-[11px] text-neutral-400 mr-2">{t.ticketNumber}</span>{t.subject}</p>
                    <p className="text-xs text-neutral-500">{t.category} · {t.priority} · {date(t.createdAt)}{t.slaBreached ? ' · SLA breached' : ''}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100">{t.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
