import { useState, useEffect } from 'react';
import { getAllClaims, decideClaim } from '../../../services/api/admin/adminClaimService';
import { Claim } from '../../../services/api/claimService';
import { useToast } from '../../../context/ToastContext';

export default function AdminClaims() {
    const { showToast } = useToast();
    const [claims, setClaims] = useState<Claim[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [reviewTarget, setReviewTarget] = useState<Claim | null>(null);
    const [approvedAmount, setApprovedAmount] = useState('');
    const [decisionReason, setDecisionReason] = useState('');
    const [processing, setProcessing] = useState(false);

    const fetchClaims = async () => {
        try {
            setLoading(true);
            const response = await getAllClaims(statusFilter || undefined);
            if (response.success && response.data) setClaims(response.data);
        } catch (err) {
            showToast('Failed to load claims', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClaims();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter]);

    const openReview = (claim: Claim) => {
        setReviewTarget(claim);
        setApprovedAmount(String(claim.claimAmount));
        setDecisionReason('');
    };

    const handleDecision = async (status: 'Approved' | 'Rejected') => {
        if (!reviewTarget) return;
        if (status === 'Rejected' && !decisionReason.trim()) {
            showToast('Please provide a reason for rejection', 'error');
            return;
        }
        try {
            setProcessing(true);
            const response = await decideClaim(
                reviewTarget._id,
                status,
                status === 'Approved' ? Number(approvedAmount) : undefined,
                decisionReason.trim() || undefined
            );
            if (response.success) {
                showToast(`Claim ${status.toLowerCase()}`, 'success');
                setReviewTarget(null);
                fetchClaims();
            } else {
                showToast(response.message || 'Failed to update claim', 'error');
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update claim', 'error');
        } finally {
            setProcessing(false);
        }
    };

    const getSellerLabel = (seller: Claim['seller']) => {
        if (typeof seller === 'string') return seller;
        return seller?.storeName || seller?.sellerName || '—';
    };

    const statusBadge = (status: Claim['status']) => {
        const styles: Record<Claim['status'], string> = {
            Raised: 'bg-blue-100 text-blue-800',
            'Under Review': 'bg-amber-100 text-amber-800',
            Approved: 'bg-green-100 text-green-800',
            Rejected: 'bg-red-100 text-red-800',
        };
        return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>{status}</span>;
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <div className="flex-1 p-6">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
                    <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <h2 className="text-lg font-semibold">Disputes & Claims</h2>
                            <p className="text-sm text-teal-100 mt-1">Review seller-raised claims for RTO damage, missing returns, or settlement disputes.</p>
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-1.5 rounded text-sm bg-white text-neutral-800"
                        >
                            <option value="">All Statuses</option>
                            <option value="Raised">Raised</option>
                            <option value="Under Review">Under Review</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                        </select>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center text-neutral-500">Loading claims...</div>
                    ) : claims.length === 0 ? (
                        <div className="p-12 text-center text-neutral-400">No claims found.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-neutral-50 text-xs font-bold text-neutral-800 border-b border-neutral-200">
                                        <th className="p-4">Seller</th>
                                        <th className="p-4">Order</th>
                                        <th className="p-4">Reason</th>
                                        <th className="p-4">Requested</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {claims.map((claim) => (
                                        <tr key={claim._id} className="hover:bg-neutral-50 transition-colors text-sm text-neutral-700 border-b border-neutral-200">
                                            <td className="p-4 align-middle">{getSellerLabel(claim.seller)}</td>
                                            <td className="p-4 align-middle">{claim.orderNumber || claim.order}</td>
                                            <td className="p-4 align-middle">{claim.reason}</td>
                                            <td className="p-4 align-middle">₹{claim.claimAmount}</td>
                                            <td className="p-4 align-middle">{statusBadge(claim.status)}</td>
                                            <td className="p-4 align-middle">
                                                {(claim.status === 'Raised' || claim.status === 'Under Review') ? (
                                                    <button
                                                        onClick={() => openReview(claim)}
                                                        className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded transition-colors"
                                                    >
                                                        Review
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-neutral-400">Decided</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {reviewTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setReviewTarget(null)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg">
                            <h3 className="text-lg font-semibold">Review Claim</h3>
                            <p className="text-sm text-teal-100 mt-1">Order {reviewTarget.orderNumber || reviewTarget.order}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <p className="text-xs text-neutral-500">Reason</p>
                                <p className="text-sm font-medium text-neutral-800">{reviewTarget.reason}</p>
                            </div>
                            {reviewTarget.description && (
                                <div>
                                    <p className="text-xs text-neutral-500">Description</p>
                                    <p className="text-sm text-neutral-700">{reviewTarget.description}</p>
                                </div>
                            )}
                            {reviewTarget.photos.length > 0 && (
                                <div>
                                    <p className="text-xs text-neutral-500 mb-2">Evidence Photos</p>
                                    <div className="flex gap-2 flex-wrap">
                                        {reviewTarget.photos.map((photo, idx) => (
                                            <a key={idx} href={photo} target="_blank" rel="noreferrer">
                                                <img src={photo} alt={`Evidence ${idx + 1}`} className="w-16 h-16 object-cover rounded border border-neutral-200" />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">Approved Amount (₹)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={approvedAmount}
                                    onChange={(e) => setApprovedAmount(e.target.value)}
                                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                />
                                <p className="text-xs text-neutral-400 mt-1">Requested: ₹{reviewTarget.claimAmount}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">
                                    Decision Note <span className="text-xs text-neutral-400">(required if rejecting)</span>
                                </label>
                                <textarea
                                    value={decisionReason}
                                    onChange={(e) => setDecisionReason(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
                            <button
                                onClick={() => setReviewTarget(null)}
                                className="px-4 py-2 border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDecision('Rejected')}
                                disabled={processing}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                Reject
                            </button>
                            <button
                                onClick={() => handleDecision('Approved')}
                                disabled={processing}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                Approve
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
