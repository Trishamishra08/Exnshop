import { useState } from 'react';
import { Campaign, updateCampaignBids } from '../../../services/api/campaignService';
import { useToast } from '../../../context/ToastContext';
import BidVisibilityMeter from './BidVisibilityMeter';

/**
 * Change a campaign's cost-per-click bids and budgets, also while it is running.
 * A higher bid puts the product above other sponsored products; the seller pays the
 * bid only when a customer clicks the ad.
 */
type Row = { productId: string; name: string; categoryId?: string; current: number; bid: string; clicks: number };

export default function CampaignBidEditor({ campaign, onClose, onSaved }: { campaign: Campaign; onClose: () => void; onSaved: () => void }) {
    const { showToast } = useToast();
    const [rows, setRows] = useState<Row[]>(() =>
        campaign.products.map((p) => {
            const prod: any = typeof p.product === 'string' ? { _id: p.product } : p.product;
            return {
                productId: String(prod?._id || p.product),
                name: prod?.productName || 'Product',
                categoryId: prod?.category ? String(typeof prod.category === 'object' ? prod.category._id : prod.category) : undefined,
                current: Number(p.cpcBid) || 0,
                bid: String(p.cpcBid ?? ''),
                clicks: Number(p.clicks) || 0,
            };
        })
    );
    const [daily, setDaily] = useState(String(campaign.dailyBudget ?? ''));
    const [total, setTotal] = useState(String(campaign.totalBudget ?? ''));
    const [saving, setSaving] = useState(false);

    const setBid = (i: number, v: string) =>
        setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, bid: v.replace(/[^\d.]/g, '').slice(0, 7) } : r)));
    const addBid = (i: number, n: number) =>
        setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, bid: String(Math.round(((Number(r.bid) || 0) + n) * 100) / 100) } : r)));

    const maxBid = Math.max(0, ...rows.map((r) => Number(r.bid) || 0));
    const clicksPerDay = maxBid > 0 ? Math.floor((Number(daily) || 0) / maxBid) : 0;

    const save = async () => {
        if (rows.some((r) => !(Number(r.bid) > 0))) return showToast('Every product needs a bid greater than ₹0', 'error');
        if (!(Number(daily) > 0) || !(Number(total) > 0)) return showToast('Enter the daily and total budget', 'error');
        if (Number(daily) > Number(total)) return showToast('Daily budget cannot be more than the total budget', 'error');
        if (Number(daily) < maxBid) return showToast(`Daily budget must cover at least one click (₹${maxBid})`, 'error');
        setSaving(true);
        try {
            const res = await updateCampaignBids(campaign._id, {
                products: rows.map((r) => ({ productId: r.productId, cpcBid: Number(r.bid) })),
                dailyBudget: Number(daily),
                totalBudget: Number(total),
            });
            if (res.success) {
                showToast(res.message || 'Saved', 'success');
                onSaved();
                onClose();
            } else {
                showToast(res.message || 'Could not save', 'error');
            }
        } catch (err: any) {
            showToast(err?.response?.data?.message || 'Could not save', 'error');
        } finally {
            setSaving(false);
        }
    };

    const field = 'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
            <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 pt-4 pb-3 border-b border-neutral-200">
                    <h3 className="text-base font-bold text-neutral-900">Change bid &amp; budget</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                        {campaign.status === 'Active' ? 'Your ad keeps running; the new bid applies to the next click.' : 'Saved now; it applies when the campaign runs.'}
                    </p>
                </div>

                <div className="px-5 py-3 space-y-4 overflow-y-auto">
                    <p className="text-xs rounded-lg bg-teal-50 border border-teal-100 text-teal-900 p-2.5">
                        <b>Bid (CPC)</b> = what you pay for one click on your ad. A <b>higher bid shows your product above</b> other sponsored products.
                        You pay only when someone clicks.
                    </p>

                    {rows.map((r, i) => (
                        <div key={r.productId} className="space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-neutral-900 truncate">{r.name}</p>
                                    <p className="text-[11px] text-neutral-500">Current bid ₹{r.current}/click · {r.clicks} clicks so far</p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className="text-sm text-neutral-500">₹</span>
                                    <input
                                        inputMode="decimal"
                                        value={r.bid}
                                        onChange={(e) => setBid(i, e.target.value)}
                                        aria-label={`Bid for ${r.name}`}
                                        className="w-20 px-2 py-1.5 border border-neutral-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-1.5 justify-end">
                                {[1, 2, 5].map((n) => (
                                    <button key={n} type="button" onClick={() => addBid(i, n)} className="px-2.5 py-1 rounded-md border border-teal-200 bg-teal-50 text-teal-700 text-xs font-semibold">
                                        +₹{n}
                                    </button>
                                ))}
                            </div>
                            <BidVisibilityMeter categoryId={r.categoryId} cpcBid={Number(r.bid) || 0} />
                        </div>
                    ))}

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-100">
                        <label className="text-xs font-medium text-neutral-700">
                            Daily budget (₹)
                            <input inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value.replace(/[^\d.]/g, ''))} className={`${field} mt-1`} />
                        </label>
                        <label className="text-xs font-medium text-neutral-700">
                            Total budget (₹)
                            <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d.]/g, ''))} className={`${field} mt-1`} />
                        </label>
                    </div>
                    <p className="text-[11px] text-neutral-500">
                        Spent so far ₹{(campaign.spend || 0).toFixed(2)}. With this daily budget you get about {clicksPerDay} click{clicksPerDay === 1 ? '' : 's'} a day at your highest bid;
                        after that the ad pauses until the next day.
                    </p>
                </div>

                <div className="px-5 py-3 border-t border-neutral-200 flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 disabled:opacity-50">
                        Cancel
                    </button>
                    <button type="button" onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}
