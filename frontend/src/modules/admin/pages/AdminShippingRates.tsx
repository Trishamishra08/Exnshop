import { useEffect, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import { getShippingRates, updateShippingRates, type ShippingRates } from '../../../services/api/shippingMethodService';

const FIELDS: { key: keyof ShippingRates; label: string; hint: string; unit: string }[] = [
  { key: 'baseCharge', label: 'Base charge', hint: 'Charged for a parcel up to the base weight', unit: '₹' },
  { key: 'baseWeightGrams', label: 'Base weight', hint: 'Weight covered by the base charge', unit: 'g' },
  { key: 'perExtraSlabCharge', label: 'Extra charge per slab', hint: 'Added for each extra slab, or part of one, above the base weight', unit: '₹' },
  { key: 'slabGrams', label: 'Slab size', hint: 'Weight of one extra slab', unit: 'g' },
  { key: 'volumetricDivisor', label: 'Volumetric divisor', hint: 'Length × width × height (cm) ÷ this = volumetric kg. Couriers commonly use 5000', unit: '' },
];

export default function AdminShippingRates() {
  const { showToast } = useToast();
  const [rates, setRates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getShippingRates()
      .then((r) => setRates(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))))
      .catch(() => showToast('Failed to load shipping rates', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body = Object.fromEntries(FIELDS.map((f) => [f.key, Number(rates[f.key])]));
      await updateShippingRates(body as Partial<ShippingRates>);
      showToast('Shipping rates saved', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const base = Number(rates.baseCharge) || 0;
  const baseW = Number(rates.baseWeightGrams) || 0;
  const per = Number(rates.perExtraSlabCharge) || 0;
  const slab = Number(rates.slabGrams) || 1;
  const example = (g: number) => base + Math.ceil(Math.max(0, g - baseW) / slab) * per;

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
        <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg">
          <h2 className="text-lg font-semibold">Shipping Rates</h2>
          <p className="text-sm text-teal-100 mt-1">
            What sellers are charged for courier shipping: on company-shipped orders when delivered, and on the pickup of a customer return.
          </p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-neutral-500">Loading…</div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">{f.label}{f.unit && <span className="text-neutral-400"> ({f.unit})</span>}</label>
                  <input
                    type="number"
                    min="0"
                    value={rates[f.key] ?? ''}
                    onChange={(e) => setRates((r) => ({ ...r, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="text-xs text-neutral-400 mt-1">{f.hint}</p>
                </div>
              ))}
            </div>
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-700">
              <p className="font-medium mb-1">With these rates</p>
              <p>500 g parcel: ₹{example(500)} · 1 kg: ₹{example(1000)} · 2.5 kg: ₹{example(2500)} · 5 kg: ₹{example(5000)}</p>
            </div>
            <p className="text-xs text-neutral-500">Sellers who ship themselves pay their own courier and are not charged the outbound rate. Changes apply to orders delivered and returns completed after you save.</p>
            <button onClick={save} disabled={saving} className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving…' : 'Save rates'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
