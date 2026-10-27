import { useEffect, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import { getHandlingSettings, saveHandlingSettings, type HandlingSettings } from '../../../services/api/shippingMethodService';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Handling time, working days, cut-off and holidays: they decide each order's ship-by date. Inside the profile form, so buttons are type="button". */
export default function ShippingSettingsCard() {
  const { showToast } = useToast();
  const [s, setS] = useState<HandlingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [newHoliday, setNewHoliday] = useState('');

  useEffect(() => {
    getHandlingSettings()
      .then(setS)
      .catch(() => showToast('Could not load your handling settings', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!s) return null;

  const toggleDay = (d: number) =>
    setS({ ...s, operatingDays: s.operatingDays.includes(d) ? s.operatingDays.filter((x) => x !== d) : [...s.operatingDays, d].sort() });

  const addHoliday = () => {
    if (!newHoliday) return;
    if (s.holidays.includes(newHoliday)) return setNewHoliday('');
    setS({ ...s, holidays: [...s.holidays, newHoliday].sort() });
    setNewHoliday('');
  };

  const save = async () => {
    if (s.operatingDays.length === 0) return showToast('Choose at least one working day', 'error');
    setSaving(true);
    try {
      setS(await saveHandlingSettings(s));
      showToast('Handling settings saved', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const field = 'px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500';

  return (
    <div className="space-y-5 mt-10 pt-8 border-t border-gray-200">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Handling time &amp; working days</h3>
        <p className="text-sm text-gray-600 mt-1">
          These set the <b>ship-by date</b> shown on each E-commerce order, and the &quot;Ship by today&quot; and &quot;Late&quot; filters on your orders page.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Handling time (working days)</label>
          <input type="number" min={0} max={7} value={s.handlingTimeDays} onChange={(e) => setS({ ...s, handlingTimeDays: Number(e.target.value) })} className={`${field} w-full`} />
          <p className="text-xs text-gray-500 mt-1">Days you need to pack and hand over a parcel. 0 means the same day.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Order cut-off time</label>
          <input type="time" value={s.orderCutoffTime} onChange={(e) => setS({ ...s, orderCutoffTime: e.target.value })} className={`${field} w-full`} />
          <p className="text-xs text-gray-500 mt-1">Orders placed after this count as the next working day.</p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Working days</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((label, d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`px-3.5 py-1.5 rounded-lg border text-sm font-semibold ${s.operatingDays.includes(d) ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-gray-300 text-gray-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Holidays</p>
        <div className="flex gap-2">
          <input type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} className={field} />
          <button type="button" onClick={addHoliday} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Add</button>
        </div>
        {s.holidays.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {s.holidays.map((h) => (
              <span key={h} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                {new Date(`${h}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                <button type="button" aria-label={`Remove ${h}`} onClick={() => setS({ ...s, holidays: s.holidays.filter((x) => x !== h) })} className="text-gray-400 hover:text-red-600">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <button type="button" onClick={save} disabled={saving} className="px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50">
        {saving ? 'Saving…' : 'Save handling settings'}
      </button>
    </div>
  );
}
