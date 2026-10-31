import { useEffect, useState } from 'react';
import api from '../../../services/api/config';

/** Full activity history of one delivery partner: every change and decision, old → new. */
const ACTIONS: Record<string, string> = {
  PROFILE_UPDATED: 'Profile updated',
  CHANGE_REQUESTED: 'Change requested (waiting for approval)',
  CHANGE_APPROVED: 'Change approved',
  CHANGE_REJECTED: 'Change rejected',
  UPDATED_BY_ADMIN: 'Updated by admin',
  APPROVED_ACTIVATED: 'Approved / activated',
  DEACTIVATED: 'Deactivated',
  DOCUMENT_UPLOADED: 'Document uploaded',
  DOCUMENT_REPLACEMENT_UPLOADED: 'New version of a document uploaded',
  DOCUMENT_VIEWED: 'Document viewed by admin',
  DOCUMENT_APPROVED: 'Document approved',
  DOCUMENT_REJECTED: 'Document rejected',
};

export default function DeliveryHistoryModal({ deliveryId, name, onClose }: { deliveryId: string; name?: string; onClose: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    api.get(`/admin/delivery/${deliveryId}/history`)
      .then((res) => setRows(res.data?.data || []))
      .catch(() => setRows([]));
  }, [deliveryId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-neutral-900">Activity history{name ? ` — ${name}` : ''}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-700" aria-label="Close">×</button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3">
          {rows === null ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-neutral-500">No activity recorded yet.</p>
          ) : (
            rows.map((e) => (
              <div key={e._id} className="text-xs border-l-2 border-neutral-200 pl-3">
                <p className="font-semibold text-neutral-800">{ACTIONS[e.action] || e.action}</p>
                <p className="text-neutral-500">{e.actorName || e.actorType} · {new Date(e.createdAt).toLocaleString('en-IN')}</p>
                {(e.changes || []).map((c: any, i: number) => (
                  <p key={i} className="text-neutral-600 break-all">{c.field}{c.from || c.to ? `: ${c.from || '—'} → ${c.to || '—'}` : ''}</p>
                ))}
                {e.remarks && <p className="italic text-neutral-600">“{e.remarks}”</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
