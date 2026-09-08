import { useState, useEffect } from 'react';
import { useToast } from '../../../context/ToastContext';
import { getPolicies, createPolicy, updatePolicy, Policy } from '../../../services/api/admin/adminContentService';
import { EXNSHOP_TERMS_AND_CONDITIONS } from "../../../constants/exnshopTermsPolicy";

export default function AdminCustomerAppPolicy() {
  const { showToast } = useToast();
  const [policyId, setPolicyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [policyContent, setPolicyContent] = useState(EXNSHOP_TERMS_AND_CONDITIONS);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        setLoading(true);
        const response = await getPolicies({ type: 'customer' });
        if (response.success && response.data && response.data.length > 0) {
          const fetchedPolicy: Policy = response.data[0];
          setPolicyId(fetchedPolicy._id);
          setPolicyContent(fetchedPolicy.content);
        }
      } catch (err) {
        console.error("Failed to fetch customer policy:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPolicy();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyContent.trim()) {
      showToast('Policy text cannot be empty', 'error');
      return;
    }

    try {
      setSubmitting(true);
      if (policyId) {
        const response = await updatePolicy(policyId, {
          title: "Terms & Conditions",
          content: policyContent.trim(),
          version: "2.0",
          isActive: true,
        });
        if (response.success) {
          showToast('Terms & Conditions updated successfully!', 'success');
        } else {
          showToast(response.message || 'Failed to update policy', 'error');
        }
      } else {
        const response = await createPolicy({
          type: "customer",
          title: "Terms & Conditions",
          content: policyContent.trim(),
          version: "2.0",
          isActive: true,
        });
        if (response.success && response.data) {
          setPolicyId(response.data._id);
          showToast('Terms & Conditions created successfully!', 'success');
        } else {
          showToast(response.message || 'Failed to create policy', 'error');
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Error updating policy', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white px-4 sm:px-6 py-4 border-b border-neutral-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Terms & Conditions</h1>
          </div>
          <div className="text-sm text-neutral-600">
            <span className="text-blue-600">Home</span> / <span className="text-neutral-900">Terms & Conditions</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-neutral-50">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Policy Content Section */}
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-teal-600 px-4 sm:px-6 py-3">
                <h2 className="text-white text-lg font-semibold">Policy Content</h2>
              </div>
              <div className="p-4 sm:p-6">
                <div>
                  <label className="block text-sm font-bold text-neutral-800 mb-2">
                    Policy Text <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="policyContent"
                    value={policyContent}
                    onChange={(e) => setPolicyContent(e.target.value)}
                    placeholder="Enter Customer App Policy content..."
                    rows={25}
                    required
                    className="w-full px-4 py-3 border border-neutral-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y font-mono"
                  />
                  <p className="mt-2 text-xs text-neutral-500">
                    You can format the policy content using plain text. Use line breaks and spacing to organize the content.
                  </p>
                </div>
              </div>
            </div>

            {/* Preview Section */}
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-teal-600 px-4 sm:px-6 py-3">
                <h2 className="text-white text-lg font-semibold">Preview</h2>
              </div>
              <div className="p-4 sm:p-6">
                <div className="prose max-w-none">
                  <div className="whitespace-pre-wrap text-sm text-neutral-700 bg-neutral-50 p-4 rounded border border-neutral-200 min-h-[200px] max-h-[400px] overflow-y-auto">
                    {policyContent || 'Policy content will appear here...'}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => setPolicyContent('')}
                className="px-6 py-2.5 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Clear
              </button>
              <button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-2.5 rounded-lg text-base font-medium transition-colors"
              >
                Update Policy
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


