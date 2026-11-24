import { useState } from "react";
import { setProductStock } from "../../../services/api/productService";
import { useToast } from "../../../context/ToastContext";

type Row = { id: string; label: string; stock: string };

const variantLabel = (v: any) =>
  [v.title || v.name, v.value].filter(Boolean).join(": ") || v.sku || "Variant";

/** How many units a product has (sum of its variants when it has them). */
export const stockOf = (product: any): number =>
  Array.isArray(product?.variations) && product.variations.length > 0
    ? product.variations.reduce((t: number, v: any) => t + (Number(v.stock) || 0), 0)
    : Number(product?.stock) || 0;

/** Small coloured pill: red when out of stock, amber when 5 or fewer, green otherwise. */
export function StockPill({ product }: { product: any }) {
  const n = stockOf(product);
  const tone = n === 0 ? "bg-red-50 text-red-700 border-red-200" : n <= 5 ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-emerald-50 text-emerald-800 border-emerald-200";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${tone}`}>
      {n === 0 ? "Out of stock" : `${n} in stock`}
    </span>
  );
}

/**
 * Update stock right from the product list: one box for a simple product, one per
 * variant otherwise, with quick +1 / +10 / +50 buttons to add new stock.
 */
export default function StockModal({ product, onClose, onSaved }: { product: any; onClose: () => void; onSaved: (data: any) => void }) {
  const { showToast } = useToast();
  const hasVariants = Array.isArray(product?.variations) && product.variations.length > 0;
  const [rows, setRows] = useState<Row[]>(() =>
    hasVariants
      ? product.variations.map((v: any) => ({ id: String(v._id), label: variantLabel(v), stock: String(Number(v.stock) || 0) }))
      : [{ id: "", label: "Units available", stock: String(Number(product?.stock) || 0) }]
  );
  const [saving, setSaving] = useState(false);

  const setRow = (i: number, value: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, stock: value.replace(/\D/g, "").slice(0, 6) } : r)));
  const add = (i: number, n: number) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, stock: String(Math.min(100000, (Number(r.stock) || 0) + n)) } : r)));

  const total = rows.reduce((t, r) => t + (Number(r.stock) || 0), 0);

  const save = async () => {
    if (rows.some((r) => r.stock === "" || Number(r.stock) > 100000)) {
      showToast("Enter a stock from 0 to 100000 for each line", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await setProductStock(
        product._id,
        hasVariants ? { variations: rows.map((r) => ({ id: r.id, stock: Number(r.stock) })) } : { stock: Number(rows[0].stock) }
      );
      if (res.success) {
        showToast("Stock updated", "success");
        onSaved(res.data);
        onClose();
      } else {
        showToast(res.message || "Could not update stock", "error");
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Could not update stock", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-neutral-200">
          <h3 className="text-base font-bold text-neutral-900">Update stock</h3>
          <p className="text-xs text-neutral-500 line-clamp-1 mt-0.5">{product?.productName}</p>
        </div>

        <div className="px-5 py-3 space-y-3 overflow-y-auto">
          {rows.map((r, i) => (
            <div key={r.id || i} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-neutral-800 truncate">{r.label}</span>
                <input
                  inputMode="numeric"
                  value={r.stock}
                  onChange={(e) => setRow(i, e.target.value)}
                  aria-label={`Stock for ${r.label}`}
                  className="w-24 px-3 py-1.5 rounded-lg border border-neutral-300 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex gap-1.5 justify-end">
                {[1, 10, 50].map((n) => (
                  <button key={n} type="button" onClick={() => add(i, n)}
                    className="px-2.5 py-1 rounded-md border border-teal-200 bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100">
                    +{n}
                  </button>
                ))}
                <button type="button" onClick={() => setRow(i, "0")}
                  className="px-2.5 py-1 rounded-md border border-neutral-200 text-neutral-600 text-xs font-semibold hover:bg-neutral-50">
                  Set 0
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-between gap-3">
          <span className="text-xs text-neutral-600">Total: <b className="text-neutral-900">{total}</b> units</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">
              {saving ? "Saving…" : "Save stock"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
