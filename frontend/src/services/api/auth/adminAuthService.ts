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
      firstName: string;
      lastName: string;
      mobile: string;
      email: string;
      role: string;
    };
  };
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  password: string;
  role?: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  data: {
    token: string;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      mobile: string;
      email: string;
      role: string;
    };
  };
}

/**
 * Send OTP to admin mobile number
 */
export const sendOTP = async (mobile: string): Promise<SendOTPResponse> => {
  const response = await api.post<SendOTPResponse>('/auth/admin/send-otp', { mobile });
  return response.data;
};

/** Send a real login OTP to the admin's email. */
export const sendEmailOTP = async (email: string): Promise<SendOTPResponse> => {
  const response = await api.post<SendOTPResponse>('/auth/admin/send-otp', { email });
  return response.data;
};

/**
 * Verify OTP and login admin — by mobile, or by email when `byEmail` is set
 * (then the first argument is the email).
 */
export const verifyOTP = async (mobileOrEmail: string, otp: string, byEmail = false): Promise<VerifyOTPResponse> => {
  const response = await api.post<VerifyOTPResponse>(
    '/auth/admin/verify-otp',
    byEmail ? { email: mobileOrEmail, otp } : { mobile: mobileOrEmail, otp }
  );

  if (response.data.success && response.data.data.token) {
    const userWithUserType = {
      ...response.data.data.user,
      userType: 'Admin' as const,
    };
    setAuthToken(response.data.data.token, 'Admin', userWithUserType);
  }

  return response.data;
};

/**
 * Register new admin
 */
export const register = async (data: RegisterData): Promise<RegisterResponse> => {
  const response = await api.post<RegisterResponse>('/auth/admin/register', data);

  if (response.data.success && response.data.data.token) {
    const userWithUserType = {
      ...response.data.data.user,
      userType: 'Admin' as const,
    };
    setAuthToken(response.data.data.token, 'Admin', userWithUserType);
  }

  return response.data;
};

/**
 * Logout admin
 */
export const logout = (): void => {
  removeAuthToken('admin');
};

export interface AdminProfileResponse {
  success: boolean;
  message?: string;
  data: {
    _id: string;
    name: string;
    email: string;
    mobile: string;
    profileImage?: string;
    role: string;
  };
}

/**
 * Get admin profile
 */
export const getAdminProfile = async (): Promise<AdminProfileResponse> => {
  const response = await api.get<AdminProfileResponse>('/auth/admin/profile');
  return response.data;
};

/**
 * Update admin profile
 */
export const updateAdminProfile = async (data: {
  name?: string;
  mobile?: string;
  profileImage?: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<AdminProfileResponse> => {
  const response = await api.put<AdminProfileResponse>('/auth/admin/profile', data);
  return response.data;
};
