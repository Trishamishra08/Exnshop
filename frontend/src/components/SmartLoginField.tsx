import { useEffect, useState } from 'react';
import { isValidEmail, useOtpMethods } from './LoginMethodTabs';

/**
 * One login box for both mobile number and email.
 * Starts typing digits -> it becomes a +91 mobile field (10 digits max);
 * starts typing a letter or "@" -> it stays an email field.
 */
export type IdentifierMethod = 'mobile' | 'email';

export const parseIdentifier = (raw: string): { method: IdentifierMethod; mobile: string; email: string; valid: boolean } => {
  const value = raw.trim();
  const looksLikeMobile = value !== '' && /^[+\d\s-]+$/.test(value);
  if (looksLikeMobile) {
    let digits = value.replace(/\D/g, '');
    if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
    digits = digits.slice(0, 10);
    return { method: 'mobile', mobile: digits, email: '', valid: digits.length === 10 };
  }
  return { method: 'email', mobile: '', email: value, valid: isValidEmail(value) };
};

const MOBILE_PHRASE = 'Enter mobile number';
const EMAIL_PHRASE = 'Enter email address';

/** Index of the phrase to show; rolls to the next one every 2.5s (like the home search bar). */
function useRollingIndex(active: boolean, count: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active || count < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), 2500);
    return () => window.clearInterval(timer);
  }, [active, count]);
  return index % Math.max(count, 1);
}

export default function SmartLoginField({
  value,
  onChange,
  disabled,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onSubmit?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const { method } = parseIdentifier(value);
  const showMobile = value !== '' && method === 'mobile';
  // Only offer the OTP methods the admin has switched ON (Service Controls > Login & OTP).
  const otp = useOtpMethods();
  const PHRASES = [...(otp.mobile ? [MOBILE_PHRASE] : []), ...(otp.email ? [EMAIL_PHRASE] : [])];
  const current = useRollingIndex(value === '', PHRASES.length);
  const blocked = value !== '' && ((showMobile && !otp.mobile) || (!showMobile && !otp.email));

  const handle = (raw: string) => {
    // Digits only once it is clearly a number: keep to 10 digits and no stray letters.
    if (raw !== '' && /^[+\d\s-]+$/.test(raw)) {
      let digits = raw.replace(/\D/g, '');
      if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
      onChange(digits.slice(0, 10));
    } else {
      onChange(raw.replace(/\s/g, ''));
    }
  };

  return (
    <div className="w-full mb-3">
      <div
        className={`relative flex items-center h-11 sm:h-12 border rounded-xl overflow-hidden transition-all ${
          focused ? 'bg-white border-blue-600 ring-2 ring-blue-600/15' : 'bg-slate-50 border-slate-200'
        }`}
      >
        {showMobile && (
          <div className="w-[74px] h-full bg-slate-100/90 border-r border-slate-200/90 text-sm font-bold text-slate-700 flex items-center justify-center gap-1 select-none flex-shrink-0">
            <span>🇮🇳</span>
            <span>+91</span>
          </div>
        )}
        <div className="relative flex-1 h-full">
          <input
            type="text"
            inputMode={showMobile ? 'numeric' : 'email'}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            onChange={(e) => handle(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' && onSubmit) onSubmit(); }}
            aria-label="Mobile number or email"
            className="w-full h-full px-3.5 text-sm sm:text-base font-semibold text-slate-900 focus:outline-none bg-transparent"
            disabled={disabled}
            autoFocus
          />
          {value === '' && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 left-3.5 overflow-hidden">
              {PHRASES.map((phrase, i) => {
                const prev = (current - 1 + PHRASES.length) % PHRASES.length;
                return (
                  <div
                    key={phrase}
                    className={`absolute inset-0 flex items-center transition-all duration-500 ${
                      i === current ? 'translate-y-0 opacity-100' : i === prev ? '-translate-y-full opacity-0' : 'translate-y-full opacity-0'
                    }`}
                  >
                    <span className="text-sm sm:text-base text-slate-400 truncate">{phrase}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <p className={`mt-1.5 text-[11px] px-0.5 ${blocked ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
        {blocked
          ? showMobile
            ? 'Mobile OTP is turned off right now. Please enter your email.'
            : 'Email OTP is turned off right now. Please enter your mobile number.'
          : showMobile
            ? 'OTP will be sent to your mobile number'
            : value
              ? 'OTP will be sent to your email'
              : otp.mobile && otp.email
                ? 'Log in with your mobile number or email'
                : otp.mobile
                  ? 'Log in with your mobile number'
                  : 'Log in with your email'}
      </p>
    </div>
  );
}
