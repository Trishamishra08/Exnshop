import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSellerProfile, updateSellerProfile, sendEmailVerification, verifySellerEmail } from '../../../services/api/auth/sellerAuthService';
import { uploadImage } from '../../../services/api/uploadService';
import { useAuth } from '../../../context/AuthContext';
import { getHeaderCategoriesPublic, HeaderCategory } from '../../../services/api/headerCategoryService';
import GoogleMapsAutocomplete from '../../../components/GoogleMapsAutocomplete';
import LocationPickerMap from '../../../components/LocationPickerMap';
import ShippingMethodCard from '../components/ShippingMethodCard';
import ShippingSettingsCard from '../components/ShippingSettingsCard';
import { getShippingMethod } from '../../../services/api/shippingMethodService';

// Standard Indian business entity types — stored as the plain string the backend
// already expects, so any value a seller already had keeps showing even if it
// doesn't match one of these exactly (added as a fallback option below).
const BUSINESS_TYPES = [
    'Individual / Proprietorship',
    'Partnership',
    'Limited Liability Partnership (LLP)',
    'Private Limited Company',
    'Public Limited Company',
    'One Person Company (OPC)',
    'Hindu Undivided Family (HUF)',
    'Trust / Society / NGO',
];

const SellerAccountSettings = () => {
    const { user, updateUser } = useAuth();
    // ?tab=shipping (e.g. from the Orders page) opens that tab directly.
    const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'profile');
    // Shipping method only matters to sellers who sell via E-commerce (courier shipping).
    const [shipsEcommerce, setShipsEcommerce] = useState(false);
    useEffect(() => {
        getShippingMethod().then((s) => setShipsEcommerce(s.shipsEcommerce)).catch(() => setShipsEcommerce(false));
    }, []);
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [headerCategories, setHeaderCategories] = useState<HeaderCategory[]>([]);
    const [saveLoading, setSaveLoading] = useState(false);

    // Initial state with empty values
    const [sellerData, setSellerData] = useState({
        sellerName: '',
        email: '',
        mobile: '',
        storeName: '',
        category: '',
        categories: [] as string[],
        address: '',
        returnAddress: '',
        city: '',
        searchLocation: '',
        latitude: '',
        longitude: '',
        serviceRadiusKm: '10',
        panCard: '',
        gstin: '',
        businessType: '',
        taxName: '',
        taxNumber: '',
        accountName: '',
        bankName: '',
        branch: '',
        accountNumber: '',
        ifsc: '',
        upiId: '',
        profile: '',
        logo: '',
        storeBanner: '',
        storeDescription: '',
        commission: 0,
        status: '',
        isEmailVerified: false,
        profileCompletionPercentage: 0,
    });
    const [sameAsReturnAddress, setSameAsReturnAddress] = useState(true);
    const [emailVerifyLoading, setEmailVerifyLoading] = useState(false);
    const [emailCodeSent, setEmailCodeSent] = useState(false);
    const [emailCodeInput, setEmailCodeInput] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    // Which settings tab each validated field lives on, so a failed submit can jump there.
    const FIELD_TAB: Record<string, string> = {
        sellerName: 'profile',
        storeName: 'store', city: 'store',
        panCard: 'bank', gstin: 'bank', accountName: 'bank', bankName: 'bank', accountNumber: 'bank', ifsc: 'bank', upiId: 'bank',
    };

    // Format checks run on every field that has one; empty is allowed everywhere except
    // sellerName/storeName (always required) — bank fields become required only once any
    // one of them is filled in, so a seller can still save other tabs before adding payout info.
    const validators: Record<string, (value: string, data: typeof sellerData) => string | undefined> = {
        sellerName: (v) => (!v.trim() ? 'Full name is required' : v.trim().length < 2 ? 'Enter a valid name' : undefined),
        storeName: (v) => (!v.trim() ? 'Store name is required' : v.trim().length < 2 ? 'Enter a valid store name' : undefined),
        city: (v) => (!v.trim() ? 'City is required' : undefined),
        panCard: (v) => (v && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v) ? 'PAN must look like ABCDE1234F' : undefined),
        gstin: (v) => (v && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v) ? 'GSTIN must look like 09ABCDE1234F1Z5' : undefined),
        accountName: (v, d) => (!v.trim() && (d.bankName || d.accountNumber || d.ifsc) ? 'Required once any bank detail is filled in' : undefined),
        bankName: (v, d) => (!v.trim() && (d.accountName || d.accountNumber || d.ifsc) ? 'Required once any bank detail is filled in' : undefined),
        accountNumber: (v) => (v && !/^[0-9]{9,18}$/.test(v) ? 'Account number must be 9–18 digits' : undefined),
        ifsc: (v, d) => (d.accountNumber && !v ? 'IFSC is required with an account number' : v && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v) ? 'IFSC must look like ABCD0123456' : undefined),
        upiId: (v) => (v && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.]{1,64}$/.test(v) ? 'UPI ID must look like username@bank' : undefined),
    };

    const validateField = (name: string, value: string, data = sellerData) => {
        const check = validators[name];
        if (!check) return;
        const message = check(value, data);
        setFieldErrors(prev => {
            const next = { ...prev };
            if (message) next[name] = message; else delete next[name];
            return next;
        });
    };

    const handleFieldBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        validateField(e.target.name, e.target.value);
    };

    const validateAll = (data: typeof sellerData): Record<string, string> => {
        const errors: Record<string, string> = {};
        for (const name of Object.keys(validators)) {
            const message = validators[name]((data as any)[name] || '', data);
            if (message) errors[name] = message;
        }
        return errors;
    };

    useEffect(() => {
        fetchProfile();
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await getHeaderCategoriesPublic();
            if (Array.isArray(res)) {
                setHeaderCategories(res.filter(c => c.status === 'Published'));
            }
        } catch (err) {
            console.error('Error fetching header categories:', err);
        }
    };

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const response = await getSellerProfile();
            if (response.success) {
                const data = response.data;
                const locationCoords = data.location?.coordinates || [];
                setSellerData({
                    ...data,
                    category: data.category || '',
                    categories: Array.isArray(data.categories) ? data.categories : (data.category ? [data.category] : []),
                    latitude: data.latitude || (locationCoords[1]?.toString() || ''),
                    longitude: data.longitude || (locationCoords[0]?.toString() || ''),
                    searchLocation: data.searchLocation || data.address || '',
                    serviceRadiusKm: (data.serviceRadiusKm || 10).toString(),
                });
                setSameAsReturnAddress(!data.returnAddress || data.returnAddress === data.address);
            } else {
                setError(response.message || 'Failed to fetch profile');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Error loading profile');
        } finally {
            setLoading(false);
        }
    };

    const toggleAllowedCategory = (categoryName: string) => {
        if (!isEditing) return;
        setSellerData(prev => {
            const exists = prev.categories.includes(categoryName);
            const nextCategories = exists
                ? prev.categories.filter(c => c !== categoryName)
                : [...prev.categories, categoryName];
            return {
                ...prev,
                categories: nextCategories,
                category: prev.category || nextCategories[0] || '',
            };
        });
    };

    // Profile photo / store logo / store banner: upload the chosen image and preview it; "Save Changes" stores it.
    const [uploadingImage, setUploadingImage] = useState<'' | 'profile' | 'logo' | 'storeBanner'>('');
    const handleImagePick = async (field: 'profile' | 'logo' | 'storeBanner', e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setError('Please choose an image file');
            return;
        }
        try {
            setUploadingImage(field);
            setError('');
            const result = await uploadImage(file);
            if (result?.url) setSellerData(prev => ({ ...prev, [field]: result.url }));
        } catch (err: any) {
            setError(err.message || 'Could not upload the image');
        } finally {
            setUploadingImage('');
        }
    };

    // PAN, GSTIN and IFSC are conventionally upper-case; typing lower-case still matches.
    const UPPERCASE_FIELDS = new Set(['panCard', 'gstin', 'ifsc']);
    // What a field accepts while typing, not just on blur — a stray letter in an
    // account number or a code longer than the real format is rejected as it's typed
    // rather than only flagged afterwards.
    const DIGITS_ONLY_FIELDS = new Set(['accountNumber']);
    const ALPHANUMERIC_FIELDS = new Set(['panCard', 'gstin', 'ifsc']);
    const FIELD_MAX_LENGTH: Record<string, number> = { accountNumber: 18, ifsc: 11, panCard: 10, gstin: 15 };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        let nextValue = value;
        if (DIGITS_ONLY_FIELDS.has(name)) nextValue = nextValue.replace(/\D/g, '');
        if (ALPHANUMERIC_FIELDS.has(name)) nextValue = nextValue.replace(/[^a-zA-Z0-9]/g, '');
        if (UPPERCASE_FIELDS.has(name)) nextValue = nextValue.toUpperCase();
        const max = FIELD_MAX_LENGTH[name];
        if (max) nextValue = nextValue.slice(0, max);
        setSellerData(prev => ({
            ...prev,
            [name]: nextValue
        }));
        // Clear a field's error as soon as it's edited; full re-check happens on blur/submit.
        if (fieldErrors[name]) setFieldErrors(prev => { const next = { ...prev }; delete next[name]; return next; });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Full validation pass: name/store/city formats, PAN/GSTIN/IFSC/account/UPI formats.
        const errors = validateAll(sellerData);
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            const firstTab = FIELD_TAB[Object.keys(errors)[0]];
            if (firstTab) setActiveTab(firstTab);
            setError('Please fix the highlighted fields before saving.');
            return;
        }

        try {
            setSaveLoading(true);

            // Validate location if address is being updated
            if (sellerData.searchLocation && (!sellerData.latitude || !sellerData.longitude)) {
                setError('Please select a valid location using the map picker');
                setSaveLoading(false);
                return;
            }

            // Validate service radius
            const radius = parseFloat(sellerData.serviceRadiusKm);
            if (isNaN(radius) || radius < 0.1 || radius > 300) {
                setError('Service radius must be between 0.1 and 300 kilometers');
                setSaveLoading(false);
                return;
            }

            const updateData = {
                ...sellerData,
                serviceRadiusKm: radius,
                returnAddress: sameAsReturnAddress ? sellerData.address : sellerData.returnAddress,
            };

            const response = await updateSellerProfile(updateData);
            if (response.success) {
                setIsEditing(false);
                const data = response.data;
                const locationCoords = data.location?.coordinates || [];
                setSellerData({
                    ...data,
                    latitude: data.latitude || (locationCoords[1]?.toString() || ''),
                    longitude: data.longitude || (locationCoords[0]?.toString() || ''),
                    searchLocation: data.searchLocation || data.address || '',
                    serviceRadiusKm: (data.serviceRadiusKm || 10).toString(),
                });
                if (updateUser) {
                    updateUser({
                        ...user,
                        ...data,
                        id: data._id || user?.id
                    });
                }
                setError('');
            } else {
                setError(response.message || 'Failed to update profile');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Error updating profile');
        } finally {
            setSaveLoading(false);
        }
    };

    if (loading && !sellerData.sellerName) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-neutral-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
        );
    }

    const tabs = [
        {
            id: 'profile',
            label: 'Profile Info',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            )
        },
        {
            id: 'store',
            label: 'Store Details',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            )
        },
        {
            id: 'branding',
            label: 'Store Branding',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            )
        },
        {
            id: 'bank',
            label: 'Bank & Tax',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
            )
        },
        ...(shipsEcommerce
            ? [{
                id: 'shipping',
                label: 'Shipping Method',
                icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                ),
            }]
            : []),
    ];

    return (
        <div className="min-h-screen bg-gray-50/50">
            {/* Header Section */}
            <div className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Settings</h1>
                            <p className="mt-1 text-sm text-gray-500">Manage your store preferences and profile details</p>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                                if (isEditing) { setFieldErrors({}); setError(''); fetchProfile(); }
                                setIsEditing(!isEditing);
                            }}
                            className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 shadow-sm flex items-center gap-2 ${isEditing
                                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                                : 'bg-teal-600 text-white hover:bg-teal-700 hover:shadow-md'
                                }`}
                        >
                            {isEditing ? (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                    Cancel Editing
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    Edit Profile
                                </>
                            )}
                        </motion.button>
                    </div>
                    <div className="mt-4">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span>Profile completion</span>
                            <span className="font-semibold text-gray-700">{sellerData.profileCompletionPercentage || 0}%</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${(sellerData.profileCompletionPercentage || 0) >= 100 ? 'bg-green-500' : 'bg-teal-500'}`}
                                style={{ width: `${sellerData.profileCompletionPercentage || 0}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Sidebar Navigation */}
                    <nav className="w-full lg:w-64 flex-shrink-0 space-y-1">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === tab.id
                                        ? 'bg-teal-50 text-teal-700 shadow-sm ring-1 ring-teal-200'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                        }`}
                                >
                                    <span className={`${activeTab === tab.id ? 'text-teal-600' : 'text-gray-400'}`}>
                                        {tab.icon}
                                    </span>
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Status Card */}
                        <div className="mt-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-5 text-white shadow-lg">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-semibold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded">
                                    Account Status
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
                                    {sellerData.sellerName?.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-medium">{sellerData.sellerName}</p>
                                    <p className="text-xs text-indigo-100 uppercase">{sellerData.status || 'Active'}</p>
                                </div>
                            </div>
                        </div>
                    </nav>

                    {/* Main Content Area */}
                    <div className="flex-1">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl flex justify-between items-center shadow-sm"
                            >
                                <span className="flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    {error}
                                </span>
                                <button onClick={() => setError(null)} className="text-red-800 hover:bg-red-100 p-1 rounded transition-colors">&times;</button>
                            </motion.div>
                        )}

                        <form onSubmit={handleSubmit}>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={activeTab}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                    className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                                >
                                    <div className="p-6 md:p-8">
                                        {activeTab === 'profile' && (
                                            <div className="space-y-8">
                                                <div className="flex flex-col sm:flex-row items-center gap-6 pb-8 border-b border-gray-100">
                                                    <div className="relative group">
                                                        <div className="absolute inset-0 bg-gradient-to-tr from-teal-500 to-emerald-500 rounded-full blur opacity-25 group-hover:opacity-40 transition-opacity"></div>
                                                        <img
                                                            src={sellerData.profile || 'https://placehold.co/150'}
                                                            alt="Profile"
                                                            className="relative w-32 h-32 rounded-full object-cover border-4 border-white shadow-md bg-white"
                                                        />
                                                        {isEditing && (
                                                            // A real file picker; shown on touch screens too (no hover there).
                                                            <label className="absolute inset-0 flex items-center justify-center bg-black/40 sm:bg-black/50 rounded-full cursor-pointer opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200 z-10">
                                                                <input type="file" accept="image/*" className="hidden" disabled={Boolean(uploadingImage)} onChange={(e) => handleImagePick('profile', e)} />
                                                                <span className="text-white text-xs font-bold uppercase tracking-wider flex flex-col items-center gap-1">
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                                    {uploadingImage === 'profile' ? 'Uploading…' : 'Change'}
                                                                </span>
                                                            </label>
                                                        )}
                                                    </div>
                                                    <div className="text-center sm:text-left">
                                                        <h3 className="text-2xl font-bold text-gray-900">{sellerData.sellerName || 'Seller Name'}</h3>
                                                        <p className="text-gray-500 font-medium">{sellerData.email}</p>
                                                        <p className="text-xs text-gray-400 mt-1">Member since {new Date().getFullYear()}</p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                    <InputGroup label="Full Name" name="sellerName" value={sellerData.sellerName} onChange={handleInputChange} onBlur={handleFieldBlur} error={fieldErrors.sellerName} required disabled={!isEditing} autoComplete="name" />
                                                    <div>
                                                        {/* Email and mobile are the seller's login IDs; the server doesn't let them change here. */}
                                                        <InputGroup label="Email Address" name="email" value={sellerData.email} onChange={handleInputChange} disabled type="email" autoComplete="email" />
                                                        <div className="mt-1.5 ml-1">
                                                            {sellerData.isEmailVerified ? (
                                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                                                    Verified
                                                                </span>
                                                            ) : emailCodeSent ? (
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={emailCodeInput}
                                                                        onChange={(e) => setEmailCodeInput(e.target.value)}
                                                                        placeholder="6-digit code"
                                                                        maxLength={6}
                                                                        className="w-28 px-2 py-1 text-xs rounded border border-gray-300 focus:ring-1 focus:ring-teal-500"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        disabled={emailVerifyLoading || emailCodeInput.length !== 6}
                                                                        onClick={async () => {
                                                                            try {
                                                                                setEmailVerifyLoading(true);
                                                                                const res = await verifySellerEmail(emailCodeInput);
                                                                                if (res.success) {
                                                                                    setSellerData(prev => ({ ...prev, isEmailVerified: true }));
                                                                                    setEmailCodeSent(false);
                                                                                } else {
                                                                                    setError(res.message || 'Invalid code');
                                                                                }
                                                                            } catch (err: any) {
                                                                                setError(err.response?.data?.message || 'Invalid code');
                                                                            } finally {
                                                                                setEmailVerifyLoading(false);
                                                                            }
                                                                        }}
                                                                        className="text-xs font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-40"
                                                                    >
                                                                        {emailVerifyLoading ? 'Checking...' : 'Confirm'}
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    disabled={emailVerifyLoading}
                                                                    onClick={async () => {
                                                                        try {
                                                                            setEmailVerifyLoading(true);
                                                                            const res = await sendEmailVerification();
                                                                            if (res.success) {
                                                                                setEmailCodeSent(true);
                                                                                if (res.data?.devCode) {
                                                                                    console.log('[DEV] Email verification code:', res.data.devCode);
                                                                                }
                                                                            } else {
                                                                                setError(res.message || 'Failed to send verification email');
                                                                            }
                                                                        } catch (err: any) {
                                                                            setError(err.response?.data?.message || 'Failed to send verification email');
                                                                        } finally {
                                                                            setEmailVerifyLoading(false);
                                                                        }
                                                                    }}
                                                                    className="text-xs font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-40"
                                                                >
                                                                    {emailVerifyLoading ? 'Sending...' : 'Not verified — send verification code'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <InputGroup label="Mobile Number" name="mobile" value={sellerData.mobile} onChange={handleInputChange} disabled type="tel" autoComplete="tel" />
                                                    {/* No password: sellers sign in with an OTP sent to their mobile or email. */}
                                                    {isEditing && (
                                                        <p className="text-xs text-gray-500 ml-1 -mt-2">
                                                            Email and mobile are your login IDs. To change them, contact Exnshop support.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {activeTab === 'store' && (
                                            <div className="space-y-8">
                                                <div className="flex flex-col sm:flex-row items-center gap-6 pb-8 border-b border-gray-100">
                                                    <div className="relative group flex-shrink-0">
                                                        <div className="w-24 h-24 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden">
                                                            <img
                                                                src={sellerData.logo || 'https://placehold.co/100'}
                                                                alt="Store Logo"
                                                                className="w-full h-full object-contain"
                                                            />
                                                        </div>
                                                        {isEditing && (
                                                            <label className="absolute inset-0 flex items-center justify-center bg-black/40 sm:bg-black/50 rounded-xl cursor-pointer opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200">
                                                                <input type="file" accept="image/*" className="hidden" disabled={Boolean(uploadingImage)} onChange={(e) => handleImagePick('logo', e)} />
                                                                <span className="text-white text-xs font-bold">{uploadingImage === 'logo' ? 'Uploading…' : 'UPLOAD'}</span>
                                                            </label>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xl font-bold text-gray-900">{sellerData.storeName || 'Store Name'}</h3>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-700 uppercase tracking-wide">
                                                                {sellerData.category || 'Category'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                    <InputGroup label="Store Name" name="storeName" value={sellerData.storeName} onChange={handleInputChange} onBlur={handleFieldBlur} error={fieldErrors.storeName} required disabled={!isEditing} />

                                                    <div className="space-y-1.5">
                                                        <label className="text-sm font-semibold text-gray-700 ml-1">Primary Store Category</label>
                                                        <div className="relative">
                                                            <select
                                                                name="category"
                                                                value={sellerData.category}
                                                                onChange={handleInputChange}
                                                                disabled={!isEditing}
                                                                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none disabled:bg-gray-50/50 disabled:text-gray-500 transition-all appearance-none bg-white"
                                                            >
                                                                <option value="">Select Primary Category</option>
                                                                {headerCategories.map(cat => (
                                                                    <option key={cat._id} value={cat.name}>{cat.name}</option>
                                                                ))}
                                                            </select>
                                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="md:col-span-2 space-y-2">
                                                        <label className="text-sm font-semibold text-gray-700 ml-1">Allowed Selling Categories</label>
                                                        <p className="text-xs text-gray-500 ml-1">Categories your store is authorized to list products in when adding new items:</p>
                                                        <div className="flex flex-wrap gap-2 pt-1">
                                                            {headerCategories.map(cat => {
                                                                const isSelected = sellerData.categories.includes(cat.name);
                                                                return (
                                                                    <button
                                                                        type="button"
                                                                        key={cat._id}
                                                                        disabled={!isEditing}
                                                                        onClick={() => toggleAllowedCategory(cat.name)}
                                                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${isSelected
                                                                            ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                                                                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-teal-300'
                                                                            } ${!isEditing ? 'cursor-default opacity-85' : 'cursor-pointer'}`}
                                                                    >
                                                                        {isSelected ? '✓ ' : '+ '}{cat.name}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    <div className="md:col-span-2 space-y-1.5">
                                                        <label className="text-sm font-semibold text-gray-700 ml-1">
                                                            Store Location <span className="text-red-500">*</span>
                                                        </label>
                                                        {isEditing ? (
                                                            <>
                                                                <GoogleMapsAutocomplete
                                                                    value={sellerData.searchLocation || sellerData.address || ''}
                                                                    onChange={(address: string, lat: number, lng: number, placeName: string, components?: { city?: string; state?: string }) => {
                                                                        const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
                                                                        setSellerData(prev => ({
                                                                            ...prev,
                                                                            searchLocation: address,
                                                                            // Manual typing (no place selected) reports NaN — don't
                                                                            // clobber existing coordinates with garbage in that case;
                                                                            // the pin map below is always available as a manual fallback.
                                                                            ...(hasCoords
                                                                                ? { latitude: lat.toString(), longitude: lng.toString() }
                                                                                : {}),
                                                                            address: address,
                                                                            city: components?.city || prev.city,
                                                                        }));
                                                                    }}
                                                                    placeholder="Search and select your store location..."
                                                                    disabled={!isEditing}
                                                                    required
                                                                />
                                                                <div className="mt-4 animate-fadeIn">
                                                                    <p className="text-sm font-medium text-neutral-700 mb-2">
                                                                        Exact Location <span className="text-teal-600 text-xs font-normal">(Move the map to place the pin on your store's entrance)</span>
                                                                    </p>
                                                                    <LocationPickerMap
                                                                        initialLat={parseFloat(sellerData.latitude) || 26.9124}
                                                                        initialLng={parseFloat(sellerData.longitude) || 75.7873}
                                                                        onLocationSelect={(lat, lng) => {
                                                                            setSellerData(prev => ({
                                                                                ...prev,
                                                                                latitude: lat.toString(),
                                                                                longitude: lng.toString()
                                                                            }));
                                                                        }}
                                                                    />
                                                                    <p className="mt-1 text-xs text-neutral-500 text-center">
                                                                        Selected Coordinates: {sellerData.latitude || 'Not selected'}, {sellerData.longitude || 'Not selected'}
                                                                    </p>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <textarea
                                                                name="address"
                                                                value={sellerData.address || sellerData.searchLocation || ''}
                                                                disabled={true}
                                                                rows={3}
                                                                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-gray-50/50 text-gray-500 resize-none"
                                                            />
                                                        )}
                                                    </div>

                                                    <InputGroup label="City" name="city" value={sellerData.city} onChange={handleInputChange} onBlur={handleFieldBlur} error={fieldErrors.city} required disabled={!isEditing} />

                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-sm font-semibold text-gray-700 ml-1">
                                                                Return Address
                                                            </label>
                                                            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={sameAsReturnAddress}
                                                                    onChange={(e) => setSameAsReturnAddress(e.target.checked)}
                                                                    disabled={!isEditing}
                                                                    className="w-3.5 h-3.5 accent-teal-600"
                                                                />
                                                                Same as pickup address
                                                            </label>
                                                        </div>
                                                        <textarea
                                                            name="returnAddress"
                                                            value={sameAsReturnAddress ? (sellerData.address || '') : (sellerData.returnAddress || '')}
                                                            onChange={handleInputChange}
                                                            disabled={!isEditing || sameAsReturnAddress}
                                                            rows={3}
                                                            placeholder="Where customer returns should be shipped back to"
                                                            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none disabled:bg-gray-50/50 disabled:text-gray-500 transition-all resize-none"
                                                        />
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <label className="text-sm font-semibold text-gray-700 ml-1">
                                                            Service Radius (KM) <span className="text-red-500">*</span>
                                                        </label>
                                                        <select
                                                            name="serviceRadiusKm"
                                                            value={sellerData.serviceRadiusKm}
                                                            onChange={handleInputChange}
                                                            disabled={!isEditing}
                                                            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none disabled:bg-gray-50/50 disabled:text-gray-500 transition-all appearance-none bg-white"
                                                        >
                                                            <option value="1">1 km</option>
                                                            <option value="2">2 km</option>
                                                            <option value="5">5 km</option>
                                                            <option value="10">10 km</option>
                                                            <option value="20">20 km</option>
                                                            <option value="50">50 km</option>
                                                            <option value="100">100 km</option>
                                                            <option value="150">150 km</option>
                                                            <option value="200">200 km</option>
                                                            <option value="250">250 km</option>
                                                            <option value="300">300 km</option>
                                                            {![1, 2, 5, 10, 20, 50, 100, 150, 200, 250, 300].includes(Number(sellerData.serviceRadiusKm)) && sellerData.serviceRadiusKm && (
                                                                <option value={sellerData.serviceRadiusKm}>{sellerData.serviceRadiusKm} km</option>
                                                            )}
                                                        </select>
                                                        {isEditing && (
                                                            <p className="mt-1 text-xs text-gray-500">
                                                                Products will be shown to users within this radius from your store location
                                                            </p>
                                                        )}
                                                    </div>

                                                </div>
                                            </div>
                                        )}

                                        {activeTab === 'branding' && (
                                            <div className="space-y-8">
                                                <div className="space-y-3">
                                                    <label className="text-sm font-semibold text-gray-700 ml-1">Store Banner</label>
                                                    <div className="relative group rounded-xl overflow-hidden bg-gray-100 border-2 border-dashed border-gray-300 aspect-[21/9] transition-all hover:border-teal-300">
                                                        <img
                                                            src={sellerData.storeBanner || 'https://placehold.co/1200x400?text=Store+Banner'}
                                                            alt="Store Banner"
                                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                        />
                                                        {isEditing && (
                                                            // A real file picker; shown on touch screens too (no hover there) — same pattern as the profile photo and store logo pickers above.
                                                            <label className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm">
                                                                <input type="file" accept="image/*" className="hidden" disabled={Boolean(uploadingImage)} onChange={(e) => handleImagePick('storeBanner', e)} />
                                                                <div className="bg-white/20 p-4 rounded-full border border-white/30 backdrop-blur-md">
                                                                    {uploadingImage === 'storeBanner' ? (
                                                                        <span className="text-white text-xs font-bold px-2">Uploading…</span>
                                                                    ) : (
                                                                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                                                    )}
                                                                </div>
                                                            </label>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-500 ml-1">Recommended size: 1200x400px. Supports JPG, PNG.</p>
                                                </div>

                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-end">
                                                        <label className="text-sm font-semibold text-gray-700 ml-1">Store Description</label>
                                                        <span className="text-xs text-gray-400">Displayed on your store page</span>
                                                    </div>
                                                    <textarea
                                                        name="storeDescription"
                                                        value={sellerData.storeDescription || ''}
                                                        onChange={handleInputChange}
                                                        disabled={!isEditing}
                                                        rows={6}
                                                        placeholder="Tell customers about your store, specialty, and heritage..."
                                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none disabled:bg-gray-50/50 disabled:text-gray-500 transition-all resize-none leading-relaxed"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {activeTab === 'shipping' && (
                                            <>
                                                <ShippingMethodCard />
                                                <ShippingSettingsCard />
                                            </>
                                        )}

                                        {activeTab === 'bank' && (
                                            <div className="space-y-10">
                                                <section>
                                                    <div className="flex items-center gap-3 mb-6">
                                                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                                        </div>
                                                        <h4 className="text-lg font-bold text-gray-900">Bank Details</h4>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-gray-50/50 p-6 rounded-xl border border-gray-100">
                                                        <InputGroup label="Account Holder Name" name="accountName" value={sellerData.accountName} onChange={handleInputChange} onBlur={handleFieldBlur} error={fieldErrors.accountName} disabled={!isEditing} />
                                                        <InputGroup label="Bank Name" name="bankName" value={sellerData.bankName} onChange={handleInputChange} onBlur={handleFieldBlur} error={fieldErrors.bankName} disabled={!isEditing} />
                                                        <InputGroup label="Account Number" name="accountNumber" value={sellerData.accountNumber} onChange={handleInputChange} onBlur={handleFieldBlur} error={fieldErrors.accountNumber} disabled={!isEditing} type="text" inputMode="numeric" maxLength={18} placeholder="9–18 digit account number" />
                                                        <InputGroup label="IFSC Code" name="ifsc" value={sellerData.ifsc} onChange={handleInputChange} onBlur={handleFieldBlur} error={fieldErrors.ifsc} disabled={!isEditing} maxLength={11} placeholder="ABCD0123456" />
                                                    </div>
                                                </section>

                                                <section>
                                                    <div className="flex items-center gap-3 mb-6">
                                                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                                        </div>
                                                        <h4 className="text-lg font-bold text-gray-900">UPI Details</h4>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-gray-50/50 p-6 rounded-xl border border-gray-100">
                                                        <div>
                                                            <InputGroup label="UPI ID" name="upiId" value={sellerData.upiId || ''} onChange={handleInputChange} onBlur={handleFieldBlur} error={fieldErrors.upiId} disabled={!isEditing} placeholder="username@bank" />
                                                            <p className="text-xs text-gray-500 mt-1 ml-1">Example: username@bank</p>
                                                        </div>
                                                    </div>
                                                </section>

                                                <section>
                                                    <div className="flex items-center gap-3 mb-6">
                                                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                        </div>
                                                        <h4 className="text-lg font-bold text-gray-900">Tax Information</h4>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-gray-50/50 p-6 rounded-xl border border-gray-100">
                                                        <InputGroup label="PAN Card Number" name="panCard" value={sellerData.panCard} onChange={handleInputChange} onBlur={handleFieldBlur} error={fieldErrors.panCard} disabled={!isEditing} maxLength={10} placeholder="ABCDE1234F" />
                                                        <InputGroup label="GSTIN" name="gstin" value={sellerData.gstin} onChange={handleInputChange} onBlur={handleFieldBlur} error={fieldErrors.gstin} disabled={!isEditing} maxLength={15} placeholder="09ABCDE1234F1Z5" />
                                                        <div className="space-y-1.5">
                                                            <label className="text-sm font-semibold text-gray-700 ml-1">Business Type</label>
                                                            <div className="relative">
                                                                <select
                                                                    name="businessType"
                                                                    value={sellerData.businessType}
                                                                    onChange={handleInputChange}
                                                                    disabled={!isEditing}
                                                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none disabled:bg-gray-50/50 disabled:text-gray-500 transition-all appearance-none bg-white"
                                                                >
                                                                    <option value="">Select business type</option>
                                                                    {BUSINESS_TYPES.map(bt => (
                                                                        <option key={bt} value={bt}>{bt}</option>
                                                                    ))}
                                                                    {sellerData.businessType && !BUSINESS_TYPES.includes(sellerData.businessType) && (
                                                                        <option value={sellerData.businessType}>{sellerData.businessType}</option>
                                                                    )}
                                                                </select>
                                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <InputGroup label="Tax Number (legacy, optional)" name="taxNumber" value={sellerData.taxNumber} onChange={handleInputChange} disabled={!isEditing} />
                                                    </div>
                                                </section>
                                            </div>
                                        )}
                                    </div>

                                    {isEditing && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="px-8 py-5 bg-gray-50 border-t border-gray-200 flex justify-end gap-4"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => { setIsEditing(false); setFieldErrors({}); setError(''); fetchProfile(); }}
                                                className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={saveLoading}
                                                className={`px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 ${saveLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                                            >
                                                {saveLoading ? (
                                                    <span className="flex items-center gap-2">
                                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                        Saving...
                                                    </span>
                                                ) : 'Save Changes'}
                                            </button>
                                        </motion.div>
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

const InputGroup = ({ label, name, value, onChange, onBlur, disabled, type = "text", placeholder = "", autoComplete, error, required, maxLength, inputMode }: any) => (

    <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700 ml-1">
            {label}{required && <span className="text-red-500"> *</span>}
        </label>
        <input
            type={type}
            name={name}
            value={value || ''}
            onChange={onChange}
            onBlur={onBlur}
            disabled={disabled}
            placeholder={placeholder}
            autoComplete={autoComplete}
            maxLength={maxLength}
            inputMode={inputMode}
            aria-invalid={Boolean(error)}
            className={`w-full px-4 py-2.5 rounded-lg border outline-none transition-all ${disabled
                ? 'bg-gray-50/50 text-gray-500 cursor-default border-gray-300'
                : error
                    ? 'bg-white border-red-400 focus:ring-2 focus:ring-red-500/20 focus:border-red-500'
                    : 'bg-white border-gray-300 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500'
                }`}
        />
        {error && <p className="text-xs text-red-600 ml-1">{error}</p>}
    </div>
);

export default SellerAccountSettings;
