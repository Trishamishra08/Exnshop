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

const PRESETS: VMAxis[] = [
  { label: 'Color', values: ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Purple'] },
  { label: 'Size', values: ['S', 'M', 'L', 'XL', 'XXL'] },
  { label: 'Material', values: ['Cotton', 'Polyester', 'Linen'] },
  { label: 'Pattern', values: ['Solid', 'Printed', 'Striped'] },
  { label: 'Storage', values: ['64 GB', '128 GB', '256 GB'] },
];

const COLOR_HEX: Record<string, string> = {
  black: '#111111', white: '#ffffff', red: '#e53935', blue: '#1e88e5', green: '#43a047', yellow: '#fbc02d',
  purple: '#8e24aa', orange: '#fb8c00', pink: '#ec407a', grey: '#9e9e9e', gray: '#9e9e9e', brown: '#795548',
  navy: '#1a237e', maroon: '#880e4f', beige: '#d7ccc8', gold: '#c9a227', silver: '#bdbdbd', cream: '#fff3d6',
};
export const isColourAxis = (label: string) => /colou?r/i.test(label);
const swatch = (value: string) => COLOR_HEX[value.trim().toLowerCase()];

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
}

export default function VariantManager({
  axes, rows, onChange, combinedAxes, onCombinedChange, suggestedAttributes = [], fallbackImage, productName, skuPrefix = '',
  uploadFolder = 'exnshop/products/options', onError,
}: Props) {
  const fail = (m: string) => (onError ? onError(m) : window.alert(m));
  const [extraOptions, setExtraOptions] = useState<Record<string, string[]>>({});
  const [customAttrs, setCustomAttrs] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState<Record<string, string>>({});
  const [newAttr, setNewAttr] = useState('');
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
    PRESETS.forEach((a) => add(a.label, a.values));
    customAttrs.forEach((l) => add(l, []));
    axes.forEach((a) => add(a.label, a.values));
    Object.entries(extraOptions).forEach(([l, vs]) => add(l, vs));
    return [...byLabel.entries()].map(([label, set]) => ({ label, values: [...set] }));
  }, [suggestedAttributes, customAttrs, axes, extraOptions]);

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
    const label = newAttr.trim();
    if (!label) return;
    if (attributeList.some((a) => a.label.toLowerCase() === label.toLowerCase())) return fail(`${label} is already in the list.`);
    setCustomAttrs((c) => [...c, label]);
    setNewAttr('');
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
  const removeRow = (title: string) => {
    onChange(axes, rows.filter((r) => r.title !== title));
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

  const addVariant = () => {
    if (!adding) return;
    if (axes.length === 0) return fail('Tick at least one attribute first.');
    const values = axes.map((a) => (adding[a.label] || '').trim());
    if (values.some((v) => !v)) return fail('Choose or type an option for every attribute.');
    const options = axes.map((a, i) => ({ name: a.label, value: values[i] }));
    const title = comboTitle(options);
    if (rows.some((r) => r.title === title)) return fail(`${title} is already in the list.`);
    const nextAxes = axes.map((a, i) => (a.values.includes(values[i]) ? a : { ...a, values: [...a.values, values[i]] }));
    onChange(nextAxes, [...rows, emptyRow(title, options)]);
    setAdding(null);
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
    const head = table[0].map((h) => h.toLowerCase());
    const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
    const axisCols = axes.map((a) => head.indexOf(a.label.toLowerCase()));
    if (axes.length && axisCols.some((c) => c < 0)) {
      return fail(`The CSV needs a column for each attribute: ${axes.map((a) => a.label).join(', ')}. Download the template to start.`);
    }
    const c = { sku: col('sku'), mrp: col('mrp', 'price'), sell: col('selling price', 'selling', 'sale price'), stock: col('stock'), w: col('weight (kg)', 'weight'), st: col('status') };
    let nextAxes = axes;
    let nextRows = [...rows];
    for (const line of table.slice(1)) {
      const options = axes.map((a, i) => ({ name: a.label, value: line[axisCols[i]] || '' }));
      if (options.some((o) => !o.value)) continue;
      nextAxes = nextAxes.map((a, i) => (a.values.includes(options[i].value) ? a : { ...a, values: [...a.values, options[i].value] }));
      const title = axes.length ? comboTitle(options) : 'Default';
      const patch: Partial<VMRow> = {};
      if (c.sku >= 0) patch.sku = line[c.sku] || '';
      if (c.mrp >= 0) patch.price = line[c.mrp] || '';
      if (c.sell >= 0) patch.discPrice = line[c.sell] || '';
      if (c.stock >= 0) patch.stock = line[c.stock] || '0';
      if (c.w >= 0) patch.weightKg = line[c.w] || '';
      if (c.st >= 0) patch.isActive = !/^(inactive|off|no|0|false)$/i.test(line[c.st] || '');
      const at = nextRows.findIndex((r) => r.title === title);
      if (at >= 0) nextRows[at] = { ...nextRows[at], ...patch };
      else nextRows.push({ ...emptyRow(title, axes.length ? options : []), ...patch });
    }
    onChange(nextAxes, nextRows);
  };

  // ── Photos ──
  const colourAxis = axes.find((a) => isColourAxis(a.label));
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2 space-y-4 min-w-0">
        {/* Variant attributes */}
        <section className={`${box} p-4`}>
          <h3 className="text-sm font-bold text-neutral-900">Variant Attributes</h3>
          <p className="text-xs text-neutral-500 mb-3">Tick up to {MAX_ATTRIBUTES} attributes and pick their options, then generate the variants.</p>
          <div className="divide-y divide-neutral-100">
            {attributeList.map((attr) => {
              const axis = axisOf(attr.label);
              const on = !!axis;
              return (
                <div key={attr.label} className="py-2.5 flex flex-col md:flex-row md:items-center gap-2">
                  <label className="flex items-center gap-2 md:w-32 shrink-0 cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => toggleAttribute(attr.label)} className="w-4 h-4 accent-teal-600" />
                    <span className={`text-sm font-semibold ${on ? 'text-neutral-900' : 'text-neutral-500'}`}>{attr.label}</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 flex-1">
                    {attr.values.map((v) => {
                      const picked = !!axis?.values.includes(v);
                      const hex = isColourAxis(attr.label) ? swatch(v) : undefined;
                      return hex ? (
                        <button
                          key={v}
                          type="button"
                          title={v}
                          onClick={() => toggleOption(attr.label, v)}
                          className={`w-7 h-7 rounded-full border ${picked ? 'ring-2 ring-offset-1 ring-teal-600 border-neutral-400' : 'border-neutral-300 opacity-60'}`}
                          style={{ background: hex }}
                          aria-label={v}
                          aria-pressed={picked}
                        />
                      ) : (
                        <button
                          key={v}
                          type="button"
                          onClick={() => toggleOption(attr.label, v)}
                          aria-pressed={picked}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${picked ? 'bg-teal-50 border-teal-500 text-teal-800' : 'bg-white border-neutral-300 text-neutral-500'}`}
                        >
                          {v}
                        </button>
                      );
                    })}
                    <span className="inline-flex items-center gap-1">
                      <input
                        value={optionDraft[attr.label] || ''}
                        onChange={(e) => setOptionDraft((d) => ({ ...d, [attr.label]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(attr.label); } }}
                        placeholder={`+ Add ${attr.label.toLowerCase()}`}
                        className="w-28 px-2 py-1 rounded-lg border border-dashed border-teal-400 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      {(optionDraft[attr.label] || '').trim() && (
                        <button type="button" onClick={() => addOption(attr.label)} className="text-xs font-semibold text-teal-700">Add</button>
                      )}
                    </span>
                  </div>
                  {on && isColourAxis(attr.label) && axis!.values.length > 0 && (
                    <span className="text-[11px] text-neutral-500 md:w-40 md:text-right">{axis!.values.join(', ')}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <input
              value={newAttr}
              onChange={(e) => setNewAttr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomAttribute(); } }}
              placeholder="Custom attribute, e.g. RAM, Flavour"
              className="px-3 py-1.5 rounded-lg border border-neutral-300 text-xs w-56"
            />
            <button type="button" onClick={addCustomAttribute} className={`${btnOutline} border-teal-500 text-teal-700`}>+ Add Custom Attribute</button>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button type="button" onClick={generate} className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold">
              Generate Variants
            </button>
            <span className="text-xs text-neutral-500">
              {axes.length === 0 ? 'No attributes ticked — the product is sold in one form.' : 'Creates every combination; what you already entered is kept.'}
            </span>
          </div>
          {outOfDate && rows.length > 0 && (
            <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Attributes changed. Press Generate Variants to update the matrix.
            </p>
          )}

          {axes.length >= 2 && (
            <div className="mt-4 pt-3 border-t border-neutral-100">
              <p className="text-xs font-semibold text-neutral-700">Show to customers as one choice (optional)</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {axes.map((a) => {
                  const on = combinedAxes.includes(a.label);
                  return (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => onCombinedChange(on ? combinedAxes.filter((x) => x !== a.label) : [...combinedAxes, a.label])}
                      className={`${btnOutline} ${on ? 'bg-teal-50 border-teal-500 text-teal-800' : 'bg-white border-neutral-300 text-neutral-600'}`}
                    >
                      {on ? '✓ ' : ''}{a.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                {combined.length >= 2
                  ? `Customers see one picker: ${combined.map((a) => a.values[0] || a.label).join(' + ')}`
                  : 'Tick two or more, e.g. RAM + Storage. Unticked attributes keep their own picker.'}
              </p>
            </div>
          )}
        </section>

        {/* Variant matrix */}
        <section className={`${box}`}>
          <div className="p-4 pb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Variant Matrix</h3>
              <p className="text-xs text-neutral-500">MRP is the printed price; selling price is what the customer pays. Stock 0 = unlimited.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setBulk((b) => ({ ...b, open: !b.open }))} className={`${btnOutline} border-neutral-300 text-neutral-700`}>Bulk Edit</button>
              <button type="button" onClick={() => onChange(axes, autoSkus(rows, skuPrefix))} className={`${btnOutline} border-neutral-300 text-neutral-700`}>Auto SKU</button>
              <button type="button" onClick={downloadCsv} className={`${btnOutline} border-neutral-300 text-neutral-700`}>Download CSV</button>
              <button type="button" onClick={() => csvRef.current?.click()} className={`${btnOutline} border-neutral-300 text-neutral-700`}>Upload CSV</button>
              <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={uploadCsv} />
              {axes.length > 0 && (
                <button type="button" onClick={() => setAdding(adding ? null : {})} className={`${btnOutline} bg-teal-600 border-teal-600 text-white`}>+ Add Variant</button>
              )}
            </div>
          </div>

          {bulk.open && (
            <div className="mx-4 mb-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
              {([['price', 'MRP (₹)'], ['discPrice', 'Selling price (₹)'], ['stock', 'Stock'], ['weightKg', 'Weight (kg)']] as const).map(([k, label]) => (
                <label key={k} className="text-[11px] font-semibold text-neutral-600">
                  {label}
                  <input type="number" min="0" step="any" value={bulk[k]} onChange={(e) => setBulk((b) => ({ ...b, [k]: e.target.value }))} className={smallInput} />
                </label>
              ))}
              <button type="button" onClick={() => applyBulk(true)} className={`${btnOutline} border-teal-500 text-teal-700`}>Apply to selected ({selected.size})</button>
              <button type="button" onClick={() => applyBulk(false)} className={`${btnOutline} bg-teal-600 border-teal-600 text-white`}>Apply to all</button>
            </div>
          )}

          {adding && (
            <div className="mx-4 mb-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200 flex flex-wrap items-end gap-2">
              {axes.map((a) => (
                <label key={a.label} className="text-[11px] font-semibold text-neutral-600">
                  {a.label}
                  <input
                    list={`vm-${a.label}`}
                    value={adding[a.label] || ''}
                    onChange={(e) => setAdding((d) => ({ ...(d || {}), [a.label]: e.target.value }))}
                    className={`${smallInput} w-32`}
                  />
                  <datalist id={`vm-${a.label}`}>{a.values.map((v) => <option key={v} value={v} />)}</datalist>
                </label>
              ))}
              <button type="button" onClick={addVariant} className={`${btnOutline} bg-teal-600 border-teal-600 text-white`}>Add</button>
            </div>
          )}

          {selected.size > 0 && (
            <div className="mx-4 mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-neutral-700">{selected.size} selected</span>
              <button type="button" onClick={() => setActiveFor(true)} className="text-teal-700 font-semibold hover:underline">Switch on</button>
              <button type="button" onClick={() => setActiveFor(false)} className="text-neutral-600 font-semibold hover:underline">Switch off</button>
              <button type="button" onClick={() => { onChange(axes, rows.filter((r) => !selected.has(r.title))); setSelected(new Set()); }} className="text-red-600 font-semibold hover:underline">Delete</button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="p-2 w-8">
                    <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.title)))} className="accent-teal-600" aria-label="Select all" />
                  </th>
                  {axes.map((a) => <th key={a.label} className="p-2 text-left font-semibold">{a.label}</th>)}
                  {axes.length === 0 && <th className="p-2 text-left font-semibold">Variant</th>}
                  <th className="p-2 text-left font-semibold">SKU</th>
                  <th className="p-2 text-left font-semibold">MRP (₹)</th>
                  <th className="p-2 text-left font-semibold">Selling (₹)</th>
                  <th className="p-2 text-left font-semibold">Discount</th>
                  <th className="p-2 text-left font-semibold">Stock</th>
                  <th className="p-2 text-left font-semibold">Weight (kg)</th>
                  <th className="p-2 text-left font-semibold">Images</th>
                  <th className="p-2 text-left font-semibold">Status</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={12} className="p-6 text-center text-neutral-500">Tick attributes and press Generate Variants.</td></tr>
                )}
                {rows.map((r) => {
                  const pct = discountPct(r);
                  return (
                    <tr key={r.title} className={`border-t border-neutral-100 ${r.isActive ? '' : 'bg-neutral-50 text-neutral-400'}`}>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(r.title)}
                          onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.title)) n.delete(r.title); else n.add(r.title); return n; })}
                          className="accent-teal-600"
                          aria-label={`Select ${r.title}`}
                        />
                      </td>
                      {axes.map((a) => {
                        const v = r.options.find((o) => o.name === a.label)?.value || '';
                        const hex = isColourAxis(a.label) ? swatch(v) : undefined;
                        return (
                          <td key={a.label} className="p-2 whitespace-nowrap font-medium text-neutral-800">
                            <span className="inline-flex items-center gap-1.5">
                              {hex && <span className="w-3.5 h-3.5 rounded-full border border-neutral-300" style={{ background: hex }} />}
                              {v}
                            </span>
                          </td>
                        );
                      })}
                      {axes.length === 0 && <td className="p-2 font-medium text-neutral-800">Standard</td>}
                      <td className="p-2"><input value={r.sku} onChange={(e) => updateRow(r.title, { sku: e.target.value })} placeholder="Auto" className={`${smallInput} w-28`} /></td>
                      <td className="p-2"><input type="number" min="0" value={r.price} onChange={(e) => updateRow(r.title, { price: e.target.value })} className={smallInput} /></td>
                      <td className="p-2"><input type="number" min="0" value={r.discPrice} onChange={(e) => updateRow(r.title, { discPrice: e.target.value })} className={smallInput} /></td>
                      <td className="p-2 whitespace-nowrap">{pct > 0 ? <span className="font-semibold text-green-700">{pct}%</span> : '—'}</td>
                      <td className="p-2"><input type="number" min="0" value={r.stock} onChange={(e) => updateRow(r.title, { stock: e.target.value })} className={smallInput} /></td>
                      <td className="p-2"><input type="number" min="0" step="0.01" value={r.weightKg} onChange={(e) => updateRow(r.title, { weightKg: e.target.value })} className={smallInput} /></td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          {r.images.slice(0, 3).map((src) => <img key={src} src={src} alt="" className="w-7 h-7 rounded object-cover border border-neutral-200" />)}
                          {r.images.length > 3 && <span className="text-[10px] text-neutral-500">+{r.images.length - 3}</span>}
                          {!colourAxis && axes.length > 0 && r.images.length < MAX_ROW_PHOTOS && (
                            <label className="w-7 h-7 rounded border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400 cursor-pointer" title="Add photos">
                              {uploading === r.title ? '…' : '+'}
                              <input type="file" accept="image/*" multiple className="hidden" disabled={uploading !== null}
                                onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; upload(r.title, files, r.images, (images) => updateRow(r.title, { images })); }} />
                            </label>
                          )}
                          {r.images.length === 0 && (colourAxis || axes.length === 0) && <span className="text-neutral-400">—</span>}
                        </div>
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={r.isActive}
                          onClick={() => updateRow(r.title, { isActive: !r.isActive })}
                          className={`relative w-9 h-5 rounded-full transition-colors ${r.isActive ? 'bg-green-500' : 'bg-neutral-300'}`}
                          title={r.isActive ? 'On sale — click to switch off' : 'Switched off — hidden from customers'}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${r.isActive ? 'left-[18px]' : 'left-0.5'}`} />
                        </button>
                      </td>
                      <td className="p-2">
                        {axes.length > 0 && (
                          <button type="button" onClick={() => removeRow(r.title)} className="text-red-500 hover:text-red-700" aria-label={`Delete ${r.title}`}>✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="space-y-4 min-w-0">
        {/* Variant-wise images */}
        {axes.length > 0 && (
          <section className={`${box} p-4`}>
            <h3 className="text-sm font-bold text-neutral-900">Variant-wise Images</h3>
            <p className="text-xs text-neutral-500 mb-3">
              {colourAxis ? `Upload photos once per ${colourAxis.label.toLowerCase()}; every size/option of that colour uses them.` : 'Add photos per variant from the Images column.'}
            </p>
            {colourAxis ? (
              <div className="space-y-3">
                {colourAxis.values.map((colour) => {
                  const imgs = colourImages(colour);
                  const hex = swatch(colour);
                  return (
                    <div key={colour}>
                      <p className="text-xs font-semibold text-neutral-800 mb-1.5 flex items-center gap-1.5">
                        {hex && <span className="w-3 h-3 rounded-full border border-neutral-300" style={{ background: hex }} />}
                        {colour} <span className="font-normal text-neutral-500">({imgs.length} images)</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {imgs.map((src) => (
                          <div key={src} className="relative w-14 h-14 rounded-lg overflow-hidden border border-neutral-200">
                            <img src={src} alt="" className="w-full h-full object-cover" />
                            <button type="button" onClick={() => setColourImages(colour, imgs.filter((x) => x !== src))}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] leading-none" aria-label="Remove photo">×</button>
                          </div>
                        ))}
                        {imgs.length < MAX_ROW_PHOTOS && (
                          <label className="w-14 h-14 rounded-lg border-2 border-dashed border-neutral-300 flex flex-col items-center justify-center text-neutral-400 text-[10px] cursor-pointer hover:bg-neutral-50">
                            {uploading === colour ? '…' : <><span className="text-lg leading-none">+</span>Upload</>}
                            <input type="file" accept="image/*" multiple className="hidden" disabled={uploading !== null}
                              onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; upload(colour, files, imgs, (images) => setColourImages(colour, images)); }} />
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-neutral-500">No colour attribute — photos are added per row in the matrix.</p>
            )}
          </section>
        )}

        {/* Preview */}
        <section className={`${box} p-4`}>
          <h3 className="text-sm font-bold text-neutral-900 mb-3">Preview <span className="font-normal text-neutral-500 text-xs">(what customers see)</span></h3>
          <div className="aspect-square w-full max-w-[220px] mx-auto rounded-xl bg-neutral-50 border border-neutral-100 overflow-hidden flex items-center justify-center">
            {previewImage ? <img src={previewImage} alt="" className="w-full h-full object-contain" /> : <span className="text-4xl">🛍️</span>}
          </div>
          {productName && <p className="mt-3 text-sm font-semibold text-neutral-900 line-clamp-2">{productName}</p>}
          {axes.map((a) => (
            <div key={a.label} className="mt-3">
              <p className="text-xs font-semibold text-neutral-600 mb-1.5">{a.label}: <span className="text-neutral-900">{pick(a.label)}</span></p>
              <div className="flex flex-wrap gap-1.5">
                {a.values.map((v) => {
                  const hex = isColourAxis(a.label) ? swatch(v) : undefined;
                  const active = pick(a.label) === v;
                  return hex ? (
                    <button key={v} type="button" title={v} onClick={() => setPreview((p) => ({ ...p, [a.label]: v }))}
                      className={`w-7 h-7 rounded-full border ${active ? 'ring-2 ring-offset-1 ring-teal-600' : 'border-neutral-300'}`} style={{ background: hex }} aria-label={v} />
                  ) : (
                    <button key={v} type="button" onClick={() => setPreview((p) => ({ ...p, [a.label]: v }))}
                      className={`min-w-[36px] px-2 py-1 rounded-lg border text-xs font-semibold ${active ? 'border-teal-600 text-teal-800 bg-teal-50' : 'border-neutral-300 text-neutral-700'}`}>
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {previewRow && Number(previewRow.price) > 0 && (
            <div className="mt-3 flex items-baseline gap-2 flex-wrap">
              <span className="text-xl font-bold text-neutral-900">₹{previewSelling}</span>
              {previewOff > 0 && <span className="text-xs text-neutral-400 line-through">₹{previewRow.price}</span>}
              {previewOff > 0 && <span className="text-[11px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">{previewOff}% OFF</span>}
            </div>
          )}
          {previewRow && !previewRow.isActive && <p className="mt-2 text-xs font-semibold text-red-600">This combination is switched off — customers won't see it.</p>}
          {previewRow && axes.length > 0 && !rows.some((r) => r.options.every((o) => pick(o.name) === o.value)) && (
            <p className="mt-2 text-xs text-amber-700">This combination isn't in the matrix.</p>
          )}
        </section>
      </div>
    </div>
  );
}
