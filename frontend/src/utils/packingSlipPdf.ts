import jsPDF from 'jspdf';
import type { PackingSlip } from '../services/api/shippingMethodService';

// One A4 page per order: what to pick and pack, who it goes to, and ship-by.
// This is not a tax invoice. jsPDF's built-in fonts have no ₹ glyph, so text stays plain.

const PAGE_W = 595;
const M = 36;
const W = PAGE_W - 2 * M;

const dmy = (v?: string) => {
  if (!v) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

function drawSlip(doc: jsPDF, s: PackingSlip) {
  let y = M;
  doc.setFont('helvetica', 'bold').setFontSize(20).text('Packing Slip', M, y + 14);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110);
  doc.text('Not a tax invoice', PAGE_W - M, y + 14, { align: 'right' });
  doc.setTextColor(0);
  y += 34;
  doc.setDrawColor(200).line(M, y, PAGE_W - M, y);
  y += 18;

  const field = (label: string, value: string, x: number, yy: number, width: number) => {
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120).text(label.toUpperCase(), x, yy);
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0);
    const lines = doc.splitTextToSize(value || '-', width) as string[];
    doc.text(lines, x, yy + 13);
    return yy + 13 + lines.length * 12;
  };

  const colW = W / 2 - 10;
  let y1 = field('Order number', s.orderNumber, M, y, colW);
  let y2 = field('Order date', dmy(s.orderDate), M + W / 2, y, colW);
  y = Math.max(y1, y2) + 10;
  y1 = field('Ship by', dmy(s.shipByDate) || '-', M, y, colW);
  y2 = field('Deliver by', dmy(s.deliverByDate) || '-', M + W / 2, y, colW);
  y = Math.max(y1, y2) + 10;
  y1 = field('Courier', s.courier || '-', M, y, colW);
  y2 = field('Tracking number', s.trackingNumber || '-', M + W / 2, y, colW);
  y = Math.max(y1, y2) + 10;
  y1 = field('Payment', s.paymentMethod || '-', M, y, colW);
  y = y1 + 6;

  doc.setDrawColor(220).line(M, y, PAGE_W - M, y);
  y += 16;

  y1 = field('Ship to', [s.customer.name, s.customer.phone, s.customer.address].filter(Boolean).join('\n'), M, y, colW);
  y2 = field('Sold by', [s.seller.name, s.seller.phone, s.seller.address].filter(Boolean).join('\n'), M + W / 2, y, colW);
  y = Math.max(y1, y2) + 14;

  // Items
  doc.setFillColor(240, 240, 240).rect(M, y, W, 20, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(60);
  doc.text('#', M + 6, y + 13);
  doc.text('Item', M + 30, y + 13);
  doc.text('SKU', M + W - 150, y + 13);
  doc.text('Qty', PAGE_W - M - 6, y + 13, { align: 'right' });
  y += 20;
  doc.setTextColor(0);

  let units = 0;
  s.items.forEach((it, i) => {
    units += it.quantity;
    const name = it.variation ? `${it.name} (${it.variation})` : it.name;
    const lines = doc.splitTextToSize(name, W - 200) as string[];
    const rowH = Math.max(22, lines.length * 12 + 10);
    doc.setFont('helvetica', 'normal').setFontSize(10);
    doc.text(String(i + 1), M + 6, y + 15);
    doc.text(lines, M + 30, y + 15);
    doc.setFontSize(9).text(it.sku || '-', M + W - 150, y + 15);
    doc.setFont('helvetica', 'bold').setFontSize(11).text(String(it.quantity), PAGE_W - M - 6, y + 15, { align: 'right' });
    y += rowH;
    doc.setDrawColor(230).line(M, y, PAGE_W - M, y);
  });

  y += 16;
  doc.setFont('helvetica', 'bold').setFontSize(10).text(`${s.items.length} item(s), ${units} unit(s) to pack`, M, y);
  y += 40;
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120);
  doc.text('Check every item against this slip before sealing the parcel.', M, y);
}

export async function downloadPackingSlips(slips: PackingSlip[], filename: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  slips.forEach((s, i) => {
    if (i > 0) doc.addPage();
    drawSlip(doc, s);
  });
  doc.save(filename);
}
