import { useEffect, useState } from 'react';
import api from '../services/api/config';

export type LoginMethod = 'mobile' | 'email';

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * Which OTP methods the admin has switched ON (Admin > Service Controls > Login & OTP).
 * Mobile OTP is OFF until the admin turns it on (it needs an SMS provider); email is ON.
 * The last known state is kept on the device so forms open on the right method at once.
 */
export interface OtpMethods { mobile: boolean; email: boolean }

const CACHE_KEY = 'otp_methods';
const readCached = (): OtpMethods => {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (v && typeof v === 'object') return { mobile: v.mobile === true, email: v.email !== false };
  } catch {
    /* ignore */
  }
  return { mobile: import.meta.env.VITE_MOBILE_OTP_ENABLED === 'true', email: true };
};

let current: OtpMethods = readCached();
let inflight: Promise<OtpMethods> | null = null;
const listeners = new Set<(m: OtpMethods) => void>();

const refresh = () => {
  if (!inflight) {
    inflight = api
      .get('/customer/services')
      .then((res) => {
        const d = res.data?.data || {};
        const next: OtpMethods = { mobile: d.sms_otp === true, email: d.email_otp !== false };
        if (!next.mobile && !next.email) next.email = true; // never lock everyone out
        current = next;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        } catch {
          /* private mode */
        }
        listeners.forEach((fn) => fn(next));
        return next;
      })
      .catch(() => current)
      .finally(() => {
        setTimeout(() => { inflight = null; }, 30000); // re-check at most every 30 s
      });
  }
  return inflight;
};

export function useOtpMethods(): OtpMethods {
  const [methods, setMethods] = useState<OtpMethods>(current);
  useEffect(() => {
    listeners.add(setMethods);
    refresh();
    return () => { listeners.delete(setMethods); };
  }, []);
  return methods;
}

/** The method a form should start on. */
export const defaultLoginMethod = (): LoginMethod => (current.email ? 'email' : 'mobile');

/** Kept for older imports: the starting method when the page loads. */
export const DEFAULT_LOGIN_METHOD: LoginMethod = defaultLoginMethod();

/** "Mobile | Email" switch shown on sign-up forms; only the methods the admin allows are offered. */
export default function LoginMethodTabs({
  value,
  onChange,
  disabled,
}: {
  value: LoginMethod;
  onChange: (method: LoginMethod) => void;
  disabled?: boolean;
}) {
  const methods = useOtpMethods();

  // The selected method was switched off by the admin: move to the one that is on.
  useEffect(() => {
    if (value === 'mobile' && !methods.mobile && methods.email) onChange('email');
    else if (value === 'email' && !methods.email && methods.mobile) onChange('mobile');
  }, [value, methods, onChange]);

  const tab = (method: LoginMethod, label: string) => (
    <button
      type="button"
      onClick={() => onChange(method)}
      disabled={disabled}
      aria-pressed={value === method}
      className={`flex-1 h-9 rounded-lg text-sm font-semibold transition-colors ${
        value === method ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  );
  if (!methods.mobile || !methods.email) return null; // only one method is on
  return (
    <div className="w-full flex gap-1 p-1 mb-3.5 bg-slate-100 rounded-xl" role="group" aria-label="Login with">
      {tab('mobile', 'Mobile number')}
      {tab('email', 'Email')}
    </div>
  );
}
