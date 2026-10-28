import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProducts, submitDraftForReview, updateProduct } from "../../../services/api/admin/adminProductService";
import { useToast } from "../../../context/ToastContext";
import { useAdminMode } from "../context/AdminModeContext";

interface DraftRow {
  _id: string;
  productName: string;
  mainImage?: string;
  seller?: { storeName?: string; sellerName?: string } | string;
  category?: { name?: string } | string | null;
  updatedAt?: string;
  missingFields?: string[];
}

const sellerOf = (p: DraftRow) =>
  typeof p.seller === "object" && p.seller ? p.seller.storeName || p.seller.sellerName || "Unknown seller" : "Unknown seller";

/**
 * Products a seller started but never submitted. The admin can open one to
 * finish it; once nothing is missing it can be sent on to Product Approvals.
 */
export default function AdminDraftProducts() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { mode } = useAdminMode();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProducts({ status: "Draft", limit: 500, channel: mode });
      setRows(res.success ? ((res.data as unknown) as DraftRow[]) : []);
    } catch {
      showToast("Could not load draft products", "error");
    } finally {
      setLoading(false);
    }
  }, [mode, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const publishNow = async (id: string) => {
    setBusyId(id);
    try {
      const res = await updateProduct(id, { publish: true } as any);
      showToast(res.message || "Product is live", "success");
      await load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Could not publish this product", "error");
    } finally {
      setBusyId(null);
    }
  };

  const sendToReview = async (id: string) => {
    setBusyId(id);
    try {
      const res = await submitDraftForReview(id);
      showToast(res.message || "Sent to Product Approvals", "success");
      await load();
    } catch (err: any) {
      showToast(err?.response?.data?.message || "Could not send this draft to review", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        <div className="bg-teal-700 px-6 py-4">
          <h1 className="text-xl font-semibold text-white">Draft Products</h1>
          <p className="text-sm text-teal-100 mt-1">
            Products sellers started but have not submitted. A draft can be published only after every required detail is filled in. Open one to help the seller finish it.
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-center text-neutral-600">Loading drafts…</p>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-semibold text-neutral-700">No draft products.</p>
            <p className="text-sm text-neutral-500 mt-1">Products a seller leaves unfinished will show up here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-600">
                <tr>
                  <th className="p-4 font-semibold">Product</th>
                  <th className="p-4 font-semibold">Seller</th>
                  <th className="p-4 font-semibold">Still missing</th>
                  <th className="p-4 font-semibold">Last saved</th>
                  <th className="p-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const missing = p.missingFields || [];
                  const complete = missing.length === 0;
                  return (
                    <tr key={p._id} className="border-t border-neutral-200 align-top">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {p.mainImage ? (
                            <img src={p.mainImage} alt="" className="w-12 h-12 rounded object-cover border border-neutral-200" />
                          ) : (
                            <div className="w-12 h-12 rounded bg-neutral-100 border border-neutral-200" />
                          )}
                          <span className="font-medium text-neutral-900 line-clamp-2 max-w-xs">{p.productName || "Untitled product"}</span>
                        </div>
                      </td>
                      <td className="p-4 text-neutral-700">{sellerOf(p)}</td>
                      <td className="p-4">
                        {complete ? (
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Complete</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-w-sm">
                            {missing.map((m) => (
                              <span key={m} className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">
                                {m}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-neutral-600 whitespace-nowrap">
                        {p.updatedAt ? new Date(p.updatedAt).toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/admin/product/edit/${p._id}`)}
                            className="px-3 py-1.5 text-xs font-semibold text-blue-700 border border-blue-300 hover:bg-blue-50 rounded">
                            {complete ? "Edit" : "Complete details"}
                          </button>
                          <button
                            onClick={() => publishNow(p._id)}
                            disabled={!complete || busyId === p._id}
                            title={complete ? "Make this product live for customers" : "Complete the missing details first"}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded disabled:opacity-40 disabled:cursor-not-allowed">
                            {busyId === p._id ? "Publishing…" : "Publish"}
                          </button>
                          <button
                            onClick={() => sendToReview(p._id)}
                            disabled={!complete || busyId === p._id}
                            title={complete ? "Send to Product Approvals for a second check" : "Complete the missing details first"}
                            className="px-3 py-1.5 text-xs font-semibold text-neutral-700 border border-neutral-300 hover:bg-neutral-50 rounded disabled:opacity-40 disabled:cursor-not-allowed">
                            Send to review
                          </button>
                        </div>
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
