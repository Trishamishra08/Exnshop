import { useEffect, useState } from 'react';
import ReportPeriodPicker, { periodReady } from '../../../components/ReportPeriodPicker';
import IncomeReportView from '../../../components/IncomeReportView';
import { useToast } from '../../../context/ToastContext';
import {
  downloadErrorMessage,
  downloadMyGstReport,
  downloadMyIncomeReport,
  getMyIncomeReport,
  type IncomeReport,
  type ReportPeriodParams,
} from '../../../services/api/reportDownloadService';

/** Seller panel > Reports > Income & Tax reports: a brief of the seller's income and the downloads. */
export default function SellerIncomeReport() {
  const { showToast } = useToast();
  const [period, setPeriod] = useState<ReportPeriodParams>({ preset: 'current_month' });
  const [report, setReport] = useState<IncomeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'income' | 'gst'>('');

  useEffect(() => {
    if (!periodReady(period)) return;
    let live = true;
    setLoading(true);
    setError('');
    getMyIncomeReport(period)
      .then((r) => live && setReport(r))
      .catch((e) => live && setError(e?.response?.data?.message || 'Could not load the report'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [period.preset, period.from, period.to]);

  const run = async (kind: 'income' | 'gst') => {
    if (!periodReady(period)) return showToast('Choose both the From and To dates', 'error');
    setBusy(kind);
    try {
      await (kind === 'income' ? downloadMyIncomeReport(period) : downloadMyGstReport(period));
    } catch (err: any) {
      showToast(await downloadErrorMessage(err, 'Could not download the report'), 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Income & Tax reports</h1>
        <p className="text-sm text-neutral-500">Pick a period, see your income at a glance, and download the files for your accountant or GST filing.</p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 flex flex-wrap items-end justify-between gap-3">
        <ReportPeriodPicker value={period} onChange={setPeriod} />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => run('income')}
            disabled={Boolean(busy) || !periodReady(period)}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">
            {busy === 'income' ? 'Preparing…' : 'Download income report (Excel)'}
          </button>
          <button
            onClick={() => run('gst')}
            disabled={Boolean(busy) || !periodReady(period)}
            className="px-4 py-2 rounded-lg border border-teal-600 text-teal-700 hover:bg-teal-50 text-sm font-semibold disabled:opacity-50">
            {busy === 'gst' ? 'Preparing…' : 'Download GST / TCS report (zip)'}
          </button>
        </div>
      </div>

      {!periodReady(period) ? (
        <p className="text-sm text-neutral-500">Choose the From and To dates to see the report.</p>
      ) : loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : report ? (
        <IncomeReportView report={report} />
      ) : null}

      <p className="text-xs text-neutral-500">
        The GST / TCS zip holds two Excel files: <b>tcs_sales</b> (items you dispatched in the period) and <b>tcs_sales_return</b> (items cancelled or
        returned in the period), in the same layout marketplaces give for GST filing. Periods use India time; the financial year runs April to March.
      </p>
    </div>
  );
}
