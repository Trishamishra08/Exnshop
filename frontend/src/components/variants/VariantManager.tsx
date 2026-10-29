import React, { useMemo, useRef, useState } from 'react';
import { uploadImages } from '../../services/api/uploadService';
import { compressImage, validateImageFile } from '../../utils/imageUpload';

/**
 * Variant manager used by the seller product form and the admin product page.
 *
 *   Attributes (Color, Size, …) with their options
 *     → Generate Variants: one row per combination
 *       → Variant Matrix: SKU, MRP, selling price, stock, weight, photos, on/off per row
 *         → Variant-wise photos (per colour) and a live customer preview
 *
 * Stored on the product as variantAxes (attributes) + variations (combinations).
 */

export interface VMAxis {
  label: string;
  values: string[];
}
export interface VMOption {
  name: string;
  value: string;
}
export interface VMRow {
  title: string;
  options: VMOption[];
  price: string; // MRP
  discPrice: string; // selling price ('' = sells at MRP)
  stock: string; // 0 = unlimited
  sku: string;
  images: string[];
  weightKg: string;
  isActive: boolean;
  _id?: string;
}

export const MAX_ATTRIBUTES = 3;
const MAX_ROW_PHOTOS = 8;

const COLOR_HEX: Record<string, string> = {
  black: '#111111', white: '#ffffff', red: '#e53935', blue: '#1e88e5', green: '#43a047', yellow: '#fbc02d',
  purple: '#8e24aa', orange: '#fb8c00', pink: '#ec407a', grey: '#9e9e9e', gray: '#9e9e9e', brown: '#795548',
  navy: '#1a237e', maroon: '#880e4f', beige: '#d7ccc8', gold: '#c9a227', silver: '#bdbdbd', cream: '#fff3d6',
};
export const isColourAxis = (label: string) => /colou?r/i.test(label);
/** A colour dot for any option that is a colour: a known name, a #hex code, or any CSS colour name the browser understands. */
const swatch = (value: string): string | undefined => {
  const v = value.trim().toLowerCase();
  if (COLOR_HEX[v]) return COLOR_HEX[v];
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return v;
  const css = v.replace(/\s+/g, '');
  return typeof CSS !== 'undefined' && CSS.supports?.('color', css) ? css : undefined;
};

export const emptyRow = (title = 'Default', options: VMOption[] = []): VMRow => ({
  title, options, price: '', discPrice: '', stock: '0', sku: '', images: [], weightKg: '', isActive: true,
});
export const comboTitle = (options: VMOption[]) => options.map((o) => o.value).join(' / ');

/** Every combination of the attributes' options, keeping what was already entered for a combination. */
export const buildRows = (axes: VMAxis[], current: VMRow[]): VMRow[] => {
  if (axes.length === 0) {
    const base = current.find((r) => r.title === 'Default') || current[0];
    return [{ ...(base || emptyRow()), title: 'Default', options: [] }];
  }
  let combos: VMOption[][] = [[]];
  for (const axis of axes) combos = combos.flatMap((c) => axis.values.map((value) => [...c, { name: axis.label, value }]));
  return combos.map((options) => {
    const title = comboTitle(options);
    const existing = current.find((r) => r.title === title);
    return existing ? { ...existing, options } : emptyRow(title, options);
  });
};

const rowFromVariation = (v: any, options: VMOption[]): VMRow => ({
  _id: v._id ? String(v._id) : undefined,
  title: options.length ? comboTitle(options) : v.value || v.title || 'Default',
  options,
  price: v.price !== undefined && v.price !== null ? String(v.price) : '',
  discPrice: Number(v.discPrice) > 0 ? String(v.discPrice) : '',
  stock: String(v.stock ?? 0),
  sku: v.sku || '',
  images: Array.isArray(v.images) ? v.images : [],
  weightKg: Number(v.weightGrams) > 0 ? String(Number(v.weightGrams) / 1000) : '',
  isActive: v.isActive !== false,
});

/** Reads a saved product's attributes and combinations (older products have a single attribute). */
export const variantsFromProduct = (p: any): { axes: VMAxis[]; rows: VMRow[] } => {
  const vs: any[] = p?.variations || [];
  if (vs.length === 0 || (vs.length === 1 && /^default$/i.test(vs[0].value || vs[0].title || 'Default'))) {
    return { axes: [], rows: [vs.length ? { ...rowFromVariation(vs[0], []), title: 'Default' } : emptyRow()] };
  }
  if (Array.isArray(p.variantAxes) && p.variantAxes.length > 0) {
    return {
      axes: p.variantAxes.map((a: any) => ({ label: a.name, values: a.values || [] })),
      rows: vs.map((v) => rowFromVariation(v, v.options || [])),
    };
  }
  const label = p.variationType || 'Option';
  const values = [...new Set(vs.map((v) => String(v.value || v.title || '')).filter(Boolean))];
  return { axes: [{ label, values }], rows: vs.map((v) => rowFromVariation(v, [{ name: label, value: v.value || v.title || '' }])) };
};

/** What to send to the server for these attributes and rows. */
export const variantsPayload = (axes: VMAxis[], rows: VMRow[], combinedAxes: string[]) => {
  const hasAxes = axes.length > 0;
  const combined = axes.map((a) => a.label).filter((n) => combinedAxes.includes(n));
  return {
    variationType: hasAxes ? axes.map((a) => a.label).join(' / ') : undefined,
    variantAxes: axes.map((a) => ({ name: a.label, values: a.values })),
    combinedAxes: combined.length >= 2 ? combined : [],
    variations: rows.map((r) => ({
      ...(r._id ? { _id: r._id } : {}),
      title: hasAxes ? r.title : 'Default',
      ...(hasAxes ? { name: axes.map((a) => a.label).join(' / '), options: r.options } : {}),
      price: Number(r.price),
      discPrice: r.discPrice ? Number(r.discPrice) : 0,
      stock: Number(r.stock || 0),
      ...(r.sku.trim() ? { sku: r.sku.trim() } : {}),
      ...(Number(r.weightKg) > 0 ? { weightGrams: Math.round(Number(r.weightKg) * 1000) } : {}),
      isActive: r.isActive,
      images: hasAxes ? r.images : [],
      status: 'Available',
    })),
  };
};

