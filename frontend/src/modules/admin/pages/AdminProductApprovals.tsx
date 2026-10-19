import { useState, useEffect, useCallback } from 'react';
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
import {
    ProductReviewDetails,
    getComplianceDocUrlAdmin,
    getProductReviewDetails,
    reviewComplianceDoc,
    startProductReview,
} from '../../../services/api/admin/adminListingService';
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

// Every product field the review window already presents somewhere, plus internal bookkeeping.
// Anything not in this list is shown under "Other submitted fields", so a field added to
// products later can never be silently missing from the review.
const SHOWN_PRODUCT_FIELDS = new Set([
    '_id', 'id', '__v', 'seller', 'productName', 'status', 'publish', 'headerCategoryId', 'category', 'subcategory',
    'subSubCategory', 'brand', 'condition', 'modelNumber', 'barcode', 'sku', 'hsnCode', 'handlingTimeDays', 'weightGrams',
    'dimensionsCm', 'isReturnable', 'maxReturnDays', 'tax', 'totalAllowedQuantity', 'manufacturer', 'madeIn', 'marketer',
    'pack', 'shelfLife', 'fssaiLicNo', 'isShopByStoreOnly', 'shopId', 'popular', 'dealOfDay', 'listingMethod', 'createdAt',
    'updatedAt', 'smallDescription', 'description', 'attributes', 'tags', 'seoTitle', 'seoKeywords', 'seoDescription',
    'seoImageAlt', 'returnPolicyText', 'mainImage', 'galleryImages', 'variations', 'complianceDocs', 'variationType',
    'price', 'discPrice', 'compareAtPrice', 'discount', 'stock', 'rating', 'reviewsCount', 'commission', 'listingVersion',
    'approvedAt', 'approvedBy', 'rejectionReason', 'pendingRevision', 'translations', 'requiresApproval', 'mrp',
    'qualityFlags', 'reviewStartedAt', 'reviewStartedBy', 'reviewStartedByName', 'mainImageUrl', 'galleryImageUrls',
]);

const humanize = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const otherProductFields = (product: any): Array<[string, any]> =>
    Object.entries(product || {})
        .filter(([k, v]) => !SHOWN_PRODUCT_FIELDS.has(k) && v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => [
            humanize(k),
            typeof v === 'boolean' ? (v ? 'Yes' : 'No') : Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : typeof v === 'object' ? (v as any).name || JSON.stringify(v) : String(v),
        ]);

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">{title}</p>
            {children}
        </div>
    );
}

function FactGrid({ facts, cols = 'sm:grid-cols-3' }: { facts: Array<[string, any]>; cols?: string }) {
    if (!facts.length) return null;
    return (
        <div className={`grid grid-cols-2 ${cols} gap-x-6 gap-y-2 text-xs`}>
            {facts.map(([k, v]) => (
                <div key={k} className="min-w-0">
                    <p className="text-neutral-400">{k}</p>
                    <p className="font-medium text-neutral-800 break-words">{v === undefined || v === null || v === '' ? '—' : String(v)}</p>
                </div>
            ))}
        </div>
    );
}

const formatValue = (field: string, value: any): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return `${value.length} image${value.length === 1 ? '' : 's'}`;
    if (typeof value === 'object') return value.name || value._id || JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
};

