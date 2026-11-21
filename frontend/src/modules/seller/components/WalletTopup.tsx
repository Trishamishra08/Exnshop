import { useState } from 'react';
import api from '../../../services/api/config';
import { useToast } from '../../../context/ToastContext';

/**
 * "Add Money" to the seller wallet with Razorpay.
 * Sellers who deliver orders themselves collect the customer's cash; the platform's share is
 * taken from this wallet after delivery, so it must stay above zero to keep accepting
 * self-delivery COD orders.
 */
const loadRazorpay = () =>
  new Promise<boolean>((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function WalletTopup({ balance, onDone }: { balance: number; onDone: () => void }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(() => (balance < 0 ? String(Math.max(100, Math.ceil(-balance))) : '500'));
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 100) {
      showToast('Enter at least ₹100', 'error');
      return;
    }
    setBusy(true);
    try {
      if (!(await loadRazorpay())) throw new Error('Could not load the payment window. Check your internet and try again.');
      const res = await api.post('/seller/wallet/topup/create', { amount: value });
      const d = res.data?.data;
      const rzp = new (window as any).Razorpay({
        key: d.razorpayKey,
        amount: d.amount,
        currency: d.currency,
        order_id: d.razorpayOrderId,
        name: 'Exnshop',
        description: 'Seller wallet top-up',
        prefill: d.prefill,
        theme: { color: '#0d9488' },
        handler: async (r: any) => {
          try {
            const v = await api.post('/seller/wallet/topup/verify', {
              razorpayOrderId: r.razorpay_order_id,
              razorpayPaymentId: r.razorpay_payment_id,
              razorpaySignature: r.razorpay_signature,
            });
            showToast(v.data?.message || 'Money added to your wallet', 'success');
            setOpen(false);
            onDone();
          } catch (e: any) {
            showToast(e?.response?.data?.message || 'Payment received but not confirmed yet. Contact support with your payment ID.', 'error');
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch (e: any) {
      showToast(e?.response?.data?.message || e?.message || 'Could not start the payment', 'error');
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-emerald-600 transition-all shadow-md self-stretch sm:self-auto text-center"
      >
        + Add Money
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm text-gray-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Add money to wallet</h3>
            <p className="text-xs text-gray-500 mt-1">
              For orders you deliver yourself, you collect the customer's cash and the platform charge is taken from this wallet after delivery.
            </p>
            {balance < 0 && (
              <p className="mt-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                Your wallet is ₹{balance.toFixed(2)}. Add at least ₹{Math.ceil(-balance)} to accept self-delivery COD orders again.
              </p>
            )}
            <label className="block text-sm font-medium mt-4 mb-1">Amount (₹)</label>
            <input
              type="number"
              min={100}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex gap-2 mt-2">
              {[500, 1000, 2000].map((v) => (
                <button key={v} type="button" onClick={() => setAmount(String(v))} className="flex-1 border border-gray-200 rounded-lg py-1 text-sm hover:bg-gray-50">
                  ₹{v}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button disabled={busy} onClick={() => setOpen(false)} className="flex-1 border border-gray-300 rounded-lg py-2 font-medium disabled:opacity-50">
                Cancel
              </button>
              <button disabled={busy} onClick={pay} className="flex-1 bg-emerald-600 text-white rounded-lg py-2 font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {busy ? 'Please wait…' : 'Pay with Razorpay'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
