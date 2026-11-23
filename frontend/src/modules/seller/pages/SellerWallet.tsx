import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '../../../context/ToastContext';
import {
  getSellerWalletBalance,
  getSellerWalletTransactions,
  requestSellerWithdrawal,
  getSellerWithdrawals,
  getSellerCommissions,
} from '../../../services/api/sellerWalletService';
import { getSellerProfile } from '../../../services/api/auth/sellerAuthService';
import WalletTopup from '../components/WalletTopup';

type Tab = 'transactions' | 'withdrawals' | 'commissions';

export default function SellerWallet() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('transactions');
  const [balance, setBalance] = useState(0);
  const [onHoldBalance, setOnHoldBalance] = useState(0);
  // Available + on hold + frozen, payout-eligible amount, credit limit (from /balance)
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any>({ commissions: [], total: 0, paid: 0, pending: 0, onHold: 0, nextSettlementDate: null });
  const [loading, setLoading] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Bank Transfer' | 'UPI'>('Bank Transfer');
  const [sellerProfile, setSellerProfile] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      setLoading(true);
      const [balanceRes, transactionsRes, withdrawalsRes, commissionsRes, profileRes] = await Promise.all([
        getSellerWalletBalance(),
        getSellerWalletTransactions(),
        getSellerWithdrawals(),
        getSellerCommissions(),
        getSellerProfile().catch(() => null),
      ]);

      if (balanceRes.success) {
        setBalance(balanceRes.data.balance || 0);
        setOnHoldBalance(balanceRes.data.onHoldBalance || 0);
        setSummary(balanceRes.data);
      }
      if (transactionsRes.success) setTransactions(transactionsRes.data.transactions || []);
      if (withdrawalsRes.success) setWithdrawals(withdrawalsRes.data || []);
      if (commissionsRes.success) setCommissions(commissionsRes.data);
      if (profileRes?.success) setSellerProfile(profileRes.data);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to load wallet data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const frozen = Number(summary?.frozen || 0);
  const totalBalance = Number(summary?.totalBalance ?? balance + onHoldBalance);
  const eligibleForPayout = Number(summary?.eligibleForPayout ?? Math.max(0, balance));
  const pendingWithdrawal = Number(summary?.pendingWithdrawal || 0);
  const creditLimit = Number(summary?.creditLimit || 0);
  const creditUsed = Number(summary?.creditUsed || 0);
  const creditRemaining = Number(summary?.creditRemaining || 0);
  const adSpendTotal = Number(summary?.adSpendTotal || 0);
  const platformFeeTotal = Number(summary?.platformFeeTotal || 0);
  const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleWithdrawRequest = async () => {
    try {
      const amount = parseFloat(withdrawAmount);
      if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
      }

      if (amount > eligibleForPayout) {
        showToast(`You can withdraw up to ₹${eligibleForPayout.toFixed(2)}`, 'error');
        return;
      }

      setIsSubmitting(true);
      const response = await requestSellerWithdrawal(amount, paymentMethod);
      if (response.success) {
        showToast('Withdrawal request submitted successfully', 'success');
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        fetchWalletData();
      }
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to request withdrawal', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3">
          <h1 className="text-xl font-bold text-gray-900">Wallet</h1>
        </div>
      </div>

      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="m-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg"
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-sm opacity-90 mb-1">Eligible for payout (to your bank)</p>
            <h1 className="text-4xl font-bold mb-2">{money(eligibleForPayout)}</h1>
            <p className="text-xs bg-white/20 px-3 py-1 rounded-full inline-block backdrop-blur-sm">
              Total balance: <span className="font-semibold">{money(totalBalance)}</span>
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 self-stretch sm:self-auto">
            <WalletTopup balance={balance} onDone={fetchWalletData} />
            <button
              onClick={() => setShowWithdrawModal(true)}
              className="bg-white text-blue-600 px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-50 transition-all shadow-md self-stretch sm:self-auto text-center"
            >
              Request Withdrawal
            </button>
          </div>
        </div>
      </motion.div>

      {/* How the balance is made up */}
      <div className="mx-4 mb-4 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Your balance</h2>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-gray-600">Available</span>
            <span className={`font-medium ${balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>{money(balance)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-600">On hold <span className="text-gray-400">(delivered orders, until the return window ends)</span></span>
            <span className="font-medium text-gray-900">{money(onHoldBalance)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-600">Frozen by admin <span className="text-gray-400">(held for chargebacks)</span></span>
            <span className={`font-medium ${frozen > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{money(frozen)}</span>
          </div>
          <div className="flex justify-between gap-3 border-t border-gray-100 pt-1.5">
            <span className="font-semibold text-gray-900">Total balance</span>
            <span className="font-bold text-gray-900">{money(totalBalance)}</span>
          </div>
          <p className="text-[11px] text-gray-500 pt-1">
            Already deducted from Available: ad clicks {money(adSpendTotal)} · platform fees {money(platformFeeTotal)}.
          </p>
          <div className="flex justify-between gap-3 border-t border-gray-100 pt-1.5">
            <span className="font-semibold text-gray-900">Eligible for payout</span>
            <span className="font-bold text-green-700">{money(eligibleForPayout)}</span>
          </div>
          <p className="text-[11px] text-gray-500">
            Only Available money can go to your bank. On-hold and frozen money can't.
            {pendingWithdrawal > 0 && <> A withdrawal of {money(pendingWithdrawal)} is already requested.</>}
          </p>
        </div>

        {/* Credit limit from the admin */}
        <div className="mt-3 rounded-lg bg-gray-50 border border-gray-100 p-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-gray-600">Credit limit</span>
            <span className="font-medium text-gray-900">{money(creditLimit)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-600">Used</span>
            <span className={`font-medium ${creditUsed > 0 ? 'text-red-600' : 'text-gray-900'}`}>{money(creditUsed)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-600">Remaining</span>
            <span className="font-medium text-gray-900">{money(creditRemaining)}</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Your wallet can go below zero up to this limit for self-delivery COD orders and ad clicks.
          </p>
        </div>
      </div>

      {balance < 0 && (
        <div className="mx-4 mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <b>Your wallet is {money(balance)}.</b> For orders you deliver yourself, the platform charge is taken from this wallet, and ad clicks too.
          {creditLimit > 0 && creditRemaining > 0
            ? <> You still have {money(creditRemaining)} of credit; add money before it runs out.</>
            : <> Add money to keep accepting self-delivery COD orders and running ads.</>}
        </div>
      )}

      {/* Settlement Summary */}
      <div className="mx-4 mb-4 grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">Total Settled to Wallet</p>
          <p className="text-xl font-bold text-green-600">₹{(commissions.paid || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">Next Settlement</p>
          <p className="text-xl font-bold text-orange-600">₹{(commissions.onHold || 0).toFixed(2)}</p>
          {commissions.nextSettlementDate && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              Releases {new Date(commissions.nextSettlementDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white mx-4 rounded-xl shadow-sm overflow-hidden">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'transactions'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600'
              }`}
          >
            Transactions
          </button>
          <button
            onClick={() => setActiveTab('withdrawals')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'withdrawals'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600'
              }`}
          >
            Withdrawals
          </button>
          <button
            onClick={() => setActiveTab('commissions')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'commissions'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600'
              }`}
          >
            Commissions
          </button>
        </div>

        <div className="p-4">
          {/* Transactions Tab */}
          {activeTab === 'transactions' && (
            <div className="space-y-3">
              {(() => {
                // Combine transactions and pending commissions
                const allItems = [
                  ...transactions.map((t: any) => ({ ...t, source: 'transaction' })),
                  ...(commissions.commissions || [])
                    .filter((c: any) => c.status === 'Pending')
                    .map((c: any) => ({
                      _id: c.id || c._id,
                      description: `Order #${c.orderId?.substring(0, 8) || 'Unknown'} (Pending)`,
                      amount: c.orderAmount - c.amount, // Calculate Net Earning: Order Amount - Commission Fee
                      type: 'Credit',
                      createdAt: c.createdAt,
                      status: 'Pending',
                      source: 'commission'
                    }))
                ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                if (allItems.length === 0) {
                  return <p className="text-center text-gray-500 py-8">No transactions yet</p>;
                }

                return allItems.map((item: any) => (
                  <div key={item._id} className="flex justify-between items-start p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{item.description}</p>
                        {item.status === 'Pending' && (
                          <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">
                            Pending
                          </span>
                        )}
                        {item.status === 'Completed' && (
                          <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                            Success
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(item.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <p className={`font-bold text-lg ${item.type === 'Credit' ? 'text-green-600' : 'text-red-600'} ${item.status === 'Pending' ? 'opacity-60' : ''}`}>
                      {item.type === 'Credit' ? '+' : '-'}₹{item.amount.toFixed(2)}
                    </p>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* Withdrawals Tab */}
          {activeTab === 'withdrawals' && (
            <div className="space-y-3">
              {withdrawals.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No withdrawal requests yet</p>
              ) : (
                withdrawals.map((withdrawal: any) => (
                  <div key={withdrawal._id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-gray-900">₹{withdrawal.amount.toFixed(2)}</p>
                        <p className="text-xs text-gray-600">{withdrawal.paymentMethod}</p>
                        {withdrawal.paymentMethod === 'UPI' && (
                          <p className="text-xs font-mono text-blue-600 font-medium mt-0.5">
                            {withdrawal.accountDetails || withdrawal.upiId || 'N/A'}
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${withdrawal.status === 'Completed'
                          ? 'bg-green-100 text-green-700'
                          : withdrawal.status === 'Approved'
                            ? 'bg-blue-100 text-blue-700'
                            : withdrawal.status === 'Rejected'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                      >
                        {withdrawal.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(withdrawal.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                    {withdrawal.remarks && (
                      <p className="text-xs text-gray-600 mt-2 italic">{withdrawal.remarks}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Commissions Tab */}
          {activeTab === 'commissions' && (
            <div className="space-y-3">
              {commissions.commissions?.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No commissions yet</p>
              ) : (
                commissions.commissions?.map((comm: any) => (
                  <div key={comm.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-gray-900">Order Commission</p>
                        <p className="text-xs text-gray-600">Rate: {comm.rate}%</p>
                      </div>
                      <p className="font-bold text-green-600">₹{comm.amount.toFixed(2)}</p>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Order Amount: ₹{comm.orderAmount.toFixed(2)}</span>
                      <span>{new Date(comm.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Withdrawal Modal */}
      {
        showWithdrawModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full"
            >
              <h2 className="text-2xl font-bold mb-4">Request Withdrawal</h2>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter amount"
                    min="0"
                    step="0.01"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Eligible for payout: {money(eligibleForPayout)}</p>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                </select>
              </div>

              {paymentMethod === 'UPI' && (
                sellerProfile?.upiId ? (
                  <div className="mb-6 p-3.5 bg-blue-50 border border-blue-100 rounded-xl text-sm">
                    <p className="text-xs text-blue-700 font-semibold uppercase tracking-wider mb-1">Withdrawal will be sent to:</p>
                    <p className="font-mono font-semibold text-blue-950">{sellerProfile.upiId}</p>
                  </div>
                ) : (
                  <div className="mb-6 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-sm">
                    <p className="font-bold text-amber-900 mb-1">UPI ID Missing</p>
                    <p className="text-xs text-amber-800 mb-2">Please add your UPI ID in Account Settings before requesting a UPI withdrawal.</p>
                    <a
                      href="/seller/account-settings"
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Go to Account Settings &rarr;
                    </a>
                  </div>
                )
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowWithdrawModal(false);
                    setWithdrawAmount('');
                  }}
                  className="flex-1 border border-gray-300 rounded-lg py-2.5 font-semibold hover:bg-gray-50 transition"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleWithdrawRequest}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                  disabled={isSubmitting || (paymentMethod === 'UPI' && !sellerProfile?.upiId)}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </motion.div>
          </div>
        )
      }
    </div >
  );
}
