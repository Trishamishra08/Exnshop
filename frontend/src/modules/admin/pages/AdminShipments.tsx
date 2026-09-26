import { useState, useEffect } from "react";
import {
  getShipmentOrders,
  updateShipment,
  type Order,
} from "../../../services/api/admin/adminOrderService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";

const SHIPMENT_STATUSES = ["Processed", "Shipped", "Out for Delivery", "Delivered", "Cancelled"];

interface RowDraft {
  courierName: string;
  awbCode: string;
  trackingUrl: string;
  orderStatus: string;
}

export default function AdminShipments() {
  const { isAuthenticated, token } = useAuth();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {};
      if (searchQuery) params.search = searchQuery;
      if (statusFilter !== "All Status") params.status = statusFilter;

      const response = await getShipmentOrders(params);
      if (response.success && Array.isArray(response.data)) {
        setOrders(response.data);
        const nextDrafts: Record<string, RowDraft> = {};
        response.data.forEach((order) => {
          nextDrafts[order._id] = {
            courierName: order.shiprocket?.courierName || "",
            awbCode: order.shiprocket?.awbCode || "",
            trackingUrl: order.shiprocket?.trackingUrl || "",
            orderStatus: order.status,
          };
        });
        setDrafts(nextDrafts);
      } else {
        setOrders([]);
      }
    } catch (err: any) {
      console.error("Error fetching shipments:", err);
      setError(err.response?.data?.message || "Failed to load shipments. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setLoading(false);
      return;
    }
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders();
  };

  const updateDraft = (orderId: string, field: keyof RowDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [orderId]: { ...prev[orderId], [field]: value },
    }));
  };

  const handleSave = async (orderId: string) => {
    const draft = drafts[orderId];
    if (!draft) return;
    try {
      setSavingId(orderId);
      const response = await updateShipment(orderId, {
        courierName: draft.courierName,
        awbCode: draft.awbCode,
        trackingUrl: draft.trackingUrl,
        orderStatus: draft.orderStatus as RowDraft["orderStatus"] as any,
      });
      if (response.success) {
        showToast("Shipment updated", "success");
        setOrders((prev) =>
          prev.map((o) => (o._id === orderId ? { ...o, ...response.data } : o))
        );
      } else {
        showToast(response.message || "Failed to update shipment", "error");
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || "Failed to update shipment", "error");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-neutral-900">Manage Shipments</h1>
        <p className="text-sm text-neutral-500 mt-1">
          E-Commerce channel orders. Set courier, AWB/tracking number, and shipping status manually
          until Shiprocket is connected — once integrated, these will update automatically.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order #, customer, AWB..."
            className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            Search
          </button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option>All Status</option>
          {SHIPMENT_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-neutral-600">Order</th>
              <th className="px-4 py-3 text-left font-semibold text-neutral-600">Customer</th>
              <th className="px-4 py-3 text-left font-semibold text-neutral-600">Courier</th>
              <th className="px-4 py-3 text-left font-semibold text-neutral-600">AWB / Tracking No.</th>
              <th className="px-4 py-3 text-left font-semibold text-neutral-600">Tracking URL</th>
              <th className="px-4 py-3 text-left font-semibold text-neutral-600">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-neutral-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  Loading shipments...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  No E-Commerce orders found.
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const draft = drafts[order._id] || {
                  courierName: "",
                  awbCode: "",
                  trackingUrl: "",
                  orderStatus: order.status,
                };
                const customerName =
                  typeof order.customer === "object" ? order.customer.name : order.customerName;
                return (
                  <tr key={order._id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-neutral-900 whitespace-nowrap">
                      {order.orderNumber}
                    </td>
                    <td className="px-4 py-3 text-neutral-700 whitespace-nowrap">{customerName}</td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={draft.courierName}
                        onChange={(e) => updateDraft(order._id, "courierName", e.target.value)}
                        placeholder="e.g. Delhivery"
                        className="w-32 px-2 py-1.5 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={draft.awbCode}
                        onChange={(e) => updateDraft(order._id, "awbCode", e.target.value)}
                        placeholder="AWB / Tracking #"
                        className="w-36 px-2 py-1.5 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={draft.trackingUrl}
                        onChange={(e) => updateDraft(order._id, "trackingUrl", e.target.value)}
                        placeholder="https://..."
                        className="w-40 px-2 py-1.5 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={draft.orderStatus}
                        onChange={(e) => updateDraft(order._id, "orderStatus", e.target.value)}
                        className="px-2 py-1.5 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {SHIPMENT_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleSave(order._id)}
                        disabled={savingId === order._id}
                        className="px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
                      >
                        {savingId === order._id ? "Saving..." : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
