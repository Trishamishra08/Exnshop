import jsPDF from 'jspdf';
import { code128, datamatrix } from 'bwip-js';
import type { ShippingLabel } from '../services/api/shippingLabelService';
import { appendTaxInvoices, normalizeInvoice, str } from './taxInvoicePdf';

// A4 courier label (customer + return address, payment, courier codes, product
// details) followed by the seller's tax invoice on its own page(s). Both the
// barcode (Code 128) and the Data Matrix encode the shipment's AWB number.

const PAGE_W = 595;
const M = 14; // page margin
const rs = (n: number) => `Rs.${(n || 0).toFixed(2)}`;

// Barcode images; null when the AWB can't be encoded, so the label still prints (with the AWB as text).
const barcodeImage = (awb: string): string | null => {
  try {
    const canvas = document.createElement('canvas');
    code128(canvas, { bcid: 'code128', text: awb, scale: 3, height: 14, includetext: false, backgroundcolor: 'FFFFFF' });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('Code 128 barcode failed', err);
    return null;
  }
};

const dataMatrixImage = (awb: string): string | null => {
  try {
    const canvas = document.createElement('canvas');
    datamatrix(canvas, { bcid: 'datamatrix', text: awb, scale: 6, backgroundcolor: 'FFFFFF', paddingwidth: 2, paddingheight: 2 });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('Data Matrix failed', err);
    return null;
  }
};

const addImageSafe = (doc: jsPDF, img: string | null, x: number, y: number, w: number, h: number) => {
  if (!img) return false;
  try {
    doc.addImage(img, 'PNG', x, y, w, h, undefined, 'FAST');
    return true;
  } catch {
    return false;
  }
};

/** Every field the label reads, as a safe value (missing text → "", AWB always a string). */
const normalizeLabel = (l: any): ShippingLabel => {
  const invoice = normalizeInvoice(l?.invoice);
  return {
    ...l,
    awbCode: str(l?.awbCode).trim(),
    courierName: str(l?.courierName),
    routingCode: str(l?.routingCode),
    rtoRoutingCode: str(l?.rtoRoutingCode),
    paymentMethod: l?.paymentMethod === 'COD' ? 'COD' : 'Prepaid',
    codAmount: Number(l?.codAmount) || 0,
    shipmentRef: str(l?.shipmentRef || invoice.orderNumber),
    returnTo: {
      name: str(l?.returnTo?.name || invoice.seller.name),
      address: str(l?.returnTo?.address || invoice.seller.address),
      city: str(l?.returnTo?.city || invoice.seller.city),
      state: str(l?.returnTo?.state || invoice.seller.state),
      pincode: str(l?.returnTo?.pincode || invoice.seller.pincode),
    },
    invoice,
  };
};

function drawLabel(doc: jsPDF, label: ShippingLabel) {
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
  addImageSafe(doc, dataMatrixImage(label.awbCode), 450, 60, 110, 110);

  // AWB number + Code 128 barcode
  const barTop = Math.max(ry + 14, 215);
  text(label.awbCode, RX + RW / 2, barTop + 10, 16, true, { align: 'center' });
  if (!addImageSafe(doc, barcodeImage(label.awbCode), RX + 10, barTop + 16, RW - 20, 46)) {
    text('(barcode unavailable: use the AWB number above)', RX + RW / 2, barTop + 40, 9, false, { align: 'center' });
  }
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
    const skuLines: string[] = (doc.setFont('helvetica', 'normal'), doc.setFontSize(11), doc.splitTextToSize(str(item.sku || item.name) || '-', 175));
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
  const ready = (labels || []).map(normalizeLabel).filter((l) => l.awbCode);
  if (ready.length === 0) throw new Error('No courier AWB / tracking number on this order yet');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  for (const [i, label] of ready.entries()) {
    if (i > 0) doc.addPage();
    drawLabel(doc, label);
    await appendTaxInvoices(doc, [label.invoice], true);
  }
  savePdf(doc, fileName);
}

/**
 * Saves the PDF. jsPDF's save() can be silently ignored by some mobile browsers, so if it
 * throws we fall back to opening the PDF in a new tab, where it can be printed or saved.
 */
export function savePdf(doc: jsPDF, fileName: string) {
  const safeName = str(fileName).replace(/[\\/:*?"<>|]+/g, '_') || 'document.pdf';
  try {
    doc.save(safeName);
  } catch (err) {
    console.error('PDF save failed, opening it instead', err);
    const url = URL.createObjectURL(doc.output('blob'));
    const win = window.open(url, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
