import { useState } from 'react';
import api from '../../../services/api/config';

/**
 * Change the seller's login email or mobile: enter the new one, get a 6-digit code on
 * it, enter the code. Nothing changes until the code is confirmed.
 */
export default function ContactChange({
    type,
    current,
    onChanged,
}: {
    type: 'email' | 'mobile';
    current: string;
    onChanged: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');
    const [otp, setOtp] = useState('');
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const label = type === 'email' ? 'email' : 'mobile number';
    const reset = () => {
        setOpen(false);
        setValue('');
        setOtp('');
        setSent(false);
        setMsg(null);
    };

    const send = async () => {
        setBusy(true);
        setMsg(null);
        try {
            const res = await api.post('/seller/auth/contact-change/send', { type, value });
            setSent(true);
            setMsg({ text: res.data?.message || 'Code sent', ok: true });
        } catch (e: any) {
            setMsg({ text: e?.response?.data?.message || 'Could not send the code', ok: false });
        } finally {
            setBusy(false);
        }
    };

    const verify = async () => {
        setBusy(true);
        setMsg(null);
        try {
            const res = await api.post('/seller/auth/contact-change/verify', { type, value, otp });
            const saved = type === 'email' ? res.data?.data?.email : res.data?.data?.mobile;
            onChanged(saved || value);
            reset();
            setMsg({ text: res.data?.message || 'Changed', ok: true });
        } catch (e: any) {
            setMsg({ text: e?.response?.data?.message || 'Could not change it', ok: false });
        } finally {
            setBusy(false);
        }
    };

    const input = 'w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

    if (!open) {
        return (
            <div className="mt-1.5 ml-1">
                <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-teal-700 hover:text-teal-800">
                    Change {label}
                </button>
                {msg && <p className={`text-xs mt-1 ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
            </div>
        );
    }

    return (
        <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50/40 p-3 space-y-2">
            <p className="text-xs text-gray-600">
                Your {label} is how you sign in. Enter the new one; we send a code to it to confirm. Current: <b>{current || '—'}</b>
            </p>
            <input
                type={type === 'email' ? 'email' : 'tel'}
                inputMode={type === 'email' ? 'email' : 'numeric'}
                value={value}
                disabled={sent || busy}
                onChange={(e) => setValue(type === 'mobile' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value)}
                placeholder={type === 'email' ? 'New email address' : 'New 10-digit mobile number'}
                className={input}
            />
            {sent && (
                <input
                    inputMode="numeric"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                    className={input}
                />
            )}
            {msg && <p className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
            <div className="flex flex-wrap gap-2">
                {!sent ? (
                    <button type="button" onClick={send} disabled={busy || !value.trim()} className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold disabled:opacity-50">
                        {busy ? 'Sending…' : 'Send code'}
                    </button>
                ) : (
                    <>
                        <button type="button" onClick={verify} disabled={busy || otp.length !== 6} className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold disabled:opacity-50">
                            {busy ? 'Checking…' : 'Confirm'}
                        </button>
                        <button type="button" onClick={send} disabled={busy} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 disabled:opacity-50">
                            Resend code
                        </button>
                        <button type="button" onClick={() => { setSent(false); setOtp(''); }} disabled={busy} className="px-3 py-1.5 text-xs text-gray-600 underline">
                            Edit {label}
                        </button>
                    </>
                )}
                <button type="button" onClick={reset} disabled={busy} className="px-3 py-1.5 text-xs text-gray-600">
                    Cancel
                </button>
            </div>
        </div>
    );
}
