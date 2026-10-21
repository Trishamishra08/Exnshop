import jsPDF from 'jspdf';
import { code128, datamatrix } from 'bwip-js';
import type { ShippingLabel } from '../services/api/shippingLabelService';

// A4 courier label + tax invoice, laid out like the marketplace labels couriers
// expect: shipping label on top, tax invoice below. Both the barcode (Code 128)
// and the Data Matrix encode the shipment's AWB number.

const PAGE_W = 595;
const PAGE_H = 842;
const M = 14; // page margin
const rs = (n: number) => `Rs.${(n || 0).toFixed(2)}`;
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

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
  text('Customer Address', 19, 30, 10, true);
  text(label.customer.name, 19, 47, 12, true);
  let y = wrap(label.customer.address, 19, 64, LEFT_W - 10, 11, 16);
  y = wrap(`${[label.customer.city, label.customer.state].filter(Boolean).join(', ')}${label.customer.pincode ? `, ${label.customer.pincode}` : ''}`, 19, y, LEFT_W - 10, 11, 16);
  if (label.customer.phone) y = wrap(`Ph: ${label.customer.phone}`, 19, y, LEFT_W - 10, 10, 14);

  y += 10;
  text('If undelivered, return to:', 19, y, 10, true);
  y += 16;
  y = wrap(label.seller.name, 19, y, LEFT_W - 10, 11, 16);
  y = wrap(label.seller.address, 19, y, LEFT_W - 10, 11, 16);
  y = wrap(`${[label.seller.city, label.seller.state].filter(Boolean).join(', ')}${label.seller.pincode ? `, ${label.seller.pincode}` : ''}`, 19, y, LEFT_W - 10, 11, 16);
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
  for (const item of label.items) {
    const skuLines: string[] = (doc.setFont('helvetica', 'normal'), doc.setFontSize(11), doc.splitTextToSize(item.sku || '-', 175));
    skuLines.forEach((l, i) => text(l, cols[0], y + i * 13, 11));
    text(item.size || 'NA', cols[1], y, 11);
    text(String(item.qty), cols[2], y, 11);
    text(item.color || 'NA', cols[3], y, 11);
    text(label.shipmentRef, cols[4], y, 11);
    y += Math.max(1, skuLines.length) * 13 + 3;
  }

  // ── Tax invoice ──
  y += 6;
  doc.setFillColor(235, 235, 235);
  doc.rect(M, y, PAGE_W - 2 * M, 21, 'FD');
  text('TAX INVOICE', PAGE_W / 2, y + 14, 10, true, { align: 'center' });
  text('Original For Recipient', PAGE_W - M - 6, y + 14, 8, false, { align: 'right' });
  y += 34;

  const billTop = y;
  text('BILL TO / SHIP TO', 18, y, 8, true);
  let by = wrap(
    `${label.customer.name} - ${label.customer.address}, ${[label.customer.city, label.customer.state].filter(Boolean).join(', ')}${label.customer.pincode ? `, ${label.customer.pincode}` : ''}`,
    18,
    y + 12,
    200,
    8,
    11
  );
  by = wrap(`Place of Supply: ${label.placeOfSupply || '-'}`, 18, by, 200, 8, 11, true);

  text(`Sold by : ${label.seller.contactName || label.seller.name}`, 228, billTop, 8, true);
  let sy = wrap(
    `${label.seller.name}, ${label.seller.address}${label.seller.city ? `, ${label.seller.city}` : ''}${label.seller.state ? `, ${label.seller.state}` : ''}${label.seller.pincode ? `, ${label.seller.pincode}` : ''}`,
    228,
    billTop + 12,
    350,
    8,
    11
  );
  text(`GSTIN - ${label.seller.gstin || 'Not registered'}`, 228, sy + 3, 8, true);
  sy += 17;
  [
    ['Purchase Order No.', label.orderNumber, 228],
    ['Invoice No.', label.invoiceNumber, 359],
    ['Order Date', fmtDate(label.orderDate), 437],
    ['Invoice Date', fmtDate(label.invoiceDate), 506],
  ].forEach(([h, v, x]) => {
    text(String(h), Number(x), sy, 8);
    text(String(v), Number(x), sy + 12, 8, true);
  });
  y = Math.max(by, sy + 12) + 16;

  // Items table
  const tc = [19, 132, 177, 199, 267, 334, 447, 537];
  doc.setFillColor(245, 245, 245);
  doc.rect(16, y, PAGE_W - 32, 18, 'F');
  ['Description', 'HSN', 'Qty', 'Gross Amount', 'Discount', 'Taxable Value', 'Taxes', 'Total'].forEach((h, i) =>
    text(h, tc[i], y + 12, 8, true)
  );
  y += 30;

  const taxLines = (rate: number, amount: number) =>
    label.taxType === 'CGST_SGST'
      ? [`CGST @${(rate / 2).toFixed(1)}%`, rs(amount / 2), `SGST @${(rate / 2).toFixed(1)}%`, rs(amount / 2)]
      : [`IGST @${rate.toFixed(1)}%`, rs(amount)];

  for (const item of label.items) {
    if (y > PAGE_H - 120) {
      doc.addPage();
      y = M + 20;
    }
    const descEnd = wrap(item.name, tc[0], y, 105, 8, 12);
    text(item.hsn || '-', tc[1], y, 8);
    text(String(item.qty), tc[2], y, 8);
    text(rs(item.gross), tc[3], y, 8);
    text(rs(item.discount), tc[4], y, 8);
    text(rs(item.taxable), tc[5], y, 8);
    const tl = taxLines(item.gstRate, item.gstAmount);
    tl.forEach((l, i) => text(l, tc[6], y + i * 12, 8));
    text(rs(item.total), tc[7], y, 8);
    y = Math.max(descEnd, y + tl.length * 12) + 6;
  }

  // Other charges (platform fee, delivery, packaging) — no GST is charged on them here.
  text('Other Charges', tc[0], y, 8);
  text('NA', tc[2], y, 8);
  text(rs(label.otherCharges), tc[3], y, 8);
  text(rs(0), tc[4], y, 8);
  text(rs(label.otherCharges), tc[5], y, 8);
  text(rs(0), tc[6], y, 8);
  text(rs(label.otherCharges), tc[7], y, 8);
  y += 14;

  doc.setLineWidth(0.5);
  doc.line(16, y, PAGE_W - 16, y);
  y += 14;
  text('Total', tc[0], y, 9, true);
  text(rs(label.totals.tax), tc[6], y, 9, true);
  text(rs(label.totals.total), tc[7], y, 9, true);
  y += 8;
  doc.line(16, y, PAGE_W - 16, y);
  y += 14;

  doc.setTextColor(90);
  wrap(
    'Tax is not payable on reverse charge basis. This is a computer generated invoice and does not require signature. Other charges are charges that are applicable to your order and include charges for logistics fee (where applicable). Includes discounts for your city and/or for online payments (as applicable).',
    18,
    y,
    PAGE_W - 36,
    7,
    10
  );
  doc.setTextColor(0);
}

/** Downloads one A4 page per shipment label. */
export function downloadShippingLabels(labels: ShippingLabel[], fileName: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  labels.forEach((label, i) => {
    if (i > 0) doc.addPage();
    drawLabel(doc, label);
  });
  doc.save(fileName);
}
