import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { register, sendOTP, verifyOTP } from '../../../services/api/auth/sellerAuthService';
import { removeAuthToken } from '../../../services/api/config';
import OTPInput from '../../../components/OTPInput';
import GoogleMapsAutocomplete from '../../../components/GoogleMapsAutocomplete';
import { useAuth } from '../../../context/AuthContext';
import { getHeaderCategoriesPublic, HeaderCategory } from '../../../services/api/headerCategoryService';
import LocationPickerMap from '../../../components/LocationPickerMap';
import AnimatedLogo from '../../../components/AnimatedLogo';

export default function SellerSignUp() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [bgImgOk, setBgImgOk] = useState(true);

  const [formData, setFormData] = useState({
    sellerName: '',
    mobile: '',
    email: '',
    storeName: '',
    category: '',
    categories: [] as string[],
    address: '',
    city: '',
    panCard: '',
    taxName: '',
    taxNumber: '',
    searchLocation: '',
    latitude: '',
    longitude: '',
    serviceRadiusKm: '10',
    accountName: '',
    bankName: '',
    branch: '',
    accountNumber: '',
    ifsc: '',
    channels: ['Quick'] as ('Quick' | 'ECommerce')[],
  });

  const [showOTP, setShowOTP] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<HeaderCategory[]>([]);
  const [locLoading, setLocLoading] = useState(false);

  useEffect(() => {
    getHeaderCategoriesPublic()
      .then((res) => { if (Array.isArray(res)) setCategories(res.filter((c) => c.status === 'Published')); })
      .catch(() => {});
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'mobile') {
      setFormData((p) => ({ ...p, mobile: value.replace(/\D/g, '').slice(0, 10) }));
    } else if (name === 'serviceRadiusKm') {
      const parts = value.replace(/[^0-9.]/g, '').split('.');
      setFormData((p) => ({ ...p, serviceRadiusKm: parts.length > 2 ? `${parts[0]}.${parts[1]}` : value.replace(/[^0-9.]/g, '') }));
    } else {
      setFormData((p) => ({ ...p, [name]: value }));
    }
  };

  const toggleChannel = (ch: 'Quick' | 'ECommerce') =>
    setFormData((p) => ({
      ...p,
      channels: p.channels.includes(ch) ? p.channels.filter((c) => c !== ch) : [...p.channels, ch],
    }));

  const toggleCategory = (cat: string) =>
    setFormData((p) => {
      const next = p.categories.includes(cat) ? p.categories.filter((c) => c !== cat) : [...p.categories, cat];
      return { ...p, categories: next, category: next[0] || '' };
    });

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) { setError('Geolocation not supported'); return; }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        const str = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        setFormData((p) => ({ ...p, latitude: lat.toString(), longitude: lng.toString(), searchLocation: str, address: p.address || str }));
        setLocLoading(false);
      },
      () => { setError('Unable to retrieve location'); setLocLoading(false); }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sellerName) { setError('Please enter your name'); return; }
    if (!formData.mobile || formData.mobile.length !== 10) { setError('Enter a valid 10-digit mobile'); return; }
    if (!formData.email) { setError('Please enter your email'); return; }
    if (!formData.storeName) { setError('Please enter your store name'); return; }
    if (formData.categories.length === 0) { setError('Select at least one category'); return; }
    if (formData.channels.length === 0) { setError('Select at least one commerce channel'); return; }
    if (!formData.searchLocation || !formData.latitude || !formData.longitude) { setError('Please select your store location'); return; }
    if (!formData.city) { setError('Please enter your city'); return; }
    const radius = parseFloat(formData.serviceRadiusKm);
    if (isNaN(radius) || radius < 0.1 || radius > 300) { setError('Service radius must be between 0.1 and 300 km'); return; }

    setLoading(true);
    setError('');
    try {
      const response = await register({
        sellerName: formData.sellerName,
        mobile: formData.mobile,
        email: formData.email,
        storeName: formData.storeName,
        category: formData.categories[0],
        categories: formData.categories,
        address: formData.address || formData.searchLocation,
        city: formData.city,
        searchLocation: formData.searchLocation,
        latitude: formData.latitude,
        longitude: formData.longitude,
        serviceRadiusKm: formData.serviceRadiusKm,
        channels: formData.channels,
      });
      if (response.success) {
        removeAuthToken('seller');
        try {
          await sendOTP(formData.email);
          setShowOTP(true);
        } catch (otpErr: any) {
          setError(otpErr.response?.data?.message || 'Registration successful but failed to send OTP.');
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await verifyOTP(formData.email, otp);
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
        navigate('/seller', { replace: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ─── Reusable input wrapper ─── */
  const inputCls = 'flex-1 h-full px-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent';
  const fieldWrap = 'flex items-center h-10 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 transition-all';
  const iconBox = 'w-10 h-full bg-slate-100/90 border-r border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0';
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';

  return (
    <div
      className="min-h-screen w-full flex flex-col relative overflow-x-hidden overflow-y-auto select-none font-['Poppins',sans-serif]"
      style={{ minHeight: '100vh', backgroundColor: '#fbf9f4' }}
    >
      {/* Background */}
      {bgImgOk && (
        <img src="/seller_login_bg.png" alt="" aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none z-0"
          loading="eager" onError={() => setBgImgOk(false)} />
      )}

      {/* Top Bar */}
      <div className="w-full max-w-sm sm:max-w-md mx-auto flex items-center justify-between relative z-10 px-4 pt-4 pb-2">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-white/95 hover:bg-white text-slate-700 border border-slate-200/80 flex items-center justify-center transition-all active:scale-95 shadow-sm cursor-pointer"
          aria-label="Go back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18L9 12L15 6" />
          </svg>
        </button>
        <div className="bg-white/95 rounded-full shadow-sm border border-slate-200/80 px-3 py-1 flex items-center gap-1">
          <span className="font-bold text-xs tracking-tight">
            <span className="text-blue-600">Exn</span><span className="text-orange-500">shop</span>
          </span>
          <span className="text-[11px] font-semibold text-slate-500">Seller</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-sm sm:max-w-md mx-auto flex flex-col items-center px-4 pb-6 relative z-10">

        {/* Branding */}
        <div className="flex flex-col items-center text-center mb-3">
          <div className="mb-2"><AnimatedLogo size="md" /></div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            Grow Your{' '}
            <span className="relative inline-block text-blue-600">
              Business
              <svg className="absolute left-0 -bottom-1 w-full" height="5" viewBox="0 0 100 5" preserveAspectRatio="none" aria-hidden="true">
                <path d="M1 3.5 Q 25 1 50 2.5 T 99 2.5" stroke="#f59e0b" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <div className="flex items-center justify-center gap-1.5 pt-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">📦 Sell Products</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">📈 Track Orders</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200/80">🤝 Grow Faster</span>
          </div>
        </div>

        {/* Card */}
        <div className="w-full bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-100 overflow-hidden">
          {/* Card Header */}
          <div className="px-5 pt-5 pb-3 text-center border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Seller Sign Up</h2>
            <p className="text-xs text-slate-500 mt-0.5">Create your Exnshop seller account</p>
          </div>

          {/* Scrollable Form Body */}
          <div className="px-5 py-4 overflow-y-auto ssignup-scroll" style={{ maxHeight: '58vh', scrollbarWidth: 'none' }}>
            <style>{`.ssignup-scroll::-webkit-scrollbar{display:none}`}</style>

            {!showOTP ? (
              <form onSubmit={handleSubmit}>

                {/* ── Required Info ── */}
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Required Info</p>

                {/* Seller Name */}
                <div className="mb-3">
                  <label className={labelCls}>Seller Name <span className="text-red-500">*</span></label>
                  <div className={fieldWrap}>
                    <div className={iconBox}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                    </div>
                    <input type="text" name="sellerName" value={formData.sellerName} onChange={handleInputChange} placeholder="Your full name" required disabled={loading} className={inputCls} />
                  </div>
                </div>

                {/* Mobile */}
                <div className="mb-3">
                  <label className={labelCls}>Mobile Number <span className="text-red-500">*</span></label>
                  <div className={fieldWrap}>
                    <div className="w-[62px] h-full bg-slate-100/90 border-r border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center gap-1 select-none flex-shrink-0">
                      <span>🇮🇳</span><span>+91</span>
                    </div>
                    <input type="tel" name="mobile" value={formData.mobile} onChange={handleInputChange} placeholder="Mobile number" required maxLength={10} disabled={loading} className={inputCls} />
                  </div>
                </div>

                {/* Email */}
                <div className="mb-3">
                  <label className={labelCls}>Email <span className="text-red-500">*</span></label>
                  <div className={fieldWrap}>
                    <div className={iconBox}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    </div>
                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="Email address" required disabled={loading} className={inputCls} />
                  </div>
                </div>

                {/* Store Name */}
                <div className="mb-3">
                  <label className={labelCls}>Store Name <span className="text-red-500">*</span></label>
                  <div className={fieldWrap}>
                    <div className={iconBox}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                    <input type="text" name="storeName" value={formData.storeName} onChange={handleInputChange} placeholder="Your store / shop name" required disabled={loading} className={inputCls} />
                  </div>
                </div>

                {/* Categories */}
                <div className="mb-3">
                  <label className={labelCls}>Categories <span className="text-red-500">*</span></label>
                  {categories.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                      <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                      Loading categories...
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                      {categories.map((cat) => {
                        const checked = formData.categories.includes(cat.name);
                        return (
                          <label key={cat._id} className={`flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1.5 rounded-lg transition-colors ${checked ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'text-slate-700 hover:bg-slate-100 border border-transparent'}`}>
                            <input type="checkbox" checked={checked} onChange={() => toggleCategory(cat.name)} disabled={loading}
                              className="h-3.5 w-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500 accent-blue-600 flex-shrink-0" />
                            <span className="truncate font-medium">{cat.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {formData.categories.length === 0 && categories.length > 0 && (
                    <p className="text-[10px] text-red-500 mt-0.5">Select at least one category</p>
                  )}
                </div>

                {/* Sell Via (Channels) */}
                <div className="mb-3">
                  <label className={labelCls}>Sell Via <span className="text-red-500">*</span> <span className="text-slate-400 font-normal">(select one or both)</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: 'Quick' as const, label: 'Quick Commerce', sub: 'Instant delivery' },
                      { key: 'ECommerce' as const, label: 'E-Commerce', sub: 'Standard shipping' },
                    ]).map((ch) => (
                      <button key={ch.key} type="button" onClick={() => toggleChannel(ch.key)} disabled={loading}
                        className={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border text-left transition-all ${formData.channels.includes(ch.key) ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                        <span className={`text-xs font-bold ${formData.channels.includes(ch.key) ? 'text-blue-800' : 'text-slate-800'}`}>{ch.label}</span>
                        <span className={`text-[10px] ${formData.channels.includes(ch.key) ? 'text-blue-600' : 'text-slate-400'}`}>{ch.sub}</span>
                      </button>
                    ))}
                  </div>
                  {formData.channels.length === 0 && (
                    <p className="text-[10px] text-red-500 mt-0.5">Select at least one channel</p>
                  )}
                </div>

                {/* Store Location */}
                <div className="mb-3">
                  <label className={labelCls}>Store Location <span className="text-red-500">*</span></label>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <GoogleMapsAutocomplete
                        value={formData.searchLocation}
                        onChange={(address, lat, lng, _placeName, components) => {
                          const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
                          setFormData((p) => ({
                            ...p,
                            searchLocation: address,
                            ...(hasCoords ? { latitude: lat.toString(), longitude: lng.toString() } : {}),
                            address,
                            city: components?.city || p.city,
                          }));
                        }}
                        placeholder="Search your store location…"
                        disabled={loading}
                        required
                      />
                    </div>
                    <button type="button" onClick={handleUseCurrentLocation} disabled={locLoading || loading}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors flex-shrink-0 disabled:opacity-40"
                      title="Use current location">
                      {locLoading
                        ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>}
                    </button>
                  </div>

                  {/* Map picker */}
                  <div className="mt-2 rounded-xl overflow-hidden border border-slate-200">
                    <p className="text-[10px] text-slate-500 px-2 pt-1.5 pb-1">
                      Drag the pin to your exact store entrance
                    </p>
                    <LocationPickerMap
                      initialLat={parseFloat(formData.latitude) || 0}
                      initialLng={parseFloat(formData.longitude) || 0}
                      onLocationSelect={(lat, lng) => setFormData((p) => ({ ...p, latitude: lat.toString(), longitude: lng.toString() }))}
                    />
                    {formData.latitude && formData.longitude && (
                      <p className="text-[10px] text-slate-400 text-center py-1">
                        📍 {parseFloat(formData.latitude).toFixed(5)}, {parseFloat(formData.longitude).toFixed(5)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Service Radius + City */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className={labelCls}>Radius (km) <span className="text-red-500">*</span></label>
                    <input type="number" name="serviceRadiusKm" value={formData.serviceRadiusKm} onChange={handleInputChange}
                      onKeyDown={(e) => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()}
                      placeholder="e.g. 10" required min="0.1" max="300" step="0.1" disabled={loading}
                      className="w-full h-10 px-3 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 focus:bg-white transition-all placeholder:text-slate-400 placeholder:font-normal" />
                  </div>
                  <div>
                    <label className={labelCls}>City <span className="text-red-500">*</span></label>
                    <input type="text" name="city" value={formData.city} onChange={handleInputChange} placeholder="Your city" required disabled={loading}
                      className="w-full h-10 px-3 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 focus:bg-white transition-all placeholder:text-slate-400 placeholder:font-normal" />
                  </div>
                </div>

                {/* ── Optional Info ── */}
                <div className="border-t border-slate-100 pt-3 mb-3">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Optional Info</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { name: 'panCard', label: 'PAN Card', placeholder: 'PAN number' },
                      { name: 'taxName', label: 'Tax Name', placeholder: 'GST / Tax name' },
                      { name: 'taxNumber', label: 'Tax Number', placeholder: 'Tax number' },
                      { name: 'ifsc', label: 'IFSC Code', placeholder: 'IFSC code' },
                      { name: 'accountName', label: 'Account Name', placeholder: 'Account holder' },
                      { name: 'bankName', label: 'Bank Name', placeholder: 'Bank name' },
                      { name: 'accountNumber', label: 'Account No.', placeholder: 'Account number' },
                      { name: 'branch', label: 'Branch', placeholder: 'Branch name' },
                    ].map((f) => (
                      <div key={f.name}>
                        <label className={labelCls}>{f.label}</label>
                        <input type="text" name={f.name} value={(formData as any)[f.name]} onChange={handleInputChange} placeholder={f.placeholder} disabled={loading}
                          className="w-full h-9 px-2.5 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white transition-all placeholder:text-slate-400 placeholder:font-normal" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hidden coord fields */}
                <input type="hidden" name="latitude" value={formData.latitude} />
                <input type="hidden" name="longitude" value={formData.longitude} />

                {/* Error */}
                {error && (
                  <div className="mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200/80 p-2.5 rounded-xl text-center">{error}</div>
                )}

                {/* Submit */}
                <button type="submit" disabled={loading}
                  className={`w-full h-11 rounded-xl font-semibold text-sm tracking-wide transition-all flex items-center justify-center shadow-md ${!loading ? 'bg-gradient-to-r from-blue-700 via-blue-600 to-teal-600 text-white hover:from-blue-800 hover:to-teal-700 shadow-blue-900/20 cursor-pointer active:scale-[0.99]' : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'}`}>
                  {loading ? (
                    <span className="inline-flex items-center gap-2 text-white">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                      Creating Account...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      Create Seller Account
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                    </span>
                  )}
                </button>

                <p className="text-xs text-slate-500 text-center font-medium mt-3">
                  Already a seller?{' '}
                  <span onClick={() => navigate('/seller/login')} className="text-blue-700 font-semibold hover:underline cursor-pointer">Log in →</span>
                </p>
              </form>
            ) : (
              /* OTP Step */
              <div className="space-y-4 py-2">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 text-2xl">📧</div>
                  <h3 className="text-base font-bold text-slate-900">Verify Your Email</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Enter the 6-digit code sent to <span className="font-bold text-blue-700">{formData.email}</span>
                  </p>
                </div>

                <div className="flex justify-center">
                  <OTPInput onComplete={handleOTPComplete} disabled={loading} />
                </div>

                {error && (
                  <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-200/80 p-2.5 rounded-xl text-center">{error}</div>
                )}

                <div className="flex gap-2.5">
                  <button onClick={() => { setShowOTP(false); setError(''); }} disabled={loading}
                    className="flex-1 h-10 rounded-xl font-semibold text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition-all border border-slate-200 cursor-pointer flex items-center justify-center">
                    ← Back
                  </button>
                  <button onClick={async () => { setLoading(true); setError(''); try { await sendOTP(formData.email); } catch (e: any) { setError(e.response?.data?.message || 'Failed to resend.'); } finally { setLoading(false); } }}
                    disabled={loading}
                    className="flex-1 h-10 rounded-xl font-semibold text-xs bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100 active:scale-95 transition-all cursor-pointer flex items-center justify-center">
                    {loading ? 'Sending...' : 'Resend OTP'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Card Footer */}
          <div className="px-5 pb-4">
            <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-3 border-t border-slate-100">
              By continuing, you agree to Exnshop's{' '}
              <span onClick={() => navigate('/terms-and-conditions')} className="text-blue-700 font-medium hover:underline cursor-pointer">Terms of Service</span>
              {' '}&{' '}
              <span onClick={() => navigate('/privacy-policy')} className="text-blue-700 font-medium hover:underline cursor-pointer">Privacy Policy</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
