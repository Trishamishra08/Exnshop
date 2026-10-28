import { useEffect, useRef, useState } from 'react';
import { getExchangeOptions, type ExchangeOptions } from '../services/api/customerOrderService';

export interface ExchangeExtrasValue {
  variationId: string;
  condition: '' | 'Unused' | 'Defective' | 'Used';
  files: File[];
}

export const EMPTY_EXTRAS: ExchangeExtrasValue = { variationId: '', condition: '', files: [] };

/** Reasons where the customer must show the problem in a photo (matches the server). */
export const reasonNeedsPhoto = (reason: string) => /defect|damag|wrong/i.test(reason);
/** Size/colour reasons where the customer chooses the variant they want. */
export const reasonNeedsVariant = (reason: string) => /size|fit|colo/i.test(reason);

/**
 * Extra exchange details: which size/variant the customer wants, what condition
 * the item is in, and photos. Photos also help when requesting a return.
 */
export default function ExchangeExtras({
  orderId,
  itemId,
  reason,
  isExchange,
  value,
  onChange,
}: {
  orderId: string;
  itemId: string;
  reason: string;
  isExchange: boolean;
  value: ExchangeExtrasValue;
  onChange: (v: ExchangeExtrasValue) => void;
}) {
  const [opts, setOpts] = useState<ExchangeOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isExchange) return;
    setLoading(true);
    getExchangeOptions(orderId, itemId)
      .then(setOpts)
      .catch(() => setOpts(null))
      .finally(() => setLoading(false));
  }, [orderId, itemId, isExchange]);

  const previews = value.files.map((f) => URL.createObjectURL(f));
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p)));

  const needsPhoto = reasonNeedsPhoto(reason);
  const showVariant = isExchange && opts?.canChooseVariant;

  return (
    <div className="space-y-4">
      {showVariant && (
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
            Size / variant you want {reasonNeedsVariant(reason) ? '' : <span className="font-normal normal-case text-gray-400">(optional)</span>}
          </label>
          {loading ? (
            <p className="text-xs text-gray-500">Checking what is in stock…</p>
          ) : opts && opts.options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {opts.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onChange({ ...value, variationId: value.variationId === o.id ? '' : o.id })}
                  className={`px-3.5 py-2 rounded-xl border text-sm font-medium ${value.variationId === o.id ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                >
                  {o.label}
                  {o.stock <= 3 && <span className="ml-1.5 text-[10px] text-amber-600">only {o.stock} left</span>}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
              No other variant is in stock at the same price right now. You can still ask for the same one again, or request a return for a refund.
            </p>
          )}
          {opts?.current && <p className="text-[11px] text-gray-500 mt-1.5">You bought: {opts.current}. Only variants at the same price are offered.</p>}
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Item condition</label>
        <div className="grid grid-cols-3 gap-2">
          {(['Unused', 'Defective', 'Used'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ ...value, condition: value.condition === c ? '' : c })}
              className={`py-2 rounded-xl border text-xs font-semibold ${value.condition === c ? 'border-neutral-900 bg-neutral-50 text-neutral-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {c === 'Unused' ? 'Unused, with tags' : c === 'Defective' ? 'Defective / damaged' : 'Already used'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
          Photos {needsPhoto ? <span className="text-red-500 normal-case">(required for this reason)</span> : <span className="font-normal normal-case text-gray-400">(optional, up to 5)</span>}
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onChange({ ...value, files: [...value.files, ...Array.from(e.target.files || [])].slice(0, 5) })}
        />
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div key={src} className="relative w-16 h-16">
              <img src={src} alt={`Photo ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => onChange({ ...value, files: value.files.filter((_, j) => j !== i) })}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-neutral-900 text-white text-xs leading-none"
              >
                ×
              </button>
            </div>
          ))}
          {value.files.length < 5 && (
            <button type="button" onClick={() => fileRef.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 text-gray-400 text-2xl hover:bg-gray-50">
              +
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
