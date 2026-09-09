import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api/config';
import { EXNSHOP_REFUND_POLICY } from '../../constants/exnshopTermsPolicy';

interface PolicyData {
  title: string;
  content: string;
  updatedAt?: string;
}

export default function RefundPolicy() {
  const navigate = useNavigate();
  const [policy, setPolicy] = useState<PolicyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchRefundPolicy = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await api.get('/customer/refund-policy');
        if (response.data?.success && response.data?.data) {
          setPolicy(response.data.data);
        } else {
          setPolicy({
            title: 'Refund & Cancellation Policy',
            content: EXNSHOP_REFUND_POLICY,
          });
        }
      } catch (err: any) {
        console.error('Failed to fetch refund policy:', err);
        setPolicy({
          title: 'Refund & Cancellation Policy',
          content: EXNSHOP_REFUND_POLICY,
        });
        setError('');
      } finally {
        setLoading(false);
      }
    };
    fetchRefundPolicy();
  }, []);

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
            <h1 className="text-lg sm:text-xl font-bold text-neutral-900">
              {policy?.title || 'Refund & Cancellation Policy'}
            </h1>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 lg:px-8 py-6 max-w-3xl mx-auto">
        {loading ? (
          <div className="py-20 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-sm text-neutral-600">Loading refund policy...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center bg-red-50 rounded-2xl p-6 border border-red-100">
            <p className="text-sm font-semibold text-red-700 mb-1">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-dark transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="bg-white">
            {policy?.updatedAt && (
              <div className="flex items-center justify-between text-xs text-neutral-500 mb-6 pb-4 border-b border-neutral-100">
                <span>Last Updated: {formatDate(policy.updatedAt)}</span>
              </div>
            )}
            <div className="prose prose-sm sm:prose-base max-w-none text-neutral-700 leading-relaxed whitespace-pre-wrap font-sans break-words">
              {policy?.content}
            </div>
            <p className="mt-8 text-xs text-neutral-500 flex flex-wrap gap-x-3 gap-y-1">
              <button type="button" onClick={() => navigate('/terms-and-conditions')} className="text-primary underline">
                Terms & Conditions
              </button>
              <button type="button" onClick={() => navigate('/privacy-policy')} className="text-primary underline">
                Privacy Policy
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
