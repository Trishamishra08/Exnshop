import jsPDF from 'jspdf';
import { code128, datamatrix } from 'bwip-js';
import type { ShippingLabel } from '../services/api/shippingLabelService';
import { appendTaxInvoices } from './taxInvoicePdf';

// A4 courier label (customer + return address, payment, courier codes, product
// details) followed by the seller's tax invoice on its own page(s). Both the
// barcode (Code 128) and the Data Matrix encode the shipment's AWB number.

const PAGE_W = 595;
const M = 14; // page margin
const rs = (n: number) => `Rs.${(n || 0).toFixed(2)}`;

const barcodeImage = (awb: string) => {
  const canvas = document.createElement('canvas');
  code128(canvas, { bcid: 'code128', text: awb, scale: 3, height: 14, includetext: false, backgroundcolor: 'FFFFFF' });
  return canvas.toDataURL('image/png');
};

const dataMatrixImage = (awb: string) => {
  const canvas = document.createElement('canvas');
  datamatrix(canvas, { bcid: 'datamatrix', text: awb, scale: 6, backgroundcolor: 'FFFFFF', paddingwidth: 2, paddingheight: 2 });
  return canvas.toDataURL('image/png');
};

function drawLabel(doc: jsPDF, label: ShippingLabel) {
  const text = (value: string, x: number, y: number, size: number, bold = false, opts?: any) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(value, x, y, opts);
  };
  const wrap = (value: string, x: number, y: number, width: number, size: number, lineH: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines: string[] = doc.splitTextToSize(value || '', width);
    lines.forEach((l, i) => doc.text(l, x, y + i * lineH));
    return y + lines.length * lineH;
  };

  doc.setDrawColor(0);
  doc.setLineWidth(0.8);

  // ── Shipping label ──
  const labelTop = M;
  const LEFT_W = 238;

  // Left: customer, then return address
  const customer = label.invoice.shipping;
  text('Customer Address', 19, 30, 10, true);
  text(customer.name, 19, 47, 12, true);
  let y = wrap(customer.address, 19, 64, LEFT_W - 10, 11, 16);
  y = wrap(`${[customer.city, customer.state].filter(Boolean).join(', ')}${customer.pincode ? `, ${customer.pincode}` : ''}`, 19, y, LEFT_W - 10, 11, 16);
  if (customer.phone) y = wrap(`Ph: ${customer.phone}`, 19, y, LEFT_W - 10, 10, 14);

  y += 10;
  text('If undelivered, return to:', 19, y, 10, true);
  y += 16;
  y = wrap(label.returnTo.name, 19, y, LEFT_W - 10, 11, 16);
  y = wrap(label.returnTo.address, 19, y, LEFT_W - 10, 11, 16);
  y = wrap(`${[label.returnTo.city, label.returnTo.state].filter(Boolean).join(', ')}${label.returnTo.pincode ? `, ${label.returnTo.pincode}` : ''}`, 19, y, LEFT_W - 10, 11, 16);
  const leftBottom = y;

  // Right: payment banner, courier, codes
  const RX = 259;
  const RW = PAGE_W - M - RX;
  doc.rect(RX, labelTop, RW, 25);
  text(
    label.paymentMethod === 'COD' ? `COD: Collect ${rs(label.codAmount)}` : 'Prepaid: Do not collect cash',
    RX + RW / 2,
    labelTop + 17,
    14,
    true,
    { align: 'center' }
  );

  text(label.courierName || 'Courier', 265, 67, 16, true);
  doc.rect(265, 81, 38, 15);
  text('Pickup', 269, 92, 10);

  text('Destination Code', 265, 114, 10, true);
  let ry = wrap(label.routingCode || '-', 265, 129, 140, 10, 15);
  text('Return Code', 265, Math.max(ry + 6, 178), 10, true);
  ry = wrap(label.rtoRoutingCode || '-', 265, Math.max(ry + 21, 193), 140, 10, 15);

  // Data Matrix (AWB) at the top right
  doc.addImage(dataMatrixImage(label.awbCode), 'PNG', 450, 60, 110, 110, undefined, 'FAST');

  // AWB number + Code 128 barcode
  const barTop = Math.max(ry + 14, 215);
  text(label.awbCode, RX + RW / 2, barTop + 10, 16, true, { align: 'center' });
  doc.addImage(barcodeImage(label.awbCode), 'PNG', RX + 10, barTop + 16, RW - 20, 46, undefined, 'FAST');
  const rightBottom = barTop + 16 + 46;

  // ── Product details ──
  y = Math.max(leftBottom, rightBottom) + 14;
  doc.line(M, y, PAGE_W - M, y);
  y += 18;
  text('Product Details', 20, y, 11, true);
  y += 18;
  const cols = [19, 203, 298, 345, 439];
  ['SKU', 'Size', 'Qty', 'Color', 'Order No.'].forEach((h, i) => text(h, cols[i], y, 11, true));
  y += 16;
  for (const item of label.invoice.items) {
    const skuLines: string[] = (doc.setFont('helvetica', 'normal'), doc.setFontSize(11), doc.splitTextToSize(item.sku || '-', 175));
    skuLines.forEach((l, i) => text(l, cols[0], y + i * 13, 11));
    text(item.size || 'NA', cols[1], y, 11);
    text(String(item.qty), cols[2], y, 11);
    text(item.color || 'NA', cols[3], y, 11);
    text(label.shipmentRef, cols[4], y, 11);
    y += Math.max(1, skuLines.length) * 13 + 3;
  }
}

/** Downloads each shipment's label page followed by its tax invoice. */
export async function downloadShippingLabels(labels: ShippingLabel[], fileName: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  for (const [i, label] of labels.entries()) {
    if (i > 0) doc.addPage();
    drawLabel(doc, label);
    await appendTaxInvoices(doc, [label.invoice], true);
  }
  doc.save(fileName);
}
