import api from './config';

/** The date filter every downloadable report uses (India time; financial year = April to March). */
export type ReportPreset = 'current_month' | 'last_month' | 'last_3_months' | 'current_fy' | 'previous_fy' | 'custom';

export const REPORT_PRESET_OPTIONS: Array<{ value: ReportPreset; label: string }> = [
  { value: 'current_month', label: 'Current Month' },
  { value: 'last_month', label: 'Last One Month' },
  { value: 'last_3_months', label: 'Last Three Months' },
  { value: 'current_fy', label: 'Current Financial Year' },
  { value: 'previous_fy', label: 'Previous Financial Year' },
  { value: 'custom', label: 'Custom Date' },
];

export interface ReportPeriodParams {
  preset: ReportPreset;
  from?: string;
  to?: string;
}

export interface IncomeReport {
  seller: { id: string; code: string; name: string; storeName: string; email: string; mobile: string; gstin: string };
  period: { label: string; from: string; to: string };
  summary: {
    orders: number;
    itemsSold: number;
    grossSales: number;
    taxableSales: number;
    gstCollected: number;
    cancelledValue: number;
    returnedValue: number;
    commission: number;
    courierCharges: number;
    orderEarnings: number;
    pendingEarnings: number;
    walletCharges: number;
    walletCredits: number;
    adSpend: number;
    netIncome: number;
    paidToBank: number;
    walletBalance: number;
    onHoldBalance: number;
    gstNetTaxable: number;
    gstNetTax: number;
  };
  chargeBreakdown: Array<{ label: string; debit: number; credit: number }>;
  orders: Array<{
    date: string; orderNumber: string; channel: string; paymentMethod: string; product: string; qty: number;
    invoiceValue: number; commission: number; courier: number; earning: number; itemStatus: string; settlement: string;
  }>;
  orderCount: number;
  withdrawals: Array<{ requestedOn: string; paidOn: string; amount: number; method: string; status: string; reference: string }>;
  campaigns: Array<{ name: string; status: string; clicks: number; impressions: number; spend: number }>;
}

export interface PlatformReport {
  period: { label: string; from: string; to: string };
  summary: {
    orders: number; salesValue: number; taxableSales: number; gstOnSales: number; platformFees: number; commission: number;
    commissionReversed: number; deliveryCharges: number; riderPayouts: number; adRevenue: number; netEarnings: number;
    gstOnFees: number; courierChargedToSellers: number; refundsToCustomers: number; sellerBankPayouts: number; returns: number; exchanges: number;
  };
  bySource: Array<{ source: string; amount: number; entries: number }>;
  sellers: Array<{ sellerId: string; sellerName: string; sales: number; gst: number; commission: number; courier: number; adSpend: number; settlement: number; balance: number }>;
  campaigns: Array<{ campaign: string; seller: string; status: string; clicks: number; impressions: number; spend: number }>;
  gstTcs: { salesTaxable: number; salesTax: number; returnTaxable: number; returnTax: number; netTaxable: number; netTax: number };
}

export interface ReportSeller {
  id: string;
  storeName: string;
  sellerName: string;
  email: string;
  mobile: string;
  gstin: string;
  city: string;
  status: string;
}

const qs = (p: ReportPeriodParams) => ({ preset: p.preset, ...(p.preset === 'custom' ? { from: p.from, to: p.to } : {}) });

/** Saves a blob the server sent; the file name comes from its Content-Disposition. */
const saveBlob = (res: { data: Blob; headers: any }, fallbackName: string) => {
  const cd = String(res.headers?.['content-disposition'] || '');
  const name = cd.match(/filename="?([^";]+)"?/i)?.[1] || fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/** A failed download comes back as a Blob; read the server's message out of it. */
export const downloadErrorMessage = async (err: any, fallback: string): Promise<string> => {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text())?.message || fallback;
    } catch {
      return fallback;
    }
  }
  return data?.message || err?.message || fallback;
};

const download = async (url: string, params: any, fallbackName: string) => {
  const res = await api.get(url, { params, responseType: 'blob' });
  saveBlob(res as any, fallbackName);
};

// ── Seller ──────────────────────────────────────────────────

export const getMyIncomeReport = async (p: ReportPeriodParams): Promise<IncomeReport> =>
  (await api.get('/seller/reports/income', { params: qs(p) })).data.data;
export const downloadMyIncomeReport = (p: ReportPeriodParams) => download('/seller/reports/income/download', qs(p), 'income_report.xlsx');
export const downloadMyGstReport = (p: ReportPeriodParams) => download('/seller/reports/gst/download', qs(p), 'gst_report.zip');

// ── Admin ───────────────────────────────────────────────────

export const getPlatformReport = async (p: ReportPeriodParams): Promise<PlatformReport> =>
  (await api.get('/admin/reports/platform', { params: qs(p) })).data.data;
export const downloadPlatformReport = (p: ReportPeriodParams) => download('/admin/reports/platform/download', qs(p), 'exnshop_platform_report.xlsx');
export const downloadGstReportAdmin = (p: ReportPeriodParams, sellerId?: string) =>
  download('/admin/reports/gst/download', { ...qs(p), ...(sellerId ? { sellerId } : {}) }, 'gst_report.zip');
export const searchReportSellers = async (search: string, status?: string): Promise<ReportSeller[]> =>
  (await api.get('/admin/reports/sellers', { params: { search, ...(status ? { status } : {}) } })).data.data;
export const getSellerIncomeAdmin = async (sellerId: string, p: ReportPeriodParams): Promise<IncomeReport> =>
  (await api.get(`/admin/reports/sellers/${sellerId}/income`, { params: qs(p) })).data.data;
export const downloadSellerIncomeAdmin = (sellerId: string, p: ReportPeriodParams) =>
  download(`/admin/reports/sellers/${sellerId}/income/download`, qs(p), 'income_report.xlsx');
export const sendSellerReport = async (
  sellerId: string,
  p: ReportPeriodParams,
  opts: { income: boolean; gst: boolean; note?: string }
): Promise<{ success: boolean; message: string }> =>
  (await api.post(`/admin/reports/sellers/${sellerId}/send`, { ...qs(p), ...opts })).data;
