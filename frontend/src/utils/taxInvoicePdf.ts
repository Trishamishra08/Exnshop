import jsPDF from 'jspdf';
import type { TaxInvoice, TaxInvoiceParty } from '../services/api/taxInvoiceService';

// Amazon-style documents (A4, points):
//  - Tax Invoice/Bill of Supply/Cash Memo: one per seller, like Amazon's 1519 invoice.
//  - Printable Order Summary: the whole order, "not a GST invoice", like Amazon's order details print.
// jsPDF's built-in fonts have no ₹ glyph, so amounts print as "Rs.".

const PAGE_W = 595;
const PAGE_H = 842;
const M = 20;
const CONTENT_W = PAGE_W - 2 * M;
const FOOTER_Y = PAGE_H - 28;

const money = (n: number) =>
  `Rs.${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string) => {
  const d = new Date(iso || '');
  return isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};
const longDate = (iso?: string) => {
  const d = new Date(iso || '');
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

// ── Amount in words (Indian numbering: thousand, lakh, crore) ──
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const belowHundred = (n: number) =>
  n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10].toLowerCase()}` : ''}`;
const belowThousand = (n: number) =>
  [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', n % 100 ? belowHundred(n % 100) : ''].filter(Boolean).join(' ');
const integerWords = (n: number): string => {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  if (crore) parts.push(`${integerWords(crore)} Crore`);
  const lakh = Math.floor((n % 10000000) / 100000);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  const thousand = Math.floor((n % 100000) / 1000);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  const rest = n % 1000;
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
};
export const amountInWords = (amount: number) => {
  const rupees = Math.floor(Math.round(amount * 100) / 100);
  const paise = Math.round((amount - rupees) * 100);
  return `${integerWords(rupees)}${paise ? ` and ${belowHundred(paise)} Paise` : ''} only`;
};

// The logo is fetched once and embedded; without it the header falls back to the store name in text.
let logoPromise: Promise<string | null> | null = null;
const loadLogo = () => {
  logoPromise ??= fetch('/exnshop_logo.png')
    .then((r) => (r.ok ? r.blob() : Promise.reject()))
    .then(
      (blob) =>
        new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        })
    )
    .catch(() => null);
  return logoPromise;
};

class Writer {
  constructor(public doc: jsPDF) {}

  font(size: number, bold = false) {
    this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
  }

  text(value: string, x: number, y: number, size: number, bold = false, align: 'left' | 'right' | 'center' = 'left') {
    this.font(size, bold);
    this.doc.text(value, x, y, { align });
  }

  /** Wrapped text; returns the y just below the last line. */
  wrap(value: string, x: number, y: number, width: number, size: number, bold = false, align: 'left' | 'right' = 'left') {
    this.font(size, bold);
    const lineH = size * 1.25;
    const lines: string[] = this.doc.splitTextToSize(value || '', width);
    lines.forEach((l, i) => this.doc.text(l, x, y + i * lineH, { align }));
    return y + lines.length * lineH;
  }

  lines(value: string, width: number, size: number, bold = false): string[] {
    this.font(size, bold);
    return this.doc.splitTextToSize(value || '', width);
  }
}

// ── Tax invoice ──

const header = (w: Writer, logo: string | null) => {
  if (logo) w.doc.addImage(logo, 'PNG', M, 14, 58, 40, undefined, 'FAST');
  else w.text('Exnshop', M, 40, 20, true);
  w.text('Tax Invoice/Bill of Supply/Cash Memo', PAGE_W - M, 30, 10, true, 'right');
  w.text('(Original for Recipient)', PAGE_W - M, 42, 9, false, 'right');
};

const partyLines = (p: TaxInvoiceParty) => [
  p.name,
  p.address,
  [p.city, p.state].filter(Boolean).join(', ') + (p.pincode ? `, ${p.pincode}` : ''),
  'IN',
].filter((l) => l.trim());

// Column layout of the item table (widths add up to CONTENT_W).
const COLS = [
  { key: 'sl', title: 'Sl.\nNo', w: 22, align: 'center' },
  { key: 'desc', title: 'Description', w: 183, align: 'left' },
  { key: 'unit', title: 'Unit\nPrice', w: 52, align: 'right' },
  { key: 'disc', title: 'Discount', w: 45, align: 'right' },
  { key: 'qty', title: 'Qty', w: 24, align: 'center' },
  { key: 'net', title: 'Net\nAmount', w: 52, align: 'right' },
  { key: 'rate', title: 'Tax\nRate', w: 31, align: 'center' },
  { key: 'type', title: 'Tax\nType', w: 37, align: 'center' },
  { key: 'tax', title: 'Tax\nAmount', w: 52, align: 'right' },
  { key: 'total', title: 'Total\nAmount', w: 57, align: 'right' },
] as const;
type ColKey = (typeof COLS)[number]['key'];
const colX: Record<string, number> = {};
COLS.reduce((x, c) => ((colX[c.key] = x), x + c.w), M);
const colW = (key: ColKey) => COLS.find((c) => c.key === key)!.w;

/** Draws one table row; cells hold one or more lines. Returns the row height. */
const drawRow = (w: Writer, y: number, cells: Partial<Record<ColKey, string[]>>, size = 7.5, bold = false, fill?: number) => {
  const lineH = size * 1.3;
  const height = Math.max(...COLS.map((c) => (cells[c.key]?.length || 1))) * lineH + 8;
  if (fill !== undefined) {
    w.doc.setFillColor(fill, fill, fill);
    w.doc.rect(M, y, CONTENT_W, height, 'F');
  }
  w.doc.setDrawColor(0);
  w.doc.setLineWidth(0.5);
  w.doc.rect(M, y, CONTENT_W, height);
  for (const c of COLS) {
    if (c.key !== 'sl') w.doc.line(colX[c.key], y, colX[c.key], y + height);
    const x = c.align === 'right' ? colX[c.key] + c.w - 3 : c.align === 'center' ? colX[c.key] + c.w / 2 : colX[c.key] + 3;
    (cells[c.key] || []).forEach((line, i) => w.text(line, x, y + 10 + i * lineH, size, bold, c.align));
  }
  return height;
};

function drawTaxInvoice(w: Writer, inv: TaxInvoice, logo: string | null) {
  const firstPage = w.doc.getNumberOfPages();
  header(w, logo);

  // Sold By (left) / Billing + Shipping (right), as on Amazon's invoice.
  const RX = PAGE_W - M;
  const HALF = CONTENT_W / 2 - 10;
  let ly = 80;
  w.text('Sold By :', M, ly, 9, true);
  ly += 12;
  ly = w.wrap(inv.seller.name, M, ly, HALF, 8.5);
  ly = w.wrap(
    `${inv.seller.address}${inv.seller.city ? `, ${inv.seller.city}` : ''}${inv.seller.state ? `, ${inv.seller.state}` : ''}${inv.seller.pincode ? `, ${inv.seller.pincode}` : ''}`,
    M, ly, HALF, 8.5
  );
  ly = w.wrap('IN', M, ly, HALF, 8.5);
  ly += 14;
  w.text('PAN No:', M, ly, 8.5, true);
  w.text(inv.seller.pan || 'Not available', M + 38, ly, 8.5);
  ly += 12;
  w.text('GST Registration No:', M, ly, 8.5, true);
  w.text(inv.seller.gstin || 'Not registered', M + 92, ly, 8.5);
  ly += 12;

  let ry = 80;
  const rightBlock = (title: string, party: TaxInvoiceParty) => {
    w.text(title, RX, ry, 9, true, 'right');
    ry += 12;
    for (const line of partyLines(party)) ry = w.wrap(line, RX, ry, HALF, 8.5, false, 'right');
    if (party.stateCode) {
      w.text(`State/UT Code: ${party.stateCode}`, RX, ry, 8.5, true, 'right');
      ry += 11;
    }
    ry += 8;
  };
  rightBlock('Billing Address :', inv.billing);
  rightBlock('Shipping Address :', inv.shipping);
  const keyValueRight = (k: string, v: string) => {
    w.font(8.5, false);
    const vw = w.doc.getTextWidth(v);
    w.text(v, RX, ry, 8.5, false, 'right');
    w.text(k, RX - vw - 3, ry, 8.5, true, 'right');
    ry += 11;
  };
  keyValueRight('Place of supply:', inv.placeOfSupply || '-');
  keyValueRight('Place of delivery:', inv.placeOfDelivery || '-');
  ry += 8;

  // Order details (left) level with invoice details (right).
  let y = Math.max(ly, ry);
  const keyValueLeft = (k: string, v: string, yy: number) => {
    w.text(k, M, yy, 8.5, true);
    w.font(8.5, true);
    w.text(v, M + w.doc.getTextWidth(k) + 3, yy, 8.5);
  };
  keyValueLeft('Order Number:', inv.orderNumber, y);
  keyValueLeft('Order Date:', fmtDate(inv.orderDate), y + 11);
  ry = y;
  keyValueRight('Invoice Number :', inv.invoiceNumber);
  keyValueRight('Invoice Details :', `${inv.channel === 'ECommerce' ? 'EC' : 'QC'}-${inv.orderNumber}`);
  keyValueRight('Invoice Date :', fmtDate(inv.invoiceDate));
  y = ry + 10;

  // Item table
  const headerCells = Object.fromEntries(COLS.map((c) => [c.key, c.title.split('\n')])) as Record<ColKey, string[]>;
  const drawHeader = () => {
    y += drawRow(w, y, headerCells, 7.5, true, 235);
  };
  const ensureSpace = (needed: number) => {
    if (y + needed > FOOTER_Y - 20) {
      w.doc.addPage();
      header(w, logo);
      y = 70;
      drawHeader();
    }
  };
  drawHeader();

  const taxCells = (rate: number, amount: number) =>
    inv.taxType === 'CGST_SGST'
      ? { rate: [`${rate / 2}%`, `${rate / 2}%`], type: ['CGST', 'SGST'], tax: [money(amount / 2), money(amount / 2)] }
      : { rate: [`${rate}%`], type: ['IGST'], tax: [money(amount)] };

  inv.items.forEach((item, i) => {
    const desc = [
      ...w.lines(item.name, colW('desc') - 6, 7.5),
      ...(item.sku ? [`SKU: ${item.sku}`] : []),
      `HSN:${item.hsn || '-'}`,
    ];
    const t = taxCells(item.gstRate, item.gstAmount);
    ensureSpace(desc.length * 10 + 12);
    y += drawRow(w, y, {
      sl: [String(i + 1)],
      desc,
      unit: [money(item.unitPrice)],
      disc: [money(item.discount)],
      qty: [String(item.qty)],
      net: [money(item.netAmount)],
      ...t,
      total: [money(item.total)],
    });
  });

  // Shipping charges, platform fee … (no GST is charged on them).
  for (const charge of inv.charges) {
    ensureSpace(22);
    y += drawRow(w, y, {
      desc: [charge.label],
      unit: [money(charge.amount)],
      disc: [money(0)],
      net: [money(charge.amount)],
      rate: ['0%'],
      type: [inv.taxType === 'CGST_SGST' ? 'CGST' : 'IGST'],
      tax: [money(0)],
      total: [money(charge.amount)],
    });
  }

  ensureSpace(60);
  y += drawRow(w, y, { desc: ['TOTAL:'], tax: [money(inv.totals.tax)], total: [money(inv.totals.total)] }, 8, true, 245);

  // Amount in words
  const words = w.lines(amountInWords(inv.totals.total), CONTENT_W - 10, 8.5, true);
  const wordsH = 14 + words.length * 11 + 4;
  w.doc.rect(M, y, CONTENT_W, wordsH);
  w.text('Amount in Words:', M + 4, y + 11, 8.5, true);
  words.forEach((l, i) => w.text(l, M + 4, y + 23 + i * 11, 8.5, true));
  y += wordsH;

  // Signatory box, then the reverse-charge line.
  const signH = 56;
  if (y + signH + 30 > FOOTER_Y - 10) {
    w.doc.addPage();
    header(w, logo);
    y = 70;
  }
  w.doc.rect(M, y, CONTENT_W, signH);
  w.text(`For ${inv.seller.name}:`, RX - 4, y + 13, 8.5, true, 'right');
  w.text('Authorized Signatory', RX - 4, y + signH - 8, 8.5, true, 'right');
  y += signH + 12;
  w.text('Whether tax is payable under reverse charge - No', M, y, 8);

  // Footer with "Page X of Y" on every page of this invoice.
  const lastPage = w.doc.getNumberOfPages();
  for (let p = firstPage; p <= lastPage; p++) {
    w.doc.setPage(p);
    w.doc.setTextColor(90);
    w.text('This is a computer generated invoice. Please note that this invoice is not a demand for payment.', PAGE_W / 2, FOOTER_Y, 7, false, 'center');
    w.text(`Page ${p - firstPage + 1} of ${lastPage - firstPage + 1}`, PAGE_W - M, FOOTER_Y + 12, 7, false, 'right');
    w.doc.setTextColor(0);
  }
  w.doc.setPage(lastPage);
}

/** Draws each invoice starting on a fresh page of `doc` (the current page is used if it's blank). */
export async function appendTaxInvoices(doc: jsPDF, invoices: TaxInvoice[], startOnNewPage: boolean) {
  const logo = await loadLogo();
  const w = new Writer(doc);
  invoices.forEach((inv, i) => {
    if (startOnNewPage || i > 0) doc.addPage();
    drawTaxInvoice(w, inv, logo);
  });
}

/** Downloads the tax invoice(s) of an order as one PDF. */
export async function downloadTaxInvoices(invoices: TaxInvoice[], fileName: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  await appendTaxInvoices(doc, invoices, false);
  doc.save(fileName);
}

// ── Printable order summary ──

/** The customer order as the order API returns it (only the fields used here). */
export interface OrderSummarySource {
  id?: string;
  orderNumber?: string;
  orderDate?: string;
  createdAt?: string;
  status?: string;
  deliveredAt?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: { address?: string; city?: string; state?: string; pincode?: string; landmark?: string };
  address?: { address?: string; street?: string; city?: string; state?: string; pincode?: string; landmark?: string; name?: string };
  deliveryOption?: string;
  channel?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  items?: any[];
  subtotal?: number;
  shipping?: number;
  platformFee?: number;
  tipAmount?: number;
  tax?: number;
  discount?: number;
  couponCode?: string;
  total?: number;
  totalAmount?: number;
  fees?: { platformFee?: number; deliveryFee?: number };
}

const statusLine = (o: OrderSummarySource) => {
  switch (o.status) {
    case 'Delivered':
    case 'Completed':
      return o.deliveredAt ? `Delivered ${longDate(o.deliveredAt)}` : 'Delivered';
    case 'Cancelled':
    case 'Rejected':
      return 'Cancelled';
    case 'Returned':
    case 'RTO':
      return 'Returned';
    case 'Shipped':
    case 'Picked up':
    case 'On the way':
    case 'Out for Delivery':
      return 'Dispatched';
    default:
      return 'Not Yet Dispatched';
  }
};

export async function downloadOrderSummary(order: OrderSummarySource) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = new Writer(doc);
  const logo = await loadLogo();
  const orderNumber = order.orderNumber || order.id || '';
  const placed = order.orderDate || order.createdAt;
  const grandTotal = order.total ?? order.totalAmount ?? 0;
  const addr = { ...(order.address || {}), ...(order.deliveryAddress || {}) };
  const addressLines = [
    order.customerName || order.address?.name || '',
    addr.address || order.address?.street || '',
    addr.landmark || '',
    `${(addr.city || '').toUpperCase()}${addr.state ? `, ${addr.state.toUpperCase()}` : ''} ${addr.pincode || ''}`.trim(),
    'India',
  ].filter((l) => l.trim());

  if (logo) doc.addImage(logo, 'PNG', M, 14, 50, 34, undefined, 'FAST');
  let y = 72;
  w.text(`Details for Order #${orderNumber}`, PAGE_W / 2, y, 13, true, 'center');
  y += 26;
  w.text(`Order Placed: ${longDate(placed)}`, M, y, 9);
  y += 13;
  w.text(`Exnshop order number: ${orderNumber}`, M, y, 9);
  y += 13;
  w.text(`Order Total: INR ${(grandTotal || 0).toFixed(2)}`, M, y, 9, true);
  y += 14;

  // Status band
  doc.setDrawColor(150);
  doc.setLineWidth(0.6);
  doc.rect(M, y, CONTENT_W, 24);
  w.text(statusLine(order), PAGE_W / 2, y + 16, 10, true, 'center');
  y += 24;

  // Items ordered | Price
  const itemsTop = y;
  y += 16;
  w.text('Items Ordered', M + 8, y, 9, true);
  w.text('Price', PAGE_W - M - 8, y, 9, true, 'right');
  y += 16;
  for (const item of order.items || []) {
    const name = item.product?.productName || item.productName || item.product?.name || 'Product';
    const variant = item.variantTitle && item.variantTitle !== 'Default' ? ` (${item.variantTitle})` : '';
    const qty = item.quantity || 1;
    const price = item.unitPrice ?? item.price ?? (item.total ? item.total / qty : 0);
    w.text(`INR ${(price * qty).toFixed(2)}`, PAGE_W - M - 8, y, 9, false, 'right');
    y = w.wrap(`${qty} of: ${name}${variant}`, M + 8, y, CONTENT_W - 110, 9);
    const sellerName = item.seller?.storeName || item.seller?.sellerName;
    if (sellerName) y = w.wrap(`Sold by: ${sellerName}`, M + 8, y, CONTENT_W - 110, 8.5);
    y += 6;
  }
  y += 4;
  w.text('Delivery Address:', M + 8, y, 9, true);
  y += 12;
  for (const line of addressLines) y = w.wrap(line, M + 8, y, CONTENT_W / 2, 9);
  y += 8;
  w.text('Delivery Option:', M + 8, y, 9, true);
  y += 12;
  y = w.wrap(
    order.channel === 'ECommerce' ? 'Standard Delivery by courier' : `${order.deliveryOption || 'Standard'} Delivery`,
    M + 8, y, CONTENT_W / 2, 9
  );
  y += 8;
  doc.rect(M, itemsTop, CONTENT_W, y - itemsTop);

  // Payment information
  y += 14;
  const payTop = y;
  doc.setFillColor(240, 240, 240);
  doc.rect(M, y, CONTENT_W, 20, 'FD');
  w.text('Payment information', PAGE_W / 2, y + 14, 10, true, 'center');
  y += 34;
  w.text('Payment Method:', M + 8, y, 9, true);
  w.wrap(
    `${order.paymentMethod === 'COD' ? 'Cash on Delivery' : order.paymentMethod || '-'}${order.paymentStatus ? ` (${order.paymentStatus})` : ''}`,
    M + 8, y + 12, CONTENT_W / 2 - 20, 9
  );

  const delivery = order.shipping ?? order.fees?.deliveryFee ?? 0;
  const platform = order.platformFee ?? order.fees?.platformFee ?? 0;
  const rows: Array<[string, string, boolean?]> = [
    ['Item(s) Subtotal:', `INR ${(order.subtotal || 0).toFixed(2)}`],
    ['Shipping:', `INR ${delivery.toFixed(2)}`],
  ];
  if (platform > 0) rows.push(['Platform Fee:', `INR ${platform.toFixed(2)}`]);
  if ((order.tax || 0) > 0) rows.push(['GST:', `INR ${(order.tax || 0).toFixed(2)}`]);
  if ((order.tipAmount || 0) > 0) rows.push(['Delivery Tip:', `INR ${(order.tipAmount || 0).toFixed(2)}`]);
  if ((order.discount || 0) > 0) {
    rows.push(['Total:', `INR ${(grandTotal + (order.discount || 0)).toFixed(2)}`]);
    rows.push([`Promotion Applied${order.couponCode ? ` (${order.couponCode})` : ''}:`, `-INR ${(order.discount || 0).toFixed(2)}`]);
  } else {
    rows.push(['Total:', `INR ${grandTotal.toFixed(2)}`]);
  }
  rows.push(['Grand Total:', `INR ${grandTotal.toFixed(2)}`, true]);
  let py = y;
  for (const [label, value, bold] of rows) {
    if (bold) py += 6;
    w.text(label, PAGE_W - M - 110, py, 9, Boolean(bold), 'right');
    w.text(value, PAGE_W - M - 8, py, 9, Boolean(bold), 'right');
    py += 13;
  }

  let by = y + 40;
  w.text('Billing Address:', M + 8, by, 9, true);
  by += 12;
  for (const line of addressLines) by = w.wrap(line, M + 8, by, CONTENT_W / 2 - 20, 9);
  y = Math.max(py, by) + 8;
  doc.setDrawColor(150);
  doc.rect(M, payTop, CONTENT_W, y - payTop);

  y += 22;
  w.text('To view the status of your order, open My Orders in the Exnshop app.', PAGE_W / 2, y, 8.5, false, 'center');
  y += 13;
  w.text('Please note: this is not a GST invoice.', PAGE_W / 2, y, 8.5, true, 'center');

  doc.save(`Order_Summary_${orderNumber}.pdf`);
}
