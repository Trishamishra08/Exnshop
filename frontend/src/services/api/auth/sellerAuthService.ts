import api, { setAuthToken, removeAuthToken } from '../config';

export interface SendOTPResponse {
  success: boolean;
  message: string;
}

export interface VerifyOTPResponse {
  success: boolean;
  message: string;
  data: {
    token: string;
    user: {
      id: string;
      sellerName: string;
      mobile: string;
      email: string;
      storeName: string;
      status: string;
      logo?: string;
      address?: string;
      city?: string;
    };
  };
}

export interface RegisterData {
  sellerName: string;
  mobile: string;
  email: string;
  storeName: string;
  category?: string; // primary category (optional if categories array provided)
  categories: string[]; // multiple categories
  address: string;
  city: string;
  serviceableArea?: string;
  searchLocation?: string;
  latitude?: string;
  longitude?: string;
  serviceRadiusKm?: string | number;
  channels: ('Quick' | 'ECommerce')[]; // commerce channel(s) this seller sells through
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  // register() now only stages a draft and sends the OTP — the real account
  // (and this data) only exists after verify-otp succeeds.
  data?: {
    token: string;
    user: {
      id: string;
      sellerName: string;
      mobile: string;
      email: string;
      storeName: string;
      status: string;
      categories?: string[];
    };
  };
}

/**
 * Send OTP to seller's registered email
 */
export const sendOTP = async (email: string): Promise<SendOTPResponse> => {
  const response = await api.post<SendOTPResponse>('/auth/seller/send-otp', { email });
  return response.data;
};

/**
 * Verify OTP and login seller
 */
export const verifyOTP = async (email: string, otp: string): Promise<VerifyOTPResponse> => {
  const response = await api.post<VerifyOTPResponse>('/auth/seller/verify-otp', { email, otp });

  if (response.data.success && response.data.data?.token) {
    const userData = {
      ...response.data.data.user,
      userType: 'Seller' as const,
    };
    setAuthToken(response.data.data.token, 'Seller', userData);
  }

  return response.data;
};

/**
 * Register new seller
 */
export const register = async (data: RegisterData): Promise<RegisterResponse> => {
  const response = await api.post<RegisterResponse>('/auth/seller/register', data);
  return response.data;
};

/**
 * Get current seller profile
 */
export const getSellerProfile = async (): Promise<any> => {
  const response = await api.get('/auth/seller/profile');
  return response.data;
};

/**
 * Update seller profile
 */
export const updateSellerProfile = async (data: any): Promise<any> => {
  const response = await api.put('/auth/seller/profile', data);
  return response.data;
};

/**
 * Send a 6-digit code to the seller's registered email for verification.
 */
export const sendEmailVerification = async (): Promise<any> => {
  const response = await api.post('/auth/seller/send-email-verification');
  return response.data;
};

/**
 * Verify the seller's email with the code sent by sendEmailVerification.
 */
export const verifySellerEmail = async (code: string): Promise<any> => {
  const response = await api.post('/auth/seller/verify-email', { code });
  return response.data;
};

/**
 * Logout seller
 */
export const logout = (): void => {
  removeAuthToken('seller');
};

/**
 * Toggle shop status (Open/Close)
 */
export const toggleShopStatus = async (): Promise<any> => {
  const response = await api.put('/auth/seller/toggle-shop-status');
  return response.data;
};


