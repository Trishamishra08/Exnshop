import { useEffect, useMemo, useState } from "react";
import {
  getServiceControls,
  setServiceControl,
  getServiceControlLogs,
  type ServiceControlItem,
  type ServiceControlLogItem,
} from "../../../services/api/admin/adminServiceControlService";

/**
 * Admin › Service Controls — the marketplace ON/OFF blueprint in one place.
 * Each toggle shows its state, who changed it last and when, and takes an
 * optional reason. Every change is written to an audit log. Services marked
 * "Enforced" are blocked in the backend API when OFF; critical security
 * controls are locked ON.
 */

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function AdminServiceControls() {
  const [sections, setSections] = useState<string[]>([]);
  const [services, setServices] = useState<ServiceControlItem[]>([]);
  const [logs, setLogs] = useState<ServiceControlLogItem[]>([]);
  const [active, setActive] = useState<string>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const load = async () => {
    const [data, l] = await Promise.all([getServiceControls(), getServiceControlLogs(50)]);
    setSections(data.sections);
    setServices(data.services);
    setLogs(l);
    setActive((a) => a || data.sections[0] || "");
  };

  useEffect(() => {
    load()
      .catch((e) => setMessage({ type: "err", text: e?.response?.data?.message || "Could not load service controls" }))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => (q ? s.label.toLowerCase().includes(q) : s.section === active));
  }, [services, active, search]);

  const counts = useMemo(() => {
    const c: Record<string, { on: number; total: number }> = {};
    services.forEach((s) => {
      c[s.section] = c[s.section] || { on: 0, total: 0 };
      c[s.section].total++;
      if (s.enabled) c[s.section].on++;
    });
    return c;
  }, [services]);

  const toggle = async (s: ServiceControlItem) => {
    const next = !s.enabled;
    if (!next && !window.confirm(`Switch OFF "${s.label}"?\n\nNew actions will be blocked for customers/sellers straight away. Orders and payments already in progress are not affected.`)) return;
    setBusyKey(s.key);
    setMessage(null);
    try {
      const res = await setServiceControl(s.key, next, notes[s.key]);
      setMessage({ type: "ok", text: res.message });
      await load();
    } catch (e: any) {
      setMessage({ type: "err", text: e?.response?.data?.message || "Could not change this service" });
    } finally {
      setBusyKey("");
    }
  };

  if (loading) return <div className="p-6 text-neutral-500">Loading…</div>;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="p-6 pb-0 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-800">Service Controls</h1>
          <p className="text-sm text-neutral-500">Switch marketplace services ON or OFF. Every change is logged with who, when and why.</p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a service…" className="px-3 py-2 border border-neutral-300 rounded-md text-sm w-56" />
          <button type="button" onClick={() => setShowLogs((v) => !v)} className="px-3 py-2 rounded-md border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            {showLogs ? "Hide change log" : "Change log"}
          </button>
        </div>
      </div>

      {message && (
        <div className="px-6 pt-4">
          <div className={`px-4 py-3 rounded border text-sm ${message.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{message.text}</div>
        </div>
      )}

      {showLogs && (
        <div className="px-6 pt-4">
          <div className="bg-white rounded-lg border border-neutral-200 p-4 max-h-72 overflow-y-auto">
            <h2 className="text-sm font-semibold text-neutral-800 mb-2">Recent changes</h2>
            {logs.length === 0 && <p className="text-sm text-neutral-500">No changes yet.</p>}
            <ul className="divide-y divide-neutral-100 text-sm">
              {logs.map((l) => (
                <li key={l._id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${l.to ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{l.to ? "ON" : "OFF"}</span>
                  <span className="font-medium text-neutral-800">{l.label}</span>
                  <span className="text-neutral-500">by {l.adminName || "Admin"} · {fmt(l.createdAt)}</span>
                  {l.note && <span className="text-neutral-600 italic">“{l.note}”</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="p-6 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        <nav className="bg-white rounded-lg border border-neutral-200 p-2 h-fit">
          {sections.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => {
                setActive(sec);
                setSearch("");
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm text-left ${!search && active === sec ? "bg-teal-50 text-teal-700 font-semibold" : "text-neutral-700 hover:bg-neutral-50"}`}
            >
              <span>{sec}</span>
              <span className="text-xs text-neutral-500">{counts[sec]?.on}/{counts[sec]?.total}</span>
            </button>
          ))}
        </nav>

        <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
          {visible.length === 0 && <p className="p-5 text-sm text-neutral-500">No services found.</p>}
          {visible.map((s) => (
            <div key={s.key} className="p-4 flex flex-wrap items-start gap-x-4 gap-y-2">
              <div className="flex-1 min-w-[220px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-neutral-800">{s.label}</span>
                  {s.locked && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">Locked ON</span>}
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${s.enforced ? "bg-blue-100 text-blue-700" : "bg-neutral-100 text-neutral-500"}`} title={s.enforced ? "The API blocks this when OFF" : "Recorded only — not yet wired to the feature"}>
                    {s.enforced ? "Enforced" : "Recorded"}
                  </span>
                  {search && <span className="text-xs text-neutral-400">{s.section}</span>}
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  {s.updatedAt ? `Last changed ${fmt(s.updatedAt)}${s.updatedByName ? ` by ${s.updatedByName}` : ""}` : "Never changed"}
                  {s.note ? ` · “${s.note}”` : ""}
                </p>
              </div>
              <input
                disabled={s.locked}
                value={notes[s.key] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [s.key]: e.target.value }))}
                placeholder="Reason (optional)"
                maxLength={300}
                className="w-56 px-3 py-1.5 border border-neutral-300 rounded-md text-sm disabled:bg-neutral-50"
              />
              <button
                type="button"
                role="switch"
                aria-checked={s.enabled}
                disabled={s.locked || busyKey === s.key}
                onClick={() => toggle(s)}
                className={`relative w-14 h-7 rounded-full transition-colors flex-shrink-0 ${s.enabled ? "bg-green-500" : "bg-neutral-300"} ${s.locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                title={s.locked ? "Critical security control — can't be switched off here" : s.enabled ? "Click to switch OFF" : "Click to switch ON"}
              >
                <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${s.enabled ? "left-[30px]" : "left-0.5"}`} />
                <span className={`absolute text-[10px] font-bold text-white top-1/2 -translate-y-1/2 ${s.enabled ? "left-1.5" : "right-1.5 text-neutral-600"}`}>{s.enabled ? "ON" : "OFF"}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
