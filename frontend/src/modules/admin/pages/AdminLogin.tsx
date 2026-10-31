import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithPassword } from '../../../services/api/auth/adminAuthService';
import { isValidEmail } from '../../../components/LoginMethodTabs';
import { useAuth } from '../../../context/AuthContext';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  // Admins log in with email + password.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const canContinue = isValidEmail(email) && password.length > 0;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canContinue || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await loginWithPassword(email.trim(), password);
      if (response.success && response.data) {
        login(response.data.token, { ...response.data.user, userType: "Admin" });
        navigate("/admin");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Wrong email or password");
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
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Admin email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your admin email"
                autoComplete="username"
                className="w-full px-3 py-2.5 text-sm border border-neutral-300 rounded-lg placeholder:text-neutral-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                disabled={loading}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-16 text-sm border border-neutral-300 rounded-lg placeholder:text-neutral-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                  disabled={loading}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-teal-700">
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

            <button
              type="submit"
              disabled={!canContinue || loading}
              className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${canContinue && !loading
                ? "bg-teal-600 text-white hover:bg-teal-700 shadow-md"
                : "bg-neutral-300 text-neutral-500 cursor-not-allowed"
                }`}>
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
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

