import { useEffect, useLayoutEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getHeaderCategoriesPublic, HeaderCategory } from "../../services/api/headerCategoryService";
import { getCategoriesWithChildren, Category as ApiCategory } from "../../services/api/customerProductService";
import { getIconByName } from "../../utils/iconLibrary";
import { categoryEmoji } from "../../utils/categoryEmoji";
import { useTranslation } from "../../hooks/useTranslation";
import { useLocation } from "../../hooks/useLocation";
import { useAppSettings } from "../../context/AppSettingsContext";
import { appConfig } from "../../services/configService";
import "./styles/Categories.css";

/**
 * Categories page, marketplace style:
 *   left rail  = departments (header categories)
 *   right pane = the selected department's groups, each with a grid of
 *                sub-category tiles.
 */

interface Group extends ApiCategory {
  children: ApiCategory[];
}

interface Department extends HeaderCategory {
  groups: Group[];
}

const idOf = (v: any): string => (v && typeof v === "object" ? v._id : v)?.toString() || "";

/** Square tile: the admin's image when there is one, otherwise a fitting emoji. */
function Tile({ category, label, onClick }: { category: ApiCategory; label: string; onClick: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(category.image) && !imgFailed;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center text-center cursor-pointer select-none active:scale-95 transition-transform"
    >
      <div className="w-full aspect-square rounded-2xl bg-slate-100/80 overflow-hidden flex items-center justify-center group-hover:bg-slate-100 transition-colors">
        {showImage ? (
          <img
            src={category.image}
            alt={label}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <span className="text-[28px] sm:text-[34px] leading-none" aria-hidden="true">
            {category.icon || categoryEmoji(category.name)}
          </span>
        )}
      </div>
      <span className="mt-1.5 text-[11px] sm:text-xs font-medium text-slate-800 leading-tight line-clamp-2 break-words w-full group-hover:text-primary">
        {label}
      </span>
    </button>
  );
}

