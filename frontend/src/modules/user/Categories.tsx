import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../services/api/config";
import { categoryEmoji } from "../../utils/categoryEmoji";
import { useTranslation } from "../../hooks/useTranslation";
import { useCart } from "../../context/CartContext";
import { useHomeTheme } from "./components/home/homeTheme";
import "./styles/Categories.css";

/**
 * Categories page:
 *   left rail  = Popular + the departments (a round photo each)
 *   right pane = ONE continuous scroll: Popular (Featured + All Popular), then every
 *                department with its groups and a 3-column grid of tiles.
 * The rail follows the scroll (the department you are in is highlighted) and
 * tapping a rail item jumps to that department.
 */

interface Tile {
  _id: string;
  name: string;
  slug?: string;
  image?: string;
  translations?: any;
}
interface Group extends Tile {
  tiles: Tile[];
}
interface Department extends Tile {
  iconName?: string;
  groups: Group[];
}
interface Menu {
  departments: Department[];
  featured: Tile[];
  popular: Tile[];
}

const POPULAR_ID = "__popular";
let menuCache: Menu | null = null;

/**
 * The menu from /customer/categories/menu. If the backend is older and doesn't
 * have that route yet, build the same shape from the public header-categories
 * and categories endpoints so the page still works.
 */
async function loadMenu(): Promise<Menu> {
  try {
    const res = await api.get("/customer/categories/menu", { skipLoader: true } as any);
    if (res.data?.data?.departments) return res.data.data;
  } catch (e: any) {
    if (e?.response?.status && e.response.status !== 404) throw e;
  }
  const [hRes, cRes] = await Promise.all([
    api.get("/header-categories", { skipLoader: true } as any),
    api.get("/customer/categories", { params: { withChildren: "true" }, skipLoader: true } as any),
  ]);
  const headers: any[] = (hRes.data?.data || hRes.data || []).filter((h: any) => h.status === "Published" && h.slug !== "all");
  const cats: any[] = cRes.data?.data || [];
  const idStr = (v: any) => (v ? String(v._id || v) : "");
  const tile = (c: any): Tile => ({ _id: String(c._id), name: c.name, slug: c.slug, image: c.image, translations: c.translations });
  const departments: Department[] = headers
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((h) => {
      const groups: Group[] = cats
        .filter((c) => !idStr(c.parentId) && idStr(c.headerCategoryId) === String(h._id))
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((grp) => ({ ...tile(grp), tiles: cats.filter((c) => idStr(c.parentId) === String(grp._id)).sort((a, b) => (a.order || 0) - (b.order || 0)).map(tile) }));
      const image = groups.flatMap((g) => [g.image, ...g.tiles.map((t) => t.image)]).find(Boolean);
      return { _id: String(h._id), name: h.name, slug: h.slug, iconName: h.iconName, image, translations: h.translations, groups };
    })
    .filter((d) => d.groups.length > 0);
  return {
    departments,
    featured: cats.filter((c) => c.isFeatured).map(tile),
    popular: cats.filter((c) => c.isBestseller).map(tile),
  };
}

/** Round photo (or emoji while a category has no photo yet). */
function Thumb({ image, name, size, tint, ring }: { image?: string; name: string; size: string; tint: string; ring?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`${size} rounded-full overflow-hidden flex items-center justify-center flex-shrink-0`}
      style={{ background: tint, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}
    >
      {image && !failed ? (
        <img src={image} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        <span className="text-[26px] leading-none" aria-hidden="true">
          {categoryEmoji(name)}
        </span>
      )}
    </span>
  );
}

