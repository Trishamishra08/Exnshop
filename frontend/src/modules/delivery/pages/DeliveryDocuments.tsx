import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api/config';
import { useToast } from '../../../context/ToastContext';

/**
 * KYC documents of the delivery partner: ID proof, address proof, driving licence, vehicle
 * photo / RC / PUC / insurance and bank proof. Each one is reviewed by the admin; an approved
 * document stays valid while a replacement waits for review.
 */
interface DocView { _id: string; status: string; remarks: string; originalName: string; uploadedAt: string }
interface Item {
  docType: string;
  label: string;
  hint: string;
  status: 'Missing' | 'Pending' | 'Approved' | 'Rejected';
  document: DocView | null;
  replacement: DocView | null;
}
interface View { items: Item[]; total: number; approved: number; uploaded: number; complete: boolean; accountStatus?: string }

const BADGE: Record<string, string> = {
  Missing: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-green-50 text-green-700 border-green-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
};
const BADGE_TEXT: Record<string, string> = { Missing: 'Not uploaded', Pending: 'Under review', Approved: 'Approved', Rejected: 'Rejected' };

export default function DeliveryDocuments() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [pickType, setPickType] = useState<string>('');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/delivery/documents');
      setView(res.data?.data || null);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not load your documents', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const choose = (docType: string) => {
    setPickType(docType);
    pickRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !pickType) return;
    if (!/^(image\/|application\/pdf)/.test(file.type)) return showToast('Upload a photo or a PDF', 'error');
    if (file.size > 10 * 1024 * 1024) return showToast('File must be 10 MB or smaller', 'error');
    setUploading(pickType);
    try {
      const form = new FormData();
      form.append('docType', pickType);
      form.append('file', file);
      const res = await api.post('/delivery/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      showToast(res.data?.message || 'Uploaded', 'success');
      await load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Upload failed', 'error');
    } finally {
      setUploading(null);
    }
  };

  const open = async (docId: string) => {
    try {
      const res = await api.get(`/delivery/documents/${docId}/url`);
      if (res.data?.data?.url) window.open(res.data.data.url, '_blank', 'noopener');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Could not open the document', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 pb-10">
      <div className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-neutral-100 rounded-full" aria-label="Back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <h1 className="text-lg font-semibold text-neutral-900">KYC & Documents</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        <input ref={pickRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />

        {loading || !view ? (
          <div className="bg-white rounded-xl border p-10 text-center text-sm text-neutral-500">Loading…</div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-neutral-900">{view.approved} of {view.total} documents approved</p>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${view.complete ? BADGE.Approved : BADGE.Pending}`}>
                  {view.complete ? 'Verified' : 'Incomplete'}
                </span>
              </div>
              <div className="h-2 bg-neutral-100 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${(view.approved / view.total) * 100}%` }} />
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                Upload a clear photo or PDF of each document (up to 10 MB). Your account is activated by the admin once all documents are approved.
              </p>
            </div>

            {view.items.map((it) => (
              <div key={it.docType} className="bg-white rounded-xl border border-neutral-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900 text-sm">{it.label}</p>
                    <p className="text-xs text-neutral-500">{it.hint}</p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${BADGE[it.status]}`}>{BADGE_TEXT[it.status]}</span>
                </div>

                {it.document && (
                  <p className="text-xs text-neutral-600 mt-2 truncate">
                    {it.document.originalName || 'Uploaded file'} · {new Date(it.document.uploadedAt).toLocaleDateString('en-IN')}
                    <button onClick={() => open(it.document!._id)} className="ml-2 font-semibold text-orange-600 hover:underline">View</button>
                  </p>
                )}
                {it.status === 'Rejected' && it.document?.remarks && (
                  <p className="text-xs text-red-700 bg-red-50 rounded-lg px-2.5 py-1.5 mt-2">Not accepted: {it.document.remarks}</p>
                )}
                {it.replacement && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-2">
                    A new file is waiting for admin review. Your approved document stays valid until then.
                  </p>
                )}

                <button
                  onClick={() => choose(it.docType)}
                  disabled={uploading !== null}
                  className={`mt-3 w-full py-2 rounded-lg text-sm font-semibold disabled:opacity-60 ${
                    it.status === 'Missing' || it.status === 'Rejected'
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  {uploading === it.docType ? 'Uploading…' : it.status === 'Missing' ? 'Upload' : it.status === 'Approved' ? 'Upload a new version' : 'Upload again'}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
