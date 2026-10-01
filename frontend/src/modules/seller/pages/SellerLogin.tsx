import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sendOTP, verifyOTP } from '../../../services/api/auth/sellerAuthService';
import OTPInput from '../../../components/OTPInput';
import { useAuth } from '../../../context/AuthContext';
import AnimatedLogo from '../../../components/AnimatedLogo';

export default function SellerLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showOTP, setShowOTP] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [bgImgOk, setBgImgOk] = useState(true);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidMobile = mobileNumber.length === 10;
  const isFormValid = isValidEmail || isValidMobile;

  const handleLogin = async () => {
    if (!isFormValid) {
      setError('Please enter a valid email address or 10-digit mobile number');
      return;
    }

    setLoading(true);
    setError('');
    const targetEmail = isValidEmail ? email : `${mobileNumber}@seller.exnshop.com`;
    setInfoMessage(`An OTP will be sent to ${isValidEmail ? email : `+91 ${mobileNumber}`}`);

    try {
      const response = await sendOTP(targetEmail);
      if (response.success) {
        setShowOTP(true);
        setInfoMessage('');
      } else {
        setInfoMessage('');
        setError(response.message || 'Failed to send OTP. Please try again.');
      }
    } catch (err: any) {
      setInfoMessage('');
      setError(err.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError('');

    const targetEmail = isValidEmail ? email : `${mobileNumber}@seller.exnshop.com`;

    try {
      const response = await verifyOTP(targetEmail, otp);
      if (response.success && response.data) {
        login(response.data.token, {
          id: response.data.user.id,
          name: response.data.user.sellerName,
          email: response.data.user.email,
          phone: response.data.user.mobile,
          userType: 'Seller',
          storeName: response.data.user.storeName,
          status: response.data.user.status,
          address: response.data.user.address,
          city: response.data.user.city,
        });
        const from = (location.state as any)?.from?.pathname || (location.state as any)?.from || '/seller';
        navigate(from, { replace: true });
      } else {
        setError(response.message || 'Login failed. Please try again.');
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'OTP should be valid. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-between relative overflow-x-hidden overflow-y-auto px-4 py-3 sm:px-6 sm:py-5 select-none bg-[#fbf9f4] font-['Poppins',sans-serif]"
      style={{
        minHeight: '100vh',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Background illustration */}
      {bgImgOk && (
        <img
          src="/seller_login_bg.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none z-0"
          loading="eager"
          decoding="async"
          onError={() => setBgImgOk(false)}
        />
      )}

      {/* Top Bar / Clean Circular Back Button & Seller Pill */}
      <div className="w-full max-w-sm sm:max-w-md mx-auto flex items-center justify-between relative z-10 pt-1 pb-1">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 hover:bg-white text-slate-700 border border-slate-200/80 flex items-center justify-center transition-all active:scale-95 shadow-xs cursor-pointer backdrop-blur-xs"
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Exnshop Seller Pill Badge */}
        <div className="bg-white/95 backdrop-blur-xs rounded-full shadow-xs border border-slate-200/80 px-3 py-1 flex items-center gap-1">
          <span className="font-bold text-xs sm:text-sm tracking-tight flex items-center">
            <span className="text-blue-600">Exn</span>
            <span className="text-orange-500">shop</span>
          </span>
          <span className="text-[11px] sm:text-xs font-semibold text-slate-500">Seller</span>
        </div>
      </div>

      {/* Center Unified Content Container (Brand Header + Auth Card) */}
      <div className="w-full max-w-sm sm:max-w-md mx-auto flex flex-col items-center justify-center my-auto py-1 sm:py-2 relative z-10">
        
        {/* Compact Exnshop Branding Section - All Centered */}
        <div className="flex flex-col items-center justify-center text-center mb-3 sm:mb-4 w-full">
          {/* Animated Logo with Rotating Orbital Ring */}
          <div className="mb-2.5 transition-transform duration-200 hover:scale-[1.02]">
            <AnimatedLogo size="md" />
          </div>

          {/* Brand Tagline */}
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Grow Your{' '}
              <span className="relative inline-block text-blue-600">
                Business
                <svg
                  className="absolute left-0 -bottom-1 w-full"
                  height="6"
                  viewBox="0 0 100 6"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d="M1 4 Q 25 1 50 3 T 99 3" stroke="#f59e0b" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
              </span>
            </h1>

            {/* Quick Feature Badges (Compact Tinted Pills) */}
            <div className="flex items-center justify-center gap-2 pt-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs">
                📦 Sell Products
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs">
                📈 Track Orders
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200/80 shadow-2xs">
                🤝 Grow Faster
              </span>
            </div>
          </div>
        </div>

        {/* Clean Modern Authentication Card */}
        <div className="w-full bg-white rounded-3xl p-5 sm:p-6 shadow-xl shadow-slate-200/80 border border-slate-100 relative z-10 transition-all">
          {!showOTP ? (
            <>
              {/* Form Header */}
              <div className="mb-4 text-center">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Seller Login
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 font-normal mt-0.5">
                  Enter your email or mobile number to continue
                </p>
              </div>

              {/* Email Address Input */}
              <div className="w-full mb-3">
                <div className="flex items-center h-11 sm:h-12 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/15 transition-all shadow-xs">
                  <div className="w-11 h-full bg-slate-100/90 border-r border-slate-200/90 text-slate-500 flex items-center justify-center flex-shrink-0">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value.trim()); setError(''); }}
                    placeholder="Enter your email address"
                    className="flex-1 h-full px-3.5 text-sm sm:text-base font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent"
                    disabled={loading}
                    autoFocus
                  />
                </div>
              </div>

              {/* Mobile Number Input */}
              <div className="w-full mb-3">
                <div className="flex items-center h-11 sm:h-12 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/15 transition-all shadow-xs">
                  <div className="w-[74px] h-full bg-slate-100/90 border-r border-slate-200/90 text-sm font-bold text-slate-700 flex items-center justify-center gap-1 select-none flex-shrink-0">
                    <span>🇮🇳</span>
                    <span>+91</span>
                  </div>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => { setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                    placeholder="Enter mobile number"
                    className="flex-1 h-full px-3.5 text-sm sm:text-base font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent"
                    maxLength={10}
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Remember Me & Forgot details row */}
              <div className="flex items-center justify-between text-xs sm:text-[13px] mb-3 px-0.5">
                <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-600/20 accent-blue-600 cursor-pointer"
                  />
                  <span className="font-medium text-slate-700">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="font-medium text-blue-600 hover:underline cursor-pointer"
                >
                  Forgot login details?
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="w-full mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200/80 p-2.5 rounded-xl text-center">
                  {error}
                </div>
              )}

              {/* Info Message */}
              {infoMessage && !error && (
                <div className="w-full mb-3 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200/80 p-2.5 rounded-xl text-center">
                  {infoMessage}
                </div>
              )}

              {/* Prominent Full-Width Continue CTA */}
              <div className="w-full mb-2">
                <button
                  onClick={handleLogin}
                  disabled={!isFormValid || loading}
                  className={`w-full h-11 sm:h-12 rounded-xl font-semibold text-sm tracking-wide transition-all shadow-md active:scale-[0.99] flex items-center justify-center ${
                    isFormValid && !loading
                      ? 'bg-gradient-to-r from-blue-700 via-blue-600 to-teal-600 hover:from-blue-800 hover:to-teal-700 text-white shadow-blue-900/20 cursor-pointer'
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

              {/* New to Exnshop? Register as a Seller Link */}
              <p className="text-xs sm:text-sm text-slate-500 text-center font-medium">
                New to Exnshop?{' '}
                <span
                  onClick={() => navigate('/seller/signup')}
                  className="text-blue-700 font-semibold hover:underline cursor-pointer"
                >
                  Register as a Seller →
                </span>
              </p>
            </>
          ) : (
            <>
              {/* OTP Verification Header */}
              <div className="w-full mb-4 text-center">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Verify OTP
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
                  Enter the 6-digit code sent to{' '}
                  <span className="font-bold text-blue-700">
                    {isValidEmail ? email : `+91 ${mobileNumber}`}
                  </span>
                </p>
              </div>

              {/* OTP Input Fields */}
              <div className="w-full mb-4 flex justify-center">
                <OTPInput onComplete={handleOTPComplete} disabled={loading} />
              </div>

              {/* Error Message */}
              {error && (
                <div className="w-full mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200/80 p-2.5 rounded-xl text-center">
                  {error}
                </div>
              )}

              {/* OTP Action Buttons */}
              <div className="w-full mb-2 flex gap-2.5">
                <button
                  onClick={() => {
                    setShowOTP(false);
                    setError('');
                  }}
                  disabled={loading}
                  className="flex-1 h-10 rounded-xl font-semibold text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition-all border border-slate-200 cursor-pointer flex items-center justify-center"
                >
                  Change Details
                </button>
                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="flex-1 h-10 rounded-xl font-semibold text-xs bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                >
                  {loading ? 'Sending...' : 'Resend OTP'}
                </button>
              </div>
            </>
          )}

          {/* Legal / Terms Copy */}
          <p className="text-[11px] text-slate-400 text-center leading-relaxed mt-4 pt-3 border-t border-slate-100">
            By continuing, you agree to Exnshop's{' '}
            <span
              onClick={() => navigate('/terms-and-conditions')}
              className="text-blue-700 font-medium hover:underline cursor-pointer"
            >
              Terms of Service
            </span>{' '}
            &{' '}
            <span
              onClick={() => navigate('/privacy-policy')}
              className="text-blue-700 font-medium hover:underline cursor-pointer"
            >
              Privacy Policy
            </span>.
          </p>
        </div>
      </div>

      {/* Forgot Details Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 text-center animate-fadeIn">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 text-xl">
              🔑
            </div>
            <h3 className="text-lg font-bold text-slate-900">Forgot Login Details?</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Please enter your registered email address or mobile number on the login screen to receive a one-time OTP for direct login.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              For assistance, email Seller Support at <strong className="text-slate-800">support@exnshop.com</strong>
            </p>
            <button
              onClick={() => setShowForgotModal(false)}
              className="w-full h-11 bg-gradient-to-r from-blue-700 to-blue-600 text-white rounded-xl font-semibold text-xs mt-5 shadow-md shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Bottom Spacer for Vertical Centering Balance */}
      <div className="w-full max-w-sm sm:max-w-md mx-auto h-1 sm:h-2" />
    </div>
  );
}