export default function AdminProductApprovals() {
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
    const [detailsTarget, setDetailsTarget] = useState<Product | null>(null);
    const [details, setDetails] = useState<ProductReviewDetails | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [docRejectId, setDocRejectId] = useState<string | null>(null);
    const [docRejectReason, setDocRejectReason] = useState('');

    const loadDetails = async (id: string) => {
        setDetailsLoading(true);
        try {
            const res = await getProductReviewDetails(id);
            if (res.success) setDetails(res.data);
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to load the product details', 'error');
        } finally {
            setDetailsLoading(false);
        }
    };

    const openDetails = (product: Product) => {
        setDetailsTarget(product);
        setDetails(null);
        setDocRejectId(null);
        loadDetails(product._id);
    };

    const handleStartReview = async () => {
        if (!detailsTarget) return;
        try {
            const res = await startProductReview(detailsTarget._id);
            if (res.success) {
                showToast('Marked as under your review.', 'success');
                fetchAll();
                loadDetails(detailsTarget._id);
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Could not start the review', 'error');
        }
    };

    const viewDoc = async (docId: string) => {
        if (!detailsTarget) return;
        const tab = window.open('', '_blank');
        try {
            const res = await getComplianceDocUrlAdmin(detailsTarget._id, docId);
            if (tab) tab.location.href = res.data.url;
        } catch (err: any) {
            tab?.close();
            showToast(err.response?.data?.message || 'Could not open the document', 'error');
        }
    };

    const decideDoc = async (docId: string, status: 'Approved' | 'Rejected') => {
        if (!detailsTarget) return;
        if (status === 'Rejected' && !docRejectReason.trim()) {
            showToast('Please give a reason so the seller knows what to fix.', 'error');
            return;
        }
        try {
            const res = await reviewComplianceDoc(detailsTarget._id, docId, status, docRejectReason.trim());
            if (res.success) {
                setDetails((d) => (d ? { ...d, complianceDocs: res.data } : d));
                setDocRejectId(null);
                setDocRejectReason('');
                loadDetails(detailsTarget._id);
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Could not save the decision', 'error');
        }
    };

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
                                                        onClick={() => openDetails(product)}
                                                        className="flex items-center gap-3 text-left hover:text-teal-700"
                                                    >
                                                        <img
                                                            src={product.mainImage || '/api/placeholder/40/40'}
                                                            alt={product.productName}
                                                            className="w-10 h-10 object-cover rounded border border-neutral-200"
                                                        />
                                                        <span>
                                                            <span className="font-medium block">{product.productName}</span>
                                                            <span className="flex flex-wrap gap-1 mt-0.5">
                                                                {(product as any).reviewStartedByName && (
                                                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                                                                        Under review · {(product as any).reviewStartedByName}
                                                                    </span>
                                                                )}
                                                                {((product as any).qualityFlags || []).length > 0 && (
                                                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                                                        {(product as any).qualityFlags.length} check{(product as any).qualityFlags.length === 1 ? '' : 's'} flagged
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </span>
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
                                                            onClick={() => openDetails(product)}
                                                            className="px-3 py-1.5 border border-teal-600 text-teal-700 hover:bg-teal-50 text-xs font-medium rounded"
                                                        >
                                                            Review
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

            {detailsTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setDetailsTarget(null)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="text-lg font-semibold truncate">{detailsTarget.productName}</h3>
                                <p className="text-sm text-teal-100 mt-0.5">{sellerLabel(detailsTarget.seller)}</p>
                            </div>
                            <button onClick={() => setDetailsTarget(null)} className="text-white text-xl leading-none" type="button">×</button>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-5 text-sm">
                            {detailsLoading || !details ? (
                                <p className="text-center text-neutral-500 py-8">Loading...</p>
                            ) : (
                                <>
                                    {details.problems.length > 0 && (
                                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
                                            <p className="font-semibold text-xs mb-1">Not ready to go live — still missing</p>
                                            <p className="text-xs">{details.problems.join(', ')}</p>
                                        </div>
                                    )}
                                    {details.qualityFlags.length > 0 && (
                                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                            <p className="font-semibold text-xs text-amber-900 mb-1">Automated checks flagged</p>
                                            <ul className="text-xs text-amber-900 list-disc pl-4 space-y-0.5">
                                                {details.qualityFlags.map((f) => <li key={f}>{f}</li>)}
                                            </ul>
                                        </div>
                                    )}

                                    {details.product.rejectionReason && (
                                        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-orange-900">
                                            <p className="font-semibold text-xs mb-0.5">Previously sent back with this reason</p>
                                            <p className="text-xs whitespace-pre-wrap">{details.product.rejectionReason}</p>
                                        </div>
                                    )}
                                    {details.product.pendingRevision?.data && Object.keys(details.product.pendingRevision.data).length > 0 && (
                                        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-purple-900 text-xs">
                                            This live product also has edits waiting in <strong>Edited listings</strong>:{' '}
                                            {Object.keys(details.product.pendingRevision.data).map((f) => FIELD_LABELS[f] || f).join(', ')}.
                                        </div>
                                    )}

                                    {!details.seller && (
                                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                                            The seller account for this product no longer exists. Don't approve it; delete it or have it relisted by an active seller.
                                        </div>
                                    )}
                                    {details.seller && (
                                        <ReviewSection title="Seller">
                                            <div className="flex items-start gap-3">
                                                {details.seller.logo ? (
                                                    <img src={details.seller.logo} alt="" className="w-12 h-12 rounded-lg object-cover border border-neutral-200 shrink-0" />
                                                ) : (
                                                    <div className="w-12 h-12 rounded-lg bg-teal-50 text-teal-700 font-bold flex items-center justify-center shrink-0">
                                                        {(details.seller.storeName || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="font-semibold text-neutral-900">{details.seller.storeName}</p>
                                                        {details.seller.onboardingStatus && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200">{details.seller.onboardingStatus}</span>
                                                        )}
                                                        {details.seller.bankVerificationStatus && details.seller.bankVerificationStatus !== 'Verified' && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">Bank not verified</span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-neutral-500">{details.seller.sellerName}</p>
                                                </div>
                                                <a
                                                    href={`/admin/manage-seller/review/${details.seller._id}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs font-semibold text-teal-700 hover:underline shrink-0"
                                                >
                                                    Open seller profile
                                                </a>
                                            </div>
                                            <FactGrid
                                                facts={[
                                                    ['Mobile', details.seller.mobile ? `+91 ${details.seller.mobile}` : undefined],
                                                    ['Email', details.seller.email ? `${details.seller.email}${details.seller.isEmailVerified ? ' (verified)' : ''}` : undefined],
                                                    ['City', details.seller.city],
                                                    ['Business type', details.seller.businessType],
                                                    ['Registered name', details.seller.legalBusinessName],
                                                    ['GST', details.seller.gstRegistered ? details.seller.gstin || 'Registered' : 'Not registered'],
                                                    ['PAN', details.seller.panCard],
                                                    ['FSSAI licence', details.seller.fssaiLicNo],
                                                    ['Sells via', (details.seller.channels || []).map((c) => (c === 'ECommerce' ? 'E-Commerce' : c)).join(', ')],
                                                    ['Delivery radius', details.seller.serviceRadiusKm ? `${details.seller.serviceRadiusKm} km` : undefined],
                                                    ['Seller since', details.seller.createdAt ? new Date(details.seller.createdAt).toLocaleDateString('en-GB') : undefined],
                                                    [
                                                        'Products',
                                                        Object.keys(details.seller.productCounts || {}).length
                                                            ? Object.entries(details.seller.productCounts || {})
                                                                  .map(([s, n]) => `${n} ${s === 'Active' ? 'live' : s.toLowerCase()}`)
                                                                  .join(' · ')
                                                            : undefined,
                                                    ],
                                                ]}
                                            />
                                            <FactGrid
                                                facts={[
                                                    ['Shop status', details.seller.isShopOpen === false ? 'Closed' : 'Open'],
                                                    ['Instant delivery', details.seller.supportsInstantDelivery === false ? 'No' : 'Yes'],
                                                    ['Needs product approval', details.seller.requireProductApproval ? 'Yes' : 'No'],
                                                    ['Shows seller details to buyers', details.seller.viewCustomerDetails === false ? 'No' : 'Yes'],
                                                    ['Commission', details.seller.commissionRate ?? details.seller.commission ? `${details.seller.commissionRate ?? details.seller.commission}%` : undefined],
                                                    ['Departments', (details.seller.categories || []).join(', ')],
                                                    ['Tax name / number', [details.seller.taxName, details.seller.taxNumber].filter(Boolean).join(' · ')],
                                                    ['Serviceable area', details.seller.serviceableArea],
                                                    ['Map pin', details.seller.latitude && details.seller.longitude ? `${details.seller.latitude}, ${details.seller.longitude}` : undefined],
                                                    ['Bank', [details.seller.bankName, details.seller.accountNumber, details.seller.ifsc].filter(Boolean).join(' · ')],
                                                    ['Account holder', details.seller.accountName],
                                                    ['UPI', details.seller.upiId],
                                                    ['Courier pickup (Shiprocket)', details.seller.shiprocketPickupLocation || (details.seller.shiprocketPickupSyncError ? `Not registered: ${details.seller.shiprocketPickupSyncError}` : undefined)],
                                                    ['Application submitted', details.seller.onboardingSubmittedAt ? new Date(details.seller.onboardingSubmittedAt).toLocaleString('en-GB') : undefined],
                                                ]}
                                            />
                                            <FactGrid
                                                cols="sm:grid-cols-1"
                                                facts={[
                                                    ['Pickup address', [details.seller.address, details.seller.searchLocation].filter(Boolean).join(' — ')],
                                                    ['Return address', details.seller.returnAddress && details.seller.returnAddress !== details.seller.address ? details.seller.returnAddress : 'Same as pickup'],
                                                    ['Store description', details.seller.storeDescription],
                                                    [
                                                        'Working hours',
                                                        details.seller.workingHours?.open || details.seller.workingHours?.close
                                                            ? `${details.seller.workingHours.open || '?'} – ${details.seller.workingHours.close || '?'}${(details.seller.workingHours.offDays || []).length ? ` (closed ${details.seller.workingHours.offDays.join(', ')})` : ''}`
                                                            : undefined,
                                                    ],
                                                    [
                                                        'Social links',
                                                        Object.entries(details.seller.socialLinks || {})
                                                            .filter(([, v]) => Boolean(v))
                                                            .map(([k, v]) => `${k}: ${v}`)
                                                            .join(' · ') || undefined,
                                                    ],
                                                ]}
                                            />
                                            {details.seller.storeBanner && <img src={details.seller.storeBanner} alt="Store banner" className="w-full max-h-28 object-cover rounded border border-neutral-200" />}
                                        </ReviewSection>
                                    )}

                                    <ReviewSection title={`Images (${1 + (details.product.galleryImages || []).length})`}>
                                        <div className="flex flex-wrap gap-2">
                                            {[details.product.mainImage, ...(details.product.galleryImages || [])].filter(Boolean).map((src: string, i: number) => (
                                                <a key={src + i} href={src} target="_blank" rel="noreferrer" className="relative block">
                                                    <img src={src} alt="" className="w-20 h-20 object-cover rounded border border-neutral-200 hover:opacity-90" />
                                                    {i === 0 && <span className="absolute bottom-0.5 left-0.5 px-1 rounded bg-black/60 text-white text-[9px]">Main</span>}
                                                </a>
                                            ))}
                                        </div>
                                    </ReviewSection>

                                    <div className="flex gap-4">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs flex-1">
                                            {[
                                                ['Status', details.product.status],
                                                ['Visible to customers', details.product.publish ? 'Yes, once approved' : 'No (seller hid it)'],
                                                ['Variation type', details.product.variationType],
                                                ['Base MRP', details.product.price !== undefined ? `₹${details.product.price}` : undefined],
                                                ['Base selling price', details.product.discPrice > 0 ? `₹${details.product.discPrice}` : undefined],
                                                ['Compare-at price', details.product.compareAtPrice ? `₹${details.product.compareAtPrice}` : undefined],
                                                ['Discount', details.product.discount ? `${details.product.discount}%` : undefined],
                                                ['Total stock', details.product.stock === 0 ? 'Unlimited' : details.product.stock],
                                                ['Rating', details.product.reviewsCount ? `${details.product.rating} (${details.product.reviewsCount} reviews)` : undefined],
                                                ['Product commission', details.product.commission !== undefined && details.product.commission !== null ? `${details.product.commission}%` : undefined],
                                                ['Listing form', details.product.listingVersion >= 2 ? 'Guided (7 steps)' : 'Classic form / older listing'],
                                                ['Approved at', details.product.approvedAt ? new Date(details.product.approvedAt).toLocaleString('en-GB') : undefined],
                                                ['Department', details.product.headerCategoryId?.name],
                                                ['Category', details.product.category?.name],
                                                ['Subcategory', details.product.subcategory?.name],
                                                ['Product type', details.product.subSubCategory?.name],
                                                ['Brand', details.product.brand?.name],
                                                ['Condition', details.product.condition],
                                                ['Model', details.product.modelNumber],
                                                ['Barcode / GTIN', details.product.barcode],
                                                ['SKU', details.product.sku],
                                                ['HSN code', details.product.hsnCode],
                                                ['Handling time', details.product.handlingTimeDays !== undefined && details.product.handlingTimeDays !== null ? `${details.product.handlingTimeDays} day(s)` : undefined],
                                                ['Weight', details.product.weightGrams ? `${details.product.weightGrams} g` : undefined],
                                                [
                                                    'Package size',
                                                    details.product.dimensionsCm
                                                        ? `${details.product.dimensionsCm.length} × ${details.product.dimensionsCm.width} × ${details.product.dimensionsCm.height} cm`
                                                        : undefined,
                                                ],
                                                ['Returns', details.product.isReturnable ? `Yes${details.product.maxReturnDays ? ` (${details.product.maxReturnDays} days)` : ''}` : 'No'],
                                                ['GST slab', details.tax ? `${details.tax.name} (${details.tax.percentage}%)` : undefined],
                                                ['Max per order', details.product.totalAllowedQuantity],
                                                ['Manufacturer', details.product.manufacturer],
                                                ['Made in', details.product.madeIn],
                                                ['Marketer', details.product.marketer],
                                                ['Pack', details.product.pack],
                                                ['Shelf life', details.product.shelfLife],
                                                ['FSSAI licence', details.product.fssaiLicNo],
                                                ['Shop-by-store only', details.product.isShopByStoreOnly ? `Yes${details.product.shopId?.name ? ` (${details.product.shopId.name})` : ''}` : undefined],
                                                ['Popular / Deal of day', [details.product.popular && 'Popular', details.product.dealOfDay && 'Deal of the day'].filter(Boolean).join(', ') || undefined],
                                                ['Listed via', details.product.listingMethod],
                                                ['Created', details.product.createdAt ? new Date(details.product.createdAt).toLocaleString('en-GB') : undefined],
                                                ['Last updated', details.product.updatedAt ? new Date(details.product.updatedAt).toLocaleString('en-GB') : undefined],
                                            ].map(([k, v]) => (
                                                <div key={k as string}>
                                                    <p className="text-neutral-400">{k}</p>
                                                    <p className="font-medium text-neutral-800 break-words">{v === undefined || v === null || v === '' ? '—' : String(v)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {(details.product.smallDescription || details.product.description) && (
                                        <ReviewSection title="Description">
                                            {details.product.smallDescription && <p className="text-xs text-neutral-800 whitespace-pre-wrap">{details.product.smallDescription}</p>}
                                            {details.product.description && details.product.description !== details.product.smallDescription && (
                                                <p className="text-xs text-neutral-800 whitespace-pre-wrap">{details.product.description}</p>
                                            )}
                                        </ReviewSection>
                                    )}

                                    <ReviewSection title="Specifications">
                                        {details.specGroups.length === 0 ? (
                                            <p className="text-xs text-neutral-500">The seller hasn't filled in any category attributes.</p>
                                        ) : (
                                            <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-200">
                                                {details.specGroups.map((g) => (
                                                    <div key={g.title} className="p-3">
                                                        <p className="text-xs font-bold text-neutral-800 mb-1.5">{g.title}</p>
                                                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                                            {g.items.map((it) => (
                                                                <div key={it.label} className="flex gap-2 min-w-0">
                                                                    <dt className="text-neutral-400 w-32 shrink-0">{it.label}</dt>
                                                                    <dd className="font-medium text-neutral-800 break-words min-w-0">
                                                                        {it.value}
                                                                        {it.keySpec && <span className="ml-1 text-[9px] font-semibold text-amber-700">KEY</span>}
                                                                    </dd>
                                                                </div>
                                                            ))}
                                                        </dl>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {(details.otherAttributes || []).length > 0 && (
                                            <div className="rounded-lg border border-neutral-200 p-3">
                                                <p className="text-xs font-bold text-neutral-800 mb-1.5">Other values the seller saved</p>
                                                <FactGrid facts={details.otherAttributes.map((a) => [a.label, a.value] as [string, any])} />
                                            </div>
                                        )}
                                        {details.unfilledAttributes.length > 0 && (
                                            <p className="text-[11px] text-neutral-500">
                                                Not filled ({details.unfilledAttributes.length}):{' '}
                                                {details.unfilledAttributes.map((a) => (a.required ? `${a.label} (required)` : a.label)).join(', ')}
                                            </p>
                                        )}
                                    </ReviewSection>

                                    {details.product.translations && Object.keys(details.product.translations).length > 0 && (
                                        <ReviewSection title="Translations">
                                            <div className="space-y-2">
                                                {Object.entries(details.product.translations as Record<string, Record<string, string>>).map(([lang, fields]) => (
                                                    <div key={lang} className="rounded-lg border border-neutral-200 p-3">
                                                        <p className="text-xs font-bold text-neutral-800 mb-1 uppercase">{lang}</p>
                                                        <FactGrid cols="sm:grid-cols-1" facts={Object.entries(fields || {}).filter(([, v]) => Boolean(v)).map(([k, v]) => [k, v] as [string, any])} />
                                                    </div>
                                                ))}
                                            </div>
                                        </ReviewSection>
                                    )}

                                    {otherProductFields(details.product).length > 0 && (
                                        <ReviewSection title="Other submitted fields">
                                            <FactGrid facts={otherProductFields(details.product)} />
                                        </ReviewSection>
                                    )}

                                    {((details.product.tags || []).length > 0 || details.product.seoTitle || details.product.seoDescription || details.product.seoKeywords || details.product.returnPolicyText) && (
                                        <ReviewSection title="Tags, search & policy">
                                            {(details.product.tags || []).length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {details.product.tags.map((t: string) => (
                                                        <span key={t} className="px-2 py-0.5 rounded-full bg-neutral-100 text-[11px] text-neutral-700">{t}</span>
                                                    ))}
                                                </div>
                                            )}
                                            <FactGrid
                                                cols="sm:grid-cols-1"
                                                facts={([
                                                    ['SEO title', details.product.seoTitle],
                                                    ['SEO keywords', details.product.seoKeywords],
                                                    ['SEO description', details.product.seoDescription],
                                                    ['Image alt text', details.product.seoImageAlt],
                                                    ['Return policy', details.product.returnPolicyText],
                                                ] as Array<[string, any]>).filter(([, v]) => Boolean(v))}
                                            />
                                        </ReviewSection>
                                    )}

                                    <div>
                                        <p className="text-xs font-semibold text-neutral-700 mb-1">Variants, price & stock</p>
                                        <table className="w-full text-xs border border-neutral-200">
                                            <thead>
                                                <tr className="bg-neutral-50 text-neutral-600">
                                                    <th className="p-2 text-left">Variant</th>
                                                    <th className="p-2 text-left">SKU</th>
                                                    <th className="p-2 text-left">MRP</th>
                                                    <th className="p-2 text-left">Selling price</th>
                                                    <th className="p-2 text-left">Discount</th>
                                                    <th className="p-2 text-left">Stock</th>
                                                    <th className="p-2 text-left">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(details.product.variations || []).map((v: any, i: number) => (
                                                    <tr key={i} className="border-t border-neutral-100">
                                                        <td className="p-2">{v.value || v.title || v.name}</td>
                                                        <td className="p-2 font-mono text-neutral-500">{v.sku || '—'}</td>
                                                        <td className="p-2">₹{v.price}</td>
                                                        <td className="p-2">{v.discPrice > 0 ? `₹${v.discPrice}` : '—'}</td>
                                                        <td className={`p-2 ${v.discPrice > 0 && v.price > 0 && v.discPrice < v.price * 0.3 ? 'text-red-600 font-semibold' : ''}`}>
                                                            {v.discPrice > 0 && v.price > 0 ? `${Math.round((1 - v.discPrice / v.price) * 100)}%` : '—'}
                                                        </td>
                                                        <td className="p-2">{v.stock === 0 ? 'Unlimited' : v.stock}</td>
                                                        <td className="p-2">{v.status || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {(details.isRegulated || details.complianceDocs.length > 0) && (
                                        <div>
                                            <p className="text-xs font-semibold text-neutral-700 mb-1">Compliance documents{details.isRegulated ? ' (regulated category)' : ''}</p>
                                            {details.complianceDocs.length === 0 ? (
                                                <p className="text-xs text-red-700">No documents uploaded yet.</p>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {details.complianceDocs.map((d) => (
                                                        <li key={d._id} className="rounded-lg border border-neutral-200 p-3">
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-semibold text-neutral-800">{d.label}</p>
                                                                    <p className="text-[11px] text-neutral-500 truncate">
                                                                        {d.originalName} ·{' '}
                                                                        <span className={d.status === 'Approved' ? 'text-green-700 font-semibold' : d.status === 'Rejected' ? 'text-red-600 font-semibold' : 'text-amber-700 font-semibold'}>{d.status}</span>
                                                                    </p>
                                                                    {d.remarks && <p className="text-[11px] text-red-600">Reason: {d.remarks}</p>}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <button onClick={() => viewDoc(d._id)} className="px-2.5 py-1 text-xs rounded bg-neutral-100 hover:bg-neutral-200">View</button>
                                                                    <button onClick={() => decideDoc(d._id, 'Approved')} className="px-2.5 py-1 text-xs rounded bg-green-600 hover:bg-green-700 text-white">Approve</button>
                                                                    <button onClick={() => { setDocRejectId(docRejectId === d._id ? null : d._id); setDocRejectReason(''); }} className="px-2.5 py-1 text-xs rounded bg-orange-600 hover:bg-orange-700 text-white">Reject</button>
                                                                </div>
                                                            </div>
                                                            {docRejectId === d._id && (
                                                                <div className="mt-2 flex gap-2">
                                                                    <input
                                                                        value={docRejectReason}
                                                                        onChange={(e) => setDocRejectReason(e.target.value)}
                                                                        placeholder="What's wrong with this document?"
                                                                        className="flex-1 px-3 py-1.5 border border-neutral-300 rounded text-xs"
                                                                        autoFocus
                                                                    />
                                                                    <button onClick={() => decideDoc(d._id, 'Rejected')} className="px-3 py-1.5 text-xs rounded bg-orange-600 text-white">Send</button>
                                                                </div>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="px-5 py-4 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-neutral-500">
                                {(detailsTarget as any).reviewStartedByName ? `Under review · ${(detailsTarget as any).reviewStartedByName}` : 'Not picked up yet'}
                            </div>
                            <div className="flex items-center gap-2">
                                {!(detailsTarget as any).reviewStartedByName && (
                                    <button onClick={handleStartReview} className="px-3 py-2 border border-blue-600 text-blue-700 hover:bg-blue-50 text-xs font-medium rounded">
                                        Start review
                                    </button>
                                )}
                                <button
                                    onClick={() => { setRejectTarget({ id: detailsTarget._id, name: detailsTarget.productName, kind: 'new' }); setRejectReason(''); setDetailsTarget(null); }}
                                    className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded"
                                >
                                    Send back
                                </button>
                                <button
                                    onClick={async () => { const p = detailsTarget; await handleApprove(p); setDetailsTarget(null); }}
                                    disabled={processingId === detailsTarget._id}
                                    className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded disabled:opacity-50"
                                >
                                    Approve
                                </button>
                            </div>
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
