import api from './config';

export interface TaxInvoiceParty {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
}

/** One seller's GST tax invoice for an order (built by the backend, Amazon layout). */
export interface TaxInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  orderNumber: string;
  orderDate: string;
  channel: 'Quick' | 'ECommerce';
  seller: {
    id: string;
    name: string;
    storeName: string;
    address: string;
    city: string;
    state: string;
    stateCode: string;
    pincode: string;
    pan: string;
    gstin: string;
  };
  billing: TaxInvoiceParty;
  shipping: TaxInvoiceParty;
  placeOfSupply: string;
  placeOfDelivery: string;
  taxType: 'IGST' | 'CGST_SGST';
  items: Array<{
    name: string;
    sku: string;
    size: string;
    color: string;
    hsn: string;
    qty: number;
    unitPrice: number;
    gross: number;
    discount: number;
    netAmount: number;
    gstRate: number;
    gstAmount: number;
    total: number;
  }>;
  charges: Array<{ label: string; amount: number }>;
  totals: { netAmount: number; tax: number; total: number };
  paymentMethod: string;
  sequence: number;
  count: number;
}

type Res<T> = { success: boolean; message?: string; data: T };

/** Customer: invoices for their own order (available once delivered). */
export const getCustomerOrderInvoice = async (orderId: string) =>
  (await api.get<Res<TaxInvoice[]>>(`/customer/orders/${orderId}/invoice`)).data;

/** Seller: the invoice for their own items of an order. */
export const getSellerTaxInvoice = async (orderId: string) =>
  (await api.get<Res<TaxInvoice[]>>(`/orders/${orderId}/tax-invoice`)).data;

/** Admin: every seller's invoice for an order. */
export const getAdminTaxInvoices = async (orderId: string) =>
  (await api.get<Res<TaxInvoice[]>>(`/admin/orders/${orderId}/tax-invoice`)).data;
