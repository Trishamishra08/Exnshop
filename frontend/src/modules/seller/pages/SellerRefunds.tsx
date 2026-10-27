import { useEffect, useState } from 'react';
import { getMyRefundRequests, type RefundRequestRow } from '../../../services/api/shippingMethodService';
import { useToast } from '../../../context/ToastContext';

const STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-amber-100 text-amber-800',
  Processing: 'bg-blue-100 text-blue-800',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-700',
  Failed: 'bg-red-100 text-red-700',
};

const STATUS_TEXT: Record<string, string> = {
  Pending: 'Waiting for admin',
  Processing: 'Processing',
  Approved: 'Refunded',
  Rejected: 'Declined',
  Failed: 'Could not complete',
};

export default function SellerRefunds() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<RefundRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyRefundRequests()
      .then(setRows)
      .catch(() => showToast('Failed to load refund requests', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 sm:p-6">
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="bg-teal-600 text-white px-4 sm:px-6 py-3">
          <h2 className="text-lg font-semibold">Refunds</h2>
          <p className="text-sm text-teal-100 mt-1">Refunds you asked for on delivered orders. To start one, open a delivered order and choose Refund order.</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-neutral-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-neutral-400">No refund requests yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-neutral-50 text-xs font-bold text-neutral-800 border-b border-neutral-200">
                  <th className="p-4">Order</th>
                  <th className="p-4">Item</th>
                  <th className="p-4">Reason</th>
                  <th className="p-4">Refund</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Asked on</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="border-b border-neutral-200 align-top text-neutral-700">
                    <td className="p-4 font-medium text-neutral-900">{r.orderNumber}</td>
                    <td className="p-4">{r.productName} <span className="text-neutral-400">× {r.quantity}</span></td>
                    <td className="p-4">
                      {r.reason}
                      {r.noteToSelf && <p className="text-xs text-neutral-400 mt-1">Your note: {r.noteToSelf}</p>}
                    </td>
                    <td className="p-4 whitespace-nowrap">₹{r.refundAmount.toFixed(2)}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status]}`}>{STATUS_TEXT[r.status]}</span>
                      {r.adminNote && <p className="text-xs text-neutral-500 mt-1 max-w-[220px]">Admin: {r.adminNote}</p>}
                      {r.status === 'Failed' && r.failureReason && <p className="text-xs text-red-600 mt-1 max-w-[220px]">{r.failureReason}</p>}
                    </td>
                    <td className="p-4 whitespace-nowrap text-xs text-neutral-500">{new Date(r.createdAt).toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
