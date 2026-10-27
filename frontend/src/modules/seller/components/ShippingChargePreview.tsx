import { useEffect, useState } from 'react';
import { getShippingChargePreview, type ShippingChargePreview as Preview } from '../../../services/api/shippingMethodService';

/** Shows the courier shipping charge for this product as the seller fills in weight and size. */
export default function ShippingChargePreview({ weightGrams, length, width, height }: { weightGrams: string; length: string; width: string; height: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (!(Number(weightGrams) > 0)) {
      setPreview(null);
      return;
    }
    const t = setTimeout(() => {
      getShippingChargePreview({ weightGrams, length, width, height })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(t);
  }, [weightGrams, length, width, height]);

  if (!preview) return null;

  return (
    <div className={`rounded-xl border p-3 text-xs leading-relaxed ${preview.sellerPays ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>
      {preview.sellerPays ? (
        <>
          <p className="font-bold text-sm">Shipping charge: ₹{preview.charge.toFixed(2)} per parcel</p>
          <p className="mt-1">
            Exnshop books and pays the courier for you, and this charge is deducted from your earnings when the order is delivered.
            Based on {preview.chargeableGrams} g (the larger of actual and volumetric weight).
          </p>
          <p className="mt-1">If the customer never receives the parcel, no shipping is charged. If the customer returns it after delivery, the return pickup is charged to you as well.</p>
        </>
      ) : (
        <>
          <p className="font-bold text-sm">You ship this yourself</p>
          <p className="mt-1">You pay your own courier, so Exnshop deducts no shipping charge. (Company rate for this parcel would be ₹{preview.charge.toFixed(2)}.) If a customer returns an item, the return pickup booked by Exnshop is charged to you.</p>
        </>
      )}
    </div>
  );
}
