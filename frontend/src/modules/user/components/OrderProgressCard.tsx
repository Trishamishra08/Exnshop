/**
 * "Order Progress" for a Quick order: the same five steps the delivery partner sees —
 * Pending → Ready for pickup → Picked Up → Out for Delivery → Delivered.
 */
const STEPS = ['Pending', 'Ready for pickup', 'Picked Up', 'Out for Delivery', 'Delivered'];

/** Where the order is in the five steps, from the order's status. */
export const progressIndexOf = (status: string): number => {
  switch (status) {
    case 'Delivered':
    case 'Completed':
      return 4;
    case 'Out for Delivery':
    case 'On the way':
    case 'Shipped':
      return 3;
    case 'Picked up':
      return 2;
    case 'Processed':
      return 1;
    default:
      return 0; // Received, Pending, Accepted
  }
};

export default function OrderProgressCard({ status }: { status: string }) {
  const current = progressIndexOf(status);
  return (
    <div className="mx-4 mt-3 bg-white rounded-2xl p-5 shadow-sm border border-neutral-100">
      <p className="text-neutral-500 text-xs font-medium uppercase tracking-wider mb-1">Process</p>
      <h2 className="text-lg font-bold text-neutral-900 mb-6">Order Progress</h2>

      <div className="relative">
        <div className="flex justify-between mb-2 relative z-10">
          {STEPS.map((step, idx) => (
            <div key={step} className="flex flex-col items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                  idx <= current ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-neutral-200 text-neutral-300'
                }`}
              >
                {idx <= current ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Connecting line, filled up to the current step */}
        <div className="absolute top-4 left-[10%] right-[10%] h-0.5 bg-neutral-100 -z-0">
          <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${(current / (STEPS.length - 1)) * 100}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-neutral-500 font-medium mt-2">
          {STEPS.map((step, idx) => (
            <span key={step} className={`text-center flex-1 transition-colors ${idx === current ? 'text-blue-600 font-bold' : ''}`}>
              {step}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
