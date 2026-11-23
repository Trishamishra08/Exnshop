import { useEffect, useState } from "react";
import { useToast } from "../../../context/ToastContext";
import {
  getSellerCredits,
  setDefaultCreditLimit,
  setSellerCreditLimit,
  holdSellerBalance,
  type SellerCreditRow,
} from "../../../services/api/admin/adminSellerCreditService";

const inr = (n: number) => `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type HoldAction = "freeze" | "release" | "deduct";

/**
 * Seller credit & holds:
 * - Credit limit: how far a seller's wallet may go below zero for self-delivery COD orders
 *   and ad clicks. Set it for all sellers at once (default) or for one seller.
 * - Hold: freeze part of a seller's available balance (e.g. against a chargeback), release
 *   it, or deduct the chargeback from it.
 */
export default function AdminSellerCredit() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<SellerCreditRow[]>([]);
  const [defaultLimit, setDefaultLimit] = useState(0);
  const [defaultInput, setDefaultInput] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Per-seller editors
  const [limitFor, setLimitFor] = useState<SellerCreditRow | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [holdFor, setHoldFor] = useState<SellerCreditRow | null>(null);
  const [holdAction, setHoldAction] = useState<HoldAction>("freeze");
  const [holdAmount, setHoldAmount] = useState("");
  const [holdReason, setHoldReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSellerCredits({ page, limit: 20, search: query || undefined });
      if (res.success) {
        setRows(res.data.sellers);
        setDefaultLimit(res.data.defaultCreditLimit);
        setDefaultInput((prev) => (prev === "" ? String(res.data.defaultCreditLimit) : prev));
        setPages(res.data.pagination.pages || 1);
        setTotal(res.data.pagination.total || 0);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Could not load sellers", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, query]);

  const saveDefault = async () => {
    const amount = Number(defaultInput);
    if (!Number.isFinite(amount) || amount < 0) return showToast("Enter a credit limit of ₹0 or more", "error");
    if (applyToAll && !window.confirm(`Set ₹${amount} as the credit limit for ALL sellers? Individual limits will be replaced.`)) return;
    setSaving(true);
    try {
      const res = await setDefaultCreditLimit(amount, applyToAll);
      showToast(res.message, "success");
      setApplyToAll(false);
      await load();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveSellerLimit = async (useDefault: boolean) => {
    if (!limitFor) return;
    let value: number | null = null;
    if (!useDefault) {
      value = Number(limitInput);
      if (limitInput.trim() === "" || !Number.isFinite(value) || value < 0) return showToast("Enter a credit limit of ₹0 or more", "error");
    }
    setSaving(true);
    try {
      const res = await setSellerCreditLimit(limitFor._id, value);
      showToast(res.message, "success");
      setLimitFor(null);
      await load();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveHold = async () => {
    if (!holdFor) return;
    const amount = Number(holdAmount);
    if (!Number.isFinite(amount) || amount <= 0) return showToast("Enter an amount greater than zero", "error");
    if (holdAction !== "release" && !holdReason.trim()) return showToast("Add a reason (e.g. the chargeback / order reference)", "error");
    setSaving(true);
    try {
      const res = await holdSellerBalance(holdFor._id, holdAction, amount, holdReason.trim());
      showToast(res.message, "success");
      setHoldFor(null);
      await load();
    } catch (err: any) {
      showToast(err.response?.data?.message || "Could not update the hold", "error");
    } finally {
      setSaving(false);
    }
  };

  const openHold = (row: SellerCreditRow, action: HoldAction) => {
    setHoldFor(row);
    setHoldAction(action);
    setHoldAmount("");
    setHoldReason("");
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Seller Credit &amp; Hold</h1>
        <p className="text-sm text-neutral-600 mt-1 max-w-3xl">
          <b>Credit limit</b>: how far a seller's wallet may go below zero to keep accepting self-delivery COD orders and to run ads.
          Once it is used up, the seller must add money first. <b>Hold</b>: freeze part of a seller's available balance (e.g. against a
          chargeback). Frozen money can't be withdrawn; release it or deduct the chargeback from it.
        </p>
      </div>

      {/* Credit limit for all sellers */}
      <div className="bg-white rounded-lg shadow p-5 border border-neutral-100">
        <h2 className="text-lg font-semibold mb-1">Credit limit for all sellers</h2>
        <p className="text-sm text-neutral-600 mb-4">
          Current default: <b>{inr(defaultLimit)}</b>. Sellers without their own limit use this.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-medium text-neutral-600">Default credit limit (₹)</span>
            <input
              type="number"
              min={0}
              value={defaultInput}
              onChange={(e) => setDefaultInput(e.target.value)}
              className="mt-1 block w-44 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700 pb-2">
            <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />
            Also replace every seller's own limit
          </label>
          <button
            type="button"
            onClick={saveDefault}
            disabled={saving}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
            {applyToAll ? "Apply to all sellers" : "Save default"}
          </button>
        </div>
      </div>

      {/* Sellers */}
      <div className="bg-white rounded-lg shadow border border-neutral-100">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100">
          <h2 className="text-lg font-semibold">Sellers ({total})</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQuery(search.trim());
            }}
            className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search store, name or mobile"
              className="w-64 max-w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button type="submit" className="px-3 py-2 rounded-lg border border-neutral-300 text-sm font-medium hover:bg-neutral-50">
              Search
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Seller</th>
                <th className="text-right px-4 py-3">Available</th>
                <th className="text-right px-4 py-3">On hold</th>
                <th className="text-right px-4 py-3">Frozen</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Credit limit</th>
                <th className="text-right px-4 py-3">Credit used</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-neutral-500">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-neutral-500">No sellers found</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r._id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-900">{r.storeName || r.sellerName}</div>
                      <div className="text-xs text-neutral-500">{r.sellerName}{r.mobile ? ` · ${r.mobile}` : ""}</div>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${r.available < 0 ? "text-red-600" : "text-neutral-900"}`}>{inr(r.available)}</td>
                    <td className="px-4 py-3 text-right text-neutral-700">{inr(r.onHold)}</td>
                    <td className={`px-4 py-3 text-right ${r.frozen > 0 ? "text-amber-700 font-medium" : "text-neutral-500"}`}>{inr(r.frozen)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{inr(r.totalBalance)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-medium">{inr(r.creditLimit)}</div>
                      <div className="text-[11px] text-neutral-500">{r.ownCreditLimit === null ? "default" : "own limit"}</div>
                    </td>
                    <td className={`px-4 py-3 text-right ${r.creditUsed > 0 ? (r.creditRemaining <= 0 ? "text-red-600 font-semibold" : "text-amber-700") : "text-neutral-500"}`}>
                      {inr(r.creditUsed)}
                      {r.creditLimit > 0 && <div className="text-[11px] text-neutral-500">left {inr(r.creditRemaining)}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setLimitFor(r);
                            setLimitInput(r.ownCreditLimit === null ? "" : String(r.ownCreditLimit));
                          }}
                          className="px-2.5 py-1 rounded-md border border-neutral-300 text-xs font-medium hover:bg-neutral-50">
                          Credit limit
                        </button>
                        <button
                          type="button"
                          onClick={() => openHold(r, "freeze")}
                          className="px-2.5 py-1 rounded-md border border-amber-300 text-amber-800 text-xs font-medium hover:bg-amber-50">
                          Hold
                        </button>
                        {r.frozen > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => openHold(r, "release")}
                              className="px-2.5 py-1 rounded-md border border-teal-300 text-teal-800 text-xs font-medium hover:bg-teal-50">
                              Release
                            </button>
                            <button
                              type="button"
                              onClick={() => openHold(r, "deduct")}
                              className="px-2.5 py-1 rounded-md border border-red-300 text-red-700 text-xs font-medium hover:bg-red-50">
                              Deduct chargeback
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-neutral-100 text-sm">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded border border-neutral-300 disabled:opacity-40">
              Previous
            </button>
            <span className="text-neutral-600">Page {page} of {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded border border-neutral-300 disabled:opacity-40">
              Next
            </button>
          </div>
        )}
      </div>

      {/* One seller's credit limit */}
      {limitFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !saving && setLimitFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Credit limit · {limitFor.storeName || limitFor.sellerName}</h3>
            <p className="text-sm text-neutral-600 mt-1">
              Now {inr(limitFor.creditLimit)} ({limitFor.ownCreditLimit === null ? "default" : "own limit"}), used {inr(limitFor.creditUsed)}.
            </p>
            <label className="block mt-4">
              <span className="text-xs font-medium text-neutral-600">This seller's credit limit (₹)</span>
              <input
                type="number"
                min={0}
                autoFocus
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                placeholder={`Default ${defaultLimit}`}
                className="mt-1 block w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {limitFor.ownCreditLimit !== null && (
                <button type="button" disabled={saving} onClick={() => saveSellerLimit(true)} className="px-3 py-2 rounded-lg border border-neutral-300 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50">
                  Use default
                </button>
              )}
              <button type="button" disabled={saving} onClick={() => setLimitFor(null)} className="px-3 py-2 rounded-lg border border-neutral-300 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="button" disabled={saving} onClick={() => saveSellerLimit(false)} className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hold / release / deduct */}
      {holdFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !saving && setHoldFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">
              {holdAction === "freeze" ? "Hold balance" : holdAction === "release" ? "Release held balance" : "Deduct chargeback"} · {holdFor.storeName || holdFor.sellerName}
            </h3>
            <p className="text-sm text-neutral-600 mt-1">
              Available {inr(holdFor.available)} · Frozen {inr(holdFor.frozen)}
            </p>
            <p className="text-xs text-neutral-500 mt-2">
              {holdAction === "freeze"
                ? "Moves this amount from the seller's available balance into a hold. They can't withdraw it."
                : holdAction === "release"
                  ? "Gives this amount back to the seller's available balance."
                  : "Takes this amount out of the held money for a chargeback. It does not come back to the seller."}
            </p>
            <label className="block mt-4">
              <span className="text-xs font-medium text-neutral-600">Amount (₹)</span>
              <input
                type="number"
                min={0}
                autoFocus
                value={holdAmount}
                onChange={(e) => setHoldAmount(e.target.value)}
                className="mt-1 block w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>
            <label className="block mt-3">
              <span className="text-xs font-medium text-neutral-600">Reason{holdAction === "release" ? " (optional)" : ""}</span>
              <input
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="e.g. Chargeback on order ORD…"
                maxLength={300}
                className="mt-1 block w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </label>
            <p className="text-[11px] text-neutral-500 mt-2">The seller sees this on their wallet statement.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setHoldFor(null)} className="px-3 py-2 rounded-lg border border-neutral-300 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveHold}
                className={`px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${holdAction === "deduct" ? "bg-red-600 hover:bg-red-700" : holdAction === "release" ? "bg-teal-600 hover:bg-teal-700" : "bg-amber-600 hover:bg-amber-700"}`}>
                {saving ? "Saving…" : holdAction === "freeze" ? "Hold amount" : holdAction === "release" ? "Release" : "Deduct"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
