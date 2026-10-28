import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getReviewCounts } from "../../../services/api/admin/adminProductService";

const SEEN_KEY = {
  draft: "admin_seen_draft_products",
  pending: "admin_seen_pending_products",
  sellerDraft: "admin_seen_draft_sellers",
} as const;
const DRAFT_PATH = "/admin/product/drafts";
const APPROVAL_PATH = "/admin/product/approvals";
const SELLER_DRAFT_PATH = "/admin/manage-seller/drafts";

const readSeen = (key: string) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};
const writeSeen = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — the badge simply stays until the next visit */
  }
};

/**
 * Sidebar badges: how many drafts / products awaiting review are NEW since the
 * admin last opened that page. Opening the page clears the badge.
 */
export function useProductReviewCounts() {
  const location = useLocation();
  const [counts, setCounts] = useState({ draft: 0, pending: 0, sellerDraft: 0 });
  const serverTime = useRef("");

  const refresh = useCallback(async () => {
    try {
      const res = await getReviewCounts(readSeen(SEEN_KEY.draft), readSeen(SEEN_KEY.pending), readSeen(SEEN_KEY.sellerDraft));
      if (!res.success) return;
      serverTime.current = res.data.serverTime;
      setCounts({ draft: res.data.draft.new, pending: res.data.pending.new, sellerDraft: res.data.sellerDraft?.new ?? 0 });
    } catch {
      /* badges are optional — never block the sidebar */
    }
  }, []);

  // Opening a page marks everything as seen up to the server's clock.
  useEffect(() => {
    const kind = location.pathname.startsWith(DRAFT_PATH)
      ? "draft"
      : location.pathname.startsWith(APPROVAL_PATH)
        ? "pending"
        : location.pathname.startsWith(SELLER_DRAFT_PATH)
          ? "sellerDraft"
          : null;
    (async () => {
      if (kind) {
        if (!serverTime.current) await refresh();
        writeSeen(SEEN_KEY[kind], serverTime.current || new Date().toISOString());
        setCounts((c) => ({ ...c, [kind]: 0 }));
      } else {
        refresh();
      }
    })();
  }, [location.pathname, refresh]);

  useEffect(() => {
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, [refresh]);

  return counts;
}
