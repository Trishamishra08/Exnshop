import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sendOTP, verifyOTP } from '../../../services/api/auth/deliveryAuthService';
import OTPInput from '../../../components/OTPInput';
import { useAuth } from '../../../context/AuthContext';
import { removeAuthToken, getAuthToken } from '../../../services/api/config';

export default function DeliveryLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [showOTP, setShowOTP] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isNotRegistered, setIsNotRegistered] = useState(false);
  const [bgImgOk, setBgImgOk] = useState(true);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Clear token on mount only if unauthenticated
  useEffect(() => {
    if (!getAuthToken('delivery')) {
      removeAuthToken('delivery');
    }
  }, []);

  const handleEmailLogin = async () => {
    if (!isValidEmail) return;

    setLoading(true);
    setError('');
    setIsNotRegistered(false);
    setInfoMessage('An OTP will be sent to your email');

    try {
      const response = await sendOTP(email);
      if (response.success && response.sessionId) {
        setSessionId(response.sessionId);
        setShowOTP(true);
        setInfoMessage('');
      } else {
        setInfoMessage('');
        setError(response.message || 'Failed to initiate OTP');
      }
    } catch (err: any) {
      setInfoMessage('');
      const status = err.response?.status;
      const message = err.response?.data?.message || 'Failed to send OTP. Please try again.';
      setError(message);
      if (status === 400 && (message.toLowerCase().includes('not found') || message.toLowerCase().includes('register'))) {
        setIsNotRegistered(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await verifyOTP(email, otp, sessionId);
      if (response.success && response.data) {
        login(response.data.token, {
          ...response.data.user,
          userType: 'Delivery'
        });
        const from = (location.state as any)?.from?.pathname || (location.state as any)?.from || '/delivery';
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      const message = err.response?.data?.message || 'OTP should be valid. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-between relative overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 select-none bg-white"
      style={{ minHeight: '100vh', width: '100%', boxSizing: 'border-box', backgroundColor: '#FFFFFF' }}
    >
      {bgImgOk && (
        <img
          src="/login_bg.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none z-0"
          loading="eager"
          decoding="async"
          onError={() => setBgImgOk(false)}
        />
      )}

      {/* Top Bar / Back Button */}
      <div className="w-full max-w-sm sm:max-w-md mx-auto flex items-center justify-between relative z-10 pt-1 pb-2">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 flex items-center justify-center transition-all active:scale-95 shadow-xs cursor-pointer"
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="w-full max-w-sm sm:max-w-md mx-auto flex flex-col items-center justify-center my-auto py-2 relative z-10">
        {/* Branding */}
        <div className="flex flex-col items-center justify-center text-center mb-4 sm:mb-5">
          <div className="mb-2.5 transition-transform duration-200 hover:scale-[1.02]">
            <img src="/exnshop_logo.png" alt="Exnshop" className="w-32 sm:w-36 h-auto max-h-14 object-contain mx-auto" />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Delivery{' '}
              <span className="relative inline-block text-teal-600">
                Partner
                <svg className="absolute left-0 -bottom-1 w-full" height="6" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M1 4 Q 25 1 50 3 T 99 3" stroke="#f59e0b" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium tracking-wide">
              Deliver orders & track your earnings
            </p>
            <div className="flex items-center justify-center gap-2 pt-2.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs">
                🛵 Deliveries
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs">
                ₹ Earnings
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200/80 shadow-2xs">
                ⚡ Flexible
              </span>
            </div>
          </div>
        </div>

        {/* Auth Card */}
        <div className="w-full bg-white rounded-3xl p-5 sm:p-6 shadow-xl shadow-slate-200/80 border border-slate-100 relative z-10 transition-all">
          {!showOTP ? (
            <>
              <div className="mb-4 text-center">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Delivery Log in</h2>
                <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
                  Enter your registered email to continue
                </p>
              </div>

              <div className="w-full mb-3.5">
                <div className="flex items-center h-12 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:bg-white focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/15 transition-all shadow-xs">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value.trim())}
                    placeholder="you@example.com"
                    className="flex-1 h-full px-3.5 text-sm sm:text-base font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent"
                    disabled={loading}
                    autoFocus
                  />
                </div>
              </div>

              {infoMessage && !error && (
                <div className="w-full mb-3 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200/80 p-2.5 rounded-xl text-center">
                  {infoMessage}
                </div>
              )}

              {error && (
                <div className="w-full mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200/80 p-2.5 rounded-xl text-center flex flex-col gap-2">
                  <span>{error}</span>
                  {isNotRegistered && (
                    <button
                      onClick={() => navigate('/delivery/signup')}
                      className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 py-1.5 px-3 rounded self-center transition-colors"
                    >
                      Register Now
                    </button>
                  )}
                </div>
              )}

              <div className="w-full mb-2">
                <button
                  onClick={handleEmailLogin}
                  disabled={!isValidEmail || loading}
                  className={`w-full h-12 rounded-xl font-semibold text-sm tracking-wide transition-all shadow-md active:scale-[0.99] flex items-center justify-center ${
                    isValidEmail && !loading
                      ? 'bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 hover:from-teal-800 hover:to-emerald-700 text-white shadow-teal-900/20 cursor-pointer'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                  }`}
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2 text-white">
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending OTP...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      Continue
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  )}
                </button>
              </div>

              <p className="text-xs sm:text-sm text-slate-500 text-center font-medium">
                Don't have a delivery partner account?{' '}
                <span onClick={() => navigate('/delivery/signup')} className="text-teal-700 font-semibold hover:underline cursor-pointer">
                  Sign up
                </span>
              </p>
            </>
          ) : (
            <>
              <div className="w-full mb-4 text-center">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Verify Email</h2>
                <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
                  Enter the 6-digit code sent to <span className="font-bold text-teal-700">{email}</span>
                </p>
              </div>

              <div className="w-full mb-4 flex justify-center">
                <OTPInput onComplete={handleOTPComplete} disabled={loading} />
              </div>

              {error && (
                <div className="w-full mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200/80 p-2.5 rounded-xl text-center">
                  {error}
                </div>
              )}

              <div className="w-full mb-2 flex gap-2.5">
                <button
                  onClick={() => { setShowOTP(false); setError(''); }}
                  disabled={loading}
                  className="flex-1 h-10 rounded-xl font-semibold text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition-all border border-slate-200 cursor-pointer flex items-center justify-center"
                >
                  Change Email
                </button>
                <button
                  onClick={handleEmailLogin}
                  disabled={loading}
                  className="flex-1 h-10 rounded-xl font-semibold text-xs bg-teal-50 text-teal-700 border border-teal-200/80 hover:bg-teal-100 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                >
                  {loading ? 'Sending...' : 'Resend OTP'}
                </button>
              </div>
            </>
          )}

          <p className="text-[11px] text-slate-400 text-center leading-relaxed mt-4 pt-3 border-t border-slate-100">
            By continuing, you agree to Exnshop's{' '}
            <span onClick={() => navigate('/terms-and-conditions')} className="text-teal-700 font-medium hover:underline cursor-pointer">
              Terms of Service
            </span>{' '}&{' '}
            <span onClick={() => navigate('/privacy-policy')} className="text-teal-700 font-medium hover:underline cursor-pointer">
              Privacy Policy
            </span>.
          </p>
        </div>
      </div>

      <div className="w-full max-w-sm sm:max-w-md mx-auto h-2" />
    </div>
  );
}
