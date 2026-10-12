import api from './config';

export type OnboardingStatus =
  | 'Draft'
  | 'KYCPending'
  | 'UnderReview'
  | 'ActionRequired'
  | 'Approved'
  | 'Active'
  | 'Suspended'
  | 'Rejected';

export type SectionKey = 'business' | 'kyc' | 'bank' | 'store';
export type ReviewStatus = 'NotSubmitted' | 'Submitted' | 'Approved' | 'ChangesRequired';

export interface SectionState {
  complete: boolean;
  missing: string[];
  reviewStatus: ReviewStatus;
  remarks: string;
  editable: boolean;
}

export interface OnboardingDocument {
  _id: string;
  docType: string;
  label: string;
  originalName?: string;
  format?: string;
  uploadedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  remarks: string;
}

export interface OnboardingView {
  sellerId: string;
  onboardingStatus: OnboardingStatus;
  statusReason: string;
  submittedAt?: string;
  canSubmit: boolean;
  sections: Record<SectionKey, SectionState>;
  business: {
    businessType: string;
    legalBusinessName: string;
    panCard: string;
    gstRegistered?: boolean;
    gstin: string;
    fssaiLicNo: string;
  };
  bank: {
    accountName: string;
    bankName: string;
    branch: string;
    ifsc: string;
    upiId: string;
    accountNumber?: string;
    accountNumberMasked: string;
    verificationStatus: 'Unverified' | 'Verified' | 'Failed';
    verificationMethod?: string;
    verifiedAt?: string;
    verificationRemarks: string;
  };
  store: {
    storeName: string;
    storeDescription: string;
    logo: string;
    address: string;
    returnAddress: string;
    city: string;
    searchLocation: string;
    latitude: string;
    longitude: string;
    mobile: string;
    email: string;
  };
  requiredDocuments: string[];
  documents: OnboardingDocument[];
  options: { businessTypes: string[]; documentLabels: Record<string, string> };
}

export interface AuditEntry {
  _id: string;
  actorType: 'Seller' | 'Admin' | 'System';
  actorName?: string;
  action: string;
  section?: string;
  changes?: Array<{ field: string; from?: string; to?: string }>;
  remarks?: string;
  createdAt: string;
}

export interface AdminOnboardingView extends OnboardingView {
  seller: {
    sellerName: string;
    storeName: string;
    mobile: string;
    email: string;
    city: string;
    createdAt: string;
    channels: string[];
    requireProductApproval: boolean;
  };
  auditLog: AuditEntry[];
}

type Res<T> = { success: boolean; message?: string; data: T };

export const STATUS_META: Record<OnboardingStatus, { label: string; tone: string }> = {
  Draft: { label: 'Draft', tone: 'bg-neutral-100 text-neutral-700 border-neutral-200' },
  KYCPending: { label: 'KYC Pending', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  UnderReview: { label: 'Under Review', tone: 'bg-blue-50 text-blue-800 border-blue-200' },
  ActionRequired: { label: 'Action Required', tone: 'bg-orange-50 text-orange-800 border-orange-200' },
  Approved: { label: 'Approved', tone: 'bg-teal-50 text-teal-800 border-teal-200' },
  Active: { label: 'Active', tone: 'bg-green-50 text-green-800 border-green-200' },
  Suspended: { label: 'Suspended', tone: 'bg-red-50 text-red-800 border-red-200' },
  Rejected: { label: 'Rejected', tone: 'bg-red-50 text-red-800 border-red-200' },
};

export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  Individual: 'Individual',
  Proprietorship: 'Sole Proprietorship',
  Partnership: 'Partnership',
  LLP: 'LLP',
  PrivateLimited: 'Private Limited Company',
  PublicLimited: 'Public Limited Company',
};

// ── Seller ──
export const getMyOnboarding = async () => (await api.get<Res<OnboardingView>>('/seller/onboarding')).data;
export const saveBusinessDetails = async (body: Record<string, any>) =>
  (await api.put<Res<OnboardingView>>('/seller/onboarding/business', body)).data;
export const saveBankDetails = async (body: Record<string, any>) =>
  (await api.put<Res<OnboardingView>>('/seller/onboarding/bank', body)).data;
export const saveStoreDetails = async (body: Record<string, any>) =>
  (await api.put<Res<OnboardingView>>('/seller/onboarding/store', body)).data;
export const uploadOnboardingDocument = async (docType: string, file: File) => {
  const form = new FormData();
  form.append('docType', docType);
  form.append('file', file);
  return (
    await api.post<Res<OnboardingView>>('/seller/onboarding/documents', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  ).data;
};
export const deleteOnboardingDocument = async (docId: string) =>
  (await api.delete<Res<OnboardingView>>(`/seller/onboarding/documents/${docId}`)).data;
export const getMyDocumentUrl = async (docId: string) =>
  (await api.get<Res<{ url: string }>>(`/seller/onboarding/documents/${docId}/url`)).data;
export const submitOnboarding = async () => (await api.post<Res<OnboardingView>>('/seller/onboarding/submit')).data;

// ── Admin ──
export const getSellerOnboardingAdmin = async (sellerId: string) =>
  (await api.get<Res<AdminOnboardingView>>(`/sellers/${sellerId}/onboarding`)).data;
export const getSellerDocumentUrlAdmin = async (sellerId: string, docId: string) =>
  (await api.get<Res<{ url: string }>>(`/sellers/${sellerId}/documents/${docId}/url`)).data;
export const reviewSellerDocumentAdmin = async (
  sellerId: string,
  docId: string,
  status: 'Approved' | 'Rejected',
  remarks?: string
) => (await api.patch<Res<OnboardingView>>(`/sellers/${sellerId}/documents/${docId}`, { status, remarks })).data;
export const reviewSellerSectionAdmin = async (
  sellerId: string,
  section: SectionKey,
  decision: 'Approved' | 'ChangesRequired',
  remarks?: string
) => (await api.post<Res<OnboardingView>>(`/sellers/${sellerId}/onboarding/review`, { section, decision, remarks })).data;
export const decideSellerAdmin = async (
  sellerId: string,
  action: 'approve' | 'request_changes' | 'reject' | 'suspend' | 'reactivate',
  remarks?: string
) => (await api.post<Res<OnboardingView>>(`/sellers/${sellerId}/onboarding/decision`, { action, remarks })).data;

export const apiErrorMessage = (err: any, fallback = 'Something went wrong') =>
  err?.response?.data?.message || err?.message || fallback;
