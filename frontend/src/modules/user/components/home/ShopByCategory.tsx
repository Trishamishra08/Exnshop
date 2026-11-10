import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCategories } from "../../../../services/api/customerProductService";
import { useTranslation } from "../../../../hooks/useTranslation";
import { categoryEmoji } from "../../../../utils/categoryEmoji";
import type { HomeTheme } from "./homeTheme";

// Categories don't change with Quick / Shop All — keep them for the page session.
let categoriesCache: any[] | null = null;

/**
 * "Shop by Category" tile grid: the top-level categories with their images.
 * Title / how many / on-off come from Admin › Home Page Content.
 */
export default function ShopByCategory({ theme, config }: { theme: HomeTheme; config?: { title: string; limit: number; isActive: boolean } | null }) {
  const navigate = useNavigate();
  const { t, getTranslatedField } = useTranslation();
  const [categories, setCategories] = useState<any[]>(categoriesCache || []);

  useEffect(() => {
    if (categoriesCache) return;
    getCategories()
      .then((res) => {
        categoriesCache = res?.data || [];
        setCategories(categoriesCache);
      })
      .catch(() => setCategories([]));
  }, []);

  if (config && config.isActive === false) return null;
  if (!categories.length) return null;

  return (
    <div className="mt-4 px-3 min-[400px]:px-4 md:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[16px] sm:text-xl font-bold tracking-tight text-neutral-900">{config?.title || t("home.shopByCategory", "Shop by Category")}</h2>
        <button type="button" onClick={() => navigate("/categories")} className="flex items-center text-[#0056FF] font-semibold text-xs sm:text-sm">
          {t("common.viewAll", "View All")}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-4 min-[360px]:grid-cols-5 min-[480px]:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5 sm:gap-3">
        {categories.slice(0, config?.limit || 12).map((c) => {
          const name = getTranslatedField(c, "name") || c.name;
          return (
            <button
              key={c._id}
              type="button"
              onClick={() => navigate(`/category/${c.slug || c._id}`)}
              className="flex flex-col items-center rounded-xl p-1 pb-1.5 bg-white border border-neutral-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] active:scale-95 transition-transform hover:shadow-md"
            >
              <div className="w-full aspect-square rounded-lg overflow-hidden flex items-center justify-center" style={{ background: theme.tint }}>
                {c.image ? (
                  <img src={c.image} alt={name} loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl">{categoryEmoji(c.name)}</span>
                )}
              </div>
              <span className="mt-1 text-[9px] min-[400px]:text-[10px] sm:text-[13px] font-semibold text-neutral-900 text-center leading-[1.2] tracking-tight line-clamp-2 w-full">
                {name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
