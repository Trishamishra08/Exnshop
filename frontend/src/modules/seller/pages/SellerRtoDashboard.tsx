import { useEffect, useState } from 'react';
import {
    getRtoDashboard,
    getActiveRtoPromoBanners,
    RtoDashboardData,
    RtoPromoBanner,
} from '../../../services/api/rtoDashboardService';
import { useToast } from '../../../context/ToastContext';
import GaugeChart from '../components/GaugeChart';
import TrendBadge from '../components/TrendBadge';

export default function SellerRtoDashboard() {
    const { showToast } = useToast();
    const [data, setData] = useState<RtoDashboardData | null>(null);
    const [banners, setBanners] = useState<RtoPromoBanner[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const [dashboardRes, bannersRes] = await Promise.all([
                    getRtoDashboard(),
                    getActiveRtoPromoBanners().catch(() => ({ success: false, data: [] as RtoPromoBanner[] })),
                ]);
                if (dashboardRes.success) setData(dashboardRes.data);
                if (bannersRes.success) setBanners(bannersRes.data);
            } catch (err) {
                showToast('Failed to load RTO dashboard', 'error');
            } finally {
                setLoading(false);
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!data) {
        return <div className="text-center text-neutral-500 py-12">Failed to load dashboard.</div>;
    }

    return (
        <div className="flex flex-col h-full">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-neutral-800">Return &amp; RTO Overview</h1>
                <p className="text-sm text-neutral-500 mt-1">
                    How often customers return items, and how often couriers bring parcels back undelivered (RTO), this month vs last.
                </p>
            </div>

            {banners.map((banner) => (
                <div
                    key={banner._id}
                    className="mb-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4"
                >
                    <div>
                        <p className="text-sm font-semibold text-amber-900">{banner.heading}</p>
                        {banner.bodyText && <p className="text-xs text-amber-700 mt-0.5">{banner.bodyText}</p>}
                    </div>
                    {banner.ctaText && (
                        <a
                            href={banner.ctaLink || '#'}
                            className="shrink-0 text-xs font-semibold text-amber-900 underline whitespace-nowrap"
                        >
                            {banner.ctaText}
                        </a>
                    )}
                </div>
            ))}

            {/* Rate gauges */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
                    <GaugeChart value={data.returnRate.thisMonth} maxValue={100} label="Customer Return Rate" format="percent" />
                    <div className="mt-2 flex justify-center">
                        <TrendBadge trendPercent={pctChange(data.returnRate.thisMonth, data.returnRate.lastMonth)} invert />
                    </div>
                    <p className="text-xs text-neutral-500 text-center mt-2">
                        {data.returnCount.thisMonth} returned out of {data.deliveredCount.thisMonth} delivered
                    </p>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
                    <GaugeChart value={data.rtoRate.thisMonth} maxValue={100} label="Courier Return (RTO) Rate" format="percent" />
                    <div className="mt-2 flex justify-center">
                        <TrendBadge trendPercent={pctChange(data.rtoRate.thisMonth, data.rtoRate.lastMonth)} invert />
                    </div>
                    <p className="text-xs text-neutral-500 text-center mt-2">
                        {data.rtoCount.thisMonth} RTO out of {data.deliveredCount.thisMonth} dispatched
                    </p>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
                    <GaugeChart
                        value={data.avgReverseShippingCost.thisMonth}
                        maxValue={Math.max(100, data.avgReverseShippingCost.thisMonth * 1.5)}
                        label="Average Reverse Shipping Cost"
                    />
                    <div className="mt-2 flex justify-center">
                        <TrendBadge
                            trendPercent={pctChange(data.avgReverseShippingCost.thisMonth, data.avgReverseShippingCost.lastMonth)}
                            invert
                        />
                    </div>
                </div>
            </div>

            {/* Product Performance */}
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 flex-1 flex flex-col">
                <div className="p-4 border-b border-neutral-100">
                    <h2 className="text-lg font-semibold text-neutral-800">Product Performance</h2>
                    <p className="text-xs text-neutral-500 mt-0.5">Products with the most RTOs this month</p>
                </div>
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-neutral-50 text-xs font-bold text-neutral-800">
                                <th className="p-4 border-b border-neutral-200">Product</th>
                                <th className="p-4 border-b border-neutral-200">RTO This Month</th>
                                <th className="p-4 border-b border-neutral-200">RTO Last Month</th>
                                <th className="p-4 border-b border-neutral-200">What Changed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.productPerformance.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-neutral-400">
                                        No RTOs recorded yet.
                                    </td>
                                </tr>
                            ) : (
                                data.productPerformance.map((row) => (
                                    <tr key={row.productId} className="hover:bg-neutral-50 text-sm text-neutral-700">
                                        <td className="p-4 border-b border-neutral-100 font-medium">{row.productName}</td>
                                        <td className="p-4 border-b border-neutral-100">{row.rtoCountThisMonth}</td>
                                        <td className="p-4 border-b border-neutral-100">{row.rtoCountLastMonth}</td>
                                        <td className="p-4 border-b border-neutral-100">
                                            <TrendBadge trendPercent={row.trendPercent} invert />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function pctChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
}
