import { useState, useEffect } from 'react';
import { getAllCampaignsAdmin, forcePauseCampaign } from '../../../services/api/admin/adminCampaignService';
import { Campaign } from '../../../services/api/campaignService';
import { useToast } from '../../../context/ToastContext';

export default function AdminCampaigns() {
    const { showToast } = useToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchCampaigns = async () => {
        try {
            setLoading(true);
            const response = await getAllCampaignsAdmin();
            if (response.success && response.data) setCampaigns(response.data);
        } catch (err) {
            showToast('Failed to load campaigns', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const handlePause = async (id: string) => {
        try {
            const response = await forcePauseCampaign(id);
            if (response.success) {
                showToast('Campaign paused', 'success');
                fetchCampaigns();
            }
        } catch (err) {
            showToast('Failed to pause campaign', 'error');
        }
    };

    const getSellerLabel = (seller: Campaign['seller']) => {
        if (typeof seller === 'string') return seller;
        return seller?.storeName || seller?.sellerName || '—';
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

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <div className="flex-1 p-6">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200">
                    <div className="bg-teal-600 text-white px-6 py-4 rounded-t-lg">
                        <h2 className="text-lg font-semibold">Advertisement Campaigns</h2>
                        <p className="text-sm text-teal-100 mt-1">Oversight of all seller-run ad campaigns across the platform.</p>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center text-neutral-500">Loading campaigns...</div>
                    ) : campaigns.length === 0 ? (
                        <div className="p-12 text-center text-neutral-400">No campaigns found.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-neutral-50 text-xs font-bold text-neutral-800 border-b border-neutral-200">
                                        <th className="p-4">Seller</th>
                                        <th className="p-4">Product</th>
                                        <th className="p-4">Budget</th>
                                        <th className="p-4">Spend</th>
                                        <th className="p-4">Orders</th>
                                        <th className="p-4">Revenue</th>
                                        <th className="p-4">ROAS</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {campaigns.map((campaign) => (
                                        <tr key={campaign._id} className="hover:bg-neutral-50 transition-colors text-sm text-neutral-700 border-b border-neutral-200">
                                            <td className="p-4 align-middle">{getSellerLabel(campaign.seller)}</td>
                                            <td className="p-4 align-middle max-w-[220px]">{getProductsLabel(campaign)}</td>
                                            <td className="p-4 align-middle text-xs">₹{campaign.dailyBudget}/day<br />₹{campaign.totalBudget} total</td>
                                            <td className="p-4 align-middle">₹{campaign.spend.toFixed(0)}</td>
                                            <td className="p-4 align-middle">{campaign.metrics?.overall.orders || 0}</td>
                                            <td className="p-4 align-middle">₹{campaign.metrics?.overall.revenue.toFixed(0) || 0}</td>
                                            <td className="p-4 align-middle">{campaign.metrics?.overall.roas.toFixed(2) || 0}x</td>
                                            <td className="p-4 align-middle">{statusBadge(campaign.status)}</td>
                                            <td className="p-4 align-middle">
                                                {campaign.status === 'Active' && (
                                                    <button
                                                        onClick={() => handlePause(campaign._id)}
                                                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded transition-colors"
                                                    >
                                                        Force Pause
                                                    </button>
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
        </div>
    );
}
