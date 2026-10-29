import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../context/ToastContext';
import {
  CustomerBankDetails,
  getCustomerBankDetails,
  getCustomerWalletBalance,
  getCustomerWalletTransactions,
  getCustomerWithdrawals,
  requestCustomerWithdrawal,
} from '../../../services/api/customerWalletService';

export default function CustomerWallet() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Transfer to bank
  const [bank, setBank] = useState<CustomerBankDetails | null>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [method, setMethod] = useState<'Bank Transfer' | 'UPI'>('Bank Transfer');
  const [amount, setAmount] = useState('');
  const [transferring, setTransferring] = useState(false);
  const pendingTotal = withdrawals
    .filter((w) => ['Pending', 'Approved', 'Processing'].includes(w.status))
    .reduce((t, w) => t + Number(w.amount || 0), 0);

  useEffect(() => {
    fetchWalletData();
  }, []);

  const submitTransfer = async () => {
    const n = Number(amount);
    if (!(n >= 1)) return showToast('Enter an amount of at least ₹1', 'error');
    setTransferring(true);
    try {
      const res = await requestCustomerWithdrawal(n, method);
      showToast(res.message || 'Transfer requested', 'success');
      setAmount('');
      setShowTransfer(false);
      fetchWalletData();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not request the transfer', 'error');
    } finally {
      setTransferring(false);
    }
  };

  const fetchWalletData = async () => {
    try {
      setLoading(true);
      const [balanceRes, txRes, bankRes, wdRes] = await Promise.all([
        getCustomerWalletBalance(),
        getCustomerWalletTransactions(1, 20),
        getCustomerBankDetails().catch(() => null),
        getCustomerWithdrawals().catch(() => null),
      ]);

      if (balanceRes.success) setBalance(balanceRes.data.balance || 0);
      if (txRes.success) setTransactions(txRes.data.transactions || []);
      if (bankRes?.success) {
        setBank(bankRes.data);
        if (!bankRes.data.hasBank && bankRes.data.hasUpi) setMethod('UPI');
      }
      if (wdRes?.success) setWithdrawals(wdRes.data || []);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to load wallet data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatCategory = (category?: string, type?: string) => {
    if (category === 'COD_RETURN_REFUND') return 'COD Return Refund';
    if (category === 'ORDER_CANCELLATION_REFUND') return 'Cancellation Refund';
    if (category === 'ORDER_PAYMENT') return 'Order Payment';
    if (category === 'MANUAL_ADMIN_CREDIT') return 'Admin Bonus Credit';
    if (category === 'MANUAL_ADMIN_DEBIT') return 'Admin Adjustment';
    return type === 'Credit' ? 'Refund Credit' : 'Order Payment';
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">My Wallet</h1>
        </div>
      </div>

      {/* Balance Card */}
      <div className="m-4 bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10">
          <svg width="180" height="180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        </div>

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-emerald-100 flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Available Wallet Balance
            </span>
            <button
              onClick={fetchWalletData}
              className="p-1 hover:bg-white/10 rounded-full transition-colors"
              title="Refresh Balance"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-emerald-100 ${loading ? 'animate-spin' : ''}`}>
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">₹{balance.toFixed(2)}</h1>

          <div className="mt-4 pt-3 border-t border-emerald-500/30 flex items-center justify-between text-xs text-emerald-100">
            <span>Instant refunds & checkout usage</span>
            <span className="font-semibold bg-emerald-700/50 px-2.5 py-1 rounded-full">100% Safe</span>
          </div>
        </div>
      </div>

      {/* Use the balance: shop with it, or send it to the bank */}
      <div className="mx-4 grid grid-cols-2 gap-3">
        <button onClick={() => navigate('/')} className="bg-white rounded-xl border border-gray-200 p-3 text-left hover:border-emerald-300">
          <p className="text-sm font-semibold text-gray-900">Shop now</p>
          <p className="text-[11px] text-gray-500">Use your balance at checkout</p>
        </button>
        <button onClick={() => setShowTransfer((v) => !v)} className="bg-white rounded-xl border border-gray-200 p-3 text-left hover:border-emerald-300">
          <p className="text-sm font-semibold text-gray-900">Transfer to bank</p>
          <p className="text-[11px] text-gray-500">Send balance to your account</p>
        </button>
      </div>

      {showTransfer && (
        <div className="mx-4 mt-3 bg-white rounded-xl border border-emerald-200 p-4 space-y-3">
          {!bank || (!bank.hasBank && !bank.hasUpi) ? (
            <div className="text-sm text-gray-700">
              Add your bank account or UPI ID first.
              <button onClick={() => navigate('/account/bank-details')} className="ml-1 font-semibold text-emerald-700 underline">Add bank details</button>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500">Available to transfer: <b className="text-gray-900">₹{Math.max(0, balance - pendingTotal).toFixed(2)}</b></p>
              <div className="flex gap-2">
                {bank.hasBank && (
                  <button onClick={() => setMethod('Bank Transfer')} className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold text-left ${method === 'Bank Transfer' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-700'}`}>
                    Bank · {bank.accountNumberMasked}
                  </button>
                )}
                {bank.hasUpi && (
                  <button onClick={() => setMethod('UPI')} className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold text-left ${method === 'UPI' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-700'}`}>
                    UPI · {bank.upiId}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (₹)"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                <button onClick={() => setAmount(String(Math.max(0, balance - pendingTotal).toFixed(2)))} className="px-3 text-xs font-semibold text-emerald-700">Max</button>
                <button onClick={submitTransfer} disabled={transferring} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
                  {transferring ? '…' : 'Transfer'}
                </button>
              </div>
              <p className="text-[11px] text-gray-500">Usually reaches your account in 2–3 working days.</p>
            </>
          )}
        </div>
      )}

      {withdrawals.some((w) => ['Pending', 'Approved', 'Processing'].includes(w.status)) && (
        <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
          <p className="text-xs font-bold text-amber-900">Transfers in progress</p>
          {withdrawals.filter((w) => ['Pending', 'Approved', 'Processing'].includes(w.status)).map((w) => (
            <p key={w._id} className="text-xs text-amber-800 flex justify-between">
              <span>{w.remarks || 'Transfer to bank'} · {new Date(w.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              <b>₹{Number(w.amount).toFixed(2)}</b>
            </p>
          ))}
        </div>
      )}

      <button onClick={() => navigate('/account/statement')} className="mx-4 mt-3 w-[calc(100%-2rem)] bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between text-sm font-semibold text-gray-900">
        View account statement <span className="text-gray-400">›</span>
      </button>

      {/* Transaction History Section */}
      <div className="mx-4 mt-6">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Transaction History</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center border text-gray-500 space-y-2">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300 mx-auto">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            <p className="font-medium text-gray-700">No wallet transactions yet</p>
            <p className="text-xs text-gray-400">Refunds from returned or cancelled orders will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((tx: any) => {
              const isCredit = tx.type === 'Credit';
              return (
                <div key={tx._id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex justify-between items-center">
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-full mt-0.5 ${isCredit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {isCredit ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="7" y1="7" x2="17" y2="17" />
                          <polyline points="17 7 17 17 7 17" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="7" y1="17" x2="17" y2="7" />
                          <polyline points="7 7 17 7 17 17" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{tx.description || formatCategory(tx.category, tx.type)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${isCredit ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-700'}`}>
                          {formatCategory(tx.category, tx.type)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(tx.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`font-bold text-base ${isCredit ? 'text-green-600' : 'text-gray-900'}`}>
                      {isCredit ? '+' : '-'}₹{tx.amount.toFixed(2)}
                    </p>
                    {tx.balanceAfter !== undefined && (
                      <p className="text-[11px] text-gray-400 mt-0.5">Bal: ₹{tx.balanceAfter.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
