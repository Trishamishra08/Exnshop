import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../../context/ToastContext';
import { createCustomerPayout, CustomerPayoutInfo, getCustomerPayoutInfo } from '../../../services/api/admin/adminCustomerService';
import { processWithdrawal } from '../../../services/api/admin/adminWalletService';

/**
 * Admin view of one customer's bank details, wallet balance and payouts.
 * The admin can start a payout to the customer's bank / UPI and take every payout
 * through Approve → Pay (RazorpayX, or manually + UTR) → Paid, without leaving the page.
 */
const money = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusCls: Record<string, string> = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-blue-50 text-blue-700 border-blue-200',
  Processing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Completed: 'bg-green-50 text-green-700 border-green-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
};

function Copy({ value }: { value: string }) {
  const { showToast } = useToast();
  if (!value) return null;
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(value); showToast('Copied', 'success'); }}
      className="ml-2 text-[11px] font-semibold text-blue-700 hover:underline">Copy</button>
  );
}

export default function CustomerPayoutModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { showToast } = useToast();
  const [info, setInfo] = useState<CustomerPayoutInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'Bank Transfer' | 'UPI'>('Bank Transfer');
  const [note, setNote] = useState('');
  const [utr, setUtr] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await getCustomerPayoutInfo(customerId);
      if (res.success) {
        setInfo(res.data);
        if (!res.data.bankDetails.hasBank && res.data.bankDetails.hasUpi) setMethod('UPI');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not load the customer', 'error');
    } finally {
      setLoading(false);
    }
  }, [customerId, showToast]);

  useEffect(() => { load(); }, [load]);

  const act = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res && res.success === false) throw { response: { data: res } };
      showToast(res?.message || ok, 'success');
      await load();
      return true;
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Something went wrong', 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const startPayout = async () => {
    const n = Number(amount);
    if (!(n >= 1)) return showToast('Enter an amount of at least ₹1', 'error');
    const done = await act('create', () => createCustomerPayout(customerId, { amount: n, method, note }), 'Payout created');
    if (done) { setAmount(''); setNote(''); }
  };

  const b = info?.bankDetails;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-neutral-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900">{info?.customer.name || 'Customer'} — Bank & payouts</h2>
            <p className="text-xs text-neutral-500">{[info?.customer.phone, info?.customer.email].filter(Boolean).join(' · ')}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none" aria-label="Close">×</button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-neutral-500">Loading…</div>
        ) : !info ? (
          <div className="p-10 text-center text-sm text-red-600">Could not load this customer.</div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Balances */}
            <div className="grid grid-cols-3 gap-3">
              {[
                ['Wallet balance', info.walletBalance, 'text-neutral-900'],
                ['Payouts in progress', info.pendingTotal, 'text-amber-700'],
                ['Available to pay', info.availableToPay, 'text-green-700'],
              ].map(([label, value, cls]) => (
                <div key={label as string} className="rounded-lg border border-neutral-200 p-3">
                  <p className="text-[11px] text-neutral-500">{label}</p>
                  <p className={`text-base font-bold ${cls}`}>{money(value as number)}</p>
                </div>
              ))}
            </div>

            {/* Bank details the customer saved */}
            <div className="rounded-lg border border-neutral-200 p-4">
              <p className="text-xs font-bold text-neutral-700 uppercase tracking-wide mb-2">Bank details (saved by the customer)</p>
              {!b?.hasBank && !b?.hasUpi ? (
                <p className="text-sm text-neutral-500">The customer hasn't added bank details yet. They can add them in Profile → Bank Details.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  {b?.hasBank && (
                    <>
                      <p><span className="text-neutral-500">Account holder:</span> <b>{b.accountHolderName}</b></p>
                      <p><span className="text-neutral-500">Account no:</span> <b className="font-mono">{b.accountNumber}</b><Copy value={b.accountNumber} /></p>
                      <p><span className="text-neutral-500">IFSC:</span> <b className="font-mono">{b.ifscCode}</b><Copy value={b.ifscCode} /></p>
                      <p><span className="text-neutral-500">Bank:</span> {b.bankName || '—'}</p>
                    </>
                  )}
                  {b?.hasUpi && <p><span className="text-neutral-500">UPI ID:</span> <b>{b.upiId}</b><Copy value={b.upiId} /></p>}
                  {b?.updatedAt && <p className="text-[11px] text-neutral-400 sm:col-span-2">Last updated {new Date(b.updatedAt).toLocaleString('en-IN')}</p>}
                </div>
              )}
            </div>

            {/* Start a payout */}
            {(b?.hasBank || b?.hasUpi) && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                <p className="text-xs font-bold text-neutral-700 uppercase tracking-wide">Pay the customer</p>
                <div className="flex flex-wrap gap-2">
                  {b?.hasBank && (
                    <button onClick={() => setMethod('Bank Transfer')} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${method === 'Bank Transfer' ? 'border-blue-600 bg-white text-blue-700' : 'border-neutral-200 bg-white text-neutral-600'}`}>
                      Bank · ••••{b.accountNumber.slice(-4)}
                    </button>
                  )}
                  {b?.hasUpi && (
                    <button onClick={() => setMethod('UPI')} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${method === 'UPI' ? 'border-blue-600 bg-white text-blue-700' : 'border-neutral-200 bg-white text-neutral-600'}`}>
                      UPI · {b.upiId}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (₹)"
                    className="w-36 px-3 py-2 rounded-lg border border-neutral-300 text-sm bg-white" />
                  <button onClick={() => setAmount(String(info.availableToPay))} className="text-xs font-semibold text-blue-700">Max</button>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. COD return refund #ORD…"
                    className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-neutral-300 text-sm bg-white" />
                  <button onClick={startPayout} disabled={busy !== null || info.availableToPay < 1}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
                    {busy === 'create' ? 'Creating…' : 'Create payout'}
                  </button>
                </div>
                <p className="text-[11px] text-neutral-500">Paid from the customer's wallet balance. After creating it, pay it below (RazorpayX or manually + UTR).</p>
              </div>
            )}

            {/* Payouts */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-neutral-700 uppercase tracking-wide">Payouts</p>
                <Link to="/admin/withdrawals" className="text-xs font-semibold text-blue-700 hover:underline">All withdrawals →</Link>
              </div>
              {info.payouts.length === 0 ? (
                <p className="text-sm text-neutral-500">No payouts yet.</p>
              ) : (
                <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg">
                  {info.payouts.map((p) => (
                    <div key={p._id} className="p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 justify-between">
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">{money(p.amount)} <span className="font-normal text-neutral-500">· {p.paymentMethod}</span></p>
                          <p className="text-[11px] text-neutral-500">{p.remarks || 'Transfer to bank'} · {new Date(p.createdAt).toLocaleString('en-IN')}</p>
                          {p.transactionReference && <p className="text-[11px] text-green-700">UTR / reference: {p.transactionReference}</p>}
                          {p.payoutFailureReason && <p className="text-[11px] text-red-600">{p.payoutFailureReason}</p>}
                        </div>
                        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusCls[p.status] || statusCls.Pending}`}>{p.status === 'Completed' ? 'Paid' : p.status}</span>
                      </div>

                      {p.status === 'Pending' && (
                        <div className="flex gap-2">
                          <button disabled={busy !== null} onClick={() => act(p._id, () => processWithdrawal({ requestId: p._id, action: 'Approve' }), 'Approved')}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">Approve</button>
                          <button disabled={busy !== null} onClick={() => {
                            const reason = window.prompt('Reason for rejecting this payout?');
                            if (reason) act(p._id, () => processWithdrawal({ requestId: p._id, action: 'Reject', remark: reason }), 'Rejected');
                          }} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold disabled:opacity-50">Reject</button>
                        </div>
                      )}

                      {p.status === 'Approved' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button disabled={busy !== null} onClick={() => act(p._id, () => processWithdrawal({ requestId: p._id, action: 'PayRazorpay' }), 'Payout sent via RazorpayX')}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50">Pay via RazorpayX</button>
                          <span className="text-[11px] text-neutral-400">or paid manually:</span>
                          <input value={utr[p._id] || ''} onChange={(e) => setUtr((u) => ({ ...u, [p._id]: e.target.value }))} placeholder="UTR / transaction ref"
                            className="w-44 px-2 py-1.5 rounded-lg border border-neutral-300 text-xs" />
                          <button disabled={busy !== null || !(utr[p._id] || '').trim()}
                            onClick={() => act(p._id, () => processWithdrawal({ requestId: p._id, action: 'Complete', transactionReference: utr[p._id].trim() }), 'Marked as paid')}
                            className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold disabled:opacity-50">Mark as paid</button>
                        </div>
                      )}

                      {p.status === 'Processing' && <p className="text-[11px] text-indigo-700">Payout is on its way through RazorpayX — it updates by itself when the bank confirms.</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
