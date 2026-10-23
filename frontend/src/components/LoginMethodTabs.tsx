export type LoginMethod = 'mobile' | 'email';

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** "Mobile | Email" switch shown above every login and sign-up form. */
export default function LoginMethodTabs({
  value,
  onChange,
  disabled,
}: {
  value: LoginMethod;
  onChange: (method: LoginMethod) => void;
  disabled?: boolean;
}) {
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
  return (
    <div className="w-full flex gap-1 p-1 mb-3.5 bg-slate-100 rounded-xl" role="group" aria-label="Login with">
      {tab('mobile', 'Mobile number')}
      {tab('email', 'Email')}
    </div>
  );
}
