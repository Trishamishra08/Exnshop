import api from './config';

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  dateOfBirth?: string;
  registrationDate: string;
  status: string;
  refCode: string;
  walletAmount: number;
  totalOrders: number;
  totalSpent: number;
  preferredLanguage?: string;
}

export interface GetProfileResponse {
  success: boolean;
  message: string;
  data: CustomerProfile;
}

export interface UpdateProfileData {
  name?: string;
  email?: string;
  dateOfBirth?: string;
}

export interface UpdateProfileResponse {
  success: boolean;
  message: string;
  data: CustomerProfile;
}

export interface UpdateLanguageResponse {
  success: boolean;
  message: string;
  data: {
    preferredLanguage: string;
  };
}

/**
 * Get customer profile
 */
export const getProfile = async (): Promise<GetProfileResponse> => {
  const response = await api.get<GetProfileResponse>('/customer/profile');
  return response.data;
};

/**
 * Update customer profile
 */
export const updateProfile = async (data: UpdateProfileData): Promise<UpdateProfileResponse> => {
  const response = await api.put<UpdateProfileResponse>('/customer/profile', data);
  return response.data;
};

/**
 * Update customer preferred language in MongoDB
 */
export const updateCustomerLanguage = async (language: string): Promise<UpdateLanguageResponse> => {
  const response = await api.put<UpdateLanguageResponse>('/customer/language', { language });
  return response.data;
};

export interface SupportContactData {
  name: string;
  email: string;
  subject: string;
  message: string;
  category?: string;
}

export interface SupportContactResponse {
  success: boolean;
  message: string;
  data?: {
    requestId: string;
    ticketId?: string;
    ticketNumber?: string;
  };
}

/**
 * Submit customer support contact message
 */
export const submitCustomerSupport = async (data: SupportContactData): Promise<SupportContactResponse> => {
  const response = await api.post<SupportContactResponse>('/customer/support/contact', data);
  return response.data;
};



/**
 * Permanently delete the customer's account. Pass `forfeitWallet: true` to confirm giving up
 * a wallet balance. Refused (409) while an order, return or withdrawal is still in progress.
 */
export const deleteMyAccount = async (forfeitWallet = false): Promise<{ success: boolean; message: string; code?: string; walletAmount?: number }> => {
  const response = await api.delete('/customer/profile', { data: { confirm: 'DELETE', forfeitWallet } });
  return response.data;
};
