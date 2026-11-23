import jsPDF from 'jspdf';
import { code128 } from 'bwip-js';
import type { DeliverySlip } from '../services/api/shippingLabelService';
import { appendTaxInvoices, normalizeInvoice, str } from './taxInvoicePdf';
import { savePdf } from './shippingLabelPdf';

// Simple A4 delivery slip, no AWB needed: payment to collect, buyer (deliver to) and seller
// (from) with phones, the order number as a barcode, the items, and a signature line for
// the person receiving it. The seller's tax invoice follows on its own page(s).

const PAGE_W = 595;
const M = 24;
const W = PAGE_W - 2 * M;
const rs = (n: number) => `Rs.${(Number(n) || 0).toFixed(2)}`;

const orderBarcode = (value: string): string | null => {
  if (!value) return null;
  try {
    const canvas = document.createElement('canvas');
    code128(canvas, { bcid: 'code128', text: value, scale: 3, height: 12, includetext: false, backgroundcolor: 'FFFFFF' });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
};

const party = (p: any) => ({
  name: str(p?.name),
  phone: str(p?.phone),
  address: str(p?.address),
  city: str(p?.city),
  state: str(p?.state),
  pincode: str(p?.pincode),
});

const normalizeSlip = (s: any): DeliverySlip => ({
  ...s,
  orderNumber: str(s?.orderNumber),
  orderDate: str(s?.orderDate),
  channel: s?.channel === 'Quick' ? 'Quick' : 'ECommerce',
  paymentMethod: s?.paymentMethod === 'COD' ? 'COD' : 'Prepaid',
  codAmount: Number(s?.codAmount) || 0,
  deliverTo: party(s?.deliverTo),
  from: party(s?.from),
  courierName: str(s?.courierName),
  trackingNumber: str(s?.trackingNumber),
  items: (Array.isArray(s?.items) ? s.items : []).map((i: any) => ({ name: str(i?.name || 'Product'), qty: Number(i?.qty) || 0 })),
  invoice: normalizeInvoice(s?.invoice),
});

function drawSlip(doc: jsPDF, slip: DeliverySlip) {
  const text = (value: string, x: number, y: number, size: number, bold = false, opts?: any) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(str(value), x, y, opts);
  };
  const wrap = (value: string, x: number, y: number, width: number, size: number, lineH: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines: string[] = doc.splitTextToSize(str(value), width);
    lines.forEach((l, i) => doc.text(l, x, y + i * lineH));
    return y + lines.length * lineH;
  };
  const cityLine = (p: DeliverySlip['from']) =>
    `${[p.city, p.state].filter(Boolean).join(', ')}${p.pincode ? ` - ${p.pincode}` : ''}`;
  const orderDate = slip.orderDate ? new Date(slip.orderDate) : null;
  const dateText = orderDate && !isNaN(orderDate.getTime())
    ? orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  doc.setDrawColor(0);
  doc.setLineWidth(0.8);

  // Title + order
  let y = M + 14;
  text('DELIVERY SLIP', M, y, 18, true);
  text(`Order #${slip.orderNumber}`, PAGE_W - M, y - 2, 12, true, { align: 'right' });
  if (dateText) text(`Ordered on ${dateText}`, PAGE_W - M, y + 12, 9, false, { align: 'right' });
  y += 22;

  // Payment banner
  doc.rect(M, y, W, 30);
  text(
    slip.paymentMethod === 'COD' ? `CASH ON DELIVERY - COLLECT ${rs(slip.codAmount)}` : 'PREPAID - DO NOT COLLECT CASH',
    PAGE_W / 2,
    y + 20,
    15,
    true,
    { align: 'center' },
  );
  y += 44;

  // Deliver to (buyer) | From (seller)
  const colW = (W - 12) / 2;
  const boxTop = y;
  const drawParty = (title: string, p: DeliverySlip['from'], x: number, big: boolean) => {
    let yy = boxTop + 16;
    text(title, x + 8, yy, 9, true);
    yy += 16;
    yy = wrap(p.name || '-', x + 8, yy, colW - 16, big ? 14 : 12, big ? 17 : 15, true);
    if (p.phone) yy = wrap(`Ph: ${p.phone}`, x + 8, yy + 2, colW - 16, big ? 12 : 10, 15, true);
    yy = wrap(p.address, x + 8, yy + 2, colW - 16, 10.5, 14);
    yy = wrap(cityLine(p), x + 8, yy, colW - 16, 10.5, 14);
    return yy;
  };
  const leftBottom = drawParty('DELIVER TO (BUYER)', slip.deliverTo, M, true);
  const rightBottom = drawParty('FROM (SELLER)', slip.from, M + colW + 12, false);
  const boxH = Math.max(leftBottom, rightBottom) - boxTop + 8;
  doc.rect(M, boxTop, colW, boxH);
  doc.rect(M + colW + 12, boxTop, colW, boxH);
  y = boxTop + boxH + 18;

  // Order number barcode + how it's going
  const barcode = orderBarcode(slip.orderNumber);
  if (barcode) {
    try {
      doc.addImage(barcode, 'PNG', M, y, 220, 40, undefined, 'FAST');
    } catch {
      /* the order number is printed below anyway */
    }
  }
  text(slip.orderNumber, M + 110, y + 54, 11, true, { align: 'center' });
  const via = slip.trackingNumber
    ? `${slip.courierName || 'Courier'} - Tracking ${slip.trackingNumber}`
    : slip.courierName
      ? slip.courierName
      : "Seller's own delivery";
  text('Delivery by', M + 250, y + 12, 9, true);
  wrap(via, M + 250, y + 28, W - 250, 12, 15, true);
  y += 74;

  // Items
  doc.line(M, y, PAGE_W - M, y);
  y += 16;
  text('Items in this parcel', M, y, 11, true);
  text('Qty', PAGE_W - M, y, 11, true, { align: 'right' });
  y += 14;
  let totalQty = 0;
  for (const item of slip.items) {
    const rowY = y;
    y = Math.max(wrap(item.name, M, y, W - 60, 10.5, 14), y + 14);
    text(String(item.qty), PAGE_W - M, rowY, 10.5, false, { align: 'right' });
    totalQty += item.qty;
    if (y > 760) break;
  }
  doc.line(M, y - 4, PAGE_W - M, y - 4);
  text(`Total items: ${totalQty}`, PAGE_W - M, y + 10, 10.5, true, { align: 'right' });
  y += 40;

  // Received by
  text('Received by (name & signature): ______________________________', M, y, 10.5);
  text('Date: ______________', PAGE_W - M, y, 10.5, false, { align: 'right' });
  y += 18;
  text('The tax invoice for this order is on the next page.', M, y, 8.5);
}

/** Downloads each seller's delivery slip followed by their tax invoice. */
export async function downloadDeliverySlips(slips: DeliverySlip[], fileName: string) {
  const ready = (slips || []).map(normalizeSlip);
  if (ready.length === 0) throw new Error('No delivery slip for this order');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  for (const [i, slip] of ready.entries()) {
    if (i > 0) doc.addPage();
    drawSlip(doc, slip);
    await appendTaxInvoices(doc, [slip.invoice], true);
  }
  savePdf(doc, fileName);
}
