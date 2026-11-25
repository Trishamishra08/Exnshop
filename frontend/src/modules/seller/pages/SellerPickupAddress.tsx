import PickupReturnAddressEditor from '../components/PickupReturnAddressEditor';

/** Seller > Pickup & Return Address. */
export default function SellerPickupAddress() {
  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-3xl space-y-3">
      <h1 className="text-xl font-semibold text-neutral-900">Pickup &amp; Return Address</h1>
      <PickupReturnAddressEditor endpoint="/seller/shipping/addresses" />
    </div>
  );
}
