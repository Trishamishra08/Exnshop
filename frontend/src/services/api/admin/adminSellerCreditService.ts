import api from "../config";

export interface SellerCreditRow {
  _id: string;
  storeName: string;
  sellerName: string;
  mobile?: string;
  available: number;
  onHold: number;
  frozen: number;
  totalBalance: number;
  /** The seller's own limit; null = uses the default. */
  ownCreditLimit: number | null;
  creditLimit: number;
  creditUsed: number;
  creditRemaining: number;
}

export interface SellerCreditList {
  defaultCreditLimit: number;
  sellers: SellerCreditRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export const getSellerCredits = async (params: { page?: number; limit?: number; search?: string }) => {
  const res = await api.get<{ success: boolean; data: SellerCreditList; message?: string }>("/admin/seller-credit", { params });
  return res.data;
};

/** Credit limit for all sellers: sets the default; `applyToAll` also clears every seller's own limit. */
export const setDefaultCreditLimit = async (amount: number, applyToAll: boolean) => {
  const res = await api.put<{ success: boolean; message: string }>("/admin/seller-credit/default", { amount, applyToAll });
  return res.data;
};

/** One seller's own limit (null = use the default). */
export const setSellerCreditLimit = async (sellerId: string, creditLimit: number | null) => {
  const res = await api.put<{ success: boolean; message: string }>(`/admin/seller-credit/${sellerId}/limit`, { creditLimit });
  return res.data;
};

/** Freeze (hold), release, or deduct a chargeback from a seller's held amount. */
export const holdSellerBalance = async (sellerId: string, action: "freeze" | "release" | "deduct", amount: number, reason: string) => {
  const res = await api.post<{ success: boolean; message: string }>(`/admin/seller-credit/${sellerId}/hold`, { action, amount, reason });
  return res.data;
};
