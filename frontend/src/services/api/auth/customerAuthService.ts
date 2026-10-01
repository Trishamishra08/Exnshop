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
 * Send OTP to customer email. Login now runs on email+OTP — there's no live
 * SMS OTP provider yet, so mobile is collected but no longer OTP-verified.
 */
export const sendOTP = async (email: string): Promise<SendOTPResponse> => {
  const response = await api.post<SendOTPResponse>('/auth/customer/send-sms-otp', { email });
  return response.data;
};

/**
 * Verify email OTP and login customer. `mobile` is required only the first
 * time (new account creation) — pass it every time, it's ignored for
 * existing accounts.
 */
export const verifyOTP = async (email: string, otp: string, sessionId?: string, mobile?: string): Promise<VerifyOTPResponse> => {
  const response = await api.post<VerifyOTPResponse>('/auth/customer/verify-sms-otp', { email, otp, sessionId, mobile });

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

