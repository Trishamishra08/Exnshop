interface TrendBadgeProps {
  /** Percent change vs the previous period, e.g. 12.5 or -8.3 */
  trendPercent: number;
  /** When true, a rising trend is shown as bad (red) and falling as good (green) — use for metrics like RTO/Return rate where lower is better. */
  invert?: boolean;
}

export default function TrendBadge({ trendPercent, invert = false }: TrendBadgeProps) {
  const isFlat = trendPercent === 0;
  const isUp = trendPercent > 0;
  const isGood = isFlat ? true : invert ? !isUp : isUp;

  const colorClass = isFlat
    ? "text-neutral-500 bg-neutral-100"
    : isGood
      ? "text-emerald-700 bg-emerald-50"
      : "text-red-700 bg-red-50";

  const arrow = isFlat ? "→" : isUp ? "↗" : "↘";

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {arrow} {isFlat ? "0%" : `${isUp ? "+" : ""}${trendPercent}%`} vs last month
    </span>
  );
}
