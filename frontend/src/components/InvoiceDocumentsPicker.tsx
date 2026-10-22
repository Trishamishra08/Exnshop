import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { getCustomerOrderInvoice } from '../services/api/taxInvoiceService';
import type { OrderSummarySource } from '../utils/taxInvoicePdf';

type Choice = 'summary' | 'invoice';

/**
 * Amazon's "Download Invoice" choice: the Printable Order Summary (any time)
 * or the GST Invoice (once the order is delivered), then one download button.
 */
export default function InvoiceDocumentsPicker({
  order,
  onDone,
}: {
  order: OrderSummarySource & { id: string; invoiceEnabled?: boolean };
  onDone?: () => void;
}) {
  const { showToast } = useToast();
  const invoiceReady = Boolean(order.invoiceEnabled);
  const [choice, setChoice] = useState<Choice>(invoiceReady ? 'invoice' : 'summary');
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const pdf = await import('../utils/taxInvoicePdf');
      if (choice === 'summary') {
        await pdf.downloadOrderSummary(order);
      } else {
        const res = await getCustomerOrderInvoice(order.id);
        if (!res.success || !res.data.length) throw new Error(res.message || 'Invoice is not available yet');
        await pdf.downloadTaxInvoices(res.data, `Invoice_${order.orderNumber || order.id}.pdf`);
      }
      onDone?.();
    } catch (err: any) {
      showToast(err.response?.data?.message || err.message || 'Could not download the document', 'error');
    } finally {
      setBusy(false);
    }
  };

  const option = (value: Choice, label: string, disabled = false, hint?: string) => (
    <label
      className={`flex items-center gap-3 px-4 py-3.5 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <input
        type="radio"
        name="invoice-document"
        className="w-5 h-5 accent-blue-700"
        checked={choice === value}
        disabled={disabled}
        onChange={() => setChoice(value)}
      />
      <span className="flex-1">
        <span className="block text-[15px] text-gray-900">{label}</span>
        {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
      </span>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-300 divide-y divide-gray-200 overflow-hidden">
        {option('summary', 'Printable Order Summary')}
        {option('invoice', 'Invoice', !invoiceReady, invoiceReady ? undefined : 'Available once your order is delivered')}
      </div>
      <p className="text-sm text-gray-700">
        The tax invoice is issued by the seller. An order with items from more than one seller has one invoice per seller.
      </p>
      <button
        onClick={download}
        disabled={busy}
        className="w-full py-3 rounded-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-medium text-[15px] disabled:opacity-60"
      >
        {busy ? 'Downloading file…' : 'Download documents'}
      </button>
    </div>
  );
}
