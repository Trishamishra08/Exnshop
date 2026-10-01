import { useState, useEffect } from 'react';
import { getMyClaims, raiseClaim, Claim } from '../../../services/api/claimService';
import { uploadImages } from '../../../services/api/uploadService';
import { useToast } from '../../../context/ToastContext';

export default function SellerClaims() {
    const { showToast } = useToast();
    const [claims, setClaims] = useState<Claim[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    const [orderId, setOrderId] = useState('');
    const [reason, setReason] = useState('');
    const [description, setDescription] = useState('');
    const [claimAmount, setClaimAmount] = useState('');
    const [photoFiles, setPhotoFiles] = useState<File[]>([]);

    const fetchClaims = async () => {
        try {
            setLoading(true);
            const response = await getMyClaims();
            if (response.success && response.data) setClaims(response.data);
        } catch (err) {
            showToast('Failed to load claims', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClaims();
    }, []);

    const resetForm = () => {
        setOrderId('');
        setReason('');
        setDescription('');
        setClaimAmount('');
        setPhotoFiles([]);
    };

    const handleSubmit = async () => {
        if (!orderId.trim() || !reason.trim() || !claimAmount) {
            showToast('Order ID, reason and claim amount are required', 'error');
            return;
        }
        try {
            setSaving(true);
            let photos: string[] = [];
            if (photoFiles.length > 0) {
                const uploaded = await uploadImages(photoFiles, 'exnshop/claims');
                photos = uploaded.map((u) => u.secureUrl);
            }
            const response = await raiseClaim({
                orderId: orderId.trim(),
                reason: reason.trim(),
                description: description.trim() || undefined,
                claimAmount: Number(claimAmount),
                photos,
            });
            if (response.success) {
                showToast('Claim raised successfully', 'success');
                setIsModalOpen(false);
                resetForm();
                fetchClaims();
            } else {
                showToast(response.message || 'Failed to raise claim', 'error');
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to raise claim', 'error');
        } finally {
            setSaving(false);
        }
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
        <div className="flex flex-col h-full">
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
                <div className="bg-teal-600 text-white px-4 sm:px-6 py-3 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">Disputes & Claims</h2>
                        <p className="text-sm text-teal-100 mt-1">Raise a claim for damaged/missing returns, wrongly deducted settlements, or RTO disputes.</p>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-white text-teal-700 hover:bg-teal-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                    >
                        + Raise Claim
                    </button>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-neutral-500">Loading claims...</div>
                ) : claims.length === 0 ? (
                    <div className="p-12 text-center text-neutral-400">No claims raised yet.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-neutral-50 text-xs font-bold text-neutral-800 border-b border-neutral-200">
                                    <th className="p-4">Order</th>
                                    <th className="p-4">Reason</th>
                                    <th className="p-4">Requested</th>
                                    <th className="p-4">Approved</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Raised</th>
                                </tr>
                            </thead>
                            <tbody>
                                {claims.map((claim) => (
                                    <tr key={claim._id} className="hover:bg-neutral-50 transition-colors text-sm text-neutral-700 border-b border-neutral-200">
                                        <td className="p-4 align-middle font-medium">{claim.orderNumber || claim.order}</td>
                                        <td className="p-4 align-middle">
                                            <div>{claim.reason}</div>
                                            {claim.status === 'Rejected' && claim.adminDecisionReason && (
                                                <div className="text-xs text-red-600 mt-1">Admin: {claim.adminDecisionReason}</div>
                                            )}
                                        </td>
                                        <td className="p-4 align-middle">₹{claim.claimAmount}</td>
                                        <td className="p-4 align-middle">{claim.approvedAmount !== undefined ? `₹${claim.approvedAmount}` : '—'}</td>
                                        <td className="p-4 align-middle">{statusBadge(claim.status)}</td>
                                        <td className="p-4 align-middle text-xs text-neutral-500">
                                            {new Date(claim.createdAt).toLocaleDateString('en-GB')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg">
                            <h3 className="text-lg font-semibold">Raise a Claim</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">Order ID / Number</label>
                                <input
                                    type="text"
                                    value={orderId}
                                    onChange={(e) => setOrderId(e.target.value)}
                                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                    placeholder="Order ID from Orders page"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">Reason</label>
                                <select
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 bg-white"
                                >
                                    <option value="">Select a reason</option>
                                    <option value="Damaged in RTO">Damaged in RTO</option>
                                    <option value="Missing item in return">Missing item in return</option>
                                    <option value="Wrong product returned">Wrong product returned</option>
                                    <option value="Incorrect settlement deduction">Incorrect settlement deduction</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                    placeholder="Explain what happened"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">Claim Amount (₹)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={claimAmount}
                                    onChange={(e) => setClaimAmount(e.target.value)}
                                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">Evidence Photos</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))}
                                    className="text-sm text-neutral-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-teal-600 file:text-white file:text-sm file:font-medium hover:file:bg-teal-700 file:cursor-pointer cursor-pointer"
                                />
                                {photoFiles.length > 0 && (
                                    <p className="text-xs text-neutral-500 mt-1">{photoFiles.length} photo(s) selected</p>
                                )}
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={saving}
                                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {saving ? 'Submitting...' : 'Submit Claim'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
