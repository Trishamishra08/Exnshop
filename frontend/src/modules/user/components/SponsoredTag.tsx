import { useEffect, useState } from "react";

/** Time left until `until`, as "2d 4h" / "3h 12m" / "8m"; null once it has passed. */
const timeLeft = (until: Date): string | null => {
  const ms = until.getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
};

/**
 * "Sponsored" pill on a product card that is shown because of a seller's ad,
 * with a countdown to when the ad stops running (if it has an end date).
 */
export default function SponsoredTag({ until, className = "" }: { until?: string | null; className?: string }) {
  const end = until ? new Date(until) : null;
  const valid = end && !Number.isNaN(end.getTime());
  const [left, setLeft] = useState<string | null>(() => (valid ? timeLeft(end!) : null));

  useEffect(() => {
    if (!valid) return;
    setLeft(timeLeft(end!));
    const id = setInterval(() => setLeft(timeLeft(end!)), 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until]);

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded bg-amber-400/95 text-neutral-900 font-bold uppercase tracking-tight leading-none shadow-sm text-[8px] sm:text-[9px] px-1 py-[3px] ${className}`}
      title={left ? `Sponsored · ad ends in ${left}` : "Sponsored"}
    >
      <span>Sponsored</span>
      {left && (
        <span className="inline-flex items-center gap-0.5 font-semibold normal-case border-l border-neutral-900/25 pl-0.5 ml-0.5">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {left}
        </span>
      )}
    </span>
  );
}
