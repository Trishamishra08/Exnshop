import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../../../context/ToastContext';
import {
  AdminOnboardingView,
  BUSINESS_TYPE_LABELS,
  STATUS_META,
  SectionKey,
  apiErrorMessage,
  decideSellerAdmin,
  getSellerDocumentUrlAdmin,
  getSellerOnboardingAdmin,
  CheckType,
  runVerificationsAdmin,
  reviewSellerDocumentAdmin,
  reviewSellerSectionAdmin,
} from '../../../services/api/sellerOnboardingService';

const SECTION_TITLES: Record<SectionKey, string> = {
  business: 'Business details',
  kyc: 'KYC documents',
  bank: 'Bank account',
  store: 'Store details',
};

const REVIEW_TONE: Record<string, string> = {
  NotSubmitted: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  Submitted: 'bg-blue-50 text-blue-800 border-blue-200',
  Approved: 'bg-green-50 text-green-800 border-green-200',
  ChangesRequired: 'bg-orange-50 text-orange-800 border-orange-200',
};
const REVIEW_LABEL: Record<string, string> = {
  NotSubmitted: 'Not submitted',
  Submitted: 'Awaiting review',
  Approved: 'Approved',
  ChangesRequired: 'Changes required',
};

const ACTION_LABELS: Record<string, string> = {
  REGISTERED: 'Registered',
  SUBMITTED: 'Submitted application',
  RESUBMITTED: 'Resubmitted application',
  BUSINESS_UPDATED: 'Updated business details',
  BANK_UPDATED: 'Updated bank details',
  STORE_UPDATED: 'Updated store details',
  PROFILE_UPDATED: 'Updated profile',
  DOCUMENT_UPLOADED: 'Uploaded document',
  DOCUMENT_REPLACED: 'Replaced document',
  DOCUMENT_DELETED: 'Removed document',
  DOCUMENT_VIEWED: 'Viewed document',
  VERIFICATION_RUN: 'Ran automatic checks',
  DOCUMENT_APPROVED: 'Approved document',
  DOCUMENT_REJECTED: 'Rejected document',
  SECTION_APPROVED: 'Approved section',
  SECTION_CHANGESREQUIRED: 'Requested changes',
  STATUS_APPROVE: 'Approved seller',
  STATUS_REQUEST_CHANGES: 'Sent back for changes',
  STATUS_REJECT: 'Rejected seller',
  STATUS_SUSPEND: 'Suspended seller',
  STATUS_REACTIVATE: 'Reactivated seller',
  STATUS_ACTIVE: 'Became active',
  STATUS_OVERRIDE: 'Changed status from seller list',
  ADMIN_EDIT: 'Edited seller',
  MIGRATED_TO_ONBOARDING: 'Migrated to onboarding',
};

const CHECKS: { type: CheckType; title: string; hint: string }[] = [
  { type: 'PAN', title: 'PAN card', hint: 'Reads the PAN card photo and compares PAN and name' },
  { type: 'CHEQUE', title: 'Cancelled cheque', hint: 'Reads the cheque and compares account, IFSC and name' },
  { type: 'BANK', title: 'Bank account', hint: 'Asks the bank if the account exists and who holds it' },
  { type: 'FACE', title: 'Selfie match', hint: 'Compares the selfie with the photo on the PAN card' },
];
const CHECK_TONE: Record<string, string> = {
  Passed: 'bg-green-50 text-green-800 border-green-200',
  Failed: 'bg-red-50 text-red-700 border-red-200',
  Inconclusive: 'bg-amber-50 text-amber-800 border-amber-200',
  TestMode: 'bg-purple-50 text-purple-800 border-purple-200',
  Error: 'bg-neutral-100 text-neutral-700 border-neutral-200',
};
const CHECK_LABEL: Record<string, string> = {
  Passed: 'Passed',
  Failed: 'Failed',
  Inconclusive: 'Check by eye',
  TestMode: 'Test mode',
  Error: 'Could not run',
};

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-neutral-100 last:border-0">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-neutral-900 text-right break-all">{value || <span className="text-neutral-400">—</span>}</span>
    </div>
  );
}

