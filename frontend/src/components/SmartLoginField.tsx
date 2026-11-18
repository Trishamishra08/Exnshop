import { useEffect, useState } from 'react';
import { isValidEmail } from './LoginMethodTabs';

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

const PHRASES = ['Enter mobile number', 'Enter email address'];

/** Typewriter placeholder: types a phrase, pauses, deletes it, then types the next one. */
function useTypewriter(active: boolean) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!active) return;
    let phrase = 0;
    let len = 0;
    let deleting = false;
    let timer: number;
    const tick = () => {
      const current = PHRASES[phrase];
      if (!deleting) {
        len += 1;
        setText(current.slice(0, len));
        if (len === current.length) { deleting = true; timer = window.setTimeout(tick, 1400); return; }
        timer = window.setTimeout(tick, 70);
      } else {
        len -= 1;
        setText(current.slice(0, len));
        if (len === 0) { deleting = false; phrase = (phrase + 1) % PHRASES.length; timer = window.setTimeout(tick, 350); return; }
        timer = window.setTimeout(tick, 35);
      }
    };
    timer = window.setTimeout(tick, 300);
    return () => window.clearTimeout(timer);
  }, [active]);
  return text;
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
  const typed = useTypewriter(value === '');

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
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm sm:text-base text-slate-400">
              {typed}
              <span className="ml-0.5 inline-block w-px h-4 bg-slate-400 animate-pulse" />
            </span>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400 px-0.5">
        {showMobile ? 'OTP will be sent to your mobile number' : value ? 'OTP will be sent to your email' : 'Log in with your mobile number or email'}
      </p>
    </div>
  );
}
