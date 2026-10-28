import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDraftSellers, type DraftSellerRow } from "../../../services/api/sellerService";
import { useToast } from "../../../context/ToastContext";

const STAGE_LABEL: Record<DraftSellerRow["onboardingStatus"], { label: string; tone: string }> = {
  Draft: { label: "Draft", tone: "bg-amber-100 text-amber-800" },
  KYCPending: { label: "KYC pending", tone: "bg-blue-100 text-blue-800" },
};

/**
 * Sellers who began signing up but never submitted their application. The admin
 * can see exactly what is missing and open the seller's review page to help.
 */
export default function AdminDraftSellers() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [rows, setRows] = useState<DraftSellerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getDraftSellers();
        setRows(res.success ? res.data : []);
      } catch {
        showToast("Could not load draft sellers", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  return (
    <div className="p-4 md:p-6">
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="bg-teal-700 px-6 py-4">
          <h1 className="text-xl font-semibold text-white">Draft Sellers</h1>
          <p className="text-sm text-teal-100 mt-1">
            Sellers who started signing up but have not submitted their application. A seller can sell only after every step is complete and approved.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-neutral-600">Loading draft sellers…</p>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-semibold text-neutral-700">No draft sellers.</p>
            <p className="text-sm text-neutral-500 mt-1">Sellers who leave signup half-way will show up here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-600">
                <tr>
                  <th className="p-4 font-semibold">Seller</th>
                  <th className="p-4 font-semibold">Contact</th>
                  <th className="p-4 font-semibold">Stage</th>
                  <th className="p-4 font-semibold">Still missing</th>
                  <th className="p-4 font-semibold">Last active</th>
                  <th className="p-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const stage = STAGE_LABEL[s.onboardingStatus];
                  const bySection = s.missing.reduce<Record<string, string[]>>((acc, m) => {
                    (acc[m.section] = acc[m.section] || []).push(m.item);
                    return acc;
                  }, {});
                  return (
                    <tr key={s._id} className="border-t border-neutral-200 align-top">
                      <td className="p-4">
                        <p className="font-medium text-neutral-900">{s.sellerName || "—"}</p>
                        <p className="text-neutral-500">{s.storeName || "No store name yet"}</p>
                      </td>
                      <td className="p-4 text-neutral-700">
                        <p>{s.mobile || "—"}</p>
                        <p className="text-neutral-500">{s.email || ""}</p>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${stage.tone}`}>{stage.label}</span>
                      </td>
                      <td className="p-4">
                        {s.missing.length === 0 ? (
                          <span className="text-neutral-500">Nothing missing — seller has not pressed Submit</span>
                        ) : (
                          <div className="space-y-1.5 max-w-sm">
                            {Object.entries(bySection).map(([section, items]) => (
                              <div key={section} className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-semibold text-neutral-600">{section}:</span>
                                {items.map((item) => (
                                  <span key={item} className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">
                                    {item}
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-neutral-600 whitespace-nowrap">
                        {s.updatedAt ? new Date(s.updatedAt).toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => navigate(`/admin/manage-seller/review/${s._id}`)}
                          className="px-3 py-1.5 text-xs font-semibold text-blue-700 border border-blue-300 hover:bg-blue-50 rounded">
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
