import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendEmailOTP, verifyOTP } from '../../../services/api/auth/adminAuthService';
import { isValidEmail } from '../../../components/LoginMethodTabs';
import OTPInput from '../../../components/OTPInput';
import { useAuth } from '../../../context/AuthContext';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  // Admins log in by email + OTP only.
  const [email, setEmail] = useState('');
  const canContinue = isValidEmail(email);
  const [showOTP, setShowOTP] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleMobileLogin = async () => {
    if (!canContinue) return;

    setLoading(true);
    setError("");

    try {
      await sendEmailOTP(email.trim());
      setShowOTP(true);
    } catch (err: any) {
      setError(
        err.response?.data?.message || "Failed to send OTP. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError("");

    try {
      const response = await verifyOTP(email.trim(), otp, true);
      if (response.success && response.data) {
        // Update AuthContext with token and user data
        login(response.data.token, {
          ...response.data.user,
          userType: "Admin",
        });
        navigate("/admin");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "OTP should be valid. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleExnshopLogin = () => {
    // Handle Exnshop login logic here
    navigate("/admin");
  };

  const handleSellerLogin = () => {
    // Navigate to seller login page
    navigate("/seller/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-green-50 flex flex-col items-center justify-center px-4 py-8">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-neutral-50 transition-colors"
        aria-label="Back">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg">
          <path
            d="M15 18L9 12L15 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Login Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header Section */}
        <div
          className="px-6 py-4 text-center border-b border-green-700 bg-white">
          <div className="mb-2">
            <img
              src="/exnshop_logo.png"
              alt="Exnshop"
              className="h-24 w-auto max-w-xs mx-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-1">
            Admin Login
          </h1>
          <p className="text-neutral-600 text-sm">
            Access your Exnshop admin dashboard
          </p>
        </div>

        {/* Login Form */}
        <div className="p-6 space-y-4">
          {!showOTP ? (
            /* Email Login Form */
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Admin email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your admin email"
                  className="w-full px-3 py-2.5 text-sm border border-neutral-300 rounded-lg placeholder:text-neutral-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                  disabled={loading}
                  autoFocus
                />
                <p className="mt-1.5 text-xs text-neutral-500">A 6-digit code will be sent to this email.</p>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                  {error}
                </div>
              )}

              <button
                onClick={handleMobileLogin}
                disabled={!canContinue || loading}
                className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${canContinue && !loading
                  ? "bg-teal-600 text-white hover:bg-teal-700 shadow-md"
                  : "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                  }`}>
                {loading ? "Sending..." : "Continue"}
              </button>
            </div>
          ) : (
            /* OTP Verification Form */
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-neutral-600 mb-2">
                  Enter the 6-digit OTP sent to
                </p>
                <p className="text-sm font-semibold text-neutral-800">
                  {email}
                </p>
              </div>

              <OTPInput onComplete={handleOTPComplete} disabled={loading} />

              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-2 rounded text-center">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowOTP(false);
                    setError("");
                  }}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors border border-neutral-300">
                  Change Email
                </button>
                <button
                  onClick={handleMobileLogin}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                  {loading ? "Verifying..." : "Resend OTP"}
                </button>
              </div>
            </div>
          )}




        </div>
      </div>

      {/* Footer Text */}
      <p className="mt-6 text-xs text-neutral-500 text-center max-w-md">
        By continuing, you agree to Exnshop's{' '}
        <a href="/terms-and-conditions" className="text-primary font-medium hover:underline">Terms of Service</a>
        {' '}and Privacy Policy
      </p>
    </div>
  );
}