/** Problems to fix before saving (empty = fine). */
export const variantProblems = (axes: VMAxis[], rows: VMRow[]): string[] => {
  const out: string[] = [];
  const empty = axes.find((a) => a.values.length === 0);
  if (empty) out.push(`pick at least one ${empty.label} option or untick ${empty.label}`);
  if (rows.length === 0) out.push('generate the variants');
  rows.forEach((r) => {
    if (!(Number(r.price) > 0)) out.push(`MRP for ${r.title}`);
    else if (r.discPrice && Number(r.discPrice) > Number(r.price)) out.push(`selling price above MRP for ${r.title}`);
  });
  if (rows.length && !rows.some((r) => r.isActive)) out.push('switch on at least one variant');
  const skus = rows.map((r) => r.sku.trim()).filter(Boolean);
  const dupe = skus.find((s, i) => skus.indexOf(s) !== i);
  if (dupe) out.push(`SKU ${dupe} is used twice`);
  return out;
};

const SKU_CODES: Record<string, string> = {
  black: 'BLK', white: 'WHT', red: 'RED', blue: 'BLU', green: 'GRN', yellow: 'YLW', purple: 'PRP', grey: 'GRY',
  gray: 'GRY', pink: 'PNK', orange: 'ORG', brown: 'BRN', navy: 'NVY', maroon: 'MRN', silver: 'SLV', gold: 'GLD',
};
const abbr = (value: string) => {
  const known = SKU_CODES[value.trim().toLowerCase()];
  if (known) return known;
  const clean = value.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return /^\d/.test(clean) ? clean.slice(0, 4) : clean.slice(0, 3) || 'X';
};

/** Fills blank SKUs as BLK-S-001, BLK-M-002 …, never repeating one already used. */
export const autoSkus = (rows: VMRow[], prefix = ''): VMRow[] => {
  const used = new Set(rows.map((r) => r.sku.trim()).filter(Boolean));
  const head = prefix ? abbr(prefix) + '-' : '';
  return rows.map((r, i) => {
    if (r.sku.trim()) return r;
    const base = head + (r.options.length ? r.options.map((o) => abbr(o.value)).join('-') : 'STD');
    let n = i + 1;
    let sku = `${base}-${String(n).padStart(3, '0')}`;
    while (used.has(sku)) sku = `${base}-${String(++n).padStart(3, '0')}`;
    used.add(sku);
    return { ...r, sku };
  });
};

const discountPct = (r: VMRow) => {
  const mrp = Number(r.price);
  const sell = Number(r.discPrice);
  return mrp > 0 && sell > 0 && sell < mrp ? Math.round(((mrp - sell) / mrp) * 100) : 0;
};

const parseCsv = (text: string): string[][] =>
  text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const cells: string[] = [];
      let cur = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = !quoted;
        else if (ch === ',' && !quoted) { cells.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      cells.push(cur.trim());
      return cells;
    });
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const box = 'bg-white rounded-xl border border-neutral-200';
const smallInput = 'w-full min-w-[64px] px-2 py-1.5 rounded-lg border border-neutral-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500';
const btnOutline = 'px-3 py-1.5 rounded-lg border text-xs font-semibold';

interface Props {
  axes: VMAxis[];
  rows: VMRow[];
  onChange: (axes: VMAxis[], rows: VMRow[]) => void;
  combinedAxes: string[];
  onCombinedChange: (names: string[]) => void;
  /** Attributes the category suggests (with their allowed options). */
  suggestedAttributes?: VMAxis[];
  /** Product photo used in the preview when a variant has none. */
  fallbackImage?: string;
  productName?: string;
  skuPrefix?: string;
  uploadFolder?: string;
  onError?: (message: string) => void;
  /**
   * 'admin' (default): full attribute card — tick attributes, add options, custom attributes, Generate Variants.
   * 'seller': the attributes and options are set by the admin in Listing Setup; the seller only adds variants
   * (choosing from those options) and fills in the matrix.
   */
  mode?: 'admin' | 'seller';
  /** Starting values for a newly added variant when no other variant has any yet. */
  defaults?: { price?: string; discPrice?: string; stock?: string; weightKg?: string };
  /** Read-only summary shown beside the attributes, as on the design. */
  productInfo?: { name?: string; category?: string; subCategory?: string; brand?: string; description?: string };
  /** Shown under the matrix table (e.g. the seller's Additional Details: HSN, GST, weight, size, SKU). */
  footer?: React.ReactNode;
}

