import { useCallback, useEffect, useState } from 'react';
import api from '../../../services/api/config';
import CustomerPayoutModal from '../components/CustomerPayoutModal';

/**
 * Customers who changed or added bank details and are waiting for admin approval.
 * "Review" opens the customer's bank window: new details, bank proof, Approve / Reject.
 */
interface BankRequest {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  pendingBankChange?: {
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
    upiId?: string;
    submittedAt?: string;
  };
}

const mask = (n?: string) => (n ? `••••${n.slice(-4)}` : '—');

export default function AdminBankRequests() {
  const [rows, setRows] = useState<BankRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewId, setReviewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/customers', { params: { bankPending: 'true', limit: 100 } });
      setRows(res.data?.data || []);
      setError('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not load bank change requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="bg-teal-600 text-white px-6 py-4">
          <h2 className="text-lg font-semibold">Bank Change Requests</h2>
          <p className="text-sm text-teal-100 mt-1">
            Customers who added or changed their bank details. Their current details stay active until you approve the new ones.
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-neutral-500">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-neutral-400">No bank changes waiting for approval.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="text-left p-3">Customer</th>
                  <th className="text-left p-3">Contact</th>
                  <th className="text-left p-3">New bank details</th>
                  <th className="text-left p-3">Requested</th>
                  <th className="text-right p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const b = c.pendingBankChange || {};
                  return (
                    <tr key={c._id} className="border-t border-neutral-100">
                      <td className="p-3 font-medium text-neutral-800">{c.name}</td>
                      <td className="p-3 text-neutral-600">
                        <div>{c.email}</div>
                        <div className="text-xs text-neutral-400">{c.phone}</div>
                      </td>
                      <td className="p-3 text-neutral-700">
                        <div>{b.accountHolderName || '—'} · {b.bankName || '—'}</div>
                        <div className="text-xs text-neutral-500">A/c {mask(b.accountNumber)} · IFSC {b.ifscCode || '—'}{b.upiId ? ` · UPI ${b.upiId}` : ''}</div>
                      </td>
                      <td className="p-3 text-neutral-500 whitespace-nowrap">
                        {b.submittedAt ? new Date(b.submittedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setReviewId(c._id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {reviewId && (
        <CustomerPayoutModal
          customerId={reviewId}
          onClose={() => { setReviewId(null); load(); }}
        />
      )}
    </div>
  );
}
