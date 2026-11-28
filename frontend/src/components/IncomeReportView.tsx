import type { IncomeReport } from '../services/api/reportDownloadService';

const inr = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Line({ label, value, tone, bold, sub }: { label: string; value: string; tone?: 'red' | 'green'; bold?: boolean; sub?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-3 py-1.5 text-sm ${sub ? 'pl-4 text-neutral-500' : ''} ${bold ? 'font-bold text-neutral-900' : ''}`}>
      <span>{label}</span>
      <span className={tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-green-700' : ''}>{value}</span>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-lg font-bold text-neutral-900 mt-0.5">{value}</p>
      {hint && <p className="text-[11px] text-neutral-500 mt-0.5">{hint}</p>}
    </div>
  );
}

/** The brief of a seller's income for a period, shown the same in the seller and admin panels. */
export default function IncomeReportView({ report }: { report: IncomeReport }) {
  const s = report.summary;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Gross sales" value={inr(s.grossSales)} hint={`${s.orders} orders · ${s.itemsSold} items`} />
        <Tile label="Earned from orders" value={inr(s.orderEarnings)} hint="After commission and courier" />
        <Tile label="Net income" value={inr(s.netIncome)} hint="After ads and other charges" />
        <Tile label="Paid to your bank" value={inr(s.paidToBank)} hint={`Wallet now ${inr(s.walletBalance)}`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-bold text-neutral-900 mb-1">Income statement · {report.period.label}</h3>
          <Line label="Taxable sales" value={inr(s.taxableSales)} />
          <Line label="GST collected" value={inr(s.gstCollected)} />
          <Line label="Cancelled orders" value={inr(s.cancelledValue)} sub />
          <Line label="Returned / RTO" value={inr(s.returnedValue)} sub />
          <div className="border-t border-neutral-200 my-1" />
          <Line label="Commission to Exnshop" value={`− ${inr(s.commission)}`} tone="red" />
          <Line label="Courier charges" value={`− ${inr(s.courierCharges)}`} tone="red" />
          <Line label="Earned from orders" value={inr(s.orderEarnings)} bold />
          <Line label="Not in wallet yet (delivery / return window pending)" value={inr(s.pendingEarnings)} sub />
          <Line label="Other charges from wallet" value={`− ${inr(s.walletCharges)}`} tone="red" />
          <Line label="of which ad campaign clicks" value={`− ${inr(s.adSpend)}`} sub />
          {s.walletCredits > 0 && <Line label="Other credits" value={`+ ${inr(s.walletCredits)}`} tone="green" />}
          <div className="border-t border-neutral-200 my-1" />
          <Line label="Net income" value={inr(s.netIncome)} bold tone={s.netIncome < 0 ? 'red' : 'green'} />
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h3 className="text-sm font-bold text-neutral-900 mb-1">Your money now</h3>
            <Line label="Available in wallet" value={inr(s.walletBalance)} />
            <Line label="On hold (return window)" value={inr(s.onHoldBalance)} />
            <Line label="Paid to your bank in this period" value={inr(s.paidToBank)} />
          </section>
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <h3 className="text-sm font-bold text-neutral-900 mb-1">GST for filing</h3>
            <Line label="Net taxable value (sales − returns)" value={inr(s.gstNetTaxable)} />
            <Line label="Net tax" value={inr(s.gstNetTax)} />
            <p className="text-[11px] text-neutral-500 mt-1">Download the GST report for the item-wise files (tcs_sales, tcs_sales_return).</p>
          </section>
        </div>
      </div>

      {report.chargeBreakdown.length > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-bold text-neutral-900 mb-2">Charges and credits on your wallet</h3>
          <table className="w-full text-sm">
            <tbody>
              {report.chargeBreakdown.map((c) => (
                <tr key={c.label} className="border-t border-neutral-100">
                  <td className="py-1.5">{c.label}</td>
                  <td className="py-1.5 text-right text-red-600">{c.debit ? `− ${inr(c.debit)}` : ''}</td>
                  <td className="py-1.5 text-right text-green-700">{c.credit ? `+ ${inr(c.credit)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report.campaigns.length > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-4 overflow-x-auto">
          <h3 className="text-sm font-bold text-neutral-900 mb-2">Ad campaigns</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500">
                <th className="py-1">Campaign</th><th>Status</th><th className="text-right">Clicks</th><th className="text-right">Impressions</th><th className="text-right">Spend</th>
              </tr>
            </thead>
            <tbody>
              {report.campaigns.map((c) => (
                <tr key={c.name} className="border-t border-neutral-100">
                  <td className="py-1.5">{c.name}</td><td>{c.status}</td><td className="text-right">{c.clicks}</td><td className="text-right">{c.impressions}</td><td className="text-right">{inr(c.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-4 overflow-x-auto">
        <h3 className="text-sm font-bold text-neutral-900 mb-2">
          Orders in this period ({report.orderCount}){report.orderCount > report.orders.length ? ` · latest ${report.orders.length} shown, the download has all` : ''}
        </h3>
        {report.orders.length === 0 ? (
          <p className="text-sm text-neutral-500">No orders in this period.</p>
        ) : (
          <table className="w-full text-xs sm:text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-neutral-500">
                <th className="py-1">Date</th><th>Order</th><th>Product</th><th>Pay</th>
                <th className="text-right">Value</th><th className="text-right">Commission</th><th className="text-right">Courier</th><th className="text-right">Earning</th><th>Settlement</th>
              </tr>
            </thead>
            <tbody>
              {report.orders.map((o, i) => (
                <tr key={`${o.orderNumber}-${i}`} className="border-t border-neutral-100">
                  <td className="py-1.5 whitespace-nowrap">{o.date}</td>
                  <td className="whitespace-nowrap">{o.orderNumber}</td>
                  <td className="max-w-[200px] truncate" title={o.product}>{o.product} × {o.qty}</td>
                  <td>{o.paymentMethod}</td>
                  <td className="text-right">{inr(o.invoiceValue)}</td>
                  <td className="text-right">{inr(o.commission)}</td>
                  <td className="text-right">{inr(o.courier)}</td>
                  <td className="text-right font-semibold">{inr(o.earning)}</td>
                  <td className="whitespace-nowrap text-neutral-600">{o.settlement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
