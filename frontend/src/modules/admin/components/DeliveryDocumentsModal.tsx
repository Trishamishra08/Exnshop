import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import api from '../../../services/api/config';

/**
 * Admin view of one delivery partner's KYC documents: open each file, approve or reject it
 * (a rejection needs a reason). Every upload ever made stays listed under "All uploads".
 */
interface Item {
  docType: string; label: string; hint: string;
  status: 'Missing' | 'Pending' | 'Approved' | 'Rejected';
  document: { _id: string; originalName: string; uploadedAt: string; remarks: string } | null;
  replacement: { _id: string; originalName: string; uploadedAt: string } | null;
}
interface HistoryRow { _id: string; label: string; status: string; originalName: string; uploadedAt: string; remarks: string; reviewedBy?: string; isReplacement: boolean }
interface View { name: string; mobile?: string; status: string; items: Item[]; approved: number; total: number; history: HistoryRow[] }

const PILL: Record<string, string> = {
  Missing: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-green-50 text-green-700 border-green-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
  Superseded: 'bg-neutral-100 text-neutral-500 border-neutral-200',
};

export default function DeliveryDocumentsModal({ deliveryId, onClose }: { deliveryId: string; onClose: () => void }) {
  const { showToast } = useToast();
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setView((await api.get(`/admin/delivery/${deliveryId}/documents`)).data?.data || null);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not load documents', 'error');
    }
  }, [deliveryId, showToast]);

  useEffect(() => { load(); }, [load]);

  const open = async (docId: string) => {
    try {
      const res = await api.get(`/admin/delivery/${deliveryId}/documents/${docId}/url`);
      if (res.data?.data?.url) window.open(res.data.data.url, '_blank', 'noopener');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not open the file', 'error');
    }
  };

  const review = async (docId: string, status: 'Approved' | 'Rejected') => {
    let remarks: string | undefined;
    if (status === 'Rejected') {
      remarks = window.prompt('Why is this document rejected? (the partner will see it)') || undefined;
      if (!remarks) return;
    }
    setBusy(docId);
    try {
      await api.patch(`/admin/delivery/${deliveryId}/documents/${docId}`, { status, remarks });
      showToast(`Document ${status.toLowerCase()}`, 'success');
      await load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not save', 'error');
    } finally {
      setBusy(null);
    }
  };

  const target = (it: Item) => it.replacement || (it.document && it.status !== 'Approved' ? it.document : null);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-neutral-900">KYC documents{view ? ` — ${view.name}` : ''}</h3>
            {view && <p className="text-xs text-neutral-500">{view.approved} of {view.total} approved · account {view.status}</p>}
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-700" aria-label="Close">×</button>
        </div>

        <div className="p-5 space-y-3">
          {!view ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (
            <>
              {view.items.map((it) => {
                const t = target(it);
                return (
                  <div key={it.docType} className="border border-neutral-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">{it.label}</p>
                        {it.document ? (
                          <p className="text-xs text-neutral-500 truncate">
                            {it.document.originalName} · {new Date(it.document.uploadedAt).toLocaleDateString('en-IN')}
                            <button onClick={() => open(it.document!._id)} className="ml-2 font-semibold text-blue-700 hover:underline">View</button>
                          </p>
                        ) : (
                          <p className="text-xs text-neutral-400">Not uploaded yet</p>
                        )}
                        {it.status === 'Rejected' && it.document?.remarks && <p className="text-xs text-red-600 mt-0.5">Rejected: {it.document.remarks}</p>}
                      </div>
                      <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${PILL[it.status]}`}>{it.status}</span>
                    </div>

                    {it.replacement && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-2">
                        New version uploaded {new Date(it.replacement.uploadedAt).toLocaleDateString('en-IN')} (the approved one stays valid until you approve it)
                        <button onClick={() => open(it.replacement!._id)} className="ml-2 font-semibold text-blue-700 hover:underline">View new</button>
                      </p>
                    )}

                    {t && (
                      <div className="flex gap-2 mt-2">
                        <button disabled={busy !== null} onClick={() => review(t._id, 'Approved')}
                          className="px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold disabled:opacity-50">Approve{it.replacement ? ' new' : ''}</button>
                        <button disabled={busy !== null} onClick={() => review(t._id, 'Rejected')}
                          className="px-3 py-1 rounded-lg border border-red-200 text-red-600 text-xs font-semibold disabled:opacity-50">Reject</button>
                      </div>
                    )}
                  </div>
                );
              })}

              <button onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-blue-700 hover:underline">
                {showAll ? 'Hide' : 'Show'} all uploads (full record)
              </button>
              {showAll && (
                <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100 text-xs">
                  {view.history.length === 0 ? (
                    <p className="p-3 text-neutral-500">Nothing uploaded yet.</p>
                  ) : view.history.map((h) => (
                    <div key={h._id} className="p-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-800">{h.label}{h.isReplacement ? ' (new version)' : ''}</p>
                        <p className="text-neutral-500 truncate">{h.originalName} · {new Date(h.uploadedAt).toLocaleString('en-IN')}{h.reviewedBy ? ` · by ${h.reviewedBy}` : ''}</p>
                        {h.remarks && <p className="text-red-600">{h.remarks}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => open(h._id)} className="font-semibold text-blue-700 hover:underline">View</button>
                        <span className={`px-2 py-0.5 rounded-full border font-semibold ${PILL[h.status]}`}>{h.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
