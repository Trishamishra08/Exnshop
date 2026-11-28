/**
 * The date filter shared by every downloadable report (seller and admin). Periods are in
 * India time, and financial years run April to March, as GST filing uses them.
 *
 *   current_month  — 1st of this month to now
 *   last_month     — the whole previous calendar month
 *   last_3_months  — the three whole calendar months before this one
 *   current_fy     — 1 April of this financial year to now
 *   previous_fy    — the whole previous financial year
 *   custom         — from / to dates (YYYY-MM-DD), both days included
 */

export type ReportPreset = "current_month" | "last_month" | "last_3_months" | "current_fy" | "previous_fy" | "custom";

export const REPORT_PRESETS: Array<{ value: ReportPreset; label: string }> = [
  { value: "current_month", label: "Current Month" },
  { value: "last_month", label: "Last One Month" },
  { value: "last_3_months", label: "Last Three Months" },
  { value: "current_fy", label: "Current Financial Year" },
  { value: "previous_fy", label: "Previous Financial Year" },
  { value: "custom", label: "Custom Date" },
];

export interface ReportPeriod {
  preset: ReportPreset;
  from: Date;
  to: Date;
  /** "Oct 2026", "FY 2026-27", "01 Oct 2026 – 15 Oct 2026" … */
  label: string;
  /** For file names: "10_2026", "FY2026-27", "2026-10-01_2026-10-15". */
  fileTag: string;
}

const IST_MS = 5.5 * 60 * 60 * 1000;
const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m, 1) - IST_MS);
const istParts = (d: Date) => {
  const t = new Date(d.getTime() + IST_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), day: t.getUTCDate() };
};
export const istDate = (d: Date | string | number | null | undefined): string => {
  if (!d) return "";
  const t = new Date(new Date(d).getTime() + IST_MS);
  return Number.isNaN(t.getTime()) ? "" : t.toISOString().slice(0, 10);
};
const monthLabel = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
const dayLabel = (d: Date) => new Date(d.getTime()).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const pad = (n: number) => String(n).padStart(2, "0");

export class ReportPeriodError extends Error {}

export const resolveReportPeriod = (q: { preset?: any; from?: any; to?: any }, now = new Date()): ReportPeriod => {
  const preset = (String(q.preset || "current_month") as ReportPreset);
  const { y, m } = istParts(now);
  const fyStart = m >= 3 ? y : y - 1;

  switch (preset) {
    case "current_month":
      return { preset, from: monthStart(y, m), to: now, label: monthLabel(y, m), fileTag: `${pad(m + 1)}_${y}` };
    case "last_month": {
      const py = m === 0 ? y - 1 : y;
      const pm = (m + 11) % 12;
      return { preset, from: monthStart(py, pm), to: new Date(monthStart(y, m).getTime() - 1), label: monthLabel(py, pm), fileTag: `${pad(pm + 1)}_${py}` };
    }
    case "last_3_months": {
      const from = monthStart(y, m - 3);
      const to = new Date(monthStart(y, m).getTime() - 1);
      const a = istParts(from);
      const b = istParts(to);
      return {
        preset,
        from,
        to,
        label: `${monthLabel(a.y, a.m)} – ${monthLabel(b.y, b.m)}`,
        fileTag: `${pad(a.m + 1)}_${a.y}-${pad(b.m + 1)}_${b.y}`,
      };
    }
    case "current_fy":
      return { preset, from: monthStart(fyStart, 3), to: now, label: `FY ${fyStart}-${String(fyStart + 1).slice(2)}`, fileTag: `FY${fyStart}-${String(fyStart + 1).slice(2)}` };
    case "previous_fy":
      return {
        preset,
        from: monthStart(fyStart - 1, 3),
        to: new Date(monthStart(fyStart, 3).getTime() - 1),
        label: `FY ${fyStart - 1}-${String(fyStart).slice(2)}`,
        fileTag: `FY${fyStart - 1}-${String(fyStart).slice(2)}`,
      };
    case "custom": {
      const parse = (s: any) => {
        const mm = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return mm ? { y: +mm[1], m: +mm[2] - 1, d: +mm[3] } : null;
      };
      const a = parse(q.from);
      const b = parse(q.to);
      if (!a || !b) throw new ReportPeriodError("Choose both the From and To dates for a custom period.");
      const from = new Date(Date.UTC(a.y, a.m, a.d) - IST_MS);
      const to = new Date(Date.UTC(b.y, b.m, b.d + 1) - IST_MS - 1);
      if (from > to) throw new ReportPeriodError("The From date must be on or before the To date.");
      return { preset, from, to, label: `${dayLabel(from)} – ${dayLabel(to)}`, fileTag: `${q.from}_${q.to}` };
    }
    default:
      throw new ReportPeriodError("Unknown report period.");
  }
};

/** Financial year start (e.g. 2026 for Apr 2026 – Mar 2027) and month number of a date, India time. */
export const fyAndMonth = (d: Date) => {
  const { y, m } = istParts(d);
  return { financialYear: m >= 3 ? y : y - 1, month: m + 1 };
};
