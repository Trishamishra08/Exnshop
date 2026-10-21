import api from './config';

/** One courier shipment's label + tax invoice (built by the backend from the order). */
export interface ShippingLabel {
  awbCode: string;
  courierName: string;
  routingCode: string;
  rtoRoutingCode: string;
  paymentMethod: 'COD' | 'Prepaid';
  codAmount: number;
  orderNumber: string;
  shipmentRef: string;
  invoiceNumber: string;
  orderDate: string;
  invoiceDate: string;
  customer: { name: string; phone: string; address: string; city: string; state: string; pincode: string };
  seller: { name: string; contactName: string; address: string; city: string; state: string; pincode: string; gstin: string };
  placeOfSupply: string;
  taxType: 'IGST' | 'CGST_SGST';
  items: Array<{
    sku: string;
    name: string;
    size: string;
    color: string;
    hsn: string;
    qty: number;
    gross: number;
    discount: number;
    taxable: number;
    gstRate: number;
    gstAmount: number;
    total: number;
  }>;
  otherCharges: number;
  totals: { taxable: number; tax: number; total: number };
}

type Res<T> = { success: boolean; message?: string; data: T };

/** Seller: the label for their own shipment of an E-commerce order. */
export const getSellerShippingLabel = async (orderId: string) =>
  (await api.get<Res<ShippingLabel[]>>(`/orders/${orderId}/shipping-label`)).data;

/** Seller: retry getting the courier AWB for a packed order. */
export const generateSellerAwb = async (orderId: string) =>
  (await api.post<Res<{ awbCode?: string }>>(`/orders/${orderId}/shipping-label/awb`)).data;

/** Admin: labels for every seller shipment of an E-commerce order. */
export const getAdminShippingLabels = async (orderId: string) =>
  (await api.get<Res<ShippingLabel[]>>(`/admin/orders/${orderId}/shipping-label`)).data;
