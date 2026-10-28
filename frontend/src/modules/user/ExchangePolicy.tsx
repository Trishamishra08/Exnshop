import { useNavigate } from 'react-router-dom';
import { EXNSHOP_EXCHANGE_POLICY } from '../../constants/exnshopTermsPolicy';

export default function ExchangePolicy() {
  const navigate = useNavigate();
  return (
    <div className="pb-8 bg-white min-h-screen">
      <div className="bg-gradient-to-b from-blue-50 to-white pb-6 pt-4 sticky top-0 z-10 border-b border-neutral-100">
        <div className="px-4 md:px-6 lg:px-8 max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-neutral-900 hover:text-primary transition-colors shrink-0" aria-label="Back">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="text-lg sm:text-xl font-bold text-neutral-900">Exchange &amp; Replacement Policy</h1>
        </div>
      </div>
      <div className="px-4 md:px-6 lg:px-8 py-6 max-w-3xl mx-auto">
        <div className="prose prose-sm sm:prose-base max-w-none text-neutral-700 leading-relaxed whitespace-pre-wrap font-sans break-words">
          {EXNSHOP_EXCHANGE_POLICY}
        </div>
        <p className="mt-8 text-xs text-neutral-500 flex flex-wrap gap-x-3 gap-y-1">
          <button type="button" onClick={() => navigate('/refund-policy')} className="text-primary underline">Return &amp; Refund Policy</button>
          <button type="button" onClick={() => navigate('/terms-and-conditions')} className="text-primary underline">Terms &amp; Conditions</button>
        </p>
      </div>
    </div>
  );
}
