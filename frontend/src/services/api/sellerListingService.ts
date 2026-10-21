import api from './config';

export type AttributeType = 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'date';

export interface ListingAttribute {
  key: string;
  label: string;
  type: AttributeType;
  isRequired: boolean;
  isVariantAttribute: boolean;
  isFilterable: boolean;
  allowedValues: string[];
  unit?: string;
  validation?: { min?: number; max?: number; pattern?: string };
  helpText?: string;
  group?: string;
  keySpec?: boolean;
}

export interface ListingConfig {
  attributes: ListingAttribute[];
  rule: { defaultHsn?: string; isRegulated: boolean; requiredDocs: Array<{ key: string; label: string }> };
  seller: { gstRegistered: boolean; requiresShipping: boolean };
  /** What checkout adds on top of the selling price: GST at the category's rate and a per-order platform fee. */
  pricing?: { gstRate: number; platformFee: number };
}

export interface ComplianceDoc {
  _id: string;
  docType: string;
  label: string;
  originalName?: string;
  format?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  remarks: string;
  uploadedAt: string;
}

type Res<T> = { success: boolean; message?: string; data: T };

export const getListingConfig = async (scope: {
  headerCategoryId?: string;
  categoryId?: string;
  subcategoryId?: string;
  subSubCategoryId?: string;
}) => (await api.get<Res<ListingConfig>>('/products/listing-config', { params: scope })).data;

export const createDraft = async (body: Record<string, any>) => (await api.post<Res<any>>('/products/draft', body)).data;

/** Saves part of a listing. `guidedListing` opts in to the category-aware rules. */
export const saveListing = async (id: string, body: Record<string, any>) =>
  (await api.put<Res<any>>(`/products/${id}`, { ...body, guidedListing: true })).data;

export const submitListing = async (id: string) => saveListing(id, { submitForReview: true });

export const duplicateProduct = async (id: string) => (await api.post<Res<any>>(`/products/${id}/duplicate`)).data;

export const uploadComplianceDoc = async (productId: string, docType: string, file: File) => {
  const form = new FormData();
  form.append('docType', docType);
  form.append('file', file);
  return (await api.post<Res<ComplianceDoc[]>>(`/products/${productId}/compliance`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
};

export const deleteComplianceDoc = async (productId: string, docId: string) =>
  (await api.delete<Res<ComplianceDoc[]>>(`/products/${productId}/compliance/${docId}`)).data;

export const getComplianceDocUrl = async (productId: string, docId: string) =>
  (await api.get<Res<{ url: string }>>(`/products/${productId}/compliance/${docId}/url`)).data;

export const listingErrorMessage = (err: any, fallback = 'Something went wrong') =>
  err?.response?.data?.message || err?.message || fallback;
