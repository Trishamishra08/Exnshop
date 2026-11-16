import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../context/ToastContext';
import { CustomerBankDetails, cancelPendingBankDetails, getCustomerBankDetails, saveCustomerBankDetails } from '../../../services/api/customerWalletService';

/**
 * The customer's bank account / UPI ID. COD return refunds can be paid here,
 * and wallet balance can be transferred here.
 */
const EMPTY: CustomerBankDetails = { accountHolderName: '', accountNumber: '', ifscCode: '', bankName: '', upiId: '' };
const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500';
const labelCls = 'block text-xs font-semibold text-gray-700 mb-1';

export default function BankDetails() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [form, setForm] = useState<CustomerBankDetails>(EMPTY);
  const [confirmNumber, setConfirmNumber] = useState('');
  const [saved, setSaved] = useState<CustomerBankDetails | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [proof, setProof] = useState<File | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getCustomerBankDetails();
        if (res.success) {
          setSaved(res.data);
          setForm({ ...EMPTY, ...res.data });
          setConfirmNumber(res.data.accountNumber || '');
          setEditing(!res.data.hasBank && !res.data.hasUpi && !res.data.pending);
        }
      } catch {
        setEditing(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (k: keyof CustomerBankDetails, v: string) => { setForm((f) => ({ ...f, [k]: v })); setError(''); };

  const save = async () => {
    if (form.accountNumber && form.accountNumber !== confirmNumber) return setError('The account numbers do not match.');
    setSaving(true);
    try {
      const res = await saveCustomerBankDetails(form, proof);
      if (res.success) {
        setSaved(res.data);
        setEditing(false);
        setProof(null);
        showToast('Sent to admin for approval', 'success');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not save your bank details');
    } finally {
      setSaving(false);
    }
  };

  const onProof = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^(image\/|application\/pdf)/.test(f.type)) return setError('Upload a photo or a PDF');
    if (f.size > 10 * 1024 * 1024) return setError('The file must be 10 MB or smaller');
    setProof(f);
    setError('');
  };

  const withdrawPending = async () => {
    try {
      const res = await cancelPendingBankDetails();
      if (res.success) { setSaved(res.data); setEditing(!res.data.hasBank && !res.data.hasUpi); }
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not withdraw the request', 'error');
    }
  };

  const pending = saved?.pending;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3.5 flex items-center gap-3 max-w-xl mx-auto">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-gray-100 rounded-full" aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
          <h1 className="text-lg font-bold text-gray-900">Bank Details</h1>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-4 space-y-4">
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900">
          Refunds for cash-on-delivery returns can be paid to this account (or to your Exnshop wallet — you choose when you return an item).
          You can also transfer your wallet balance here.
        </div>

        {!editing && pending && (
          <div className={`rounded-xl border p-3 text-xs space-y-1.5 ${pending.status === 'Pending' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-red-50 border-red-200 text-red-800'}`}>
            <p className="font-bold text-sm">{pending.status === 'Pending' ? 'Waiting for admin approval' : 'Not approved'}</p>
            <p>
              {pending.accountNumberMasked ? `${pending.accountHolderName} · ${pending.accountNumberMasked} · ${pending.ifscCode}` : null}
              {pending.upiId ? `${pending.accountNumberMasked ? ' · ' : ''}UPI ${pending.upiId}` : null}
            </p>
            {pending.status === 'Pending'
              ? <p>{saved?.hasBank || saved?.hasUpi ? 'Your previous approved details stay in use until then.' : 'Your details can be used once approved.'}</p>
              : <p>Reason: {pending.remarks}</p>}
            <div className="flex gap-2 pt-1">
              {pending.status === 'Rejected' && <button onClick={() => { setForm({ ...EMPTY, upiId: pending.upiId, bankName: pending.bankName, accountHolderName: pending.accountHolderName, ifscCode: pending.ifscCode }); setConfirmNumber(''); setEditing(true); }} className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold">Fix and resend</button>}
              <button onClick={withdrawPending} className="px-3 py-1.5 rounded-lg border border-current font-semibold">{pending.status === 'Pending' ? 'Withdraw request' : 'Dismiss'}</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>
        ) : !editing && saved && (saved.hasBank || saved.hasUpi) ? (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            {saved.hasBank && (
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase">Bank account</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{saved.accountHolderName}</p>
                <p className="text-sm text-gray-700 font-mono">{saved.accountNumberMasked}</p>
                <p className="text-xs text-gray-500">IFSC {saved.ifscCode}{saved.bankName ? ` · ${saved.bankName}` : ''}</p>
                <p className="text-[11px] text-emerald-700 font-semibold mt-1">✓ Approved</p>
              </div>
            )}
            {saved.hasUpi && (
              <div className={saved.hasBank ? 'pt-3 border-t border-gray-100' : ''}>
                <p className="text-[11px] font-semibold text-gray-500 uppercase">UPI ID</p>
                <p className="text-sm text-gray-900 mt-1">{saved.upiId}</p>
              </div>
            )}
            <button onClick={() => setEditing(true)} className="w-full py-2.5 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-semibold">Change bank details (needs admin approval)</button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-sm font-bold text-gray-900">Bank account</p>
            <div>
              <label className={labelCls}>Account holder name</label>
              <input className={inputCls} value={form.accountHolderName} onChange={(e) => set('accountHolderName', e.target.value)} placeholder="As printed on your passbook" />
            </div>
            <div>
              <label className={labelCls}>Account number</label>
              <input className={inputCls} inputMode="numeric" value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value.replace(/\D/g, ''))} maxLength={18} />
            </div>
            <div>
              <label className={labelCls}>Confirm account number</label>
              <input className={inputCls} inputMode="numeric" value={confirmNumber} onChange={(e) => { setConfirmNumber(e.target.value.replace(/\D/g, '')); setError(''); }} maxLength={18} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>IFSC code</label>
                <input className={`${inputCls} uppercase`} value={form.ifscCode} onChange={(e) => set('ifscCode', e.target.value.toUpperCase())} maxLength={11} placeholder="SBIN0001234" />
              </div>
              <div>
                <label className={labelCls}>Bank name</label>
                <input className={inputCls} value={form.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Bank proof <span className="text-red-500">*</span></label>
              <p className="text-[11px] text-gray-500 mb-1">Photo or PDF of your account statement or cancelled cheque (up to 10 MB). Required for a new or changed bank account.</p>
              <input type="file" accept="image/*,application/pdf" onChange={onProof}
                className="w-full text-xs text-gray-600 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 file:mr-3 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700" />
              {proof && <p className="text-[11px] text-emerald-700 mt-1 truncate">✓ {proof.name}</p>}
            </div>

            <p className="text-sm font-bold text-gray-900 pt-2">UPI ID <span className="font-normal text-gray-500 text-xs">(optional)</span></p>
            <input className={inputCls} value={form.upiId} onChange={(e) => set('upiId', e.target.value.trim())} placeholder="name@okbank" />

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-2 pt-1">
              {saved && (saved.hasBank || saved.hasUpi || saved.pending) && (
                <button onClick={() => { setEditing(false); setForm({ ...EMPTY, ...saved }); setConfirmNumber(saved.accountNumber || ''); setProof(null); setError(''); }}
                  className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700">Cancel</button>
              )}
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">
                {saving ? 'Sending…' : 'Submit for approval'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
