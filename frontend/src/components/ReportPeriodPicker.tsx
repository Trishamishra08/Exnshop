import { REPORT_PRESET_OPTIONS, type ReportPeriodParams, type ReportPreset } from '../services/api/reportDownloadService';

/**
 * The date filter drop-down shared by all downloadable reports: current / last month,
 * last three months, current / previous financial year, or custom dates.
 */
export default function ReportPeriodPicker({
  value,
  onChange,
  className = '',
}: {
  value: ReportPeriodParams;
  onChange: (next: ReportPeriodParams) => void;
  className?: string;
}) {
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const field = 'px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none';
  return (
    <div className={`flex flex-wrap items-end gap-3 ${className}`}>
      <label className="block">
        <span className="block text-xs font-semibold text-neutral-600 mb-1">Date filter</span>
        <select
          value={value.preset}
          onChange={(e) => onChange({ ...value, preset: e.target.value as ReportPreset })}
          className={`${field} min-w-[220px]`}>
          {REPORT_PRESET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {value.preset === 'custom' && (
        <>
          <label className="block">
            <span className="block text-xs font-semibold text-neutral-600 mb-1">From</span>
            <input type="date" max={today} value={value.from || ''} onChange={(e) => onChange({ ...value, from: e.target.value })} className={field} />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-neutral-600 mb-1">To</span>
            <input type="date" max={today} min={value.from || undefined} value={value.to || ''} onChange={(e) => onChange({ ...value, to: e.target.value })} className={field} />
          </label>
        </>
      )}
    </div>
  );
}

/** A custom period is ready to use only with both dates chosen. */
export const periodReady = (p: ReportPeriodParams) => p.preset !== 'custom' || Boolean(p.from && p.to && p.from <= p.to);
