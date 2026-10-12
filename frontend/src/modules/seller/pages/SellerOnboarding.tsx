import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import GoogleMapsAutocomplete from '../../../components/GoogleMapsAutocomplete';
import LocationPickerMap from '../../../components/LocationPickerMap';
import { uploadImage } from '../../../services/api/uploadService';
import {
  BUSINESS_TYPE_LABELS,
  OnboardingView,
  STATUS_META,
  SectionKey,
  apiErrorMessage,
  deleteOnboardingDocument,
  getMyDocumentUrl,
  getMyOnboarding,
  saveBankDetails,
  saveBusinessDetails,
  saveStoreDetails,
  submitOnboarding,
  uploadOnboardingDocument,
} from '../../../services/api/sellerOnboardingService';

type Step = SectionKey | 'review';
const STEPS: { key: Step; title: string; hint: string }[] = [
  { key: 'business', title: 'Business', hint: 'Type, PAN & GST' },
  { key: 'kyc', title: 'Documents', hint: 'KYC uploads' },
  { key: 'bank', title: 'Bank', hint: 'For payouts' },
  { key: 'store', title: 'Store', hint: 'Pickup & return' },
  { key: 'review', title: 'Submit', hint: 'Send for review' },
];
const OPTIONAL_DOCS = ['ID_PROOF', 'FSSAI_LICENSE', 'SELFIE'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const isMapDefaultCenter = (lat: number, lng: number) =>
  Math.abs(lat - 20.5937) < 0.001 && Math.abs(lng - 78.9629) < 0.001;

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-neutral-50 disabled:text-neutral-500';
const labelCls = 'block text-xs font-semibold text-neutral-700 mb-1';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-neutral-500 mt-1">{hint}</p>}
    </div>
  );
}

function ReviewNote({ section, view }: { section: SectionKey; view: OnboardingView }) {
  const s = view.sections[section];
  if (s.reviewStatus === 'ChangesRequired') {
    return (
      <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-xs text-orange-900">
        <span className="font-semibold">Changes requested:</span> {s.remarks || 'Please review and update this section.'}
      </div>
    );
  }
  if (s.reviewStatus === 'Approved') {
    return (
      <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-3.5 py-2.5 text-xs text-green-800 font-medium">
        ✓ Verified by Exnshop
      </div>
    );
  }
  return null;
}

