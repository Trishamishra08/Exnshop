import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  register,
  sendMobileOTP,
  verifyMobileOTP,
  sendOTP as sendEmailOTP,
  verifyOTP as verifyEmailOTP,
} from "../../../services/api/auth/deliveryAuthService";
import LoginMethodTabs, { LoginMethod } from "../../../components/LoginMethodTabs";
import { removeAuthToken } from "../../../services/api/config";
import { uploadDocument } from "../../../services/api/uploadService";
import { validateDocumentFile, compressImage } from "../../../utils/imageUpload";
import OTPInput from "../../../components/OTPInput";
import AnimatedLogo from "../../../components/AnimatedLogo";

export default function DeliverySignUp() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    dateOfBirth: "",
    password: "",
    address: "",
    city: "",
    pincode: "",
    drivingLicenseUrl: "",
    nationalIdentityCardUrl: "",
    accountName: "",
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    bonusType: "",
  });

  const [drivingLicenseFile, setDrivingLicenseFile] = useState<File | null>(null);
  const [nationalIdentityCardFile, setNationalIdentityCardFile] = useState<File | null>(null);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [showOTP, setShowOTP] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isCityLoading, setIsCityLoading] = useState(false);
  const [bgImgOk, setBgImgOk] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // What a field accepts while typing — a stray letter in a phone/account
  // number, or more characters than the real format has, is rejected as it's
  // typed, not only flagged after the fact.
  const DIGITS_ONLY_FIELDS = new Set(["mobile", "pincode", "accountNumber"]);
  const ALPHANUMERIC_FIELDS = new Set(["ifscCode"]);
  const UPPERCASE_FIELDS = new Set(["ifscCode"]);
  const FIELD_MAX_LENGTH: Record<string, number> = { mobile: 10, pincode: 6, accountNumber: 18, ifscCode: 11 };

  // Format checks: name/mobile/email/password/address/city are always required;
  // DOB (if given) must mean 18+; pincode (if given) must be a real 6-digit
  // code; the three bank fields become required together once any one of
  // them is filled in, so the (optional) bank section can be left empty.
  const validators: Record<string, (value: string, data: typeof formData) => string | undefined> = {
    name: (v) => (!v.trim() ? "Full name is required" : v.trim().length < 2 ? "Enter a valid name" : undefined),
    mobile: (v) => (!v ? "Mobile number is required" : !/^[6-9][0-9]{9}$/.test(v) ? "Enter a valid 10-digit Indian mobile number" : undefined),
    email: (v) => (!v.trim() ? "Email is required" : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? "Enter a valid email address" : undefined),
    password: (v) => (!v ? "Password is required" : v.length < 6 ? "Password must be at least 6 characters" : undefined),
    dateOfBirth: (v) => {
      if (!v) return undefined;
      const dob = new Date(v);
      if (Number.isNaN(dob.getTime()) || dob > new Date()) return "Enter a valid date of birth";
      const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return age < 18 ? "You must be at least 18 years old" : undefined;
    },
    address: (v) => (!v.trim() ? "Address is required" : v.trim().length < 5 ? "Enter your full address" : undefined),
    city: (v) => (!v.trim() ? "City is required" : undefined),
    pincode: (v) => (v && !/^[1-9][0-9]{5}$/.test(v) ? "Enter a valid 6-digit pincode" : undefined),
    accountName: (v, d) => (!v.trim() && (d.bankName || d.accountNumber || d.ifscCode) ? "Required once any bank detail is filled in" : undefined),
    bankName: (v, d) => (!v.trim() && (d.accountName || d.accountNumber || d.ifscCode) ? "Required once any bank detail is filled in" : undefined),
    accountNumber: (v) => (v && !/^[0-9]{9,18}$/.test(v) ? "Account number must be 9–18 digits" : undefined),
    ifscCode: (v, d) => (d.accountNumber && !v ? "IFSC is required with an account number" : v && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v) ? "IFSC must look like ABCD0123456" : undefined),
  };

  const validateField = (name: string, value: string, data = formData) => {
    const check = validators[name];
    if (!check) return;
    const message = check(value, data);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (message) next[name] = message; else delete next[name];
      return next;
    });
  };
  const handleFieldBlur = (e: React.FocusEvent<HTMLInputElement>) => validateField(e.target.name, e.target.value);
  const validateAll = (data: typeof formData): Record<string, string> => {
    const errors: Record<string, string> = {};
    for (const name of Object.keys(validators)) {
      const message = validators[name]((data as any)[name] || "", data);
      if (message) errors[name] = message;
    }
    return errors;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let nextValue = value;
    if (DIGITS_ONLY_FIELDS.has(name)) nextValue = nextValue.replace(/\D/g, "");
    if (ALPHANUMERIC_FIELDS.has(name)) nextValue = nextValue.replace(/[^a-zA-Z0-9]/g, "");
    if (UPPERCASE_FIELDS.has(name)) nextValue = nextValue.toUpperCase();
    const max = FIELD_MAX_LENGTH[name];
    if (max) nextValue = nextValue.slice(0, max);
    setFormData((prev) => ({ ...prev, [name]: nextValue }));
    if (fieldErrors[name]) setFieldErrors((prev) => { const next = { ...prev }; delete next[name]; return next; });
  };

  const fetchCityFromLocation = () => {
    if (!navigator.geolocation) { setError("Geolocation not supported"); return; }
    setIsCityLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const osmRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1&accept-language=en`
          );
          if (osmRes.ok) {
            const d = await osmRes.json();
            const city = d.address?.city || d.address?.town || d.address?.state_district || "";
            if (city) { setFormData((prev) => ({ ...prev, city })); return; }
          }
          setError("Could not detect city. Enter manually.");
        } catch { setError("Enter city manually."); }
        finally { setIsCityLoading(false); }
      },
      () => { setError("Location access denied. Enter city manually."); setIsCityLoading(false); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, files } = e.target;
    if (!files || !files[0]) return;
    const validation = validateDocumentFile(files[0]);
    if (!validation.valid) { setError(validation.error || "Invalid file"); return; }
    if (name === "drivingLicense") setDrivingLicenseFile(files[0]);
    else if (name === "nationalIdentityCard") setNationalIdentityCardFile(files[0]);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const errors = validateAll(formData);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError("Please fix the highlighted fields before continuing.");
      return;
    }

    setLoading(true);

    try {
      let drivingLicenseUrl = formData.drivingLicenseUrl;
      let nationalIdentityCardUrl = formData.nationalIdentityCardUrl;

      if (drivingLicenseFile || nationalIdentityCardFile) {
        setUploadingDocs(true);
        if (drivingLicenseFile) {
          const f = drivingLicenseFile.type.startsWith("image/") ? await compressImage(drivingLicenseFile) : drivingLicenseFile;
          drivingLicenseUrl = (await uploadDocument(f, "exnshop/delivery/documents")).secureUrl;
        }
        if (nationalIdentityCardFile) {
          const f = nationalIdentityCardFile.type.startsWith("image/") ? await compressImage(nationalIdentityCardFile) : nationalIdentityCardFile;
          nationalIdentityCardUrl = (await uploadDocument(f, "exnshop/delivery/documents")).secureUrl;
        }
        setUploadingDocs(false);
      }

      const response = await register({
        name: formData.name,
        mobile: formData.mobile,
        email: formData.email,
        dateOfBirth: formData.dateOfBirth || undefined,
        password: formData.password,
        address: formData.address,
        city: formData.city,
        pincode: formData.pincode || undefined,
        drivingLicense: drivingLicenseUrl || undefined,
        nationalIdentityCard: nationalIdentityCardUrl || undefined,
        accountName: formData.accountName || undefined,
        bankName: formData.bankName || undefined,
        accountNumber: formData.accountNumber || undefined,
        ifscCode: formData.ifscCode || undefined,
        bonusType: formData.bonusType || undefined,
      });

      if (response.success) {
        removeAuthToken("delivery");
        try {
          const otpRes = await sendMobileOTP(formData.mobile);
          if (otpRes.sessionId) setSessionId(otpRes.sessionId);
          setShowOTP(true);
        } catch (otpErr: any) {
          setError(otpErr.message || "Registration successful but failed to send OTP.");
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
      setUploadingDocs(false);
    }
  };

  const [verifyBy, setVerifyBy] = useState<LoginMethod>("mobile");

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError("");
    try {
      const response = verifyBy === "mobile" ? await verifyMobileOTP(formData.mobile, otp, sessionId) : await verifyEmailOTP(formData.email.trim(), otp);
      if (response.success) navigate("/delivery");
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col relative overflow-x-hidden overflow-y-auto select-none font-['Poppins',sans-serif]"
      style={{ minHeight: "100vh", backgroundColor: "#fbf9f4" }}
    >
      {/* Background */}
      {bgImgOk && (
        <img
          src="/delivery_login_bg.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none z-0"
          loading="eager"
          onError={() => setBgImgOk(false)}
        />
      )}

      {/* Top Bar */}
      <div className="w-full max-w-sm sm:max-w-md mx-auto flex items-center justify-between relative z-10 px-4 pt-4 pb-2">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-white/95 hover:bg-white text-slate-700 border border-slate-200/80 flex items-center justify-center transition-all active:scale-95 shadow-sm cursor-pointer"
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18L9 12L15 6" />
          </svg>
        </button>
        <div className="bg-white/95 rounded-full shadow-sm border border-slate-200/80 px-3 py-1 flex items-center gap-1">
          <span className="font-bold text-xs tracking-tight">
            <span className="text-blue-600">Exn</span>
            <span className="text-orange-500">shop</span>
          </span>
          <span className="text-[11px] font-semibold text-slate-500">Delivery</span>
        </div>
      </div>

      {/* Main Content — safe-bottom-pad keeps the card clear of the phone's
          gesture navigation bar, which otherwise sits over the Create
          Account button and the Terms/Privacy text at the bottom of the card. */}
      <div className="w-full max-w-sm sm:max-w-md mx-auto flex flex-col items-center px-4 pb-6 safe-bottom-pad relative z-10">

        {/* Branding */}
        <div className="flex flex-col items-center text-center mb-3">
          <div className="mb-2">
            <AnimatedLogo size="md" />
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            Deliver More,{" "}
            <span className="relative inline-block text-blue-600">
              Earn More
              <svg className="absolute left-0 -bottom-1 w-full" height="5" viewBox="0 0 100 5" preserveAspectRatio="none" aria-hidden="true">
                <path d="M1 3.5 Q 25 1 50 2.5 T 99 2.5" stroke="#f59e0b" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <div className="flex items-center justify-center gap-1.5 pt-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">₹ Flexible Earnings</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">🕒 Your Own Time</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200/80">📍 Deliver Nearby</span>
          </div>
        </div>

        {/* Card */}
        <div className="w-full bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-100 overflow-hidden">
          {/* Card Header */}
          <div className="px-5 pt-5 pb-3 text-center border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Delivery Partner Sign Up</h2>
            <p className="text-xs text-slate-500 mt-0.5">Create your delivery partner account</p>
          </div>

          {/* Scrollable Form — the submit button lives outside this, in a
              sticky footer below, so it's never pushed off-screen on a long
              form with a hidden scrollbar (the earlier bug). */}
          <div
            className="px-5 py-4 overflow-y-auto"
            style={{ maxHeight: "50vh", scrollbarWidth: "none" }}
          >
            <style>{`.dsignup-scroll::-webkit-scrollbar{display:none}`}</style>

            {!showOTP ? (
              <form id="delivery-signup-form" onSubmit={handleSubmit} className="dsignup-scroll space-y-0">

                {/* ── Personal Info ── */}
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Personal Info</p>

                {/* Name */}
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name <span className="text-red-500">*</span></label>
                  <div className={`flex items-center h-10 bg-slate-50 border rounded-xl overflow-hidden focus-within:bg-white transition-all ${fieldErrors.name ? "border-red-400 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/15" : "border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15"}`}>
                    <div className="w-10 h-full bg-slate-100/90 border-r border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                    </div>
                    <input type="text" name="name" value={formData.name} onChange={handleInputChange} onBlur={handleFieldBlur} placeholder="Enter your full name" required disabled={loading}
                      className="flex-1 h-full px-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent" />
                  </div>
                  {fieldErrors.name && <p className="text-[11px] text-red-600 mt-1 ml-1">{fieldErrors.name}</p>}
                </div>

                {/* Mobile */}
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mobile Number <span className="text-red-500">*</span></label>
                  <div className={`flex items-center h-10 bg-slate-50 border rounded-xl overflow-hidden focus-within:bg-white transition-all ${fieldErrors.mobile ? "border-red-400 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/15" : "border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15"}`}>
                    <div className="w-[62px] h-full bg-slate-100/90 border-r border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center gap-1 select-none flex-shrink-0">
                      <span>🇮🇳</span><span>+91</span>
                    </div>
                    <input type="tel" name="mobile" value={formData.mobile} onChange={handleInputChange} onBlur={handleFieldBlur} inputMode="numeric" placeholder="Mobile number" required maxLength={10} disabled={loading}
                      className="flex-1 h-full px-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent" />
                  </div>
                  {fieldErrors.mobile && <p className="text-[11px] text-red-600 mt-1 ml-1">{fieldErrors.mobile}</p>}
                </div>

                {/* Email */}
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email <span className="text-red-500">*</span></label>
                  <div className={`flex items-center h-10 bg-slate-50 border rounded-xl overflow-hidden focus-within:bg-white transition-all ${fieldErrors.email ? "border-red-400 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/15" : "border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15"}`}>
                    <div className="w-10 h-full bg-slate-100/90 border-r border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    </div>
                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} onBlur={handleFieldBlur} placeholder="Email address" required disabled={loading}
                      className="flex-1 h-full px-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent" />
                  </div>
                  {fieldErrors.email && <p className="text-[11px] text-red-600 mt-1 ml-1">{fieldErrors.email}</p>}
                </div>

                {/* Password */}
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Password <span className="text-red-500">*</span></label>
                  <div className={`flex items-center h-10 bg-slate-50 border rounded-xl overflow-hidden focus-within:bg-white transition-all ${fieldErrors.password ? "border-red-400 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/15" : "border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15"}`}>
                    <div className="w-10 h-full bg-slate-100/90 border-r border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <input type="password" name="password" value={formData.password} onChange={handleInputChange} onBlur={handleFieldBlur} placeholder="Min 6 characters" required minLength={6} disabled={loading}
                      className="flex-1 h-full px-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent" />
                  </div>
                  {fieldErrors.password && <p className="text-[11px] text-red-600 mt-1 ml-1">{fieldErrors.password}</p>}
                </div>

                {/* Date of Birth */}
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Date of Birth</label>
                  <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleInputChange} onBlur={handleFieldBlur} max={new Date().toISOString().slice(0, 10)} disabled={loading}
                    className={`w-full h-10 px-3 text-xs font-semibold text-slate-900 bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:bg-white transition-all ${fieldErrors.dateOfBirth ? "border-red-400 focus:border-red-500 focus:ring-red-500/15" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/15"}`} />
                  {fieldErrors.dateOfBirth && <p className="text-[11px] text-red-600 mt-1 ml-1">{fieldErrors.dateOfBirth}</p>}
                </div>

                {/* Address */}
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Address <span className="text-red-500">*</span></label>
                  <div className={`flex items-center h-10 bg-slate-50 border rounded-xl overflow-hidden focus-within:bg-white transition-all ${fieldErrors.address ? "border-red-400 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/15" : "border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15"}`}>
                    <div className="w-10 h-full bg-slate-100/90 border-r border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                    <input type="text" name="address" value={formData.address} onChange={handleInputChange} onBlur={handleFieldBlur} placeholder="Your address" required disabled={loading}
                      className="flex-1 h-full px-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent" />
                  </div>
                  {fieldErrors.address && <p className="text-[11px] text-red-600 mt-1 ml-1">{fieldErrors.address}</p>}
                </div>

                {/* City */}
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">City <span className="text-red-500">*</span></label>
                  <div className={`flex items-center h-10 bg-slate-50 border rounded-xl overflow-hidden focus-within:bg-white transition-all ${fieldErrors.city ? "border-red-400 focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-500/15" : "border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15"}`}>
                    <div className="w-10 h-full bg-slate-100/90 border-r border-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    </div>
                    <input type="text" name="city" value={formData.city} onChange={handleInputChange} onBlur={handleFieldBlur} placeholder="Your city" required disabled={loading || isCityLoading}
                      className="flex-1 h-full px-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none bg-transparent" />
                    <button type="button" onClick={fetchCityFromLocation} disabled={isCityLoading || loading}
                      className="w-9 h-full flex items-center justify-center text-blue-500 hover:bg-blue-50 transition-colors disabled:text-slate-300" title="Detect city">
                      {isCityLoading
                        ? <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>}
                    </button>
                  </div>
                  {fieldErrors.city && <p className="text-[11px] text-red-600 mt-1 ml-1">{fieldErrors.city}</p>}
                </div>

                {/* Pincode */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Pincode</label>
                  <input type="text" name="pincode" value={formData.pincode} onChange={handleInputChange} onBlur={handleFieldBlur} inputMode="numeric" maxLength={6} placeholder="6-digit pincode" disabled={loading}
                    className={`w-full h-10 px-3 text-xs font-semibold text-slate-900 bg-slate-50 border rounded-xl focus:outline-none focus:ring-2 focus:bg-white transition-all placeholder:text-slate-400 placeholder:font-normal ${fieldErrors.pincode ? "border-red-400 focus:border-red-500 focus:ring-red-500/15" : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/15"}`} />
                  {fieldErrors.pincode && <p className="text-[11px] text-red-600 mt-1 ml-1">{fieldErrors.pincode}</p>}
                </div>

                {/* ── Bank Info (collapsible section header) ── */}
                <div className="border-t border-slate-100 pt-3 mb-3">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bank Details <span className="text-slate-300 normal-case font-normal">(optional)</span></p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { name: "accountName", label: "Account Name", placeholder: "Account holder" },
                      { name: "bankName", label: "Bank Name", placeholder: "Bank name" },
                      { name: "accountNumber", label: "Account No.", placeholder: "9–18 digits", inputMode: "numeric" as const, maxLength: 18 },
                      { name: "ifscCode", label: "IFSC Code", placeholder: "ABCD0123456", maxLength: 11 },
                    ].map((field) => (
                      <div key={field.name}>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">{field.label}</label>
                        <input type="text" name={field.name} value={(formData as any)[field.name]} onChange={handleInputChange} onBlur={handleFieldBlur}
                          inputMode={field.inputMode} maxLength={field.maxLength} placeholder={field.placeholder} disabled={loading}
                          className={`w-full h-9 px-2.5 text-xs font-semibold text-slate-900 bg-slate-50 border rounded-lg focus:outline-none focus:bg-white transition-all placeholder:text-slate-400 placeholder:font-normal ${(fieldErrors as any)[field.name] ? "border-red-400 focus:border-red-500" : "border-slate-200 focus:border-blue-500"}`} />
                        {(fieldErrors as any)[field.name] && <p className="text-[11px] text-red-600 mt-1">{(fieldErrors as any)[field.name]}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bonus Type */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Bonus Type</label>
                  <select name="bonusType" value={formData.bonusType} onChange={handleInputChange} disabled={loading}
                    className="w-full h-10 px-3 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all">
                    <option value="">Select bonus type</option>
                    {["Fixed or Salaried", "Fixed", "Salaried", "Commission Based"].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* ── Documents ── */}
                <div className="border-t border-slate-100 pt-3 mb-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">Documents <span className="text-slate-300 normal-case font-normal">(optional, upload later)</span></p>
                  <div className="space-y-2">
                    {[
                      { name: "drivingLicense", label: "Driving License", file: drivingLicenseFile },
                      { name: "nationalIdentityCard", label: "National ID Card", file: nationalIdentityCardFile },
                    ].map((doc) => (
                      <div key={doc.name}>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">{doc.label}</label>
                        <input type="file" name={doc.name} onChange={handleFileChange} accept="image/*,.pdf" disabled={loading || uploadingDocs}
                          className="w-full text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 file:mr-3 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
                        {doc.file && <p className="text-[10px] text-slate-500 mt-0.5 truncate">📎 {doc.file.name}</p>}
                      </div>
                    ))}
                  </div>
                </div>

              </form>
            ) : (
              /* OTP step */
              <div className="space-y-4 py-2">
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 text-2xl">📱</div>
                  <h3 className="text-base font-bold text-slate-900">{verifyBy === "mobile" ? "Verify Your Mobile" : "Verify Your Email"}</h3>
                  <p className="text-xs text-slate-500 mt-1">Enter the 6-digit code sent to <span className="font-bold text-blue-700">{verifyBy === "mobile" ? formData.mobile : formData.email}</span></p>
                </div>

                <LoginMethodTabs
                  value={verifyBy}
                  onChange={async (m) => {
                    setVerifyBy(m);
                    setError("");
                    // The form already sent a mobile code; the email code is sent when chosen.
                    if (m === "email") {
                      setLoading(true);
                      try { await sendEmailOTP(formData.email.trim()); } catch (e: any) { setError(e.response?.data?.message || "Could not send the email code."); } finally { setLoading(false); }
                    }
                  }}
                  disabled={loading}
                />

                <div className="flex justify-center">
                  <OTPInput onComplete={handleOTPComplete} disabled={loading} />
                </div>

                {error && (
                  <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-200/80 p-2.5 rounded-xl text-center">{error}</div>
                )}

                <div className="flex gap-2.5">
                  <button onClick={() => { setShowOTP(false); setError(""); }} disabled={loading}
                    className="flex-1 h-10 rounded-xl font-semibold text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition-all border border-slate-200 cursor-pointer flex items-center justify-center">
                    ← Back
                  </button>
                  <button onClick={async () => { setLoading(true); setError(""); try { if (verifyBy === "mobile") { const r = await sendMobileOTP(formData.mobile); if (r.sessionId) setSessionId(r.sessionId); } else { await sendEmailOTP(formData.email.trim()); } } catch (e: any) { setError(e.response?.data?.message || e.message || "Failed to resend."); } finally { setLoading(false); } }} disabled={loading}
                    className="flex-1 h-10 rounded-xl font-semibold text-xs bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100 active:scale-95 transition-all cursor-pointer flex items-center justify-center">
                    {loading ? "Sending..." : "Resend OTP"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sticky action footer — always visible, never pushed off-screen
              by the scrollable field area above. */}
          {!showOTP && (
            <div className="px-5 pt-3 pb-1 border-t border-slate-100">
              {error && (
                <div className="mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200/80 p-2.5 rounded-xl text-center">
                  {error}
                </div>
              )}

              <button type="submit" form="delivery-signup-form" disabled={loading || uploadingDocs}
                className={`w-full h-11 rounded-xl font-semibold text-sm tracking-wide transition-all flex items-center justify-center shadow-md ${!loading && !uploadingDocs ? "bg-gradient-to-r from-blue-700 via-blue-600 to-teal-600 text-white hover:from-blue-800 hover:to-teal-700 shadow-blue-900/20 cursor-pointer active:scale-[0.99]" : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none"}`}>
                {uploadingDocs ? (
                  <span className="inline-flex items-center gap-2 text-white"><svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>Uploading Docs...</span>
                ) : loading ? (
                  <span className="inline-flex items-center gap-2 text-white"><svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>Creating Account...</span>
                ) : (
                  <span className="inline-flex items-center gap-2">Create Account <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
                )}
              </button>

              <p className="text-xs text-slate-500 text-center font-medium mt-3">
                Already a partner?{" "}
                <span onClick={() => navigate("/delivery/login")} className="text-blue-700 font-semibold hover:underline cursor-pointer">Log in →</span>
              </p>
            </div>
          )}

          {/* Footer inside card */}
          <div className="px-5 pb-4">
            <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-3 border-t border-slate-100">
              By continuing, you agree to Exnshop's{" "}
              <span onClick={() => navigate("/terms-and-conditions")} className="text-blue-700 font-medium hover:underline cursor-pointer">Terms of Service</span>
              {" "}&{" "}
              <span onClick={() => navigate("/privacy-policy")} className="text-blue-700 font-medium hover:underline cursor-pointer">Privacy Policy</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
