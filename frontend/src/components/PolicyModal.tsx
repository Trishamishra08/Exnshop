import { useEffect, useState } from 'react';
import api from '../services/api/config';
import { EXNSHOP_PRIVACY_POLICY, EXNSHOP_TERMS_AND_CONDITIONS } from '../constants/exnshopTermsPolicy';

export type PolicyDoc = 'terms' | 'privacy';

/**
 * Terms / Privacy shown in a popup on the seller and delivery sign-in screens, so the
 * person stays on the page (their half-filled form is kept) and never lands in the
 * customer app. Delivery partners see the delivery app's own terms when the admin has set them.
 */
export default function PolicyModal({ app, doc, onClose }: { app: 'seller' | 'delivery'; doc: PolicyDoc | null; onClose: () => void }) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doc) return;
    const fallbackTitle = doc === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions';
    const fallback = doc === 'privacy' ? EXNSHOP_PRIVACY_POLICY : EXNSHOP_TERMS_AND_CONDITIONS;
    setTitle(fallbackTitle);
    setContent('');
    setLoading(true);
    let cancelled = false;
    api
      .get('/customer/app-policy', { params: { app, doc }, skipLoader: true } as any)
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        setTitle(data?.title || fallbackTitle);
        setContent(data?.content || fallback);
      })
      .catch(() => !cancelled && setContent(fallback))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [app, doc]);

  useEffect(() => {
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, onClose]);

  if (!doc) return null;
  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white w-full sm:max-w-2xl max-h-[85vh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-neutral-200">
          <h2 className="text-base font-bold text-neutral-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 text-neutral-500">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && !content ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (
            <div className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">{content}</div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-neutral-200">
          <button type="button" onClick={onClose} className="w-full h-10 rounded-lg bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
