import { useEffect, useState } from 'react';
import { getBidFeedback, BidFeedback } from '../../../services/api/campaignService';

interface BidVisibilityMeterProps {
    categoryId?: string;
    cpcBid: number;
}

const LABEL_STYLES: Record<BidFeedback['label'], { bar: string; text: string; width: string; copy: string }> = {
    Low: { bar: 'bg-red-500', text: 'text-red-700', width: '20%', copy: 'Low visibility — most similar sellers are bidding higher' },
    Fair: { bar: 'bg-amber-500', text: 'text-amber-700', width: '45%', copy: 'Fair visibility — in the middle of the pack' },
    Good: { bar: 'bg-lime-500', text: 'text-lime-700', width: '70%', copy: 'Good visibility — ads will get more views than most similar catalogs' },
    Great: { bar: 'bg-emerald-600', text: 'text-emerald-700', width: '95%', copy: 'Great visibility — one of the top bids in this category' },
};

export default function BidVisibilityMeter({ categoryId, cpcBid }: BidVisibilityMeterProps) {
    const [feedback, setFeedback] = useState<BidFeedback | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!categoryId || !cpcBid || cpcBid <= 0) {
            setFeedback(null);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                setLoading(true);
                const response = await getBidFeedback(categoryId, cpcBid);
                if (response.success && response.data) setFeedback(response.data);
            } catch {
                setFeedback(null);
            } finally {
                setLoading(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [categoryId, cpcBid]);

    if (!categoryId) {
        return <p className="text-xs text-neutral-400">Select a product to see bid feedback.</p>;
    }
    if (!cpcBid || cpcBid <= 0) {
        return <p className="text-xs text-neutral-400">Enter a bid to see how it compares.</p>;
    }
    if (loading && !feedback) {
        return <p className="text-xs text-neutral-400">Checking visibility...</p>;
    }
    if (!feedback) {
        return null;
    }

    const style = LABEL_STYLES[feedback.label];

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold ${style.text}`}>{feedback.label} Visibility</span>
                {feedback.suggestedMinimum > 0 && (
                    <span className="text-[11px] text-neutral-400">Suggested min: ₹{feedback.suggestedMinimum}</span>
                )}
            </div>
            <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                <div className={`h-full ${style.bar} rounded-full transition-all`} style={{ width: style.width }} />
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">{style.copy}</p>
        </div>
    );
}
