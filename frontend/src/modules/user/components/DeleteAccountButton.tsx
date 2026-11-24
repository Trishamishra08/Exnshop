import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { deleteMyAccount } from '../../../services/api/customerService';

/**
 * "Delete account" row for the customer's Account page, with a confirmation dialog:
 * the customer types DELETE, and confirms giving up any wallet balance. The server refuses
 * while an order, return or withdrawal is still in progress, and the reason is shown here.
 */
export default function DeleteAccountButton({ walletAmount = 0 }: { walletAmount?: number }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [forfeit, setForfeit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const hasWallet = walletAmount > 0;
  const canDelete = typed.trim().toUpperCase() === 'DELETE' && (!hasWallet || forfeit) && !busy;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setForfeit(false);
    setError('');
  };

  const handleDelete = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await deleteMyAccount(hasWallet && forfeit);
      showToast(res.message || 'Your account has been deleted.', 'success');
      logout();
      navigate('/login', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not delete your account. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full flex items-center justify-between px-3 py-3 hover:bg-red-50 transition-colors">
        <div className="flex items-center gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-red-600">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="text-[13px] font-medium text-red-600">Delete Account</span>
        </div>
        <span className="text-neutral-400">›</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-account-title" className="text-lg font-bold text-neutral-900">Delete your account?</h2>
            <p className="text-sm text-neutral-600 mt-2">This can't be undone. We will permanently remove:</p>
            <ul className="mt-2 text-sm text-neutral-700 list-disc pl-5 space-y-0.5">
              <li>Your account and login</li>
              <li>Saved addresses, wishlist and cart</li>
              <li>Your notifications</li>
            </ul>
            <p className="text-xs text-neutral-500 mt-2">
              Past orders and invoices are kept for legal and tax records, without your phone number and email.
            </p>

            {hasWallet && (
              <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <input type="checkbox" className="mt-0.5" checked={forfeit} onChange={(e) => setForfeit(e.target.checked)} disabled={busy} />
                <span>
                  Your wallet has <b>₹{walletAmount.toFixed(2)}</b>. I understand this amount will be lost. (You can withdraw it first from My Wallet.)
                </span>
              </label>
            )}

            <label className="block mt-4">
              <span className="text-sm text-neutral-700">
                Type <b>DELETE</b> to confirm
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={busy}
                autoComplete="off"
                className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="DELETE"
              />
            </label>

            {error && <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={close} disabled={busy} className="flex-1 h-11 rounded-lg border border-neutral-300 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canDelete}
                className="flex-1 h-11 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
