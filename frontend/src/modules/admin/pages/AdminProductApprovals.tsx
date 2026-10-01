import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProducts, approveProductRequest, Product } from '../../../services/api/admin/adminProductService';
import { useToast } from '../../../context/ToastContext';

export default function AdminProductApprovals() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [rejectTarget, setRejectTarget] = useState<Product | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    const fetchPendingProducts = async () => {
        try {
            setLoading(true);
            setError('');
            const response = await getProducts({ status: 'Pending', limit: 100 });
            if (response.success && response.data) {
                setProducts(response.data);
            } else {
                setError(response.message || 'Failed to fetch pending products');
            }
        } catch (err: any) {
            console.error('Error fetching pending products:', err);
            setError(err.response?.data?.message || 'Failed to fetch pending products');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPendingProducts();
    }, []);

    const handleApprove = async (product: Product) => {
        try {
            setProcessingId(product._id);
            const response = await approveProductRequest(product._id, 'Active');
            if (response.success) {
                setProducts((prev) => prev.filter((p) => p._id !== product._id));
                showToast(`"${product.productName}" approved and is now live.`, 'success');
            } else {
                showToast(response.message || 'Failed to approve product', 'error');
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to approve product', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const openRejectModal = (product: Product) => {
        setRejectTarget(product);
        setRejectReason('');
    };

    const handleReject = async () => {
        if (!rejectTarget) return;
        if (!rejectReason.trim()) {
            showToast('Please enter a rejection reason.', 'error');
            return;
        }
        try {
            setProcessingId(rejectTarget._id);
            const response = await approveProductRequest(rejectTarget._id, 'Rejected', rejectReason.trim());
            if (response.success) {
                setProducts((prev) => prev.filter((p) => p._id !== rejectTarget._id));
                showToast(`"${rejectTarget.productName}" rejected.`, 'success');
                setRejectTarget(null);
            } else {
                showToast(response.message || 'Failed to reject product', 'error');
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to reject product', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const getSellerLabel = (seller: Product['seller']) => {
        if (!seller) return '—';
        if (typeof seller === 'string') return seller;
        return seller.storeName || seller.sellerName || '—';
    };

    const getCategoryLabel = (category: Product['category']) => {
        if (!category) return '—';
        if (typeof category === 'string') return category;
        return category.name || '—';
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <div className="flex-1 p-6">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
                    <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">Product Approvals</h2>
                            <p className="text-sm text-teal-100 mt-1">
                                New products stay hidden from customers until you approve or reject them here.
                            </p>
                        </div>
                        <span className="bg-white/20 text-white text-sm font-semibold px-3 py-1 rounded-full">
                            {products.length} pending
                        </span>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 flex items-center justify-between">
                            <p className="text-sm">{error}</p>
                            <button onClick={() => setError('')} className="text-red-700 hover:text-red-900 ml-4 text-lg font-bold" type="button">×</button>
                        </div>
                    )}

                    {loading ? (
                        <div className="p-8 text-center text-neutral-500">Loading pending products...</div>
                    ) : products.length === 0 ? (
                        <div className="p-12 text-center text-neutral-400">
                            <p className="text-base font-medium">No products waiting for approval.</p>
                            <p className="text-sm mt-1">New seller-submitted products will show up here.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-neutral-50 text-xs font-bold text-neutral-800 border-b border-neutral-200">
                                        <th className="p-4">Product</th>
                                        <th className="p-4">Seller</th>
                                        <th className="p-4">Category</th>
                                        <th className="p-4">Price</th>
                                        <th className="p-4">Submitted</th>
                                        <th className="p-4">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.map((product) => (
                                        <tr key={product._id} className="hover:bg-neutral-50 transition-colors text-sm text-neutral-700 border-b border-neutral-200">
                                            <td className="p-4 align-middle">
                                                <button
                                                    onClick={() => navigate(`/admin/product/edit/${product._id}`)}
                                                    className="flex items-center gap-3 text-left hover:text-teal-700"
                                                >
                                                    <img
                                                        src={product.mainImage || '/api/placeholder/40/40'}
                                                        alt={product.productName}
                                                        className="w-10 h-10 object-cover rounded border border-neutral-200"
                                                    />
                                                    <span className="font-medium">{product.productName}</span>
                                                </button>
                                            </td>
                                            <td className="p-4 align-middle">{getSellerLabel(product.seller)}</td>
                                            <td className="p-4 align-middle">{getCategoryLabel(product.category)}</td>
                                            <td className="p-4 align-middle">₹{product.price}</td>
                                            <td className="p-4 align-middle text-xs text-neutral-500">
                                                {product.createdAt ? new Date(product.createdAt).toLocaleDateString('en-GB') : '—'}
                                            </td>
                                            <td className="p-4 align-middle">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleApprove(product)}
                                                        disabled={processingId === product._id}
                                                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => openRejectModal(product)}
                                                        disabled={processingId === product._id}
                                                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {rejectTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setRejectTarget(null)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-red-600 text-white px-6 py-4 rounded-t-lg">
                            <h3 className="text-lg font-semibold">Reject Product</h3>
                            <p className="text-sm text-red-100 mt-1">{rejectTarget.productName}</p>
                        </div>
                        <div className="p-6">
                            <label className="block text-sm font-medium text-neutral-700 mb-2">
                                Rejection Reason <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                rows={4}
                                placeholder="Explain why this product is being rejected — the seller will see this."
                                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                                autoFocus
                            />
                        </div>
                        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
                            <button
                                onClick={() => setRejectTarget(null)}
                                className="px-4 py-2 border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={processingId === rejectTarget._id}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {processingId === rejectTarget._id ? 'Rejecting...' : 'Reject Product'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
