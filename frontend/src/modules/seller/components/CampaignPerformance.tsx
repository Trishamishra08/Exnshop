import { useEffect, useMemo, useState } from 'react';
import { getCampaignAnalytics, type CampaignAnalytics } from '../../../services/api/campaignService';

const RANGES = [7, 30, 90] as const;

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const shortDay = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

/** Round a chart maximum up to a tidy number so the axis labels read cleanly. */
const niceMax = (v: number) => {
  if (v <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
};

function Chart({ series }: { series: CampaignAnalytics['series'] }) {
  const W = 720;
  const H = 220;
  const pad = { l: 52, r: 12, t: 12, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(...series.map((r) => Math.max(r.spend, r.revenue)), 0));
  const x = (i: number) => pad.l + (series.length === 1 ? iw / 2 : (i / (series.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const line = (key: 'spend' | 'revenue') => series.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.ceil(series.length / 7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Ad spend and sales by day">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth="1" />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#6b7280">{inr(t)}</text>
        </g>
      ))}
      {series.map((r, i) =>
        i % labelEvery === 0 || i === series.length - 1 ? (
          <text key={r.day} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#6b7280">{shortDay(r.day)}</text>
        ) : null,
      )}
      <path d={line('revenue')} fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d={line('spend')} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {series.length <= 31 &&
        series.map((r, i) => (
          <g key={r.day}>
            <circle cx={x(i)} cy={y(r.revenue)} r="3" fill="#0d9488"><title>{`${shortDay(r.day)}: sales ${inr(r.revenue)}`}</title></circle>
            <circle cx={x(i)} cy={y(r.spend)} r="3" fill="#f59e0b"><title>{`${shortDay(r.day)}: ad spend ${inr(r.spend)}`}</title></circle>
          </g>
        ))}
    </svg>
  );
}

/** Account-wide ad performance over a chosen date range: totals and a daily chart. */
export default function CampaignPerformance({ campaignId }: { campaignId?: string }) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCampaignAnalytics(days, campaignId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days, campaignId]);

  const hasData = useMemo(() => data?.series.some((r) => r.impressions || r.clicks || r.spend || r.orders || r.revenue), [data]);

  const tile = (label: string, value: string, note?: string) => (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-lg font-bold text-neutral-900 mt-0.5">{value}</p>
      {note && <p className="text-[11px] text-neutral-400">{note}</p>}
    </div>
  );

  return (
    <div className="px-4 sm:px-6 py-4 border-b border-neutral-200 bg-neutral-50/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-neutral-800">Performance</h3>
        <div className="flex items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${days === r ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-50'}`}
            >
              Last {r} days
            </button>
          ))}
          <button onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-teal-700 hover:underline ml-1">
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {loading ? (
            <p className="text-sm text-neutral-500 py-6 text-center">Loading…</p>
          ) : !data ? (
            <p className="text-sm text-neutral-500 py-6 text-center">Could not load performance.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                {tile('Impressions', data.totals.impressions.toLocaleString('en-IN'))}
                {tile('Clicks', data.totals.clicks.toLocaleString('en-IN'), `CTR ${data.totals.ctr.toFixed(1)}%`)}
                {tile('Ad spend', inr(data.totals.spend))}
                {tile('Orders', String(data.totals.orders), `Conversion ${data.totals.conversionRate.toFixed(1)}%`)}
                {tile('Sales', inr(data.totals.revenue))}
                {tile('ROAS', `${data.totals.roas.toFixed(2)}x`, 'Sales ÷ spend')}
              </div>
              {hasData ? (
                <div className="rounded-lg border border-neutral-200 bg-white p-3">
                  <div className="flex items-center gap-4 text-xs text-neutral-600 mb-1">
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-0.5 bg-teal-600" /> Sales</span>
                    <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-0.5 bg-amber-500" /> Ad spend</span>
                  </div>
                  <Chart series={data.series} />
                </div>
              ) : (
                <p className="text-sm text-neutral-500 py-4 text-center rounded-lg border border-dashed border-neutral-300 bg-white">
                  No ad activity in these {days} days. Daily numbers start filling once your campaigns get impressions and clicks.
                </p>
              )}
              <p className="text-[11px] text-neutral-400">Impressions, clicks and spend are counted per day from when daily tracking started. Orders and sales are the sales of your campaign products in the period.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
