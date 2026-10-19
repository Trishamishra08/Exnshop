import api from '../config';

export type AttributeType = 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'date';
export type ScopeType = 'HeaderCategory' | 'Category';

export interface AdminAttribute {
  _id: string;
  key: string;
  label: string;
  type: AttributeType;
  isRequired: boolean;
  isVariantAttribute: boolean;
  isFilterable: boolean;
  isSearchable: boolean;
  allowedValues: string[];
  unit?: string;
  helpText?: string;
  group?: string;
  keySpec?: boolean;
  keySpecFormat?: string;
  displayOrder: number;
  isActive: boolean;
  validation?: { min?: number; max?: number; pattern?: string };
}

export interface AdminListingRule {
  defaultHsn?: string;
  isRegulated: boolean;
  requiredDocs: Array<{ key?: string; label: string }>;
  notes?: string;
}

type Res<T> = { success: boolean; message?: string; data: T };

export const getListingSetup = async (scopeType: ScopeType, scopeId: string) =>
  (await api.get<Res<{ attributes: AdminAttribute[]; rule: AdminListingRule }>>('/admin/listing-setup', { params: { scopeType, scopeId } })).data;

export const createAttribute = async (scopeType: ScopeType, scopeId: string, body: Partial<AdminAttribute>) =>
  (await api.post<Res<AdminAttribute>>('/admin/listing-setup/attributes', { ...body, scopeType, scopeId })).data;

export const updateAttribute = async (id: string, body: Partial<AdminAttribute>) =>
  (await api.put<Res<AdminAttribute>>(`/admin/listing-setup/attributes/${id}`, body)).data;

export const deleteAttribute = async (id: string) => (await api.delete<Res<unknown>>(`/admin/listing-setup/attributes/${id}`)).data;

export const saveListingRule = async (scopeType: ScopeType, scopeId: string, rule: AdminListingRule) =>
  (await api.put<Res<AdminListingRule>>('/admin/listing-setup/rule', { ...rule, scopeType, scopeId })).data;

export interface ReviewSeller {
  _id: string;
  sellerName?: string;
  storeName?: string;
  mobile?: string;
  email?: string;
  isEmailVerified?: boolean;
  city?: string;
  address?: string;
  returnAddress?: string;
  searchLocation?: string;
  businessType?: string;
  legalBusinessName?: string;
  gstRegistered?: boolean;
  gstin?: string;
  panCard?: string;
  fssaiLicNo?: string;
  onboardingStatus?: string;
  status?: string;
  channels?: string[];
  serviceRadiusKm?: number;
  bankVerificationStatus?: string;
  logo?: string;
  createdAt?: string;
  productCounts?: Record<string, number>;
}

export interface ProductReviewDetails {
  product: any;
  seller: ReviewSeller | null;
  tax: { name: string; percentage: number } | null;
  specGroups: Array<{ title: string; items: Array<{ label: string; value: string; keySpec: boolean; keyText?: string }> }>;
  unfilledAttributes: Array<{ label: string; group: string; required: boolean }>;
  attributeRows: Array<{ label: string; value: any; unit?: string }>;
  problems: string[];
  isRegulated: boolean;
  complianceDocs: Array<{ _id: string; docType: string; label: string; originalName?: string; status: 'Pending' | 'Approved' | 'Rejected'; remarks: string }>;
  qualityFlags: string[];
}

export const getProductReviewDetails = async (id: string) => (await api.get<Res<ProductReviewDetails>>(`/admin/products/${id}/review`)).data;

export const startProductReview = async (id: string) => (await api.post<Res<unknown>>(`/admin/products/${id}/start-review`)).data;

export const getComplianceDocUrlAdmin = async (productId: string, docId: string) =>
  (await api.get<Res<{ url: string }>>(`/admin/products/${productId}/compliance/${docId}/url`)).data;

export const reviewComplianceDoc = async (productId: string, docId: string, status: 'Approved' | 'Rejected', remarks?: string) =>
  (await api.patch<Res<ProductReviewDetails['complianceDocs']>>(`/admin/products/${productId}/compliance/${docId}`, { status, remarks })).data;
