import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    getProducts,
    approveProductRequest,
    getProductRevisions,
    decideProductRevision,
    getProductAuditLog,
    Product,
    ProductRevisionRow,
    ProductAuditEntry,
} from '../../../services/api/admin/adminProductService';
import { useToast } from '../../../context/ToastContext';

type Tab = 'new' | 'edits';

const FIELD_LABELS: Record<string, string> = {
    productName: 'Name',
    smallDescription: 'Short description',
    description: 'Description',
    category: 'Category',
    subcategory: 'Subcategory',
    subSubCategory: 'Sub-subcategory',
    headerCategoryId: 'Header category',
    brand: 'Brand',
    mainImage: 'Main image',
    galleryImages: 'Gallery images',
    manufacturer: 'Manufacturer',
    madeIn: 'Made in',
    fssaiLicNo: 'FSSAI license',
    variationType: 'Variation type',
    tax: 'Tax',
    isReturnable: 'Returnable',
    maxReturnDays: 'Max return days',
    returnPolicyText: 'Return policy',
    isShopByStoreOnly: 'Shop-by-store only',
    shopId: 'Shop',
};

const ACTION_LABELS: Record<string, string> = {
    CREATED_DRAFT: 'Saved as draft',
    CREATED_BULK: 'Created by bulk upload',
    SUBMITTED: 'Submitted for review',
    RESUBMITTED: 'Resubmitted for review',
    APPROVED: 'Approved',
    REJECTED: 'Sent back with changes needed',
    UPDATED: 'Updated',
    VISIBILITY_CHANGED: 'Visibility changed',
    REVISION_SUBMITTED: 'Edits submitted for review',
    REVISION_WITHDRAWN: 'Edits withdrawn',
    REVISION_APPROVED: 'Edits approved',
    REVISION_REJECTED: 'Edits rejected',
    DELETED: 'Deleted',
};

const isImageField = (field: string) => field === 'mainImage';

const formatValue = (field: string, value: any): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return `${value.length} image${value.length === 1 ? '' : 's'}`;
    if (typeof value === 'object') return value.name || value._id || JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
};