export default function SellerOnboarding() {
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuth();
  const { showToast } = useToast();
  const [view, setView] = useState<OnboardingView | null>(null);
  const [step, setStep] = useState<Step>('business');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const initialised = useRef(false);

  const [business, setBusiness] = useState({
    businessType: '',
    legalBusinessName: '',
    panCard: '',
    gstRegistered: '' as '' | 'yes' | 'no',
    gstin: '',
    fssaiLicNo: '',
  });
  const [bank, setBank] = useState({ accountName: '', accountNumber: '', confirmAccountNumber: '', ifsc: '', upiId: '' });
  const [store, setStore] = useState({
    storeName: '',
    storeDescription: '',
    logo: '',
    address: '',
    returnAddress: '',
    sameReturn: true,
    city: '',
    searchLocation: '',
    latitude: '',
    longitude: '',
  });
  const [locLoading, setLocLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const applyView = useCallback(
    (v: OnboardingView, resetForms = false) => {
      setView(v);
      if (updateUser && user) {
        const gate = ['Approved', 'Active'].includes(v.onboardingStatus) ? 'Approved' : v.onboardingStatus === 'Rejected' ? 'Rejected' : 'Pending';
        if (user.onboardingStatus !== v.onboardingStatus || user.status !== gate) {
          updateUser({ ...user, onboardingStatus: v.onboardingStatus, status: gate });
        }
      }
      if (!resetForms) return;
      setBusiness({
        businessType: v.business.businessType,
        legalBusinessName: v.business.legalBusinessName,
        panCard: v.business.panCard,
        gstRegistered: v.business.gstRegistered === undefined || v.business.gstRegistered === null ? '' : v.business.gstRegistered ? 'yes' : 'no',
        gstin: v.business.gstin,
        fssaiLicNo: v.business.fssaiLicNo,
      });
      setBank({ accountName: v.bank.accountName, accountNumber: '', confirmAccountNumber: '', ifsc: v.bank.ifsc, upiId: v.bank.upiId });
      setStore({
        storeName: v.store.storeName,
        storeDescription: v.store.storeDescription,
        logo: v.store.logo,
        address: v.store.address,
        returnAddress: v.store.returnAddress,
        sameReturn: !v.store.returnAddress || v.store.returnAddress === v.store.address,
        city: v.store.city,
        searchLocation: v.store.searchLocation,
        latitude: v.store.latitude,
        longitude: v.store.longitude,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user]
  );

  const load = useCallback(async () => {
    try {
      const res = await getMyOnboarding();
      applyView(res.data, true);
      if (!initialised.current) {
        initialised.current = true;
        const firstOpen = (['business', 'kyc', 'bank', 'store'] as SectionKey[]).find(
          (s) => res.data.sections[s].reviewStatus === 'ChangesRequired' || !res.data.sections[s].complete
        );
        setStep(firstOpen || 'review');
      }
    } catch (err) {
      showToast(apiErrorMessage(err, 'Failed to load onboarding'), 'error');
    } finally {
      setLoading(false);
    }
  }, [applyView, showToast]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goNext = (from: Step) => {
    const idx = STEPS.findIndex((s) => s.key === from);
    setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)].key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const run = async (fn: () => Promise<{ data: OnboardingView; message?: string }>, next?: Step, resetForms = false) => {
    setSaving(true);
    try {
      const res = await fn();
      applyView(res.data, resetForms);
      showToast(res.message || 'Saved', 'success');
      if (next) goNext(next);
      return true;
    } catch (err) {
      showToast(apiErrorMessage(err), 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const completedCount = useMemo(
    () => (view ? (['business', 'kyc', 'bank', 'store'] as SectionKey[]).filter((s) => view.sections[s].complete).length : 0),
    [view]
  );

  if (loading || !view) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  const status = view.onboardingStatus;
  const meta = STATUS_META[status];
  const editable = (s: SectionKey) => view.sections[s].editable;

  // ── Handlers ──
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return showToast('Location is not supported on this device', 'error');
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setStore((p) => ({ ...p, latitude: lat.toString(), longitude: lng.toString(), searchLocation: `${lat.toFixed(6)}, ${lng.toFixed(6)}` }));
        const Geocoder = (window as any).google?.maps?.Geocoder;
        if (Geocoder) {
          new Geocoder().geocode({ location: { lat, lng } }, (results: any[], st: string) => {
            const r = st === 'OK' ? results?.[0] : null;
            if (!r) return;
            const city = r.address_components?.find((c: any) => c.types.includes('locality'))?.long_name;
            setStore((p) => ({ ...p, searchLocation: r.formatted_address || p.searchLocation, city: city || p.city }));
          });
        }
        setLocLoading(false);
      },
      () => {
        showToast('Unable to get your location. Please allow location access.', 'error');
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast('Please choose an image', 'error');
    setUploadingLogo(true);
    try {
      const r = await uploadImage(file);
      if (r?.url) setStore((p) => ({ ...p, logo: r.url }));
    } catch (err) {
      showToast(apiErrorMessage(err, 'Logo upload failed'), 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDocUpload = async (docType: string, file?: File) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return showToast('File must be 10 MB or smaller', 'error');
    if (!/^(image\/(jpeg|jpg|png|webp)|application\/pdf)$/.test(file.type)) {
      return showToast('Upload a JPG, PNG, WEBP or PDF file', 'error');
    }
    setUploadingDoc(docType);
    try {
      const res = await uploadOnboardingDocument(docType, file);
      applyView(res.data);
      showToast('Document uploaded', 'success');
    } catch (err) {
      showToast(apiErrorMessage(err, 'Upload failed'), 'error');
    } finally {
      setUploadingDoc(null);
    }
  };

  const viewDoc = async (docId: string) => {
    const tab = window.open('', '_blank');
    try {
      const res = await getMyDocumentUrl(docId);
      if (tab) tab.location.href = res.data.url;
    } catch (err) {
      tab?.close();
      showToast(apiErrorMessage(err, 'Could not open document'), 'error');
    }
  };

  const handleSubmit = async () => {
    const ok = await run(() => submitOnboarding());
    if (ok) navigate('/seller/under-review', { replace: true });
  };

  // ── Render helpers ──
  const banner = (() => {
    if (status === 'ActionRequired') {
      return (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
          <p className="font-bold mb-1">Action required</p>
          <p className="text-xs leading-relaxed whitespace-pre-wrap">
            {view.statusReason || 'Our team asked for some changes. Fix the highlighted sections and resubmit.'}
          </p>
        </div>
      );
    }
    if (status === 'UnderReview') {
      return (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-bold mb-1">Your application is under review</p>
          <p className="text-xs">You can view your details below. Editing is paused until our team responds.</p>
        </div>
      );
    }
    if (status === 'Rejected' || status === 'Suspended') {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-bold mb-1">{status === 'Rejected' ? 'Application not approved' : 'Account suspended'}</p>
          {view.statusReason && <p className="text-xs">Reason: {view.statusReason}</p>}
          <p className="text-xs mt-1">Contact support@exnshop.com for help.</p>
        </div>
      );
    }
    if (status === 'Approved' || status === 'Active') {
      return (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 flex items-center justify-between gap-3">
          <div>
            <p className="font-bold">Your seller account is {status === 'Active' ? 'live' : 'approved'}</p>
            <p className="text-xs">You can still update your bank and store details here.</p>
          </div>
          <button onClick={() => navigate('/seller')} className="shrink-0 px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold">
            Dashboard
          </button>
        </div>
      );
    }
    return null;
  })();

  const saveBtn = (label: string, disabled: boolean, onClick: () => void) => (
    <div className="flex justify-end pt-2">
      <button
        type="button"
        onClick={onClick}
        disabled={saving || disabled}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 shadow-sm"
      >
        {saving ? 'Saving…' : label}
      </button>
    </div>
  );

  const docRows = [...view.requiredDocuments, ...OPTIONAL_DOCS.filter((d) => !view.requiredDocuments.includes(d))];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 bg-white border-b border-neutral-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/exnshop_logo.png" alt="Exnshop" className="h-8 w-auto object-contain" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-neutral-900 truncate">Seller Onboarding</p>
              <p className="text-[11px] text-neutral-500 truncate">{view.store.storeName || user?.storeName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${meta.tone}`}>{meta.label}</span>
            <button
              onClick={() => {
                logout();
                navigate('/seller/login', { replace: true });
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">
        {banner}

        <div className="bg-white rounded-2xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-neutral-600 mb-2">
            <span>Profile completion</span>
            <span>{completedCount} of 4 sections</span>
          </div>
          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 transition-all" style={{ width: `${(completedCount / 4) * 100}%` }} />
          </div>
          <div className="grid grid-cols-5 gap-1.5 mt-4">
            {STEPS.map((s, i) => {
              const sec = s.key !== 'review' ? view.sections[s.key] : null;
              const done = sec ? sec.complete : view.canSubmit;
              const flagged = sec?.reviewStatus === 'ChangesRequired';
              const active = step === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setStep(s.key)}
                  className={`rounded-xl px-1.5 py-2 text-center border transition-colors ${
                    active ? 'border-teal-500 bg-teal-50' : 'border-transparent hover:bg-neutral-50'
                  }`}
                >
                  <span
                    className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      flagged ? 'bg-orange-500 text-white' : done ? 'bg-teal-600 text-white' : active ? 'bg-teal-100 text-teal-800' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {flagged ? '!' : done && s.key !== 'review' ? '✓' : i + 1}
                  </span>
                  <span className="block text-[11px] font-semibold text-neutral-800 leading-tight">{s.title}</span>
                  <span className="hidden sm:block text-[10px] text-neutral-500">{s.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <section className="bg-white rounded-2xl border border-neutral-200 p-4 sm:p-6">
          {step === 'business' && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-neutral-900">Business details</h2>
              <ReviewNote section="business" view={view} />
              <Field label="Business type *">
                <select
                  className={inputCls}
                  value={business.businessType}
                  disabled={!editable('business')}
                  onChange={(e) => setBusiness((p) => ({ ...p, businessType: e.target.value }))}
                >
                  <option value="">Select business type</option>
                  {view.options.businessTypes.map((t) => (
                    <option key={t} value={t}>
                      {BUSINESS_TYPE_LABELS[t] || t}
                    </option>
                  ))}
                </select>
              </Field>
              {business.businessType && !['Individual', 'Proprietorship'].includes(business.businessType) && (
                <Field label="Registered business name *" hint="Exactly as on your registration certificate">
                  <input className={inputCls} disabled={!editable('business')} value={business.legalBusinessName} onChange={(e) => setBusiness((p) => ({ ...p, legalBusinessName: e.target.value }))} />
                </Field>
              )}
              <Field
                label={['Individual', 'Proprietorship'].includes(business.businessType) || !business.businessType ? 'PAN (owner) *' : 'Business PAN *'}
                hint="10 characters, e.g. ABCDE1234F"
              >
                <input className={`${inputCls} uppercase`} maxLength={10} disabled={!editable('business')} value={business.panCard} onChange={(e) => setBusiness((p) => ({ ...p, panCard: e.target.value.toUpperCase() }))} />
              </Field>
              <Field label="Are you GST registered? *">
                <div className="grid grid-cols-2 gap-2">
                  {(['yes', 'no'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={!editable('business')}
                      onClick={() => setBusiness((p) => ({ ...p, gstRegistered: v }))}
                      className={`py-2.5 rounded-xl border text-sm font-semibold ${
                        business.gstRegistered === v ? 'bg-teal-50 border-teal-500 text-teal-800 ring-1 ring-teal-500' : 'bg-white border-neutral-300 text-neutral-600'
                      }`}
                    >
                      {v === 'yes' ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </Field>
              {business.gstRegistered === 'yes' && (
                <Field label="GSTIN *" hint="15 characters. It must contain the PAN entered above.">
                  <input className={`${inputCls} uppercase`} maxLength={15} disabled={!editable('business')} value={business.gstin} onChange={(e) => setBusiness((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))} />
                </Field>
              )}
              <Field label="FSSAI license number (food sellers)" hint="14 digits. Required only if you sell food items.">
                <input className={inputCls} maxLength={14} inputMode="numeric" disabled={!editable('business')} value={business.fssaiLicNo} onChange={(e) => setBusiness((p) => ({ ...p, fssaiLicNo: e.target.value.replace(/\D/g, '') }))} />
              </Field>
              {editable('business') &&
                saveBtn('Save & continue', false, () =>
                  run(
                    () =>
                      saveBusinessDetails({
                        ...business,
                        gstRegistered: business.gstRegistered === 'yes',
                      }),
                    'business'
                  )
                )}
            </div>
          )}

          {step === 'kyc' && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-neutral-900">KYC documents</h2>
              <ReviewNote section="kyc" view={view} />
              {!view.business.businessType && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Fill in your business details first. The documents you need depend on your business type.
                </p>
              )}
              <p className="text-xs text-neutral-500">JPG, PNG, WEBP or PDF up to 10 MB. Documents are stored privately and only seen by Exnshop's verification team.</p>
              <ul className="divide-y divide-neutral-100 border border-neutral-200 rounded-2xl">
                {docRows.map((type) => {
                  const doc = view.documents.find((d) => d.docType === type);
                  const required = view.requiredDocuments.includes(type);
                  return (
                    <li key={type} className="p-3.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-800">
                          {view.options.documentLabels[type] || type} {required ? <span className="text-red-500">*</span> : <span className="text-[11px] font-normal text-neutral-400">(optional)</span>}
                        </p>
                        {doc ? (
                          <p className="text-[11px] text-neutral-500 truncate">
                            {doc.originalName || 'Uploaded'} ·{' '}
                            <span className={doc.status === 'Approved' ? 'text-green-700 font-semibold' : doc.status === 'Rejected' ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold'}>
                              {doc.status === 'Pending' ? 'Awaiting review' : doc.status}
                            </span>
                          </p>
                        ) : (
                          <p className="text-[11px] text-neutral-400">Not uploaded</p>
                        )}
                        {doc?.status === 'Rejected' && doc.remarks && <p className="text-[11px] text-red-600 mt-0.5">Reason: {doc.remarks}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {doc && (
                          <button onClick={() => viewDoc(doc._id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-700">
                            View
                          </button>
                        )}
                        {editable('kyc') && (
                          <label className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${doc ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200' : 'bg-teal-600 text-white hover:bg-teal-700'}`}>
                            {uploadingDoc === type ? 'Uploading…' : doc ? 'Replace' : 'Upload'}
                            <input
                              type="file"
                              accept={type === 'SELFIE' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'}
                              capture={type === 'SELFIE' ? 'user' : undefined}
                              className="hidden"
                              disabled={!!uploadingDoc}
                              onChange={(e) => {
                                handleDocUpload(type, e.target.files?.[0]);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                        {doc && editable('kyc') && !required && (
                          <button
                            onClick={() => run(() => deleteOnboardingDocument(doc._id))}
                            className="px-2 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {editable('kyc') && saveBtn('Continue', !view.sections.kyc.complete, () => goNext('kyc'))}
              {!view.sections.kyc.complete && view.sections.kyc.missing.length > 0 && (
                <p className="text-[11px] text-neutral-500 text-right">Still needed: {view.sections.kyc.missing.join(', ')}</p>
              )}
            </div>
          )}

          {step === 'bank' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-neutral-900">Bank account</h2>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                    view.bank.verificationStatus === 'Verified'
                      ? 'bg-green-50 text-green-800 border-green-200'
                      : view.bank.verificationStatus === 'Failed'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {view.bank.verificationStatus === 'Verified' ? 'Verified' : view.bank.verificationStatus === 'Failed' ? 'Verification failed' : 'Not verified yet'}
                </span>
              </div>
              <ReviewNote section="bank" view={view} />
              <p className="text-xs text-neutral-500">Payouts are sent only to a verified account. Changing these details pauses payouts until we verify the new account.</p>
              <Field label="Account holder name *" hint="As printed on your cheque / passbook">
                <input className={inputCls} disabled={!editable('bank')} value={bank.accountName} onChange={(e) => setBank((p) => ({ ...p, accountName: e.target.value }))} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Account number *" hint={view.bank.accountNumberMasked ? `Saved: ${view.bank.accountNumberMasked}. Leave blank to keep it.` : undefined}>
                  <input className={inputCls} inputMode="numeric" autoComplete="off" disabled={!editable('bank')} value={bank.accountNumber} onChange={(e) => setBank((p) => ({ ...p, accountNumber: e.target.value.replace(/\D/g, '') }))} />
                </Field>
                <Field label="Confirm account number *">
                  <input className={inputCls} inputMode="numeric" autoComplete="off" disabled={!editable('bank')} value={bank.confirmAccountNumber} onPaste={(e) => e.preventDefault()} onChange={(e) => setBank((p) => ({ ...p, confirmAccountNumber: e.target.value.replace(/\D/g, '') }))} />
                </Field>
              </div>
              <Field label="IFSC code *" hint={view.bank.bankName ? `${view.bank.bankName}${view.bank.branch ? ` — ${view.bank.branch}` : ''}` : 'Bank name is filled in automatically from the IFSC'}>
                <input className={`${inputCls} uppercase`} maxLength={11} disabled={!editable('bank')} value={bank.ifsc} onChange={(e) => setBank((p) => ({ ...p, ifsc: e.target.value.toUpperCase() }))} />
              </Field>
              <Field label="UPI ID (optional)">
                <input className={inputCls} placeholder="name@bank" disabled={!editable('bank')} value={bank.upiId} onChange={(e) => setBank((p) => ({ ...p, upiId: e.target.value.trim() }))} />
              </Field>
              {editable('bank') &&
                saveBtn('Save & continue', false, async () => {
                  const ok = await run(() => saveBankDetails(bank), 'bank');
                  if (ok) setBank((p) => ({ ...p, accountNumber: '', confirmAccountNumber: '' }));
                })}
            </div>
          )}

          {step === 'store' && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-neutral-900">Store setup</h2>
              <ReviewNote section="store" view={view} />
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl border border-neutral-200 bg-neutral-50 overflow-hidden flex items-center justify-center">
                  {store.logo ? <img src={store.logo} alt="Logo" className="w-full h-full object-cover" /> : <span className="text-[10px] text-neutral-400">No logo</span>}
                </div>
                {editable('store') && (
                  <label className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 cursor-pointer">
                    {uploadingLogo ? 'Uploading…' : 'Upload logo'}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogo(e.target.files?.[0])} />
                  </label>
                )}
              </div>
              <Field label="Store name *">
                <input className={inputCls} disabled={!editable('store')} value={store.storeName} onChange={(e) => setStore((p) => ({ ...p, storeName: e.target.value }))} />
              </Field>
              <Field label="Store description">
                <textarea rows={2} className={inputCls} disabled={!editable('store')} value={store.storeDescription} onChange={(e) => setStore((p) => ({ ...p, storeDescription: e.target.value }))} placeholder="What do you sell?" />
              </Field>

              <Field label="Store location on map *">
                {editable('store') && (
                  <div className="flex gap-2 items-center mb-2">
                    <div className="flex-1">
                      <GoogleMapsAutocomplete
                        value={store.searchLocation}
                        onChange={(address, lat, lng, _place, components) => {
                          const ok = Number.isFinite(lat) && Number.isFinite(lng);
                          setStore((p) => ({
                            ...p,
                            searchLocation: address,
                            ...(ok ? { latitude: lat.toString(), longitude: lng.toString() } : {}),
                            city: components?.city || p.city,
                          }));
                        }}
                        placeholder="Search your store location…"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={locLoading}
                      title="Use my current location"
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 shrink-0 disabled:opacity-40"
                    >
                      {locLoading ? (
                        <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}
                <LocationPickerMap
                  height="240px"
                  initialLat={parseFloat(store.latitude) || 0}
                  initialLng={parseFloat(store.longitude) || 0}
                  onLocationSelect={(lat, lng) => {
                    if (!editable('store') || isMapDefaultCenter(lat, lng)) return;
                    setStore((p) => ({ ...p, latitude: lat.toString(), longitude: lng.toString() }));
                  }}
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Drag the map so the pin sits on your shop entrance.
                  {store.latitude && store.longitude && ` 📍 ${parseFloat(store.latitude).toFixed(5)}, ${parseFloat(store.longitude).toFixed(5)}`}
                </p>
              </Field>
              <Field label="Pickup address *" hint="Shop no., building, street. Couriers collect orders from here.">
                <textarea rows={2} className={inputCls} disabled={!editable('store')} value={store.address} onChange={(e) => setStore((p) => ({ ...p, address: e.target.value }))} />
              </Field>
              <Field label="City *">
                <input className={inputCls} disabled={!editable('store')} value={store.city} onChange={(e) => setStore((p) => ({ ...p, city: e.target.value }))} />
              </Field>
              <label className="flex items-center gap-2 text-xs font-medium text-neutral-700">
                <input type="checkbox" disabled={!editable('store')} checked={store.sameReturn} onChange={(e) => setStore((p) => ({ ...p, sameReturn: e.target.checked }))} />
                Returns go to the same address
              </label>
              {!store.sameReturn && (
                <Field label="Return address *">
                  <textarea rows={2} className={inputCls} disabled={!editable('store')} value={store.returnAddress} onChange={(e) => setStore((p) => ({ ...p, returnAddress: e.target.value }))} />
                </Field>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-neutral-600">
                <p>
                  Contact mobile: <span className="font-semibold text-neutral-800">{view.store.mobile}</span>
                </p>
                <p className="truncate">
                  Contact email: <span className="font-semibold text-neutral-800">{view.store.email}</span>
                </p>
              </div>
              {editable('store') &&
                saveBtn('Save & continue', false, () =>
                  run(
                    () =>
                      saveStoreDetails({
                        ...store,
                        returnAddress: store.sameReturn ? store.address : store.returnAddress,
                      }),
                    'store'
                  )
                )}
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-neutral-900">Review & submit</h2>
              <ul className="space-y-2">
                {(['business', 'kyc', 'bank', 'store'] as SectionKey[]).map((s) => {
                  const sec = view.sections[s];
                  const title = STEPS.find((x) => x.key === s)!.title;
                  return (
                    <li key={s} className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-800">{title}</p>
                        {sec.complete ? (
                          <p className="text-[11px] text-green-700">Complete{sec.reviewStatus === 'Approved' ? ' · Verified' : ''}</p>
                        ) : (
                          <p className="text-[11px] text-red-600">Missing: {sec.missing.join(', ')}</p>
                        )}
                        {sec.reviewStatus === 'ChangesRequired' && <p className="text-[11px] text-orange-700">Changes requested: {sec.remarks}</p>}
                      </div>
                      <button onClick={() => setStep(s)} className="text-xs font-semibold text-teal-700 hover:underline shrink-0">
                        {sec.editable ? 'Edit' : 'View'}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {['Draft', 'KYCPending', 'ActionRequired'].includes(status) ? (
                <>
                  <p className="text-xs text-neutral-500">
                    By submitting, you confirm the details and documents are genuine. Our team usually reviews applications within 1–2 working days.
                  </p>
                  <button
                    onClick={handleSubmit}
                    disabled={!view.canSubmit || saving}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
                  >
                    {saving ? 'Submitting…' : status === 'ActionRequired' ? 'Resubmit for review' : 'Submit for review'}
                  </button>
                </>
              ) : (
                <p className="text-xs text-neutral-500">Submitted {view.submittedAt ? new Date(view.submittedAt).toLocaleString('en-IN') : ''}.</p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
