import api from './config';

export const getCustomerWalletBalance = async () => {
  const response = await api.get('/customer/wallet/balance');
  return response.data;
};

export const getCustomerWalletTransactions = async (page = 1, limit = 20) => {
  const response = await api.get('/customer/wallet/transactions', {
    params: { page, limit },
  });
  return response.data;
};

export interface CustomerBankDetails {
  accountHolderName: string;
  accountNumber: string;
  accountNumberMasked?: string;
  ifscCode: string;
  bankName: string;
  upiId: string;
  updatedAt?: string | null;
  hasBank?: boolean;
  hasUpi?: boolean;
}

export const getCustomerBankDetails = async () => (await api.get('/customer/bank-details')).data;

export const saveCustomerBankDetails = async (body: Partial<CustomerBankDetails>) => (await api.put('/customer/bank-details', body)).data;

/** Move wallet balance to the saved bank account or UPI ID. */
export const requestCustomerWithdrawal = async (amount: number, method: 'Bank Transfer' | 'UPI') =>
  (await api.post('/customer/wallet/withdraw', { amount, method })).data;

export const getCustomerWithdrawals = async () => (await api.get('/customer/wallet/withdrawals')).data;

export interface StatementEntry {
  id: string;
  date: string;
  type: 'Credit' | 'Debit';
  kind: string;
  mode: string;
  description: string;
  amount: number;
  status: string;
  orderNumber?: string;
  orderId?: string;
}

export interface StatementSummary {
  walletBalance: number;
  totalPaid: number;
  totalRefunded: number;
  totalCredits: number;
  totalDebits: number;
  pendingBankTransfers: number;
}

/** Account statement: order payments, refunds, wallet credits/debits and bank transfers. */
export const getCustomerStatement = async (): Promise<{ success: boolean; data: { summary: StatementSummary; entries: StatementEntry[] } }> =>
  (await api.get('/customer/statement')).data;