export default function AdminProductApprovals() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [tab, setTab] = useState<Tab>('new');
    const [products, setProducts] = useState<Product[]>([]);
    const [revisions, setRevisions] = useState<ProductRevisionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string; kind: Tab } | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [historyTarget, setHistoryTarget] = useState<{ id: string; name: string } | null>(null);
    const [history, setHistory] = useState<ProductAuditEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const [pending, edits] = await Promise.all([
                getProducts({ status: 'Pending', limit: 100 }),
                getProductRevisions(),
            ]);
            if (pending.success && pending.data) setProducts(pending.data);
            else setError(pending.message || 'Failed to fetch pending products');
            if (edits.success && edits.data) setRevisions(edits.data);
        } catch (err: any) {
            console.error('Error fetching approvals:', err);
            setError(err.response?.data?.message || 'Failed to fetch approvals');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

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

    const handleApproveRevision = async (row: ProductRevisionRow) => {
        try {
            setProcessingId(row._id);
            const response = await decideProductRevision(row._id, 'Approved');
            if (response.success) {
                setRevisions((prev) => prev.filter((r) => r._id !== row._id));
                showToast(`Edits to "${row.productName}" approved and applied.`, 'success');
            } else {
                showToast(response.message || 'Failed to approve edits', 'error');
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to approve edits', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async () => {
        if (!rejectTarget) return;
        if (!rejectReason.trim()) {
            showToast('Please enter a reason.', 'error');
            return;
        }
        try {
            setProcessingId(rejectTarget.id);
            const response =
                rejectTarget.kind === 'new'
                    ? await approveProductRequest(rejectTarget.id, 'Rejected', rejectReason.trim())
                    : await decideProductRevision(rejectTarget.id, 'Rejected', rejectReason.trim());
            if (response.success) {
                if (rejectTarget.kind === 'new') setProducts((prev) => prev.filter((p) => p._id !== rejectTarget.id));
                else setRevisions((prev) => prev.filter((r) => r._id !== rejectTarget.id));
                showToast(rejectTarget.kind === 'new' ? `"${rejectTarget.name}" sent back to the seller.` : 'Edits rejected.', 'success');
                setRejectTarget(null);
            } else {
                showToast(response.message || 'Failed to save decision', 'error');
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to save decision', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const openHistory = async (id: string, name: string) => {
        setHistoryTarget({ id, name });
        setHistory([]);
        setHistoryLoading(true);
        try {
            const res = await getProductAuditLog(id);
            if (res.success && res.data) setHistory(res.data);
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to load history', 'error');
        } finally {
            setHistoryLoading(false);
        }
    };

    const sellerLabel = (seller: any) => {
        if (!seller) return '—';
        if (typeof seller === 'string') return seller;
        return seller.storeName || seller.sellerName || '—';
    };

    const categoryLabel = (category: Product['category']) => {
        if (!category) return '—';
        if (typeof category === 'string') return category;
        return category.name || '—';
    };

    const empty = (title: string, hint: string) => (
        <div className="p-12 text-center text-neutral-400">
            <p className="text-base font-medium">{title}</p>
            <p className="text-sm mt-1">{hint}</p>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <div className="flex-1 p-6">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
                    <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg">
                        <h2 className="text-lg font-semibold">Product Approvals</h2>
                        <p className="text-sm text-teal-100 mt-1">
                            New products stay hidden from customers until you approve them. Edits to a live product's details wait here too,
                            while the approved version stays live.
                        </p>
                    </div>

                    <div className="flex border-b border-neutral-200 px-4">
                        {([
                            { key: 'new', label: 'New products', count: products.length },
                            { key: 'edits', label: 'Edited listings', count: revisions.length },
                        ] as const).map((t) => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={`px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                                    tab === t.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-neutral-500 hover:text-neutral-800'
                                }`}
                            >
                                {t.label}
                                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${t.count ? 'bg-teal-100 text-teal-800' : 'bg-neutral-100 text-neutral-500'}`}>
                                    {t.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 flex items-center justify-between">
                            <p className="text-sm">{error}</p>
                            <button onClick={() => setError('')} className="text-red-700 hover:text-red-900 ml-4 text-lg font-bold" type="button">×</button>
                        </div>
                    )}

                    {loading ? (
                        <div className="p-8 text-center text-neutral-500">Loading...</div>
                    ) : tab === 'new' ? (
                        products.length === 0 ? (
                            empty('No products waiting for approval.', 'New seller-submitted products will show up here.')
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-neutral-50 text-xs font-bold text-neutral-800 border-b border-neutral-200">
                                            <th className="p-4">Product</th>
                                            <th className="p-4">Seller</th>
                                            <th className="p-4">Category</th>
                                            <th className="p-4">SKU</th>
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
                                                <td className="p-4 align-middle">{sellerLabel(product.seller)}</td>
                                                <td className="p-4 align-middle">{categoryLabel(product.category)}</td>
                                                <td className="p-4 align-middle text-xs font-mono text-neutral-500">{product.sku || '—'}</td>
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
                                                            onClick={() => { setRejectTarget({ id: product._id, name: product.productName, kind: 'new' }); setRejectReason(''); }}
                                                            disabled={processingId === product._id}
                                                            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
                                                            title="Send back to the seller with what to fix"
                                                        >
                                                            Send back
                                                        </button>
                                                        <button
                                                            onClick={() => openHistory(product._id, product.productName)}
                                                            className="px-2 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded"
                                                        >
                                                            History
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    ) : revisions.length === 0 ? (
                        empty('No edited listings waiting.', "When a seller changes a live product's name, images, category and so on, it appears here.")
                    ) : (
                        <div className="divide-y divide-neutral-200">
                            {revisions.map((row) => (
                                <div key={row._id} className="p-4 sm:p-5">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <img
                                                src={row.mainImage || '/api/placeholder/40/40'}
                                                alt={row.productName}
                                                className="w-12 h-12 object-cover rounded border border-neutral-200"
                                            />
                                            <div className="min-w-0">
                                                <p className="font-semibold text-neutral-900 truncate">{row.productName}</p>
                                                <p className="text-xs text-neutral-500">
                                                    {sellerLabel(row.seller)}
                                                    {row.submittedAt ? ` · edited ${new Date(row.submittedAt).toLocaleString('en-GB')}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleApproveRevision(row)}
                                                disabled={processingId === row._id}
                                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded disabled:opacity-50"
                                            >
                                                Approve edits
                                            </button>
                                            <button
                                                onClick={() => { setRejectTarget({ id: row._id, name: row.productName, kind: 'edits' }); setRejectReason(''); }}
                                                disabled={processingId === row._id}
                                                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded disabled:opacity-50"
                                            >
                                                Reject edits
                                            </button>
                                            <button
                                                onClick={() => openHistory(row._id, row.productName)}
                                                className="px-2 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded"
                                            >
                                                History
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-3 overflow-x-auto">
                                        <table className="w-full text-sm border border-neutral-200 rounded">
                                            <thead>
                                                <tr className="bg-neutral-50 text-xs font-semibold text-neutral-600">
                                                    <th className="p-2 text-left w-40">Field</th>
                                                    <th className="p-2 text-left">Live now</th>
                                                    <th className="p-2 text-left">Seller wants</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {row.changes.map((c) => (
                                                    <tr key={c.field} className="border-t border-neutral-100 align-top">
                                                        <td className="p-2 font-medium text-neutral-700">{FIELD_LABELS[c.field] || c.field}</td>
                                                        <td className="p-2 text-neutral-500">
                                                            {isImageField(c.field) && c.from ? <img src={c.from} alt="" className="w-14 h-14 object-cover rounded border" /> : formatValue(c.field, c.from)}
                                                        </td>
                                                        <td className="p-2 text-neutral-900">
                                                            {isImageField(c.field) && c.to ? <img src={c.to} alt="" className="w-14 h-14 object-cover rounded border" /> : formatValue(c.field, c.to)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {rejectTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setRejectTarget(null)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-orange-600 text-white px-6 py-4 rounded-t-lg">
                            <h3 className="text-lg font-semibold">{rejectTarget.kind === 'new' ? 'Send back to seller' : 'Reject edits'}</h3>
                            <p className="text-sm text-orange-100 mt-1">{rejectTarget.name}</p>
                        </div>
                        <div className="p-6">
                            <label className="block text-sm font-medium text-neutral-700 mb-2">
                                What needs to change? <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                rows={4}
                                placeholder="Explain what the seller should fix. They will see this and can resubmit."
                                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
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
                                disabled={processingId === rejectTarget.id}
                                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {processingId === rejectTarget.id ? 'Saving...' : rejectTarget.kind === 'new' ? 'Send back' : 'Reject edits'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {historyTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => setHistoryTarget(null)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg flex items-start justify-between">
                            <div>
                                <h3 className="text-lg font-semibold">History</h3>
                                <p className="text-sm text-teal-100 mt-1">{historyTarget.name}</p>
                            </div>
                            <button onClick={() => setHistoryTarget(null)} className="text-white text-xl leading-none" type="button">×</button>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-3">
                            {historyLoading ? (
                                <p className="text-sm text-neutral-500 text-center py-6">Loading...</p>
                            ) : history.length === 0 ? (
                                <p className="text-sm text-neutral-400 text-center py-6">No recorded activity yet.</p>
                            ) : (
                                history.map((h) => (
                                    <div key={h._id} className="border-l-2 border-teal-500 pl-3">
                                        <p className="text-sm font-semibold text-neutral-800">{ACTION_LABELS[h.action] || h.action}</p>
                                        <p className="text-xs text-neutral-500">
                                            {h.actorName || h.actorType} · {new Date(h.createdAt).toLocaleString('en-GB')}
                                        </p>
                                        {h.remarks && <p className="text-xs text-neutral-700 mt-1">“{h.remarks}”</p>}
                                        {(h.changes || []).slice(0, 6).map((c, i) => (
                                            <p key={i} className="text-xs text-neutral-500 mt-0.5 break-words">
                                                {FIELD_LABELS[c.field] || c.field}: {c.from ? `${c.from} → ` : ''}{c.to || '—'}
                                            </p>
                                        ))}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
