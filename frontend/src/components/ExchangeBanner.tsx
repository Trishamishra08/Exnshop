/** Shown on a replacement order so everyone sees it is an exchange, not a new sale, and who pays what. */
export default function ExchangeBanner({ info }: { info?: { note: string; payer: 'Customer' | 'Seller'; deliveryCharge: number; collectOldItem: boolean } | null }) {
  if (!info) return null;
  return (
    <div className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-xs text-blue-900 space-y-1">
      <p className="font-bold text-sm">🔄 Exchange / Replacement order</p>
      <p>{info.note}</p>
      {info.payer === 'Seller' && info.deliveryCharge > 0 && (
        <p>Delivery cost ₹{Number(info.deliveryCharge).toFixed(2)} is deducted from the seller because the exchange is due to the seller&apos;s error or a faulty item.</p>
      )}
    </div>
  );
}
