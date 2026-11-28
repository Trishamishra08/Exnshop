import { useEffect, useState } from 'react';
import ReportPeriodPicker, { periodReady } from '../../../components/ReportPeriodPicker';
import IncomeReportView from '../../../components/IncomeReportView';
import { useToast } from '../../../context/ToastContext';
import { getAppSettings, updateAppSettings } from '../../../services/api/admin/adminSettingsService';
import {
  downloadErrorMessage,
  downloadGstReportAdmin,
  downloadPlatformReport,
  downloadSellerIncomeAdmin,
  getPlatformReport,
  getSellerIncomeAdmin,
  searchReportSellers,
  sendSellerReport,
  type IncomeReport,
  type PlatformReport,
  type ReportPeriodParams,
  type ReportSeller,
} from '../../../services/api/reportDownloadService';

const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const btn = 'px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50';
const primary = `${btn} bg-teal-600 hover:bg-teal-700 text-white`;
const outline = `${btn} border border-teal-600 text-teal-700 hover:bg-teal-50`;

function Row({ label, value, bold, sub, red }: { label: string; value: string; bold?: boolean; sub?: boolean; red?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 text-sm ${sub ? 'pl-4 text-neutral-500' : ''} ${bold ? 'font-bold text-neutral-900' : ''}`}>
      <span>{label}</span>
      <span className={red ? 'text-red-600' : ''}>{value}</span>
    </div>
  );
}

/** Admin > Reports > Download reports: the platform's own report, and each seller's reports (download or email). */
export default function AdminDownloadReports() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'platform' | 'seller'>('platform');
  const [period, setPeriod] = useState<ReportPeriodParams>({ preset: 'current_month' });

  // Platform report
  const [platform, setPlatform] = useState<PlatformReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  // Seller reports
  const [search, setSearch] = useState('');
  const [sellers, setSellers] = useState<ReportSeller[]>([]);
  const [picked, setPicked] = useState<ReportSeller | null>(null);
  const [income, setIncome] = useState<IncomeReport | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [sendIncome, setSendIncome] = useState(true);
  const [sendGst, setSendGst] = useState(true);
  const [note, setNote] = useState('');

  // Company GSTIN (printed as the e-commerce operator GSTIN on seller GST reports)
  const [gstin, setGstin] = useState('');
  const [savedGstin, setSavedGstin] = useState('');

  useEffect(() => {
    getAppSettings()
      .then((r: any) => {
        const g = r?.data?.companyGstin || '';
        setGstin(g);
        setSavedGstin(g);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (tab !== 'platform' || !periodReady(period)) return;
    let live = true;
    setLoading(true);
    setError('');
    getPlatformReport(period)
      .then((r) => live && setPlatform(r))
      .catch((e) => live && setError(e?.response?.data?.message || 'Could not load the report'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [tab, period.preset, period.from, period.to]);

  useEffect(() => {
    if (tab !== 'seller') return;
    const t = setTimeout(() => searchReportSellers(search).then(setSellers).catch(() => setSellers([])), 300);
    return () => clearTimeout(t);
  }, [tab, search]);

  useEffect(() => {
    if (tab !== 'seller' || !picked || !periodReady(period)) {
      setIncome(null);
      return;
    }
    let live = true;
    setIncomeLoading(true);
    getSellerIncomeAdmin(picked.id, period)
      .then((r) => live && setIncome(r))
      .catch(() => live && setIncome(null))
      .finally(() => live && setIncomeLoading(false));
    return () => {
      live = false;
    };
  }, [tab, picked?.id, period.preset, period.from, period.to]);

  const download = async (key: string, fn: () => Promise<void>) => {
    if (!periodReady(period)) return showToast('Choose both the From and To dates', 'error');
    setBusy(key);
    try {
      await fn();
    } catch (err: any) {
      showToast(await downloadErrorMessage(err, 'Could not download the report'), 'error');
    } finally {
      setBusy('');
    }
  };

  const send = async () => {
    if (!picked) return;
    if (!window.confirm(`Email the selected report(s) for ${period.preset === 'custom' ? `${period.from} to ${period.to}` : 'this period'} to ${picked.storeName || picked.sellerName} (${picked.email})?`)) return;
    setBusy('send');
    try {
      const res = await sendSellerReport(picked.id, period, { income: sendIncome, gst: sendGst, note: note.trim() || undefined });
      showToast(res.message || 'Report sent', 'success');
      setNote('');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not send the report', 'error');
    } finally {
      setBusy('');
    }
  };

  const saveGstin = async () => {
    const value = gstin.trim().toUpperCase();
    if (value && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(value)) return showToast('Enter a valid 15-character GSTIN', 'error');
    setBusy('gstin');
    try {
      await updateAppSettings({ companyGstin: value } as any);
      setSavedGstin(value);
      showToast('Company GSTIN saved', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not save the GSTIN', 'error');
    } finally {
      setBusy('');
    }
  };

  const tabBtn = (id: 'platform' | 'seller', label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === id ? 'border-teal-600 text-teal-700' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>
      {label}
    </button>
  );

  const s = platform?.summary;
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Download reports</h1>
        <p className="text-sm text-neutral-500">Everything Exnshop earned, and each seller's income and GST reports, for any period.</p>
      </div>

      <div className="flex gap-2 border-b border-neutral-200">
        {tabBtn('platform', 'Exnshop earnings')}
        {tabBtn('seller', 'Seller reports')}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <ReportPeriodPicker value={period} onChange={setPeriod} />
      </div>

      {tab === 'platform' && (
        <>
          <div className="flex flex-wrap gap-2">
            <button className={primary} disabled={Boolean(busy) || !periodReady(period)} onClick={() => download('platform', () => downloadPlatformReport(period))}>
              {busy === 'platform' ? 'Preparing…' : 'Download full report (Excel)'}
            </button>
            <button className={outline} disabled={Boolean(busy) || !periodReady(period)} onClick={() => download('gstall', () => downloadGstReportAdmin(period))}>
              {busy === 'gstall' ? 'Preparing…' : 'Download GST / TCS report, all sellers (zip)'}
            </button>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-bold text-neutral-900 mb-1">Company GSTIN</h2>
            <p className="text-xs text-neutral-500 mb-2">Exnshop's own GSTIN. It is printed as the e-commerce operator (eco_tcs_gstin) in the sellers' GST / TCS reports.</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                maxLength={15}
                placeholder="e.g. 09AARCM9332R1CM"
                className="px-3 py-2 border border-neutral-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <button className={outline} disabled={busy === 'gstin' || gstin.trim().toUpperCase() === savedGstin} onClick={saveGstin}>
                Save
              </button>
            </div>
            {!savedGstin && <p className="text-xs text-amber-700 mt-1">Not set: the GST reports will leave this column empty.</p>}
          </div>

          {!periodReady(period) ? (
            <p className="text-sm text-neutral-500">Choose the From and To dates to see the report.</p>
          ) : loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : platform && s ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  ['Net earnings', inr(s.netEarnings)],
                  ['Sales value', inr(s.salesValue)],
                  ['Orders', String(s.orders)],
                  ['Ad revenue', inr(s.adRevenue)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-neutral-200 bg-white p-3">
                    <p className="text-[11px] uppercase tracking-wide text-neutral-500">{k}</p>
                    <p className="text-lg font-bold text-neutral-900 mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <section className="rounded-xl border border-neutral-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-neutral-900 mb-1">Exnshop earnings · {platform.period.label}</h3>
                  <Row label="Platform fees" value={inr(s.platformFees)} />
                  <Row label="Seller commission" value={inr(s.commission)} />
                  <Row label="Commission given back (returns / cancellations)" value={`− ${inr(s.commissionReversed)}`} red />
                  <Row label="Delivery charges" value={inr(s.deliveryCharges)} />
                  <Row label="Rider payouts" value={`− ${inr(s.riderPayouts)}`} red />
                  <Row label="Ad campaign clicks" value={inr(s.adRevenue)} />
                  <div className="border-t border-neutral-200 my-1" />
                  <Row label="Net earnings" value={inr(s.netEarnings)} bold />
                  <Row label="GST included in fees, commission and ads (18%, indicative)" value={inr(s.gstOnFees)} sub />
                </section>
                <section className="rounded-xl border border-neutral-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-neutral-900 mb-1">Money passed through</h3>
                  <Row label="Courier charges billed to sellers" value={inr(s.courierChargedToSellers)} />
                  <Row label="Refunds to customers" value={inr(s.refundsToCustomers)} />
                  <Row label="Paid to sellers' banks" value={inr(s.sellerBankPayouts)} />
                  <div className="border-t border-neutral-200 my-1" />
                  <Row label="GST on sales (sellers' liability)" value={inr(s.gstOnSales)} />
                  <Row label="GST/TCS: net taxable value" value={inr(platform.gstTcs.netTaxable)} />
                  <Row label="GST/TCS: net tax" value={inr(platform.gstTcs.netTax)} />
                </section>
              </div>
              {platform.campaigns.length > 0 && (
                <section className="rounded-xl border border-neutral-200 bg-white p-4 overflow-x-auto">
                  <h3 className="text-sm font-bold text-neutral-900 mb-2">Campaign-wise ad revenue</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-neutral-500">
                        <th className="py-1">Campaign</th><th>Seller</th><th className="text-right">Clicks</th><th className="text-right">Spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {platform.campaigns.slice(0, 15).map((c, i) => (
                        <tr key={i} className="border-t border-neutral-100">
                          <td className="py-1.5">{c.campaign}</td><td>{c.seller}</td><td className="text-right">{c.clicks}</td><td className="text-right">{inr(c.spend)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
              <p className="text-xs text-neutral-500">The Excel file also has the full earnings ledger, month-wise earnings, seller-wise and campaign-wise sheets and GST by rate.</p>
            </div>
          ) : null}
        </>
      )}

      {tab === 'seller' && (
        <div className="grid lg:grid-cols-[320px_1fr] gap-4">
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-bold text-neutral-900 mb-2">Find a seller</h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Store, name, email, mobile, GSTIN, city"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
            <ul className="mt-2 max-h-[420px] overflow-y-auto divide-y divide-neutral-100">
              {sellers.map((x) => (
                <li key={x.id}>
                  <button
                    onClick={() => setPicked(x)}
                    className={`w-full text-left px-2 py-2 rounded-lg hover:bg-neutral-50 ${picked?.id === x.id ? 'bg-teal-50' : ''}`}>
                    <p className="text-sm font-semibold text-neutral-900">{x.storeName || x.sellerName}</p>
                    <p className="text-xs text-neutral-500">{[x.sellerName, x.city, x.mobile].filter(Boolean).join(' · ')}</p>
                    <p className="text-[11px] text-neutral-400">{x.email}{x.gstin ? ` · ${x.gstin}` : ''}</p>
                  </button>
                </li>
              ))}
              {sellers.length === 0 && <li className="py-3 text-sm text-neutral-500">No seller found.</li>}
            </ul>
          </section>

          <div className="space-y-4">
            {!picked ? (
              <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
                Pick a seller to see their income for the chosen period, then download it or email it to them.
              </div>
            ) : (
              <>
                <section className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
                  <div>
                    <p className="text-base font-bold text-neutral-900">{picked.storeName || picked.sellerName}</p>
                    <p className="text-xs text-neutral-500">{picked.email} · {picked.mobile}{picked.gstin ? ` · GSTIN ${picked.gstin}` : ' · no GSTIN on file'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className={primary} disabled={Boolean(busy) || !periodReady(period)} onClick={() => download('si', () => downloadSellerIncomeAdmin(picked.id, period))}>
                      {busy === 'si' ? 'Preparing…' : 'Download income report'}
                    </button>
                    <button className={outline} disabled={Boolean(busy) || !periodReady(period)} onClick={() => download('sg', () => downloadGstReportAdmin(period, picked.id))}>
                      {busy === 'sg' ? 'Preparing…' : 'Download GST / TCS report'}
                    </button>
                  </div>
                  <div className="border-t border-neutral-100 pt-3 space-y-2">
                    <p className="text-sm font-semibold text-neutral-800">Send to the seller by email</p>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={sendIncome} onChange={(e) => setSendIncome(e.target.checked)} /> Income report</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={sendGst} onChange={(e) => setSendGst(e.target.checked)} /> GST / TCS report</label>
                    </div>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={1000}
                      rows={2}
                      placeholder="Optional message for the seller"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                    <button className={primary} disabled={Boolean(busy) || !periodReady(period) || (!sendIncome && !sendGst)} onClick={send}>
                      {busy === 'send' ? 'Sending…' : `Send to ${picked.email || 'seller'}`}
                    </button>
                  </div>
                </section>
                {!periodReady(period) ? null : incomeLoading ? (
                  <p className="text-sm text-neutral-500">Loading…</p>
                ) : income ? (
                  <IncomeReportView report={income} />
                ) : (
                  <p className="text-sm text-red-600">Could not load this seller's report.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