export default function AdminSellerReview() {
  const { id = '' } = useParams();
  const { showToast } = useToast();
  const [data, setData] = useState<AdminOnboardingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [decisionNote, setDecisionNote] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await getSellerOnboardingAdmin(id);
      setData(res.data);
    } catch (err) {
      showToast(apiErrorMessage(err, 'Failed to load seller'), 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<any>, success: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(success, 'success');
      await load();
      return true;
    } catch (err) {
      showToast(apiErrorMessage(err), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const [runningCheck, setRunningCheck] = useState<string | null>(null);
  const runChecks = async (checks?: CheckType[]) => {
    setRunningCheck(checks?.length === 1 ? checks[0] : 'ALL');
    try {
      const res = await runVerificationsAdmin(id, checks);
      setData(res.data);
      showToast('Checks completed', 'success');
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not run the checks'), 'error');
    } finally {
      setRunningCheck(null);
    }
  };

  const openDoc = async (docId: string) => {
    const tab = window.open('', '_blank');
    try {
      const res = await getSellerDocumentUrlAdmin(id, docId);
      if (tab) tab.location.href = res.data.url;
      load();
    } catch (err) {
      tab?.close();
      showToast(apiErrorMessage(err, 'Could not open document'), 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }
  if (!data) return <p className="p-6 text-sm text-neutral-600">Seller not found.</p>;

  const status = data.onboardingStatus;
  const meta = STATUS_META[status];
  const allApproved = (['business', 'kyc', 'bank', 'store'] as SectionKey[]).every((s) => data.sections[s].reviewStatus === 'Approved');

  const sectionControls = (section: SectionKey) => {
    const sec = data.sections[section];
    return (
      <div className="mt-3 pt-3 border-t border-neutral-100 space-y-2">
        {sec.remarks && sec.reviewStatus === 'ChangesRequired' && (
          <p className="text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">Sent back: {sec.remarks}</p>
        )}
        {!sec.complete && <p className="text-xs text-red-600">Incomplete: {sec.missing.join(', ')}</p>}
        <textarea
          rows={2}
          value={notes[section] || ''}
          onChange={(e) => setNotes((p) => ({ ...p, [section]: e.target.value }))}
          placeholder="Note for the seller (required when requesting changes)"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            disabled={busy}
            onClick={() =>
              act(() => reviewSellerSectionAdmin(id, section, 'ChangesRequired', notes[section]), 'Marked as changes required').then(
                (ok) => ok && setNotes((p) => ({ ...p, [section]: '' }))
              )
            }
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100 disabled:opacity-50"
          >
            Request changes
          </button>
          <button
            disabled={busy || !sec.complete}
            onClick={() => act(() => reviewSellerSectionAdmin(id, section, 'Approved'), `${SECTION_TITLES[section]} approved`)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {section === 'bank' ? 'Mark bank verified' : 'Approve section'}
          </button>
        </div>
      </div>
    );
  };

  const card = (section: SectionKey, body: React.ReactNode) => (
    <section className="bg-white rounded-xl border border-neutral-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-semibold text-neutral-900">{SECTION_TITLES[section]}</h3>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${REVIEW_TONE[data.sections[section].reviewStatus]}`}>
          {REVIEW_LABEL[data.sections[section].reviewStatus]}
        </span>
      </div>
      {body}
      {sectionControls(section)}
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Link to="/admin/manage-seller/list" className="text-xs text-teal-700 hover:underline">
            ← Back to sellers
          </Link>
          <h1 className="text-2xl font-semibold text-neutral-800">{data.seller.storeName}</h1>
          <p className="text-sm text-neutral-500">
            {data.seller.sellerName} · {data.seller.mobile} · {data.seller.email}
          </p>
        </div>
        <span className={`self-start px-3 py-1 rounded-full text-xs font-bold border ${meta.tone}`}>{meta.label}</span>
      </div>

      {data.statusReason && (
        <p className="text-sm bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-neutral-700">
          <span className="font-semibold">Status note:</span> {data.statusReason}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <section className="bg-white rounded-xl border border-neutral-200 p-4">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-semibold text-neutral-900">Automatic checks</h3>
              <button
                disabled={!!runningCheck || !data.verification.configured}
                onClick={() => runChecks()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {runningCheck === 'ALL' ? 'Running…' : 'Run all checks'}
              </button>
            </div>
            <p className="text-xs text-neutral-500 mb-3">
              These help you review faster. They never approve anything by themselves, so you still make the final decision. Each check may cost a few rupees.
            </p>
            {!data.verification.configured && (
              <p className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Not set up yet. Add APICLUB_API_KEY to the backend environment to enable these checks.
              </p>
            )}
            {data.verification.configured && data.verification.testMode && (
              <p className="mb-3 text-xs text-purple-800 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                Test mode: the verification provider returns dummy data, so results can't confirm anything real. Switch to the production URL to go live.
              </p>
            )}
            <ul className="divide-y divide-neutral-100">
              {CHECKS.map((c) => {
                const result = data.verification.checks.find((r) => r.type === c.type);
                return (
                  <li key={c.type} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-800">{c.title}</p>
                        <p className="text-[11px] text-neutral-500">{c.hint}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {result && (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${CHECK_TONE[result.status]}`}>{CHECK_LABEL[result.status]}</span>
                        )}
                        <button
                          disabled={!!runningCheck || !data.verification.configured}
                          onClick={() => runChecks([c.type])}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 disabled:opacity-50"
                        >
                          {runningCheck === c.type ? 'Running…' : result ? 'Re-run' : 'Run'}
                        </button>
                      </div>
                    </div>
                    {result && (
                      <div className="mt-1.5 text-xs text-neutral-700">
                        <p>{result.summary}</p>
                        {Object.keys(result.details).length > 0 && (
                          <p className="mt-1 text-[11px] text-neutral-500 break-all">
                            {Object.entries(result.details)
                              .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v || '—'}`)
                              .join(' · ')}
                          </p>
                        )}
                        <p className="text-[10px] text-neutral-400 mt-0.5">
                          {new Date(result.ranAt).toLocaleString('en-IN')}
                          {result.ranBy ? ` · ${result.ranBy}` : ''}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {card(
            'business',
            <div>
              <Row label="Business type" value={BUSINESS_TYPE_LABELS[data.business.businessType] || data.business.businessType} />
              <Row label="Registered name" value={data.business.legalBusinessName} />
              <Row label="PAN" value={data.business.panCard} />
              <Row label="GST registered" value={data.business.gstRegistered === undefined ? undefined : data.business.gstRegistered ? 'Yes' : 'No'} />
              <Row label="GSTIN" value={data.business.gstin} />
              <Row label="FSSAI" value={data.business.fssaiLicNo} />
            </div>
          )}

          {card(
            'kyc',
            <ul className="divide-y divide-neutral-100">
              {[...data.requiredDocuments, ...data.documents.map((d) => d.docType).filter((t) => !data.requiredDocuments.includes(t))].map((type) => {
                const doc = data.documents.find((d) => d.docType === type);
                return (
                  <li key={type} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800">
                        {data.options.documentLabels[type] || type}
                        {data.requiredDocuments.includes(type) && <span className="text-red-500"> *</span>}
                      </p>
                      {doc ? (
                        <p className="text-[11px] text-neutral-500">
                          {doc.originalName} · uploaded {new Date(doc.uploadedAt).toLocaleDateString('en-IN')} ·{' '}
                          <span className={doc.status === 'Approved' ? 'text-green-700' : doc.status === 'Rejected' ? 'text-red-600' : 'text-amber-700'}>{doc.status}</span>
                          {doc.remarks && ` — ${doc.remarks}`}
                        </p>
                      ) : (
                        <p className="text-[11px] text-red-600">Missing</p>
                      )}
                    </div>
                    {doc && (
                      <div className="flex gap-1.5">
                        <button onClick={() => openDoc(doc._id)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-neutral-100 hover:bg-neutral-200">
                          View
                        </button>
                        <button
                          disabled={busy || doc.status === 'Approved'}
                          onClick={() => act(() => reviewSellerDocumentAdmin(id, doc._id, 'Approved'), 'Document approved')}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-50 text-green-800 border border-green-200 disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt('Why is this document rejected? The seller will see this.');
                            if (reason && reason.trim()) act(() => reviewSellerDocumentAdmin(id, doc._id, 'Rejected', reason.trim()), 'Document rejected');
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 disabled:opacity-40"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {card(
            'bank',
            <div>
              <Row label="Account holder" value={data.bank.accountName} />
              <Row label="Account number" value={data.bank.accountNumber} />
              <Row label="IFSC" value={data.bank.ifsc} />
              <Row label="Bank / branch" value={[data.bank.bankName, data.bank.branch].filter(Boolean).join(' — ')} />
              <Row label="UPI" value={data.bank.upiId} />
              <Row
                label="Verification"
                value={`${data.bank.verificationStatus}${data.bank.verificationMethod ? ` (${data.bank.verificationMethod})` : ''}${data.bank.verifiedAt ? ` · ${new Date(data.bank.verifiedAt).toLocaleDateString('en-IN')}` : ''}`}
              />
              <p className="text-[11px] text-neutral-500 mt-2">
                Check the account holder name, number and IFSC against the cancelled cheque before verifying. Payouts stay blocked until this is verified.
              </p>
            </div>
          )}

          {card(
            'store',
            <div>
              <Row label="Store name" value={data.store.storeName} />
              <Row label="Description" value={data.store.storeDescription} />
              <Row label="Pickup address" value={data.store.address} />
              <Row label="Return address" value={data.store.returnAddress} />
              <Row label="City" value={data.store.city} />
              <Row
                label="Map location"
                value={
                  data.store.latitude && data.store.longitude ? (
                    <a
                      className="text-teal-700 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://www.google.com/maps?q=${data.store.latitude},${data.store.longitude}`}
                    >
                      Open in Google Maps
                    </a>
                  ) : undefined
                }
              />
              <Row label="Channels" value={(data.seller.channels || []).join(', ')} />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <section className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
            <h3 className="font-semibold text-neutral-900">Decision</h3>
            <textarea
              rows={3}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="Reason / note (required to reject, suspend or send back without section notes)"
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {['UnderReview', 'ActionRequired'].includes(status) && (
              <button
                disabled={busy || !allApproved}
                onClick={() => act(() => decideSellerAdmin(id, 'approve'), 'Seller approved')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                title={allApproved ? '' : 'Approve every section first'}
              >
                Approve seller
              </button>
            )}
            {status === 'UnderReview' && (
              <button
                disabled={busy}
                onClick={() => act(() => decideSellerAdmin(id, 'request_changes', decisionNote), 'Sent back to seller').then((ok) => ok && setDecisionNote(''))}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
              >
                Send back for changes
              </button>
            )}
            {!['Rejected', 'Approved', 'Active', 'Suspended'].includes(status) && (
              <button
                disabled={busy}
                onClick={() => window.confirm('Reject this seller application?') && act(() => decideSellerAdmin(id, 'reject', decisionNote), 'Seller rejected')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
              >
                Reject application
              </button>
            )}
            {['Approved', 'Active'].includes(status) && (
              <button
                disabled={busy}
                onClick={() => window.confirm('Suspend this seller? Their products stop showing to customers.') && act(() => decideSellerAdmin(id, 'suspend', decisionNote), 'Seller suspended')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Suspend seller
              </button>
            )}
            {status === 'Suspended' && (
              <button
                disabled={busy}
                onClick={() => act(() => decideSellerAdmin(id, 'reactivate', decisionNote), 'Seller reactivated')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Reactivate seller
              </button>
            )}
            {!allApproved && ['UnderReview', 'ActionRequired'].includes(status) && (
              <p className="text-[11px] text-neutral-500">Approve all four sections (including bank verification) to approve the seller.</p>
            )}
            <p className="text-[11px] text-neutral-500">
              Product approval is separate: {data.seller.requireProductApproval ? 'this seller’s products need approval.' : 'this seller’s products go live without approval.'}
            </p>
          </section>

          <section className="bg-white rounded-xl border border-neutral-200 p-4">
            <h3 className="font-semibold text-neutral-900 mb-2">Activity log</h3>
            {data.auditLog.length === 0 ? (
              <p className="text-xs text-neutral-500">No activity yet.</p>
            ) : (
              <ol className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                {data.auditLog.map((entry) => (
                  <li key={entry._id} className="text-xs border-l-2 border-neutral-200 pl-2.5">
                    <p className="font-semibold text-neutral-800">
                      {ACTION_LABELS[entry.action] || entry.action}
                      {entry.section ? <span className="font-normal text-neutral-500"> · {entry.section}</span> : null}
                    </p>
                    <p className="text-neutral-500">
                      {entry.actorName || entry.actorType} · {new Date(entry.createdAt).toLocaleString('en-IN')}
                    </p>
                    {entry.changes && entry.changes.length > 0 && (
                      <ul className="mt-0.5 text-neutral-600">
                        {entry.changes.slice(0, 6).map((c, i) => (
                          <li key={i} className="break-all">
                            {c.field}
                            {c.from || c.to ? `: ${c.from || '—'} → ${c.to || '—'}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                    {entry.remarks && <p className="text-neutral-600 italic">“{entry.remarks}”</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
