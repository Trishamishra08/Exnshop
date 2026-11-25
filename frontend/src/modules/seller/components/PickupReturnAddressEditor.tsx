import { useEffect, useState } from 'react';
import api from '../../../services/api/config';
import { useToast } from '../../../context/ToastContext';

/**
 * Pickup address (where couriers collect parcels: add or update) and return address
 * (same as pickup, or another address). Used on the seller's page and in the admin's
 * Edit Seller; `endpoint` is the GET/PUT URL for the addresses.
 */

type Address = {
  contactName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
};

const EMPTY: Address = { contactName: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '' };
const fromApi = (a: any): Address => ({ ...EMPTY, ...Object.fromEntries(Object.entries(a || {}).map(([k, v]) => [k, v == null ? '' : String(v)])) });
const oneLine = (a: Address) => [a.line1, a.line2, a.landmark, a.city, `${a.state} ${a.pincode}`.trim()].filter(Boolean).join(', ');

function AddressForm({ value, onChange, states, prefix }: { value: Address; onChange: (a: Address) => void; states: string[]; prefix: string }) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let v = e.target.value;
    if (k === 'pincode') v = v.replace(/\D/g, '').slice(0, 6);
    if (k === 'phone') v = v.replace(/\D/g, '').slice(0, 10);
    onChange({ ...value, [k]: v });
  };
  const field = 'w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';
  const label = 'block text-xs font-semibold text-neutral-700 mb-1';
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <label className={label} htmlFor={`${prefix}-line1`}>Shop / house no. and street <span className="text-red-500">*</span></label>
        <input id={`${prefix}-line1`} value={value.line1} onChange={set('line1')} maxLength={190} placeholder="e.g. Shop 12, LB Cold Storage Road" className={field} />
        <p className="text-[11px] text-neutral-500 mt-1">Couriers need a number here (shop, house, plot or building number).</p>
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor={`${prefix}-line2`}>Area / village / locality</label>
        <input id={`${prefix}-line2`} value={value.line2} onChange={set('line2')} maxLength={190} placeholder="e.g. Sahara Kalan, Iglas" className={field} />
      </div>
      <div>
        <label className={label} htmlFor={`${prefix}-landmark`}>Landmark</label>
        <input id={`${prefix}-landmark`} value={value.landmark} onChange={set('landmark')} maxLength={120} placeholder="e.g. Near bus stand" className={field} />
      </div>
      <div>
        <label className={label} htmlFor={`${prefix}-city`}>City / town <span className="text-red-500">*</span></label>
        <input id={`${prefix}-city`} value={value.city} onChange={set('city')} maxLength={80} className={field} />
      </div>
      <div>
        <label className={label} htmlFor={`${prefix}-state`}>State <span className="text-red-500">*</span></label>
        <select id={`${prefix}-state`} value={value.state} onChange={set('state')} className={`${field} bg-white`}>
          <option value="">Choose state</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className={label} htmlFor={`${prefix}-pincode`}>Pincode <span className="text-red-500">*</span></label>
        <input id={`${prefix}-pincode`} value={value.pincode} onChange={set('pincode')} inputMode="numeric" placeholder="6 digits" className={field} />
      </div>
      <div>
        <label className={label} htmlFor={`${prefix}-name`}>Contact person</label>
        <input id={`${prefix}-name`} value={value.contactName} onChange={set('contactName')} maxLength={80} className={field} />
      </div>
      <div>
        <label className={label} htmlFor={`${prefix}-phone`}>Contact mobile</label>
        <input id={`${prefix}-phone`} value={value.phone} onChange={set('phone')} inputMode="numeric" placeholder="10 digits" className={field} />
      </div>
    </div>
  );
}

