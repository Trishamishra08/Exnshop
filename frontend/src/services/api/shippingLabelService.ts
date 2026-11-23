import api from './config';
import type { TaxInvoice } from './taxInvoiceService';

/** One courier shipment's label, with that seller's tax invoice (built by the backend from the order). */
export interface ShippingLabel {
  awbCode: string;
  courierName: string;
  routingCode: string;
  rtoRoutingCode: string;
  paymentMethod: 'COD' | 'Prepaid';
  codAmount: number;
  shipmentRef: string;
  returnTo: { name: string; address: string; city: string; state: string; pincode: string };
  invoice: TaxInvoice;
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

/**
 * Simple delivery slip (no AWB needed): buyer and seller details, items and payment,
 * with the seller's tax invoice. For the seller's own delivery boy, or before a
 * courier / tracking number exists.
 */
export interface DeliverySlip {
  orderNumber: string;
  orderDate: string;
  channel: 'Quick' | 'ECommerce';
  paymentMethod: 'COD' | 'Prepaid';
  codAmount: number;
  deliverTo: { name: string; phone: string; address: string; city: string; state: string; pincode: string };
  from: { name: string; phone: string; address: string; city: string; state: string; pincode: string };
  courierName: string;
  trackingNumber: string;
  items: { name: string; qty: number }[];
  invoice: TaxInvoice;
}

/** Seller: the delivery slip for their part of an order (Quick or E-commerce). */
export const getSellerDeliverySlip = async (orderId: string) =>
  (await api.get<Res<DeliverySlip[]>>(`/orders/${orderId}/delivery-slip`)).data;

/** Admin: delivery slips for every seller of an order. */
export const getAdminDeliverySlips = async (orderId: string) =>
  (await api.get<Res<DeliverySlip[]>>(`/admin/orders/${orderId}/delivery-slip`)).data;
