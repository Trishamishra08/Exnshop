import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../services/api/config';
import {
  EXNSHOP_TERMS_AND_CONDITIONS,
  EXNSHOP_PRIVACY_POLICY,
} from '../../constants/exnshopTermsPolicy';

const LEGAL_NAME = 'EXNSHOP TECHNOLOGY PRIVATE LIMITED';

/** Fix stale API/DB text that still uses the old company name */
function withLegalCompanyName(content: string): string {
  return content
    .replace(/ExnShop Commerce Pvt\.?\s*Ltd\.?/gi, LEGAL_NAME)
    .replace(/Exnshop Commerce Private Limited/gi, LEGAL_NAME)
    .replace(/ExnShop Commerce Private Limited/gi, LEGAL_NAME);
}

interface PolicyData {
  _id?: string;
  title: string;
  content: string;
  version?: string;
  updatedAt?: string;
}

type PolicyKind = 'privacy' | 'terms' | 'customer';

function resolveKind(pathname: string): PolicyKind {
  if (pathname.includes('privacy')) return 'privacy';
  if (pathname.includes('customer-policy')) return 'customer';
  return 'terms';
}

const TITLES: Record<PolicyKind, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms & Conditions',
  customer: 'Customer Policy',
};

const FALLBACKS: Record<PolicyKind, string> = {
  privacy: EXNSHOP_PRIVACY_POLICY,
  terms: EXNSHOP_TERMS_AND_CONDITIONS,
  customer: EXNSHOP_TERMS_AND_CONDITIONS,
};

export default function CustomerPolicy() {
  const navigate = useNavigate();
  const location = useLocation();
  const kind = resolveKind(location.pathname);
  const [policy, setPolicy] = useState<PolicyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        // Always use local Privacy Policy (correct legal name)
        if (kind === 'privacy') {
          if (!cancelled) {
            setPolicy({
              title: TITLES.privacy,
              content: EXNSHOP_PRIVACY_POLICY,
            });
          }
          return;
        }

        // Prefer local Terms so Contact Us always shows the correct legal name
        if (kind === 'terms') {
          if (!cancelled) {
            setPolicy({
              title: TITLES.terms,
              content: EXNSHOP_TERMS_AND_CONDITIONS,
            });
          }
          // Still try to refresh API/DB in background (non-blocking)
          api.get('/customer/policy').catch(() => undefined);
          return;
        }

        const response = await api.get('/customer/policy');
        if (response.data?.success && response.data?.data?.content) {
          let content = withLegalCompanyName(String(response.data.data.content));
          if (/ExnShop Commerce|Olovely|10 Minute App/i.test(content)) {
            content = FALLBACKS[kind];
          }
          if (!cancelled) {
            setPolicy({
              ...response.data.data,
              title: TITLES.customer,
              content,
            });
          }
        } else if (!cancelled) {
          setPolicy({
            title: TITLES[kind],
            content: FALLBACKS[kind],
          });
        }
      } catch (err) {
        console.error('Failed to fetch customer policy:', err);
        if (!cancelled) {
          setPolicy({
            title: TITLES[kind],
            content: FALLBACKS[kind],
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const title = policy?.title || TITLES[kind];

  return (
    <div className="pb-8 bg-white min-h-screen">
      <div className="bg-gradient-to-b from-blue-50 to-white pb-6 pt-4 sticky top-0 z-10 border-b border-neutral-100">
        <div className="px-4 md:px-6 lg:px-8 max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-neutral-900 hover:text-primary transition-colors shrink-0"
              aria-label="Back"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h1 className="text-lg sm:text-xl font-bold text-neutral-900">{title}</h1>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 lg:px-8 py-6 max-w-3xl mx-auto">
        {loading ? (
          <div className="py-20 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-sm text-neutral-600">Loading policy...</p>
          </div>
        ) : (
          <div className="bg-white">
            {policy?.updatedAt && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500 mb-6 pb-4 border-b border-neutral-100">
                <span>Last Updated: {formatDate(policy.updatedAt)}</span>
                {policy.version && <span>Version: {policy.version}</span>}
              </div>
            )}
            <div className="prose prose-sm sm:prose-base max-w-none text-neutral-700 leading-relaxed whitespace-pre-wrap font-sans break-words">
              {policy?.content}
            </div>
            <p className="mt-8 text-xs text-neutral-500 flex flex-wrap gap-x-3 gap-y-1">
              {kind !== 'privacy' && (
                <button type="button" onClick={() => navigate('/privacy-policy')} className="text-primary underline">
                  Privacy Policy
                </button>
              )}
              {kind !== 'terms' && (
                <button type="button" onClick={() => navigate('/terms-and-conditions')} className="text-primary underline">
                  Terms & Conditions
                </button>
              )}
              <button type="button" onClick={() => navigate('/refund-policy')} className="text-primary underline">
                Refund Policy
              </button>
              <button type="button" onClick={() => navigate('/about-us')} className="text-primary underline">
                About Us
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