export default function PickupReturnAddressEditor({ endpoint, showIntro = true }: { endpoint: string; showIntro?: boolean }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [states, setStates] = useState<string[]>([]);
  const [pickup, setPickup] = useState<Address>(EMPTY);
  const [savedPickup, setSavedPickup] = useState<Address | null>(null);
  const [returnSame, setReturnSame] = useState(true);
  const [ret, setRet] = useState<Address>(EMPTY);
  const [savedReturn, setSavedReturn] = useState<Address | null>(null);
  const [courier, setCourier] = useState<{ usesCourier: boolean; pickupRegistered: boolean; error: string } | null>(null);

  const apply = (d: any) => {
    setStates(d.states || []);
    const contact = d.defaultContact || {};
    const p = d.pickupAddress ? fromApi(d.pickupAddress) : null;
    setSavedPickup(p);
    setPickup(p || { ...EMPTY, ...fromApi(d.suggested), contactName: contact.contactName || '', phone: contact.phone || '' });
    setReturnSame(d.returnSameAsPickup !== false);
    const r = d.returnAddressDetails ? fromApi(d.returnAddressDetails) : null;
    setSavedReturn(r);
    setRet(r || { ...EMPTY, contactName: contact.contactName || '', phone: contact.phone || '' });
    setCourier(d.courier || null);
    setEditing(!p);
  };

  useEffect(() => {
    api
      .get(endpoint)
      .then((res) => apply(res.data.data))
      .catch((e) => showToast(e?.response?.data?.message || 'Could not load your addresses', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put(endpoint, {
        pickupAddress: pickup,
        returnSameAsPickup: returnSame,
        ...(returnSame ? {} : { returnAddressDetails: ret }),
      });
      apply(res.data.data);
      showToast(res.data.warning || 'Addresses saved', res.data.warning ? 'info' : 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Could not save the addresses', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-neutral-500 text-sm">Loading addresses…</div>;

  const card = 'bg-white rounded-xl border border-neutral-200 shadow-sm p-4 sm:p-5';

  return (
    <div className="space-y-4">
      {showIntro && (
        <p className="text-sm text-neutral-600">
          Couriers collect parcels from the pickup address and bring returned parcels to the return address. Enter them exactly,
          with the pincode, so the courier comes to the right place.
        </p>
      )}

      {courier?.usesCourier && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${courier.pickupRegistered && !courier.error ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          {courier.pickupRegistered && !courier.error
            ? 'Your pickup address is set up with the courier.'
            : courier.error
              ? `Courier pickup not set up: ${courier.error}`
              : 'Save your pickup address so couriers can collect your parcels.'}
        </div>
      )}

      {/* Pickup address */}
      <section className={card}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-base font-semibold text-neutral-900">Pickup address</h2>
          {savedPickup && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-sm font-semibold">Update</button>
          )}
        </div>
        {savedPickup && !editing ? (
          <div className="text-sm text-neutral-800 space-y-1">
            <p>{oneLine(savedPickup)}</p>
            {(savedPickup.contactName || savedPickup.phone) && (
              <p className="text-neutral-500">{[savedPickup.contactName, savedPickup.phone].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        ) : (
          <>
            {!savedPickup && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                No pickup address yet. We filled what we could from your profile; please check every field, especially the pincode.
              </p>
            )}
            <AddressForm value={pickup} onChange={setPickup} states={states} prefix="pickup" />
          </>
        )}
      </section>

      {/* Return address */}
      <section className={card}>
        <h2 className="text-base font-semibold text-neutral-900 mb-3">Return address</h2>
        <label className="flex items-center gap-2 text-sm text-neutral-800 cursor-pointer mb-3">
          <input type="checkbox" checked={returnSame} onChange={(e) => { setReturnSame(e.target.checked); setEditing(true); }} />
          Same as pickup address
        </label>
        {!returnSame &&
          (savedReturn && !editing ? (
            <div className="text-sm text-neutral-800 space-y-1">
              <p>{oneLine(savedReturn)}</p>
              {(savedReturn.contactName || savedReturn.phone) && (
                <p className="text-neutral-500">{[savedReturn.contactName, savedReturn.phone].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          ) : (
            <AddressForm value={ret} onChange={setRet} states={states} prefix="return" />
          ))}
      </section>

      {editing && (
        <div className="flex justify-end gap-2">
          {savedPickup && (
            <button
              type="button"
              onClick={() => {
                setPickup(savedPickup);
                if (savedReturn) setRet(savedReturn);
                setEditing(false);
              }}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button type="button" onClick={save} disabled={saving} className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save addresses'}
          </button>
        </div>
      )}
    </div>
  );
}
