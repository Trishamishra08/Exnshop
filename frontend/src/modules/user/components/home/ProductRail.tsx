import { useEffect, useState } from "react";
import api from "../../../../services/api/config";
import { useLocation } from "../../../../hooks/useLocation";
import { useCommerceMode } from "../../../../context/CommerceModeContext";
import { useTranslation } from "../../../../hooks/useTranslation";
import DealCard from "./DealCard";
import type { HomeTheme, HomeProductSection } from "./homeTheme";

/**
 * A home-page row of product cards. Title, subtitle, emoji, sort and size all
 * come from Admin › Home Page Content; the products come from the regular
 * products API (same channel + location filtering as the category pages).
 * Hidden when there is nothing to show.
 *
 * Results are kept in memory per (sort, mode, location) so switching
 * Quick ⇄ Shop All shows the last list instantly while it refreshes quietly.
 */

const railCache = new Map<string, any[]>();

const railKey = (section: Pick<HomeProductSection, "sort" | "limit">, mode: string, lat?: number, lng?: number) =>
  `${section.sort}|${section.limit}|${mode}|${lat?.toFixed(3) ?? "-"}|${lng?.toFixed(3) ?? "-"}`;

export async function fetchRail(section: Pick<HomeProductSection, "sort" | "limit">, mode: "Quick" | "ECommerce", lat?: number, lng?: number) {
  const params: any = { limit: section.limit || 12, mode: mode === "ECommerce" ? "ecommerce" : "quick" };
  if (section.sort && section.sort !== "newest") params.sort = section.sort;
  if (lat && lng) {
    params.latitude = lat;
    params.longitude = lng;
  }
  const res = await api.get("/customer/products", { params, skipLoader: true } as any);
  const list = res.data?.success ? res.data.data || [] : [];
  railCache.set(railKey(section, mode, lat, lng), list);
  return list;
}

/** Warm the cache for the other mode so the first switch is instant too. */
export function prefetchRails(sections: HomeProductSection[], mode: "Quick" | "ECommerce", lat?: number, lng?: number) {
  sections.forEach((s) => {
    if (!railCache.has(railKey(s, mode, lat, lng))) fetchRail(s, mode, lat, lng).catch(() => {});
  });
}

export default function ProductRail({ section, theme, onViewAll }: { section: HomeProductSection; theme: HomeTheme; onViewAll?: () => void }) {
  const { location } = useLocation();
  const { mode } = useCommerceMode();
  const { getTranslatedField, t } = useTranslation();
  const lat = location?.latitude;
  const lng = location?.longitude;
  const key = railKey(section, mode, lat, lng);
  const [products, setProducts] = useState<any[] | null>(() => railCache.get(key) || null);

  useEffect(() => {
    let cancelled = false;
    const cached = railCache.get(key);
    setProducts(cached || null);
    fetchRail(section, mode, lat, lng)
      .then((list) => {
        if (!cancelled) setProducts(list);
      })
      .catch(() => {
        if (!cancelled && !cached) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (products && products.length === 0) return null;

  const title = getTranslatedField(section, "title") || section.title;
  const subtitle = getTranslatedField(section, "subtitle") || section.subtitle;
  const inner = section.tinted ? "px-2.5 sm:px-3" : "px-3 min-[400px]:px-4 md:px-6 lg:px-8";

  return (
    <section
      className={`mt-4 ${section.tinted ? "py-3 mx-3 min-[400px]:mx-4 md:mx-6 lg:mx-8 rounded-2xl" : ""}`}
      style={section.tinted ? { background: `linear-gradient(180deg, ${theme.tint} 0%, #ffffff 100%)`, border: `1px solid ${theme.tintBorder}` } : undefined}
    >
      <div className={`flex items-center justify-between gap-2 mb-2 ${inner}`}>
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[16px] sm:text-xl font-bold tracking-tight text-neutral-900 leading-tight">
            {section.emoji && <span aria-hidden="true">{section.emoji}</span>}
            <span className="truncate">{title}</span>
          </h2>
          {subtitle && <p className="text-[10px] sm:text-xs text-neutral-500 font-medium mt-0.5 truncate">{subtitle}</p>}
        </div>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="flex-shrink-0 flex items-center text-[#0056FF] font-semibold text-xs sm:text-sm">
            {t("common.viewAll", "View All")}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        )}
      </div>

      <div className={`flex gap-1.5 min-[400px]:gap-2 overflow-x-auto scrollbar-hide pb-1 snap-x ${inner}`}>
        {products === null
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[30%] min-[360px]:w-[23.5%] md:w-[18%] lg:w-[14%]">
                <div className="aspect-[3/4.6] rounded-xl bg-neutral-100 animate-pulse" />
              </div>
            ))
          : products.map((p) => (
              <div key={p._id || p.id} className="snap-start flex-shrink-0 w-[30%] min-[360px]:w-[23.5%] md:w-[18%] lg:w-[14%]">
                <DealCard product={p} theme={theme} />
              </div>
            ))}
      </div>
    </section>
  );
}