export default function VariantManager({
  axes, rows, onChange, combinedAxes, onCombinedChange, suggestedAttributes = [], fallbackImage, productName, skuPrefix = '',
  uploadFolder = 'exnshop/products/options', onError, productInfo, mode = 'admin', defaults, footer,
}: Props) {
  const sellerMode = mode === 'seller';
  const fail = (m: string) => (onError ? onError(m) : window.alert(m));
  const [extraOptions, setExtraOptions] = useState<Record<string, string[]>>({});
  const [customAttrs, setCustomAttrs] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState<Record<string, string>>({});
  const [newAttr, setNewAttr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ open: boolean; price: string; discPrice: string; stock: string; weightKg: string }>({
    open: false, price: '', discPrice: '', stock: '', weightKg: '',
  });
  const [adding, setAdding] = useState<Record<string, string> | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, string>>({});
  const csvRef = useRef<HTMLInputElement>(null);

  // ── Attributes ──
  const attributeList: VMAxis[] = useMemo(() => {
    const byLabel = new Map<string, Set<string>>();
    const add = (label: string, values: string[]) => {
      const key = [...byLabel.keys()].find((k) => k.toLowerCase() === label.toLowerCase()) || label;
      const set = byLabel.get(key) || new Set<string>();
      values.forEach((v) => set.add(v));
      byLabel.set(key, set);
    };
    suggestedAttributes.forEach((a) => add(a.label, a.values));
    customAttrs.forEach((l) => add(l, []));
    axes.forEach((a) => add(a.label, a.values));
    Object.entries(extraOptions).forEach(([l, vs]) => add(l, vs));
    return [...byLabel.entries()].map(([label, set]) => ({ label, values: [...set] }));
  }, [suggestedAttributes, customAttrs, axes, extraOptions]);

  // Seller mode: the attributes are the ones the admin set up (or the ones this product already uses); options are fixed.
  const sellerAttrs: VMAxis[] = useMemo(() => {
    if (!sellerMode) return [];
    const suggested = (label: string) => suggestedAttributes.find((p) => p.label.toLowerCase() === label.toLowerCase())?.values || [];
    if (axes.length > 0) return axes.map((a) => ({ label: a.label, values: [...new Set([...suggested(a.label), ...a.values])] }));
    return suggestedAttributes.slice(0, MAX_ATTRIBUTES).map((a) => ({ label: a.label, values: a.values }));
  }, [sellerMode, suggestedAttributes, axes]);
  const formAxes: VMAxis[] = sellerMode ? sellerAttrs : axes;

  const axisOf = (label: string) => axes.find((a) => a.label.toLowerCase() === label.toLowerCase());
  const setAxes = (next: VMAxis[]) => onChange(next, rows);

  const toggleAttribute = (label: string) => {
    if (axisOf(label)) {
      setAxes(axes.filter((a) => a.label.toLowerCase() !== label.toLowerCase()));
      return;
    }
    if (axes.length >= MAX_ATTRIBUTES) return fail(`A product can vary by at most ${MAX_ATTRIBUTES} attributes.`);
    setAxes([...axes, { label, values: [] }]);
  };
  const toggleOption = (label: string, value: string) => {
    const axis = axisOf(label);
    if (!axis) {
      if (axes.length >= MAX_ATTRIBUTES) return fail(`A product can vary by at most ${MAX_ATTRIBUTES} attributes.`);
      return setAxes([...axes, { label, values: [value] }]);
    }
    setAxes(axes.map((a) => (a === axis ? { ...a, values: a.values.includes(value) ? a.values.filter((v) => v !== value) : [...a.values, value] } : a)));
  };
  const addOption = (label: string) => {
    const value = (optionDraft[label] || '').trim();
    if (!value) return;
    const known = attributeList.find((a) => a.label === label)?.values || [];
    if (known.some((v) => v.toLowerCase() === value.toLowerCase())) {
      setOptionDraft((d) => ({ ...d, [label]: '' }));
      return toggleOption(label, known.find((v) => v.toLowerCase() === value.toLowerCase())!);
    }
    setExtraOptions((e) => ({ ...e, [label]: [...(e[label] || []), value] }));
    setOptionDraft((d) => ({ ...d, [label]: '' }));
    toggleOption(label, value);
  };
  const addCustomAttribute = () => {
    if (newAttr === null) return setNewAttr('');
    const label = newAttr.trim();
    if (!label) return setNewAttr(null);
    if (attributeList.some((a) => a.label.toLowerCase() === label.toLowerCase())) return fail(`${label} is already in the list.`);
    setCustomAttrs((c) => [...c, label]);
    setNewAttr(null);
  };

  // Rows follow the attributes only when the seller presses Generate.
  const expectedTitles = useMemo(() => buildRows(axes, []).map((r) => r.title).sort().join('|'), [axes]);
  const currentTitles = rows.map((r) => r.title).sort().join('|');
  const outOfDate = axes.every((a) => a.values.length > 0) && expectedTitles !== currentTitles;
  const generate = () => {
    const empty = axes.find((a) => a.values.length === 0);
    if (empty) return fail(`Pick at least one ${empty.label} option, or untick ${empty.label}.`);
    const next = buildRows(axes, rows);
    if (next.length > 100) return fail(`That makes ${next.length} variants — a product can have at most 100.`);
    onChange(axes, next);
    setSelected(new Set());
  };

  // ── Matrix ──
  const updateRow = (title: string, patch: Partial<VMRow>) => onChange(axes, rows.map((r) => (r.title === title ? { ...r, ...patch } : r)));
  // Seller mode: dropping the last variant goes back to a single "Default" item, and unused options fall away.
  const commitRows = (next: VMRow[]) => {
    if (!sellerMode) return onChange(axes, next);
    if (next.length === 0) return onChange([], [emptyRow()]);
    onChange(axes.map((a) => ({ ...a, values: a.values.filter((v) => next.some((r) => r.options.some((o) => o.name === a.label && o.value === v))) })), next);
  };
  const removeRow = (title: string) => {
    commitRows(rows.filter((r) => r.title !== title));
    setSelected((s) => { const n = new Set(s); n.delete(title); return n; });
  };
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.title));
  const applyBulk = (onlySelected: boolean) => {
    const targets = onlySelected ? selected : new Set(rows.map((r) => r.title));
    if (targets.size === 0) return fail('Tick the variants to change first.');
    const patch: Partial<VMRow> = {};
    (['price', 'discPrice', 'stock', 'weightKg'] as const).forEach((k) => { if (bulk[k] !== '') patch[k] = bulk[k]; });
    if (Object.keys(patch).length === 0) return fail('Enter at least one value to apply.');
    onChange(axes, rows.map((r) => (targets.has(r.title) ? { ...r, ...patch } : r)));
    setBulk({ open: false, price: '', discPrice: '', stock: '', weightKg: '' });
  };
  const setActiveFor = (on: boolean) => onChange(axes, rows.map((r) => (selected.has(r.title) ? { ...r, isActive: on } : r)));

  // A new variant starts with the price, discount, stock and weight of the latest one (or the defaults), so the seller only changes what differs.
  const seeded = (title: string, options: VMOption[]): VMRow => {
    const last = [...rows].reverse().find((r) => Number(r.price) > 0);
    const base = emptyRow(title, options);
    if (last) return { ...base, price: last.price, discPrice: last.discPrice, stock: last.stock, weightKg: last.weightKg };
    return { ...base, price: defaults?.price || '', discPrice: defaults?.discPrice || '', stock: defaults?.stock || '0', weightKg: defaults?.weightKg || '' };
  };
  const addVariant = () => {
    if (!adding) return;
    if (formAxes.length === 0) return fail('No variant attributes are available for this product.');
    const values = formAxes.map((a) => (adding[a.label] || '').trim());
    if (values.some((v) => !v)) return fail('Choose an option for every attribute.');
    const options = formAxes.map((a, i) => ({ name: a.label, value: values[i] }));
    const title = comboTitle(options);
    if (rows.some((r) => r.title === title)) return fail(`${title} is already in the list.`);
    const base: VMAxis[] = axes.length > 0 ? axes : formAxes.map((a) => ({ label: a.label, values: [] }));
    const nextAxes = base.map((a, i) => (a.values.includes(values[i]) ? a : { ...a, values: [...a.values, values[i]] }));
    const nextRows = [...rows.filter((r) => r.options.length > 0), seeded(title, options)];
    onChange(nextAxes, sellerMode ? autoSkus(nextRows, skuPrefix) : nextRows);
    setEditing((s) => new Set(s).add(title));
    setPreview(Object.fromEntries(options.map((o) => [o.name, o.value])));
    setAdding(null);
  };
  const setDiscountPct = (title: string, mrp: string, pct: string) => {
    const m = Number(mrp);
    const p = Math.min(99, Math.max(0, Number(pct)));
    updateRow(title, { discPrice: m > 0 && p > 0 ? String(Math.round(m * (100 - p)) / 100) : '' });
  };

  const downloadCsv = () => {
    const header = [...axes.map((a) => a.label), 'SKU', 'MRP', 'Selling Price', 'Stock', 'Weight (kg)', 'Status'];
    const lines = rows.map((r) => [
      ...axes.map((a) => r.options.find((o) => o.name === a.label)?.value || ''),
      r.sku, r.price, r.discPrice, r.stock, r.weightKg, r.isActive ? 'Active' : 'Inactive',
    ]);
    const csv = [header, ...lines].map((l) => l.map((c) => csvCell(String(c ?? ''))).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(productName || 'variants').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-variants.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const uploadCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const table = parseCsv(await file.text());
    if (table.length < 2) return fail('The CSV has no rows.');
    // Seller mode: the columns are the admin's attributes, and only their options are accepted.
    const csvAxes = sellerMode ? formAxes : axes;
    const head = table[0].map((h) => h.toLowerCase());
    const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
    const axisCols = csvAxes.map((a) => head.indexOf(a.label.toLowerCase()));
    if (csvAxes.length && axisCols.some((c) => c < 0)) {
      return fail(`The CSV needs these columns: ${csvColumns.join(', ')}.`);
    }
    const c = { sku: col('sku'), mrp: col('mrp', 'price'), sell: col('selling price', 'selling', 'sale price'), stock: col('stock'), w: col('weight (kg)', 'weight'), st: col('status') };
    let nextAxes: VMAxis[] = axes.length > 0 ? axes : csvAxes.map((a) => ({ label: a.label, values: [] }));
    let nextRows = csvAxes.length ? rows.filter((r) => r.options.length > 0) : [...rows];
    let skipped = 0;
    for (const line of table.slice(1)) {
      const options = csvAxes.map((a, i) => {
        const raw = line[axisCols[i]] || '';
        return { name: a.label, value: (sellerMode ? a.values.find((v) => v.toLowerCase() === raw.toLowerCase()) : raw) || '' };
      });
      if (options.some((o) => !o.value)) { skipped++; continue; }
      nextAxes = nextAxes.map((a, i) => (a.values.includes(options[i].value) ? a : { ...a, values: [...a.values, options[i].value] }));
      const title = csvAxes.length ? comboTitle(options) : 'Default';
      const patch: Partial<VMRow> = {};
      if (c.sku >= 0) patch.sku = line[c.sku] || '';
      if (c.mrp >= 0) patch.price = line[c.mrp] || '';
      if (c.sell >= 0) patch.discPrice = line[c.sell] || '';
      if (c.stock >= 0) patch.stock = line[c.stock] || '0';
      if (c.w >= 0) patch.weightKg = line[c.w] || '';
      if (c.st >= 0) patch.isActive = !/^(inactive|off|no|0|false)$/i.test(line[c.st] || '');
      const at = nextRows.findIndex((r) => r.title === title);
      if (at >= 0) nextRows[at] = { ...nextRows[at], ...patch };
      else nextRows.push({ ...seeded(title, csvAxes.length ? options : []), ...patch });
    }
    if (nextRows.length === 0) return fail('No row in the CSV matches the available options.');
    if (nextRows.length > 100) return fail(`That makes ${nextRows.length} variants — a product can have at most 100.`);
    onChange(nextAxes, sellerMode ? autoSkus(nextRows, skuPrefix) : nextRows);
    if (skipped) fail(`${skipped} CSV row${skipped > 1 ? 's were' : ' was'} skipped: each attribute needs one of its listed options.`);
  };
  const csvColumns = [...(sellerMode ? formAxes : axes).map((a) => a.label), 'SKU', 'MRP', 'Selling Price', 'Stock', 'Weight (kg)', 'Status'];

  // ── Photos ──
  // Photos are uploaded per colour and shared by that colour's rows; a seller product without a colour groups them by its first attribute.
  const colourAxis = axes.find((a) => isColourAxis(a.label)) || (sellerMode ? axes[0] : undefined);
  const upload = async (key: string, files: File[], current: string[], apply: (urls: string[]) => void) => {
    if (!files.length) return;
    if (files.some((f) => !validateImageFile(f).valid)) return fail('Some photos are invalid. Check the file types and sizes.');
    const room = MAX_ROW_PHOTOS - current.length;
    if (room <= 0) return fail(`Up to ${MAX_ROW_PHOTOS} photos each.`);
    setUploading(key);
    try {
      const compressed = await Promise.all(files.slice(0, room).map((f) => compressImage(f)));
      const results = await uploadImages(compressed, uploadFolder);
      apply([...current, ...results.map((r) => r.secureUrl)]);
    } catch {
      fail('Photo upload failed. Please try again.');
    } finally {
      setUploading(null);
    }
  };
  const colourImages = (colour: string) =>
    rows.find((r) => r.options.some((o) => o.name === colourAxis?.label && o.value === colour) && r.images.length)?.images || [];
  const setColourImages = (colour: string, images: string[]) =>
    onChange(axes, rows.map((r) => (r.options.some((o) => o.name === colourAxis?.label && o.value === colour) ? { ...r, images } : r)));

  // ── Preview ──
  const pick = (label: string) => preview[label] || rows[0]?.options.find((o) => o.name === label)?.value || '';
  const previewRow = rows.find((r) => r.options.every((o) => pick(o.name) === o.value)) || rows[0];
  const previewImage = previewRow?.images[0] || fallbackImage;
  const previewSelling = previewRow ? (Number(previewRow.discPrice) > 0 ? Number(previewRow.discPrice) : Number(previewRow.price)) : 0;
  const previewOff = previewRow ? discountPct(previewRow) : 0;
  const combined = axes.filter((a) => combinedAxes.includes(a.label));

  // Rows show their values as text; the pencil (or a missing MRP) opens them for editing, as on the design.
  const isEditing = (r: VMRow) => editing.has(r.title) || !(Number(r.price) > 0);
  // Opening a row also shows that variant in the preview.
  const toggleEdit = (title: string) => {
    const row = rows.find((r) => r.title === title);
    if (row && !editing.has(title) && row.options.length) setPreview(Object.fromEntries(row.options.map((o) => [o.name, o.value])));
    setEditing((s) => { const n = new Set(s); if (n.has(title)) n.delete(title); else n.add(title); return n; });
  };
  const isCustom = (label: string) => !suggestedAttributes.some((p) => p.label.toLowerCase() === label.toLowerCase());

  const Icon = {
    edit: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>,
    trash: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>,
    plus: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
    grid: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
    upload: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>,
    download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>,
    camera: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>,
    cart: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></svg>,
    edit2: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>,
  };
  const card = 'bg-white rounded-xl border border-neutral-200 shadow-sm';
  const blueBtn = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold shadow-sm';
  const outlineBtn = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-neutral-300 text-blue-700 hover:bg-blue-50 text-[11px] font-semibold bg-white';
  const cellInput = 'w-full min-w-[52px] max-w-[96px] h-7 px-2 rounded border border-neutral-300 text-[11px] bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
      <div className="space-y-4 min-w-0">
        <div className={`grid grid-cols-1 ${sellerMode ? '' : 'lg:grid-cols-2'} gap-4`}>
          {/* Basic product information (read-only summary, edited in its own step) */}
          {productInfo && (
            <section className={`${card} p-4`}>
              <h3 className="text-sm font-bold text-neutral-900 mb-3">Basic Product Information</h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {([['Product Name', productInfo.name], ['Category', productInfo.category], ['Brand', productInfo.brand], ['Sub Category', productInfo.subCategory]] as const).map(([label, value]) => (
                  <div key={label}>
                    <p className="font-semibold text-neutral-600 mb-1">{label}</p>
                    <p className="px-2.5 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-800 truncate">{value || '—'}</p>
                  </div>
                ))}
                <div className="col-span-2">
                  <p className="font-semibold text-neutral-600 mb-1">Product Description</p>
                  <p className="px-2.5 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-700 line-clamp-3 min-h-[52px]">{productInfo.description || '—'}</p>
                </div>
              </div>
            </section>
          )}

          {/* Variant attributes (admin) */}
          {!sellerMode && (
          <section className={`${card} p-4 ${productInfo ? '' : 'lg:col-span-2'}`}>
            <h3 className="text-sm font-bold text-neutral-900">Variant Attributes</h3>
            <p className="text-xs text-neutral-500 mb-2">Select attributes and add options to create product variants.</p>
            {attributeList.length === 0 && (
              <p className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2.5 mb-2">
                No variant attributes are set up for this category yet. Add your own below (for example Color, Size, RAM), or ask the admin to add them in Listing Setup so every seller gets the same list.
              </p>
            )}
            <div className="divide-y divide-neutral-100">
              {attributeList.map((attr) => {
                const axis = axisOf(attr.label);
                const on = !!axis;
                const typing = optionDraft[attr.label] !== undefined;
                return (
                  <div key={attr.label} className="py-2 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 w-28 shrink-0 cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => toggleAttribute(attr.label)} className="w-4 h-4 accent-blue-600" />
                      <span className="leading-tight">
                        <span className={`block text-xs font-semibold ${on ? 'text-neutral-900' : 'text-neutral-600'}`}>{attr.label}</span>
                        {isCustom(attr.label) && <span className="block text-[10px] text-neutral-400">(Custom Attribute)</span>}
                      </span>
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                      {attr.values.map((v) => {
                        const picked = !!axis?.values.includes(v);
                        const hex = isColourAxis(attr.label) ? swatch(v) : undefined;
                        return hex ? (
                          <button key={v} type="button" title={v} onClick={() => toggleOption(attr.label, v)}
                            className={`w-6 h-6 rounded-full border ${picked ? 'ring-2 ring-offset-1 ring-blue-600 border-neutral-400' : 'border-neutral-300 opacity-50'}`}
                            style={{ background: hex }} aria-label={v} aria-pressed={picked} />
                        ) : (
                          <button key={v} type="button" onClick={() => toggleOption(attr.label, v)} aria-pressed={picked}
                            className={`min-w-[34px] px-2 py-1 rounded-md border text-[11px] font-semibold ${picked ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-neutral-200 text-neutral-500'}`}>
                            {v}
                          </button>
                        );
                      })}
                      {typing && (
                        <input
                          autoFocus
                          value={optionDraft[attr.label]}
                          onChange={(e) => setOptionDraft((d) => ({ ...d, [attr.label]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); addOption(attr.label); }
                            if (e.key === 'Escape') setOptionDraft((d) => { const n = { ...d }; delete n[attr.label]; return n; });
                          }}
                          onBlur={() => { if ((optionDraft[attr.label] || '').trim()) addOption(attr.label); setOptionDraft((d) => { const n = { ...d }; delete n[attr.label]; return n; }); }}
                          placeholder="Type and press Enter"
                          className="w-28 px-2 py-1 rounded-md border border-blue-400 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      )}
                    </div>
                    <button type="button" onClick={() => setOptionDraft((d) => ({ ...d, [attr.label]: d[attr.label] ?? '' }))}
                      className={on ? outlineBtn : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-400 text-xs font-semibold bg-white'}>
                      {Icon.plus} Add {isColourAxis(attr.label) ? 'Color' : attr.label.length > 10 ? 'Option' : attr.label}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {newAttr !== null && (
                <input
                  value={newAttr}
                  onChange={(e) => setNewAttr(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomAttribute(); } }}
                  placeholder="e.g. RAM, Flavour"
                  className="px-3 py-1.5 rounded-lg border border-neutral-300 text-xs w-40"
                />
              )}
              <button type="button" onClick={addCustomAttribute} className={outlineBtn}>{Icon.plus} Add Custom Attribute</button>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button type="button" onClick={generate} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
                {Icon.grid} Generate Variants
              </button>
              <span className="text-[11px] text-neutral-500">
                {axes.length === 0 ? '(No attribute ticked — sold in one form)' : '(Will create all possible combinations)'}
              </span>
            </div>
            {outOfDate && rows.length > 0 && (
              <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Attributes changed — press Generate Variants to update the matrix. Values you entered are kept.
              </p>
            )}
            {axes.length >= 2 && (
              <div className="mt-3 pt-3 border-t border-neutral-100">
                <p className="text-[11px] font-semibold text-neutral-700">Show to customers as one choice (optional)</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {axes.map((a) => {
                    const on = combinedAxes.includes(a.label);
                    return (
                      <button key={a.label} type="button"
                        onClick={() => onCombinedChange(on ? combinedAxes.filter((x) => x !== a.label) : [...combinedAxes, a.label])}
                        className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold ${on ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-neutral-200 text-neutral-500'}`}>
                        {on ? '✓ ' : ''}{a.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">
                  {combined.length >= 2 ? `One picker: ${combined.map((a) => a.values[0] || a.label).join(' + ')}` : 'e.g. RAM + Storage as "8 GB + 128 GB". Others keep their own picker.'}
                </p>
              </div>
            )}
          </section>
          )}
        </div>

        {/* Variant matrix */}
        <section className={card}>
          <div className="p-4 pb-0">
            <h3 className="text-sm font-bold text-neutral-900">Variant Matrix</h3>
            <p className="text-xs text-neutral-500">Manage price, stock, SKU and other details for each variant.</p>
          </div>
          <div className="px-4 py-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setBulk((b) => ({ ...b, open: !b.open }))} className={outlineBtn}>{Icon.edit2} Bulk Edit</button>
            <button type="button" onClick={() => csvRef.current?.click()} className={outlineBtn} title={`Columns: ${csvColumns.join(', ')}`}>{Icon.upload} Upload CSV</button>
            {!sellerMode && <button type="button" onClick={downloadCsv} className={outlineBtn}>{Icon.download} CSV</button>}
            {!sellerMode && <button type="button" onClick={() => onChange(axes, autoSkus(rows, skuPrefix))} className={outlineBtn}>Auto SKU</button>}
            <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={uploadCsv} />
            {formAxes.length > 0 && <button type="button" onClick={() => setAdding(adding ? null : {})} className={blueBtn}>{Icon.plus} Add Variant</button>}
          </div>

          {bulk.open && (
            <div className="mx-4 mb-3 p-3 rounded-lg bg-blue-50/50 border border-blue-100 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
              {([['price', 'MRP (₹)'], ['discPrice', 'Selling Price (₹)'], ['stock', 'Stock'], ['weightKg', 'Weight (kg)']] as const).map(([k, label]) => (
                <label key={k} className="text-[11px] font-semibold text-neutral-600">
                  {label}
                  <input type="number" min="0" step="any" value={bulk[k]} onChange={(e) => setBulk((b) => ({ ...b, [k]: e.target.value }))} className={cellInput} />
                </label>
              ))}
              <button type="button" onClick={() => applyBulk(true)} className={outlineBtn}>Apply to selected ({selected.size})</button>
              <button type="button" onClick={() => applyBulk(false)} className={blueBtn}>Apply to all</button>
            </div>
          )}

          {adding && (
            <div className="mx-4 mb-3 p-3 rounded-lg bg-blue-50/50 border border-blue-100 flex flex-wrap items-end gap-2">
              {formAxes.map((a) => (
                <label key={a.label} className="text-[11px] font-semibold text-neutral-600">
                  {a.label}
                  {sellerMode ? (
                    <select value={adding[a.label] || ''} onChange={(e) => setAdding((d) => ({ ...(d || {}), [a.label]: e.target.value }))} className={`${cellInput} w-36`}>
                      <option value="">Select {a.label}</option>
                      {a.values.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : (
                    <>
                      <input list={`vm-${a.label}`} value={adding[a.label] || ''} onChange={(e) => setAdding((d) => ({ ...(d || {}), [a.label]: e.target.value }))} className={`${cellInput} w-32`} />
                      <datalist id={`vm-${a.label}`}>{a.values.map((v) => <option key={v} value={v} />)}</datalist>
                    </>
                  )}
                </label>
              ))}
              <button type="button" onClick={addVariant} className={blueBtn}>Add</button>
              <button type="button" onClick={() => setAdding(null)} className="text-xs text-neutral-500">Cancel</button>
            </div>
          )}

          {selected.size > 0 && (
            <div className="mx-4 mb-2 flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-neutral-700">{selected.size} selected</span>
              <button type="button" onClick={() => setActiveFor(true)} className="text-green-700 font-semibold hover:underline">Switch on</button>
              <button type="button" onClick={() => setActiveFor(false)} className="text-neutral-600 font-semibold hover:underline">Switch off</button>
              <button type="button" onClick={() => { commitRows(rows.filter((r) => !selected.has(r.title))); setSelected(new Set()); }} className="text-red-600 font-semibold hover:underline">Delete</button>
            </div>
          )}

          {sellerMode && formAxes.length === 0 && (
            <p className="mx-4 mb-3 text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2.5">
              No variants are set up for this category, so this product is sold as a single item. Enter its price and stock below.
            </p>
          )}
          <div className="mx-4 mb-4 overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-[11px]">
              <thead className="text-neutral-700 bg-neutral-50/70">
                <tr className="border-b border-neutral-200 divide-x divide-neutral-100 [&>th]:whitespace-nowrap [&>th]:font-semibold">
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.title)))} className="accent-blue-600" aria-label="Select all" />
                  </th>
                  {axes.map((a) => <th key={a.label} className="px-3 py-2 text-left font-semibold">{a.label}</th>)}
                  {axes.length === 0 && <th className="px-3 py-2 text-left font-semibold">Variant</th>}
                  <th className="px-3 py-2 text-left font-semibold">SKU</th>
                  <th className="px-3 py-2 text-left font-semibold">MRP (₹)</th>
                  <th className="px-3 py-2 text-left font-semibold">Selling Price (₹)</th>
                  <th className="px-3 py-2 text-left font-semibold">Discount</th>
                  <th className="px-3 py-2 text-left font-semibold">Stock</th>
                  <th className="px-3 py-2 text-left font-semibold">Weight (kg)</th>
                  <th className="px-3 py-2 text-left font-semibold">Images</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={13} className="p-8 text-center text-neutral-500">{sellerMode ? 'Press Add Variant to create the first one.' : 'Tick attributes and press Generate Variants.'}</td></tr>
                )}
                {rows.map((r) => {
                  const pct = discountPct(r);
                  const edit = isEditing(r);
                  const field = (k: 'sku' | 'price' | 'discPrice' | 'stock' | 'weightKg', text: string) =>
                    edit ? (
                      <input type={k === 'sku' ? 'text' : 'number'} min="0" step={k === 'weightKg' ? '0.01' : undefined} value={r[k]}
                        placeholder={k === 'sku' ? 'Auto' : ''} onChange={(e) => updateRow(r.title, { [k]: e.target.value } as Partial<VMRow>)}
                        className={`${cellInput} ${k === 'sku' ? 'w-28' : ''}`} />
                    ) : (
                      <span className="text-neutral-800">{text || '—'}</span>
                    );
                  return (
                    <tr key={r.title} className={`border-b last:border-b-0 border-neutral-100 divide-x divide-neutral-100 ${r.isActive ? 'hover:bg-blue-50/30' : 'bg-neutral-50 text-neutral-400'}`}>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={selected.has(r.title)}
                          onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.title)) n.delete(r.title); else n.add(r.title); return n; })}
                          className="accent-blue-600" aria-label={`Select ${r.title}`} />
                      </td>
                      {axes.map((a) => {
                        const v = r.options.find((o) => o.name === a.label)?.value || '';
                        const hex = isColourAxis(a.label) ? swatch(v) : undefined;
                        return (
                          <td key={a.label} className="px-3 py-2 whitespace-nowrap text-neutral-800">
                            <span className="inline-flex items-center gap-2">
                              {hex && <span className="w-4 h-4 rounded-full border border-neutral-300" style={{ background: hex }} />}
                              {v}
                            </span>
                          </td>
                        );
                      })}
                      {axes.length === 0 && <td className="px-3 py-2 text-neutral-800">Standard</td>}
                      <td className="px-3 py-2 whitespace-nowrap font-mono">{field('sku', r.sku)}</td>
                      <td className="px-3 py-2">{field('price', r.price)}</td>
                      <td className="px-3 py-2">{field('discPrice', r.discPrice || r.price)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {edit ? (
                          <span className="inline-flex items-center gap-1">
                            <input type="number" min="0" max="99" value={pct || ''} placeholder="0" onChange={(e) => setDiscountPct(r.title, r.price, e.target.value)} className={`${cellInput} !w-12 !min-w-0`} /><span className="text-neutral-500">%</span>
                          </span>
                        ) : pct > 0 ? <span className="text-neutral-800">{pct}%</span> : '—'}
                      </td>
                      <td className="px-3 py-2">{field('stock', r.stock === '0' ? 'Unlimited' : r.stock)}</td>
                      <td className="px-3 py-2">{field('weightKg', r.weightKg)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-0.5">
                          {r.images.slice(0, 3).map((src) => <img key={src} src={src} alt="" className="w-7 h-7 rounded object-cover border border-neutral-200" />)}
                          {r.images.length > 3 && <span className="text-[10px] text-neutral-500 ml-0.5">+{r.images.length - 3}</span>}
                          {!colourAxis && axes.length > 0 && r.images.length < MAX_ROW_PHOTOS && (
                            <label className="w-7 h-7 rounded border border-dashed border-blue-300 flex items-center justify-center text-blue-500 cursor-pointer" title="Add photos">
                              {uploading === r.title ? '…' : '+'}
                              <input type="file" accept="image/*" multiple className="hidden" disabled={uploading !== null}
                                onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; upload(r.title, files, r.images, (images) => updateRow(r.title, { images })); }} />
                            </label>
                          )}
                          {r.images.length === 0 && (colourAxis || axes.length === 0) && <span className="text-neutral-400">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" role="switch" aria-checked={r.isActive} onClick={() => updateRow(r.title, { isActive: !r.isActive })}
                          className={`relative w-8 h-[18px] rounded-full transition-colors ${r.isActive ? 'bg-green-500' : 'bg-neutral-300'}`}
                          title={r.isActive ? 'On sale — click to switch off' : 'Switched off — hidden from customers'}>
                          <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${r.isActive ? 'left-4' : 'left-0.5'}`} />
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => toggleEdit(r.title)}
                            className={`p-1 rounded ${edit ? 'bg-blue-50 text-blue-700' : 'text-neutral-600 hover:text-blue-700 hover:bg-blue-50'}`}
                            aria-label={edit ? `Done editing ${r.title}` : `Edit ${r.title}`} title={edit ? 'Editing — click to finish' : 'Edit'}>
                            {Icon.edit}
                          </button>
                          <button type="button"
                            onClick={() => {
                              // The single "Standard" row can't be removed; its values are cleared instead.
                              if (axes.length > 0) return removeRow(r.title);
                              if (window.confirm('Clear the price, stock, SKU and weight of this item?')) updateRow(r.title, { price: '', discPrice: '', stock: '0', sku: '', weightKg: '' });
                            }}
                            className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50" aria-label={`Delete ${r.title}`} title={axes.length > 0 ? 'Delete' : 'Clear values'}>
                            {Icon.trash}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {footer && <div className="px-4 pb-4">{footer}</div>}
        </section>
      </div>

      <div className="space-y-4 min-w-0">
        {/* Variant-wise images */}
        {axes.length > 0 && (
          <section className={`${card} p-4`}>
            <h3 className="text-sm font-bold text-neutral-900">Variant-wise Images</h3>
            <p className="text-xs text-neutral-500 mb-3">
              {colourAxis ? `Upload different images for each ${isColourAxis(colourAxis.label) ? 'color' : colourAxis.label.toLowerCase()}/variant.` :'Add photos per variant from the Images column of the matrix.'}
            </p>
            {colourAxis ? (
              <div className="divide-y divide-neutral-100">
                {colourAxis.values.map((colour) => {
                  const imgs = colourImages(colour);
                  const inputId = `vm-img-${colour}`;
                  return (
                    <div key={colour} className="py-3 first:pt-0">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-neutral-800">
                          {colour} <span className="font-normal text-neutral-500">({imgs.length} images)</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <label htmlFor={inputId} className="text-blue-600 hover:text-blue-800 cursor-pointer" title="Add photos">{Icon.edit}</label>
                          {imgs.length > 0 && (
                            <button type="button" onClick={() => setColourImages(colour, [])} className="text-red-500 hover:text-red-700" title="Remove all photos" aria-label={`Remove all ${colour} photos`}>{Icon.trash}</button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {imgs.map((src) => (
                          <div key={src} className="relative aspect-square rounded-lg overflow-hidden border border-neutral-200 group">
                            <img src={src} alt="" className="w-full h-full object-cover" />
                            <button type="button" onClick={() => setColourImages(colour, imgs.filter((x) => x !== src))}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] leading-none opacity-0 group-hover:opacity-100" aria-label="Remove photo">×</button>
                          </div>
                        ))}
                        {imgs.length < MAX_ROW_PHOTOS && (
                          <label htmlFor={inputId} className="aspect-square rounded-lg border-2 border-dashed border-blue-200 flex flex-col items-center justify-center text-blue-500 text-[10px] cursor-pointer hover:bg-blue-50">
                            {uploading === colour ? '…' : <>{Icon.camera}<span className="mt-0.5">Upload More</span></>}
                          </label>
                        )}
                        <input id={inputId} type="file" accept="image/*" multiple className="hidden" disabled={uploading !== null}
                          onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; upload(colour, files, imgs, (images) => setColourImages(colour, images)); }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-neutral-500">No colour attribute ticked.</p>
            )}
          </section>
        )}

        {/* Preview */}
        <section className={`${card} p-4`}>
          <h3 className="text-sm font-bold text-neutral-900 mb-3">
            Preview <span className="font-normal text-neutral-500 text-xs">({axes.length ? axes.map((a) => a.label).join(' & ') + ' Selection' : 'what customers see'})</span>
          </h3>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
            <div className="aspect-square rounded-xl bg-neutral-50 border border-neutral-100 overflow-hidden flex items-center justify-center">
              {previewImage ? <img src={previewImage} alt="" className="w-full h-full object-contain" /> : <span className="text-3xl">🛍️</span>}
            </div>
            <div className="min-w-0 space-y-2.5">
              {productName && <p className="text-xs font-semibold text-neutral-900 line-clamp-2">{productName}</p>}
              {axes.map((a) => (
                <div key={a.label}>
                  <p className="text-[11px] font-semibold text-neutral-600 mb-1">{a.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {a.values.map((v) => {
                      const hex = isColourAxis(a.label) ? swatch(v) : undefined;
                      const active = pick(a.label) === v;
                      return hex ? (
                        <button key={v} type="button" title={v} onClick={() => setPreview((p) => ({ ...p, [a.label]: v }))}
                          className={`w-6 h-6 rounded-full border ${active ? 'ring-2 ring-offset-1 ring-neutral-900' : 'border-neutral-300'}`} style={{ background: hex }} aria-label={v} />
                      ) : (
                        <button key={v} type="button" onClick={() => setPreview((p) => ({ ...p, [a.label]: v }))}
                          className={`min-w-[32px] px-2 py-1 rounded-md border text-[11px] font-semibold ${active ? 'border-blue-600 text-blue-700 bg-blue-50' : 'border-neutral-300 text-neutral-700'}`}>
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {previewRow && Number(previewRow.price) > 0 && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-2xl font-bold text-neutral-900">₹{previewSelling}</span>
              {previewOff > 0 && <span className="text-xs text-neutral-400 line-through">₹{previewRow.price}</span>}
              {previewOff > 0 && <span className="text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded">{previewOff}% OFF</span>}
            </div>
          )}
          {previewRow && !previewRow.isActive && <p className="mt-2 text-xs font-semibold text-red-600">This combination is switched off — customers won't see it.</p>}
          {axes.length > 0 && !rows.some((r) => r.options.every((o) => pick(o.name) === o.value)) && (
            <p className="mt-2 text-xs text-amber-700">This combination isn't in the matrix.</p>
          )}
          <button type="button" disabled className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold opacity-90 cursor-default">
            {Icon.cart} Add to Cart
          </button>
        </section>
      </div>
    </div>
  );
}
