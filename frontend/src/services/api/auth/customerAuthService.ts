import api, { setAuthToken, removeAuthToken } from '../config';

export interface SendOTPResponse {
  success: boolean;
  message: string;
  sessionId?: string;
}

export interface VerifyOTPResponse {
  success: boolean;
  message: string;
  data: {
    token: string;
    user: {
      id: string;
      name: string;
      phone: string;
      email: string;
      walletAmount: number;
      refCode: string;
      status: string;
      preferredLanguage?: string | null;
    };
    isNewUser?: boolean;
    languageSelected?: boolean;
  };
}

/**
 * Send OTP to customer mobile (real SMS, or the fixed 123456 test code under
 * OTP_UNIVERSAL_BYPASS — no live SMS provider required for that).
 */
export const sendOTP = async (mobile: string): Promise<SendOTPResponse> => {
  const response = await api.post<SendOTPResponse>('/auth/customer/send-sms-otp', { mobile });
  return response.data;
};

/**
 * Verify mobile OTP and login customer. `email` is optional and only
 * attached to the account if provided.
 */
export const verifyOTP = async (mobile: string, otp: string, sessionId?: string, email?: string): Promise<VerifyOTPResponse> => {
  const response = await api.post<VerifyOTPResponse>('/auth/customer/verify-sms-otp', { mobile, otp, sessionId, email });

  if (response.data.success && response.data.data.token) {
    const userData = {
      ...response.data.data.user,
      userType: 'Customer' as const
    };
    setAuthToken(response.data.data.token, 'Customer', userData);
  }

  return response.data;
};

/**
 * Logout customer
 */
export const logout = (): void => {
  removeAuthToken('customer');
};

