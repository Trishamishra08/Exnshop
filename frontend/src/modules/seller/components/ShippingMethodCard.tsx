import { useEffect, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import {
  chooseShippingMethod,
  getShippingMethod,
  requestShippingMethodChange,
  type ShippingMethod,
  type ShippingMethodState,
} from '../../../services/api/shippingMethodService';

const OPTIONS: { value: ShippingMethod; title: string; text: string }[] = [
  {
    value: 'Self',
    title: 'Self shipping',
    text: 'You book your own courier. For every order you pick the courier company and enter the tracking number, then mark it shipped and delivered.',
  },
  {
    value: 'Company',
    title: 'By Company (Exnshop)',
    text: 'Exnshop books the courier through Shiprocket or another partner. You pack the order; the shipping label and tracking are handled for you.',
  },
];

const label = (m: ShippingMethod | null | undefined) => (m === 'Self' ? 'Self shipping' : m === 'Company' ? 'By Company' : 'Not chosen');

/** Rendered inside the profile <form>, so every button here is type="button". */
export default function ShippingMethodCard() {
  const { showToast } = useToast();
  const [state, setState] = useState<ShippingMethodState | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<ShippingMethod | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);

  const load = async () => {
    try {
      setState(await getShippingMethod());
    } catch {
      showToast('Could not load your shipping method', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!state) return null;

  const first = async () => {
    if (!picked) return showToast('Choose a shipping method', 'error');
    setBusy(true);
    try {
      setState(await chooseShippingMethod(picked));
      showToast(`Shipping method set to ${label(picked)}`, 'success');
      setPicked(null);
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendRequest = async () => {
    const target: ShippingMethod = state.method === 'Self' ? 'Company' : 'Self';
    setBusy(true);
    try {
      setState(await requestShippingMethodChange(target, reason));
      showToast('Change request sent to admin', 'success');
      setChanging(false);
      setReason('');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not send the request', 'error');
    } finally {
      setBusy(false);
    }
  };

  const optionCard = (o: (typeof OPTIONS)[number], selected: boolean, onClick?: () => void) => (
    <button
      type="button"
      key={o.value}
      onClick={onClick}
      disabled={!onClick}
      className={`text-left rounded-xl border p-4 transition ${selected ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500/20' : 'border-gray-200 bg-white'} ${onClick ? 'hover:border-teal-300 cursor-pointer' : 'cursor-default'}`}
    >
      <p className="font-bold text-gray-900 text-sm">{o.title}</p>
      <p className="text-xs text-gray-600 mt-1 leading-relaxed">{o.text}</p>
    </button>
  );

  // Not chosen yet: choose once, applies immediately.
  if (!state.method) {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Shipping method</h3>
          <p className="text-sm text-gray-600 mt-1">
            Choose how your E-commerce orders are shipped. This applies to all your orders. You can choose it once here; any later change needs admin approval.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">{OPTIONS.map((o) => optionCard(o, picked === o.value, () => setPicked(o.value)))}</div>
        <button type="button" onClick={first} disabled={busy || !picked} className="px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? 'Saving…' : 'Confirm shipping method'}
        </button>
        <p className="text-xs text-gray-500">Until you choose, orders are shipped by the company.</p>
      </div>
    );
  }

  const pending = state.request?.status === 'Pending' ? state.request : null;
  const last = state.request && state.request.status !== 'Pending' ? state.request : null;
  const target: ShippingMethod = state.method === 'Self' ? 'Company' : 'Self';

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Shipping method</h3>
        <p className="text-sm text-gray-600 mt-1">Fixed for all your E-commerce orders. Changing it needs admin approval.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">{OPTIONS.map((o) => optionCard(o, o.value === state.method))}</div>
      <p className="text-sm text-gray-700">
        Current method: <b>{label(state.method)}</b>
        {state.chosenAt && <span className="text-gray-400"> · since {new Date(state.chosenAt).toLocaleDateString('en-GB')}</span>}
      </p>

      {state.method === 'Self' && (
        <p className="text-xs text-gray-500">
          Courier companies you can choose on an order: {state.couriers.length ? state.couriers.join(', ') : 'none added yet — ask admin to add them'}.
        </p>
      )}

      {pending && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
          <p className="font-semibold">Change request waiting for admin approval</p>
          <p className="text-xs mt-0.5">You asked to switch to <b>{label(pending.requestedMethod)}</b> on {new Date(pending.requestedAt).toLocaleDateString('en-GB')}. Your current method stays until it is approved.</p>
        </div>
      )}

      {last && (
        <div className={`p-3.5 border rounded-xl text-sm ${last.status === 'Rejected' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-green-50 border-green-200 text-green-900'}`}>
          <p className="font-semibold">Your last request to switch to {label(last.requestedMethod)} was {last.status.toLowerCase()}</p>
          {last.adminNote && <p className="text-xs mt-0.5">Admin: {last.adminNote}</p>}
        </div>
      )}

      {!pending && !changing && (
        <button type="button" onClick={() => setChanging(true)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Request change to {label(target)}
        </button>
      )}

      {!pending && changing && (
        <div className="space-y-3 border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-900">Request change to {label(target)}</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Why do you want to change? (optional)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
          />
          <p className="text-xs text-gray-500">Orders already packed or shipped continue the way they were booked.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setChanging(false)} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={sendRequest} disabled={busy} className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">
              {busy ? 'Sending…' : 'Send request to admin'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
