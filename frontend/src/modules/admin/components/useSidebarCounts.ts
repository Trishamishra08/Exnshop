import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../../../services/api/config";

/**
 * Number of items waiting for the admin on each sidebar page (keyed by path):
 * new tickets, bank / profile change requests, returns, withdrawals, unread notifications…
 * Refreshes on every page change and every 30 seconds.
 */
export function useSidebarCounts() {
  const location = useLocation();
  const [counts, setCounts] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/admin/sidebar-counts");
      if (res.data?.success) setCounts(res.data.data || {});
    } catch {
      /* badges are optional — never block the sidebar */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [location.pathname, refresh]);

  useEffect(() => {
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return counts;
}
