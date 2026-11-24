import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import {
  clearSellerNotifications,
  deleteSellerNotification,
  getSellerNotifications,
  markSellerNotificationRead,
  SellerNotification,
} from "../../../services/api/sellerNotificationService";

export default function SellerNotifications() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<SellerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchNotifications = async () => {
    try {
      const data = await getSellerNotifications();
      setNotifications(data);
    } catch (error) {
      console.error("Failed to fetch seller notifications", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await markSellerNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    } catch (error) {
      console.error("Failed to mark notification as read", error);
    }
  };

  const handleOpen = (n: SellerNotification) => {
    if (!n.isRead) handleMarkAsRead(n._id);
    const link = (n as any).link as string | undefined;
    if (link && link.startsWith("/seller")) navigate(link);
  };

  // Only the seller's own notifications can be deleted (not announcements sent to every seller).
  const isOwn = (n: SellerNotification) => Boolean(n.recipientId);

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteSellerNotification(id);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
    } catch (error: any) {
      showToast(error?.response?.data?.message || "Could not delete the notification", "error");
    } finally {
      setBusyId(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Delete all your notifications?")) return;
    setBusyId("ALL");
    try {
      const res = await clearSellerNotifications();
      setNotifications((prev) => prev.filter((n) => !isOwn(n)));
      showToast(res?.message || "Notifications deleted", "success");
    } catch (error: any) {
      showToast(error?.response?.data?.message || "Could not delete the notifications", "error");
    } finally {
      setBusyId(null);
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const hasOwn = notifications.some(isOwn);

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="px-3 sm:px-4 md:px-6 py-4 md:py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-neutral-900 text-xl font-semibold">Notifications</h2>
          {hasOwn && (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={busyId === "ALL"}
              className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              {busyId === "ALL" ? "Deleting…" : "Clear all"}
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-10 text-neutral-500">Loading...</div>
        ) : notifications.length > 0 ? (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification._id}
                onClick={() => handleOpen(notification)}
                className={`bg-white rounded-xl p-4 shadow-sm border cursor-pointer ${
                  notification.isRead ? "border-neutral-200" : "border-orange-200 bg-orange-50"
                }`}
              >
                <div className="flex gap-3 items-start">
                  <div className="mt-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${notification.isRead ? "bg-neutral-300" : "bg-orange-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-neutral-900 text-sm">{notification.title}</div>
                    <div className="text-neutral-600 text-xs mt-1 line-clamp-3">{notification.message}</div>
                    <div className="text-neutral-400 text-[10px] mt-2">{formatTime(notification.createdAt)}</div>
                  </div>
                  {isOwn(notification) && (
                    <button
                      type="button"
                      aria-label="Delete notification"
                      disabled={busyId === notification._id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(notification._id);
                      }}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-8 min-h-[200px] flex items-center justify-center shadow-sm border border-neutral-200">
            <p className="text-neutral-500 text-sm">No notifications</p>
          </div>
        )}
      </div>
    </div>
  );
}
