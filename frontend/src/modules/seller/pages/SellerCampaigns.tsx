import { useState, useEffect } from 'react';
import {
    getMyCampaigns,
    createCampaign,
    updateCampaignStatus,
    deleteCampaign,
    Campaign,
} from '../../../services/api/campaignService';
import { getProducts, Product } from '../../../services/api/productService';
import { useToast } from '../../../context/ToastContext';
import ProductMultiSelect, { SelectedProductBid } from '../components/ProductMultiSelect';

export default function SellerCampaigns() {
    const { showToast } = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [detailsCampaign, setDetailsCampaign] = useState<Campaign | null>(null);
    const [adFunds, setAdFunds] = useState<number | null>(null);

    const [selectedProducts, setSelectedProducts] = useState<SelectedProductBid[]>([]);
    const [dailyBudget, setDailyBudget] = useState('');
    const [totalBudget, setTotalBudget] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const fetchData = async () => {
        try {
            setLoading(true);
            const [campaignsRes, productsRes] = await Promise.all([getMyCampaigns(), getProducts({ status: 'Active' } as any)]);
            if (campaignsRes.success && campaignsRes.data) setCampaigns(campaignsRes.data);
            if (campaignsRes.adFunds !== undefined) setAdFunds(campaignsRes.adFunds);
            if (productsRes.success && productsRes.data) setProducts(productsRes.data);
        } catch (err) {
            showToast('Failed to load campaigns', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const openCreateModal = () => {
        setSelectedProducts([]);
        setDailyBudget('');
        setTotalBudget('');
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        setStartDate(today);
        setEndDate(nextWeek);
        setIsModalOpen(true);
    };

    const handleCreate = async () => {
        if (selectedProducts.length === 0 || !dailyBudget || !totalBudget || !startDate || !endDate) {
            showToast('Select at least one product and fill all fields', 'error');
            return;
        }
        const missingBid = selectedProducts.find((p) => !p.cpcBid || Number(p.cpcBid) <= 0);
        if (missingBid) {
            showToast('Every selected product needs a bid greater than ₹0', 'error');
            return;
        }
        try {
            setSaving(true);
            const response = await createCampaign({
                products: selectedProducts.map((p) => ({ productId: p.productId, cpcBid: Number(p.cpcBid) })),
                dailyBudget: Number(dailyBudget),
                totalBudget: Number(totalBudget),
                startDate,
                endDate,
            });
            if (response.success) {
                showToast('Campaign created as Draft', 'success');
                setIsModalOpen(false);
                fetchData();
            } else {
                showToast(response.message || 'Failed to create campaign', 'error');
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to create campaign', 'error');
        } finally {
            setSaving(false);
        }
    };

    const toggleStatus = async (campaign: Campaign) => {
        const newStatus = campaign.status === 'Active' ? 'Paused' : 'Active';
        try {
            const response = await updateCampaignStatus(campaign._id, newStatus);
            if (response.success) {
                fetchData();
            } else {
                showToast(response.message || 'Failed to update campaign', 'error');
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to update campaign', 'error');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const response = await deleteCampaign(id);
            if (response.success) {
                showToast('Campaign deleted', 'success');
                setCampaigns((prev) => prev.filter((c) => c._id !== id));
            } else {
                showToast(response.message || 'Failed to delete campaign', 'error');
            }
        } catch (err: any) {
            showToast(err.response?.data?.message || 'Failed to delete campaign', 'error');
        }
    };

    const getProductsLabel = (campaign: Campaign) => {
        const names = campaign.products.map((p) =>
            typeof p.product === 'string' ? p.product : p.product?.productName || '—'
        );
        if (names.length <= 2) return names.join(', ');
        return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
    };

    const statusBadge = (status: Campaign['status']) => {
        const styles: Record<Campaign['status'], string> = {
            Draft: 'bg-neutral-100 text-neutral-600',
            Active: 'bg-green-100 text-green-800',
            Paused: 'bg-amber-100 text-amber-800',
            Completed: 'bg-blue-100 text-blue-800',
        };
        return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>{status}</span>;
    };

    const servingNote = (campaign: Campaign) => {
        const notes: Partial<Record<NonNullable<Campaign['servingState']>, { text: string; cls: string }>> = {
            Running: { text: 'Showing now', cls: 'text-green-700' },
            Scheduled: { text: 'Starts at the start time', cls: 'text-neutral-500' },
            DailyBudgetReached: { text: "Today's budget used — resumes tomorrow", cls: 'text-amber-700' },
            TotalBudgetReached: { text: 'Total budget used', cls: 'text-amber-700' },
            LowPayoutBalance: { text: 'Payout balance too low to charge a click', cls: 'text-red-600' },
        };
        const note = campaign.servingState ? notes[campaign.servingState] : undefined;
        return note ? <p className={`text-[11px] mt-1 leading-tight max-w-[140px] ${note.cls}`}>{note.text}</p> : null;
    };

    const fmtDateTime = (d: string) =>
        new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

    return (
        <div className="flex flex-col h-full">
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
                <div className="bg-teal-600 text-white px-4 sm:px-6 py-3 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">Advertisement Campaigns</h2>
                        <p className="text-sm text-teal-100 mt-1">Promote products to appear as "Sponsored" in customer search and category listings.</p>
                    </div>
                    <button
                        onClick={openCreateModal}
                        className="bg-white text-teal-700 hover:bg-teal-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                    >
                        + New Campaign
                    </button>
                </div>

                {adFunds !== null && (
                    <div className="px-4 sm:px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900">
                        Ad clicks are deducted from your payout. Payout available for ads: <b>₹{adFunds.toFixed(2)}</b> (wallet balance + earnings on hold).
                    </div>
                )}

                {loading ? (
                    <div className="p-8 text-center text-neutral-500">Loading campaigns...</div>
                ) : campaigns.length === 0 ? (
                    <div className="p-12 text-center text-neutral-400">No campaigns yet. Create one to start promoting your products.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-neutral-50 text-xs font-bold text-neutral-800 border-b border-neutral-200">
                                    <th className="p-4">Products</th>
                                    <th className="p-4">Duration</th>
                                    <th className="p-4">Budget</th>
                                    <th className="p-4">Spend</th>
                                    <th className="p-4">Impressions</th>
                                    <th className="p-4">Clicks</th>
                                    <th className="p-4">CTR</th>
                                    <th className="p-4">Orders</th>
                                    <th className="p-4">Conversion</th>
                                    <th className="p-4">Revenue</th>
                                    <th className="p-4">ROAS</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.map((campaign) => (
                                    <tr key={campaign._id} className="hover:bg-neutral-50 transition-colors text-sm text-neutral-700 border-b border-neutral-200">
                                        <td className="p-4 align-middle font-medium max-w-[220px]">
                                            <button onClick={() => setDetailsCampaign(campaign)} className="text-left hover:underline">
                                                {getProductsLabel(campaign)}
                                            </button>
                                        </td>
                                        <td className="p-4 align-middle text-xs whitespace-nowrap">
                                            {fmtDateTime(campaign.startDate)}<br />
                                            to {fmtDateTime(campaign.endDate)}
                                        </td>
                                        <td className="p-4 align-middle text-xs">₹{campaign.dailyBudget}/day<br />₹{campaign.totalBudget} total</td>
                                        <td className="p-4 align-middle">₹{campaign.spend.toFixed(0)}</td>
                                        <td className="p-4 align-middle">{campaign.impressions}</td>
                                        <td className="p-4 align-middle">{campaign.clicks}</td>
                                        <td className="p-4 align-middle">{campaign.metrics?.overall.ctr.toFixed(1) || 0}%</td>
                                        <td className="p-4 align-middle">{campaign.metrics?.overall.orders || 0}</td>
                                        <td className="p-4 align-middle">{campaign.metrics?.overall.conversionRate.toFixed(1) || 0}%</td>
                                        <td className="p-4 align-middle">₹{campaign.metrics?.overall.revenue.toFixed(0) || 0}</td>
                                        <td className="p-4 align-middle">{campaign.metrics?.overall.roas.toFixed(2) || 0}x</td>
                                        <td className="p-4 align-middle">{statusBadge(campaign.status)}{servingNote(campaign)}</td>
                                        <td className="p-4 align-middle">
                                            <div className="flex items-center gap-2">
                                                {(campaign.status === 'Active' || campaign.status === 'Paused' || campaign.status === 'Draft') && (
                                                    <button
                                                        onClick={() => toggleStatus(campaign)}
                                                        className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded transition-colors"
                                                    >
                                                        {campaign.status === 'Active' ? 'Pause' : 'Activate'}
                                                    </button>
                                                )}
                                                {campaign.status !== 'Active' && campaign.status !== 'Completed' && (
                                                    <button
                                                        onClick={() => handleDelete(campaign._id)}
                                                        className="px-2 py-1.5 text-red-600 hover:bg-red-50 text-xs font-medium rounded transition-colors"
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg sticky top-0">
                            <h3 className="text-lg font-semibold">New Campaign</h3>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">Select Products &amp; Set Bids</label>
                                <ProductMultiSelect products={products} selected={selectedProducts} onChange={setSelectedProducts} />
                                {products.length === 0 && (
                                    <p className="text-xs text-neutral-400 mt-1">No active products found. Add and get a product approved first.</p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">Daily Budget (₹)</label>
                                    <input type="number" min="0" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">Total Budget (₹)</label>
                                    <input type="number" min="0" value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">Start (date &amp; time)</label>
                                    <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1">End (date &amp; time)</label>
                                    <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" />
                                </div>
                            </div>
                            <p className="text-xs text-neutral-400">
                                Pick one or more products. You pay only per click, at the cost-per-click you set for each product, and it is taken from your payout. Once the daily budget is used the ad pauses for that day and resumes the next day; the ad stops at the end time you set. Campaigns are created as Draft — activate from the list when ready.
                            </p>
                        </div>
                        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2 sticky bottom-0 bg-white">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-neutral-300 text-neutral-700 hover:bg-neutral-50 rounded text-sm font-medium">Cancel</button>
                            <button onClick={handleCreate} disabled={saving} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-sm font-medium disabled:opacity-50">
                                {saving ? 'Creating...' : 'Create Campaign'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {detailsCampaign && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setDetailsCampaign(null)}>
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between sticky top-0">
                            <h3 className="text-lg font-semibold">Per-Product Performance</h3>
                            <button onClick={() => setDetailsCampaign(null)} className="text-teal-100 hover:text-white text-sm">Close</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-neutral-50 text-xs font-bold text-neutral-800 border-b border-neutral-200">
                                        <th className="p-3">Product</th>
                                        <th className="p-3">CPC Bid</th>
                                        <th className="p-3">Orders</th>
                                        <th className="p-3">Revenue</th>
                                        <th className="p-3">CTR</th>
                                        <th className="p-3">ROAS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detailsCampaign.metrics?.byProduct.map((row) => {
                                        const productEntry = detailsCampaign.products.find(
                                            (p) => (typeof p.product === 'string' ? p.product : p.product._id) === row.product
                                        );
                                        const name = productEntry && typeof productEntry.product !== 'string' ? productEntry.product.productName : row.product;
                                        return (
                                            <tr key={row.product} className="text-sm text-neutral-700 border-b border-neutral-100">
                                                <td className="p-3">{name}</td>
                                                <td className="p-3">₹{row.cpcBid}</td>
                                                <td className="p-3">{row.orders}</td>
                                                <td className="p-3">₹{row.revenue.toFixed(0)}</td>
                                                <td className="p-3">{row.ctr.toFixed(1)}%</td>
                                                <td className="p-3">{row.roas.toFixed(2)}x</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