export default function Categories() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getTranslatedField } = useTranslation();
  const { cart } = useCart();
  const theme = useHomeTheme();

  const [menu, setMenu] = useState<Menu | null>(menuCache);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string>(POPULAR_ID);
  const [paneHeight, setPaneHeight] = useState<number>();

  const wrapRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const railItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const lockUntil = useRef(0);
  const cartCount = cart?.itemCount || 0;

  const nameOf = (c: any) => getTranslatedField(c, "name") || c.name;

  useEffect(() => {
    let cancelled = false;
    loadMenu()
      .then((data) => {
        if (cancelled) return;
        menuCache = data;
        setMenu(menuCache);
        setError(null);
      })
      .catch(() => {
        if (!cancelled && !menuCache) setError("Network error. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The page below the top bar fills the screen; the rail and the tiles scroll separately.
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setPaneHeight(Math.max(320, window.innerHeight - top));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [menu]);

  const registerSection = (id: string) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  };

  // Keep the active rail item visible inside the rail.
  const revealInRail = useCallback((id: string) => {
    const rail = railRef.current;
    const btn = railItemRefs.current.get(id);
    if (!rail || !btn) return;
    const top = btn.offsetTop;
    const bottom = top + btn.offsetHeight;
    if (top < rail.scrollTop + 8) rail.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
    else if (bottom > rail.scrollTop + rail.clientHeight - 8) rail.scrollTo({ top: bottom - rail.clientHeight + 8, behavior: "smooth" });
  }, []);

  // Scroll-linked highlight: the section nearest the top of the pane is the active one.
  const onScroll = useCallback(() => {
    if (Date.now() < lockUntil.current) return;
    const pane = paneRef.current;
    if (!pane) return;
    // Sections are positioned relative to the pane (it is 'relative'); a section counts
    // as current once its label is in the top part of the pane.
    const probe = pane.scrollTop + Math.min(160, pane.clientHeight * 0.25);
    let current = POPULAR_ID;
    sectionRefs.current.forEach((el, id) => {
      if (el.offsetTop <= probe) current = id;
    });
    // At the very bottom the last department may be too short to reach the probe line
    if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 4 && menu?.departments.length) current = menu.departments[menu.departments.length - 1]._id;
    setActive((prev) => {
      if (prev !== current) revealInRail(current);
      return current;
    });
  }, [menu, revealInRail]);

  const jumpTo = useCallback(
    (id: string) => {
      const pane = paneRef.current;
      const el = sectionRefs.current.get(id);
      if (!pane || !el) return;
      lockUntil.current = Date.now() + 700;
      setActive(id);
      revealInRail(id);
      pane.scrollTo({ top: id === POPULAR_ID ? 0 : el.offsetTop - 4, behavior: "smooth" });
    },
    [revealInRail]
  );

  // ?dept=<slug> opens at that department
  useEffect(() => {
    const dept = searchParams.get("dept");
    if (!menu || !dept) return;
    const d = menu.departments.find((x) => x.slug === dept || x._id === dept);
    if (d) setTimeout(() => jumpTo(d._id), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  const open = (t: Tile) => navigate(`/category/${t.slug || t._id}`);

  const tileGrid = (tiles: Tile[], first?: { label: string; image?: string; onClick: () => void }) => (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-x-2 gap-y-3.5 md:gap-x-4 md:gap-y-5">
      {first && (
        <button type="button" onClick={first.onClick} className="flex flex-col items-center text-center active:scale-95 transition-transform">
          <Thumb image={first.image} name={first.label} size="w-[68px] h-[68px] min-[400px]:w-[76px] min-[400px]:h-[76px] md:w-[88px] md:h-[88px]" tint={theme.tint} ring={theme.tintBorder} />
          <span className="mt-1.5 text-[11px] md:text-xs leading-tight font-medium w-full line-clamp-2" style={{ color: theme.brand }}>
            {first.label}
          </span>
        </button>
      )}
      {tiles.map((t) => (
        <button key={t._id} type="button" onClick={() => open(t)} className="flex flex-col items-center text-center active:scale-95 transition-transform">
          <Thumb image={t.image} name={t.name} size="w-[68px] h-[68px] min-[400px]:w-[76px] min-[400px]:h-[76px] md:w-[88px] md:h-[88px]" tint={theme.tint} />
          <span className="mt-1.5 text-[11px] md:text-xs leading-tight text-neutral-600 w-full line-clamp-2 break-words">{nameOf(t)}</span>
        </button>
      ))}
    </div>
  );

  const sectionLabel = (text: string) => (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[10px] font-medium tracking-wider text-neutral-400 uppercase whitespace-nowrap">{text}</span>
      <span className="flex-1 h-px bg-neutral-200" />
    </div>
  );

  // ── top bar ──
  const topBar = (
    <div className="flex items-center justify-between px-4 h-12 bg-white border-b border-neutral-100">
      <h1 className="text-[13px] font-semibold tracking-wide text-neutral-800 uppercase">{getTranslatedField({ name: "Categories" }, "name") || "Categories"}</h1>
      <div className="flex items-center gap-4 text-neutral-800">
        <button type="button" aria-label="Search" onClick={() => navigate("/search")}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="11" cy="11" r="7.5" />
            <path d="m20.5 20.5-4.2-4.2" />
          </svg>
        </button>
        <button type="button" aria-label="Wishlist" onClick={() => navigate("/wishlist")}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
        <button type="button" aria-label="Cart" onClick={() => navigate("/cart")} className="relative">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {cartCount > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: theme.brand }}>
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );

  if (error && !menu) {
    return (
      <div className="categories-container font-sans bg-white">
        {topBar}
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
          <p className="text-sm text-neutral-500 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2.5 text-white rounded-xl font-semibold text-sm" style={{ background: theme.brand }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="categories-container font-sans bg-white min-h-screen">
        {topBar}
        <div className="flex">
          <div className="w-[26%] max-w-[118px] bg-neutral-50 py-3 space-y-4 flex flex-col items-center">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="w-11 h-11 rounded-full skeleton-shimmer" />
                <div className="w-12 h-2.5 rounded skeleton-shimmer" />
              </div>
            ))}
          </div>
          <div className="flex-1 p-3">
            <div className="w-28 h-4 rounded skeleton-shimmer mb-4" />
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <div className="w-[68px] h-[68px] rounded-full skeleton-shimmer" />
                  <div className="w-14 h-2.5 rounded skeleton-shimmer" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const railItems: Array<{ id: string; name: string; image?: string; star?: boolean }> = [
    { id: POPULAR_ID, name: "Popular", star: true },
    ...menu.departments.map((d) => ({ id: d._id, name: nameOf(d), image: d.image })),
  ];

  return (
    <div className="categories-container font-sans bg-white">
      {topBar}
      <div ref={wrapRef} className="flex bg-white overflow-hidden" style={{ height: paneHeight ? `${paneHeight}px` : "calc(100dvh - 120px)" }}>
        {/* Left rail */}
        <nav
          ref={railRef}
          aria-label="Departments"
          className="relative h-full w-[26%] max-w-[118px] min-w-[78px] flex-shrink-0 overflow-y-auto overscroll-contain scrollbar-hide pb-24"
          style={{ background: "#F7F5FA" }}
        >
          {railItems.map((it) => {
            const on = active === it.id;
            return (
              <button
                key={it.id}
                type="button"
                ref={(el) => {
                  if (el) railItemRefs.current.set(it.id, el);
                  else railItemRefs.current.delete(it.id);
                }}
                onClick={() => jumpTo(it.id)}
                aria-current={on ? "true" : undefined}
                className="relative w-full flex flex-col items-center gap-1 px-1.5 py-3 border-b border-white/80 transition-colors"
                style={{ background: on ? "#ffffff" : "transparent" }}
              >
                {on && <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: theme.brand }} />}
                {it.star ? (
                  <span className="w-11 h-11 rounded-full flex items-center justify-center text-[22px]" style={{ background: theme.tint }}>
                    ⭐
                  </span>
                ) : (
                  <Thumb image={it.image} name={it.name} size="w-11 h-11" tint={theme.tint} />
                )}
                <span className={`text-[11px] leading-tight text-center w-full break-words line-clamp-3 ${on ? "font-semibold" : "text-neutral-700"}`} style={on ? { color: theme.brand } : undefined}>
                  {it.name}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Right pane: one continuous scroll */}
        <div ref={paneRef} onScroll={onScroll} className="relative h-full flex-1 min-w-0 overflow-y-auto overscroll-contain px-3 pt-3 pb-28">
          {/* Popular */}
          <section ref={registerSection(POPULAR_ID)} className="mb-6">
            {sectionLabel("Popular")}
            {menu.featured.length > 0 && (
              <div className="mb-5">
                <h3 className="text-[14px] font-semibold text-neutral-900 mb-2.5">Featured</h3>
                {tileGrid(menu.featured)}
              </div>
            )}
            {menu.popular.length > 0 && (
              <div>
                <h3 className="text-[14px] font-semibold text-neutral-900 mb-2.5">All Popular</h3>
                {tileGrid(menu.popular)}
              </div>
            )}
          </section>

          {/* Departments */}
          {menu.departments.map((d) => (
            <section key={d._id} ref={registerSection(d._id)} className="mb-6">
              {sectionLabel(nameOf(d))}
              {d.groups.map((grp) => (
                <div key={grp._id} className="mb-5">
                  <h3 className="text-[14px] font-semibold text-neutral-900 mb-2.5">{nameOf(grp)}</h3>
                  {tileGrid(grp.tiles.length ? grp.tiles : [], { label: "View All", image: grp.image || grp.tiles.find((t) => t.image)?.image, onClick: () => open(grp) })}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