export default function Categories() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, getTranslatedField } = useTranslation();
  const { location: userLocation } = useLocation();
  const { settings: appSettings } = useAppSettings();

  const deliveryTime =
    appSettings?.estimatedDeliveryTime || appConfig.estimatedDeliveryTime || "12–15 mins";
  const cleanDeliveryTime = deliveryTime.toLowerCase().replace("delivery", "").trim();

  const addressLabel = useMemo(() => {
    if (userLocation?.address) return userLocation.address;
    if (userLocation?.city && userLocation?.state) return `${userLocation.city}, ${userLocation.state}`;
    if (userLocation?.city) return userLocation.city;
    return t("customer.deliverTo", "Deliver to");
  }, [userLocation, t]);

  const openLocationModal = () => {
    window.dispatchEvent(new CustomEvent("openLocationChangeModal"));
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [headerCategories, setHeaderCategories] = useState<HeaderCategory[]>([]);
  const [allCategories, setAllCategories] = useState<ApiCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const contentRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const railRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // The rail + content area fills the rest of the screen, and each column
  // scrolls on its own, so the rail never moves while the tiles scroll.
  // (CSS sticky can't do this here: the app layout wraps pages in overflow
  // containers, which disables sticky.)
  const [paneHeight, setPaneHeight] = useState<number>();
  useLayoutEffect(() => {
    const measure = () => {
      const el = contentRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setPaneHeight(Math.max(320, window.innerHeight - top - 16));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [loading]);

  const nameOf = (c: any) => getTranslatedField(c, "name") || c.name;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [headers, catRes] = await Promise.all([
          getHeaderCategoriesPublic(true),
          getCategoriesWithChildren(),
        ]);
        setHeaderCategories(headers || []);
        setAllCategories(catRes?.data || []);
      } catch (err) {
        console.error("Failed to fetch categories data:", err);
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // department → groups (root categories) → tiles (child categories)
  const departments = useMemo<Department[]>(() => {
    const byOrder = (a: ApiCategory, b: ApiCategory) => (a.order || 0) - (b.order || 0);
    const childrenOf = new Map<string, ApiCategory[]>();
    allCategories.forEach((c) => {
      const p = idOf(c.parentId);
      if (p) childrenOf.set(p, [...(childrenOf.get(p) || []), c]);
    });
    const roots = allCategories.filter((c) => !idOf(c.parentId)).sort(byOrder);

    const depts: Department[] = headerCategories
      .filter((h) => h.status === "Published" && h.slug !== "all")
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((h) => ({
        ...h,
        groups: roots
          .filter((r) => idOf(r.headerCategoryId) === h._id.toString())
          .map((r) => ({ ...r, children: (childrenOf.get(r._id) || []).sort(byOrder) })),
      }))
      .filter((d) => d.groups.length > 0);

    // Root categories not linked to any published department
    const placed = new Set(depts.flatMap((d) => d.groups.map((g) => g._id)));
    const orphans = roots.filter((r) => !placed.has(r._id));
    if (orphans.length) {
      depts.push({
        _id: "other-categories",
        name: t("common.otherCategories", "Other Categories"),
        slug: "other",
        iconName: "grid",
        iconLibrary: "Custom",
        status: "Published",
        order: 9999,
        groups: orphans.map((r) => ({ ...r, children: (childrenOf.get(r._id) || []).sort(byOrder) })),
      } as Department);
    }
    return depts;
  }, [headerCategories, allCategories, t]);

  // Selected department lives in the URL (?dept=slug) so Back returns to it.
  const deptParam = searchParams.get("dept");
  const activeDept = useMemo(
    () => departments.find((d) => d.slug === deptParam || d._id === deptParam) || departments[0],
    [departments, deptParam]
  );

  const selectDept = (d: Department) => {
    setSearchQuery("");
    setSearchParams({ dept: d.slug || d._id }, { replace: true });
    railRefs.current.get(d._id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    paneRef.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
  }, [searchQuery]);

  // Search runs across every department; a matching group shows all its tiles.
  const query = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!query) return [];
    const hit = (c: any) => nameOf(c).toLowerCase().includes(query);
    return departments
      .map((d) => ({
        ...d,
        groups: d.groups
          .map((g) => (hit(g) ? g : { ...g, children: g.children.filter(hit) }))
          .filter((g) => hit(g) || g.children.length > 0),
      }))
      .filter((d) => d.groups.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments, query]);

  const openCategory = (c: ApiCategory) => navigate(`/category/${c.slug || c._id}`);

  const renderGroups = (groups: Group[]) =>
    groups.map((group) => {
      // A group without sub-categories is shown as a single tile of itself.
      const tiles = group.children.length ? group.children : [group];
      return (
        <section key={group._id} className="mb-6">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">{nameOf(group)}</h3>
            <button
              type="button"
              onClick={() => openCategory(group)}
              className="flex-shrink-0 text-[11px] sm:text-xs font-semibold text-primary hover:underline cursor-pointer"
            >
              {t("common.seeAll", "See all")}
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-x-2.5 gap-y-3.5">
            {tiles.map((c) => (
              <Tile key={c._id} category={c} label={nameOf(c)} onClick={() => openCategory(c)} />
            ))}
          </div>
        </section>
      );
    });

  // 1. Loading skeleton
  if (loading) {
    return (
      <div className="categories-container font-sans bg-white min-h-screen">
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="w-32 h-7 rounded-lg skeleton-shimmer mb-3" />
          <div className="w-full h-10 rounded-xl skeleton-shimmer" />
        </div>
        <div className="flex">
          <div className="w-[84px] sm:w-[104px] flex-shrink-0 bg-slate-50 py-3 space-y-4 flex flex-col items-center">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="w-12 h-12 rounded-full skeleton-shimmer" />
                <div className="w-14 h-3 rounded skeleton-shimmer" />
              </div>
            ))}
          </div>
          <div className="flex-1 p-3">
            <div className="w-28 h-4 rounded skeleton-shimmer mb-3" />
            <div className="grid grid-cols-3 gap-2.5">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-square rounded-2xl skeleton-shimmer" />
                  <div className="w-3/4 h-3 rounded skeleton-shimmer mx-auto mt-1.5" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Error state
  if (error && !departments.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center bg-white">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-4 border border-red-100 shadow-sm">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">{t("common.oops", "Oops!")}</h3>
        <p className="text-sm text-slate-500 mb-5 max-w-xs">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl font-semibold shadow-sm transition-all text-sm active:scale-95 cursor-pointer"
        >
          {t("common.retry", "Retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="categories-container font-sans">
      {/* Delivery / address banner */}
      <div
        className="px-4 pt-3 pb-6 flex flex-col gap-1.5"
        style={{ background: "linear-gradient(to bottom, #b3d4ff 0%, #d6e8ff 70%, transparent 100%)" }}
      >
        <div className="inline-flex items-center gap-1.5 bg-white/85 border border-white rounded-full px-2.5 py-1 shadow-sm w-fit">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
            <path d="M13 2L4.09 12.69a1 1 0 0 0 .77 1.64H11l-1 7.31a1 1 0 0 0 1.79.63L20.91 11.3a1 1 0 0 0-.77-1.64H14l1-7.3a1 1 0 0 0-1.79-.63L13 2z" fill="#FF8C00" stroke="#FF8C00" strokeWidth="0.5" />
          </svg>
          <span className="text-xs font-semibold text-neutral-800">
            {t("customer.deliveringInShort", "Delivering in")} {cleanDeliveryTime}
          </span>
        </div>
        <button type="button" onClick={openLocationModal} className="flex items-center gap-1.5 max-w-full cursor-pointer group text-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-blue-700">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span className="font-semibold text-neutral-900 text-sm truncate group-hover:text-blue-700 transition-colors">{addressLabel}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-neutral-700">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Title + search */}
      <div className="bg-white px-4 pt-4 pb-3 -mt-4 rounded-t-3xl relative z-10 border-b border-slate-100">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight mb-3">
          {t("common.categories", "Categories")}
        </h1>
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("customer.searchCategories", "Search categories...")}
            className="w-full pl-9 pr-9 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-slate-800 placeholder-slate-400 text-xs sm:text-sm rounded-xl border border-slate-200/90 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              aria-label="Clear search"
            >
              <svg className="w-4 h-4 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-full p-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {departments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <h3 className="text-slate-900 font-bold text-base mb-1">{t("customer.noCategoriesFound", "No Categories Found")}</h3>
          <p className="text-slate-400 text-xs max-w-xs mb-4">
            {t("customer.noCategoriesPrompt", "We couldn't find any registered categories at the moment.")}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-semibold shadow-sm cursor-pointer"
          >
            {t("common.retry", "Retry")}
          </button>
        </div>
      ) : (
        <div
          ref={contentRef}
          className="flex bg-white overflow-hidden"
          style={{ height: paneHeight ? `${paneHeight}px` : "calc(100dvh - 240px)" }}
        >
          {/* Left rail: departments (fixed; scrolls on its own only if it doesn't fit) */}
          <nav
            aria-label="Departments"
            className="h-full w-[84px] sm:w-[104px] flex-shrink-0 overflow-y-auto overscroll-contain scrollbar-hide bg-slate-50 border-r border-slate-100 pb-6"
          >
            {departments.map((d) => {
              const active = !query && activeDept?._id === d._id;
              return (
                <button
                  key={d._id}
                  type="button"
                  ref={(el) => {
                    if (el) railRefs.current.set(d._id, el);
                    else railRefs.current.delete(d._id);
                  }}
                  onClick={() => selectDept(d)}
                  aria-current={active ? "page" : undefined}
                  className={`relative w-full flex flex-col items-center gap-1.5 px-1.5 py-3 cursor-pointer transition-colors ${
                    active ? "bg-white" : "hover:bg-white/60"
                  }`}
                >
                  {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary" />}
                  <span
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center bg-amber-300 text-slate-900 [&>svg]:w-6 [&>svg]:h-6 sm:[&>svg]:w-7 sm:[&>svg]:h-7 transition-shadow ${
                      active ? "ring-2 ring-primary ring-offset-2 ring-offset-white" : ""
                    }`}
                  >
                    {getIconByName(d.iconName)}
                  </span>
                  <span
                    className={`text-[11px] sm:text-xs leading-tight text-center break-words w-full ${
                      active ? "font-bold text-slate-900" : "font-medium text-slate-600"
                    }`}
                  >
                    {nameOf(d)}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Right pane: groups and tiles — the only part that scrolls */}
          <div
            ref={paneRef}
            className="h-full flex-1 min-w-0 overflow-y-auto overscroll-contain px-3 sm:px-4 pt-3 pb-24"
          >
            {query ? (
              searchResults.length ? (
                searchResults.map((d) => (
                  <div key={d._id}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">{nameOf(d)}</p>
                    {renderGroups(d.groups)}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <h3 className="text-slate-800 font-bold text-sm mb-1">
                    {t("customer.noMatchingCategories", "No matching categories")}
                  </h3>
                  <p className="text-slate-400 text-xs mb-4">We couldn't find any category matching "{searchQuery}".</p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    {t("customer.clearSearch", "Clear Search")}
                  </button>
                </div>
              )
            ) : (
              activeDept && (
                <>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-3">{nameOf(activeDept)}</h2>
                  {renderGroups(activeDept.groups)}
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
