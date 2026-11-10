import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getSubcategories } from "../../../services/api/categoryService";
import { getHeaderCategoriesPublic } from "../../../services/api/headerCategoryService";
import { useTranslation } from "../../../hooks/useTranslation";
import { useAppSettings } from "../../../context/AppSettingsContext";
import { categoryEmoji } from "../../../utils/categoryEmoji";
import DealCard from "./home/DealCard";
import { useHomeTheme, OFFER_STYLES, resolvePageContent, type HomePageContent, type HomeBanner } from "./home/homeTheme";
import { TRUST_ICON_SVGS, OFFER_ICON_SVGS } from "./home/homeIcons";

/**
 * Top of the home page under the search bar: banner carousel, trust strip,
 * offer cards, Crazy Deals and the category promo banners.
 *
 * Everything here comes from data — `homeData` is the /customer/home
 * response that Home already loaded (no second request):
 *   - banners / trust strip / offer cards → Admin › Home Page Content
 *   - Crazy Deals → Admin › Lowest Prices products (+ Promo Strip title/end date)
 *   - promo banners → Admin › Promo Strip cards, else the real categories,
 *     badge = their best live discount
 */

interface PromoCard {
  id: string;
  badge: string;
  title: string;
  imageUrl?: string;
  categoryId?: string;
  slug?: string;
  subcategoryImages?: string[];
  translations?: any;
}

interface PromoStripProps {
  homeData: any;
  loading?: boolean;
}

// Department names are the same for every mode — load them once per page view.
let departmentNamesCache: any[] | null = null;

export default function PromoStrip({ homeData, loading = false }: PromoStripProps) {
  const navigate = useNavigate();
  const { t, getTranslatedField } = useTranslation();
  const { settings: appSettings } = useAppSettings();
  const homeTheme = useHomeTheme();

  // The server's Home Page Content, or the defaults if it sent none (older backend / not saved yet)
  const pageContent: HomePageContent = resolvePageContent(homeData?.pageContent, homeTheme.quick);
  const deals: any[] = homeData?.lowestPrices || [];
  const promoStrip = homeData?.promoStrip?.isActive ? homeData.promoStrip : null;

  const [departments, setDepartments] = useState<any[]>(departmentNamesCache || []);
  const [subcategoryImagesMap, setSubcategoryImagesMap] = useState<Record<string, string[]>>({});
  const [slide, setSlide] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [failedBanners, setFailedBanners] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (departmentNamesCache) return;
    getHeaderCategoriesPublic(true)
      .then((cats) => {
        departmentNamesCache = (cats || [])
          .filter((c) => c.status === "Published" && c.slug !== "all")
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        setDepartments(departmentNamesCache);
      })
      .catch(() => setDepartments([]));
  }, []);

  // ── Category promo cards (Promo Strip → promo cards → categories) ──
  const categoryCards: PromoCard[] = useMemo(() => {
    if (promoStrip?.categoryCards?.length) {
      return [...promoStrip.categoryCards]
        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
        .map((card: any) => {
          const category = typeof card.categoryId === "object" ? card.categoryId : null;
          return {
            id: card._id || category?._id || card.categoryId,
            badge: card.badge || (card.discountPercentage ? `Up to ${card.discountPercentage}% OFF` : ""),
            title: card.title || category?.name || "",
            categoryId: category?._id || card.categoryId,
            slug: category?.slug || card.categoryId,
            imageUrl: category?.image,
            translations: card.translations,
          };
        });
    }
    if (homeData?.promoCards?.length) return homeData.promoCards;
    return [];
  }, [promoStrip, homeData?.promoCards]);

  // Promo Strip cards carry only the category — fetch a few sub-category photos for them
  useEffect(() => {
    if (!promoStrip?.categoryCards?.length) return;
    let cancelled = false;
    (async () => {
      const map: Record<string, string[]> = {};
      await Promise.all(
        categoryCards.slice(0, 4).map(async (card) => {
          if (!card.categoryId) return;
          try {
            const res = await getSubcategories(card.categoryId, { limit: 4 });
            const imgs = (res?.data || []).map((s: any) => s.subcategoryImage || s.image).filter(Boolean);
            if (imgs.length) map[card.id] = imgs.slice(0, 4);
          } catch {
            /* keep the category image */
          }
        })
      );
      if (!cancelled) setSubcategoryImagesMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [promoStrip, categoryCards]);

  // ── Crazy Deals countdown to the Promo Strip end date ──
  const promoEndDate = promoStrip?.endDate ? new Date(promoStrip.endDate) : null;
  useEffect(() => {
    if (!promoEndDate) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [promoStrip?.endDate]);
  const remainingMs = promoEndDate ? promoEndDate.getTime() - now : 0;
  const countdown =
    remainingMs > 0
      ? [Math.floor(remainingMs / 3_600_000), Math.floor(remainingMs / 60_000) % 60, Math.floor(remainingMs / 1000) % 60]
          .map((n) => String(n).padStart(2, "0"))
          .join(" : ")
      : null;

  // ── Banner carousel: admin banners for this mode ──
  const banners: HomeBanner[] = (pageContent?.banners || []).filter((b) => !failedBanners[b._id]);
  useEffect(() => setSlide(0), [banners.length, homeTheme.quick]);
  useEffect(() => {
    if (banners.length < 2) return;
    const id = setInterval(() => setSlide((s) => (s + 1) % banners.length), 5000);
    return () => clearInterval(id);
  }, [banners.length]);
  const currentBanner = banners[Math.min(slide, banners.length - 1)];

  // Built-in banner, only when this mode has no banner image: Promo Strip heading,
  // real best discount, department names and real product photos.
  const bestDiscount = Math.max(
    0,
    ...deals.map((p: any) => Number(p.discount) || 0),
    ...categoryCards.map((c) => Number((c.badge || "").match(/(\d+)\s*%/)?.[1] || 0))
  );
  const builtIn = {
    headline: promoStrip?.heading || pageContent?.fallbackHeadline || appSettings?.appName || "",
    pill: promoStrip?.saleText || (bestDiscount > 0 ? `${t("home.upTo", "Up to")} ${bestDiscount}% ${t("home.off", "Off")}` : ""),
    subtitle: departments.length
      ? [...departments.slice(0, 3).map((d) => getTranslatedField(d, "name") || d.name), t("common.more", "More")].join("  •  ")
      : "",
    art: [
      ...deals.map((p: any) => p.imageUrl || p.mainImage),
      ...categoryCards.flatMap((c) => subcategoryImagesMap[c.id] || c.subcategoryImages || (c.imageUrl ? [c.imageUrl] : [])),
    ]
      .filter(Boolean)
      .slice(0, 3) as string[],
  };

  const crazyTitle = promoStrip?.crazyDealsTitle || t("home.crazyDeals", "Crazy Deals");
  const trustItems = pageContent?.trustItems || [];
  const offerCards = pageContent?.offerCards || [];

  const promoBackgrounds = [
    { bg: "linear-gradient(120deg, #FFF4DF 0%, #FFE0B5 100%)", title: "#3A2A12" },
    { bg: "linear-gradient(120deg, #FFE6EE 0%, #FAC3D4 100%)", title: homeTheme.quick ? "#0B3FB8" : "#B0103F" },
    { bg: "linear-gradient(120deg, #E6F0FF 0%, #C9DCFF 100%)", title: "#0B3FB8" },
    { bg: "linear-gradient(120deg, #E8F8EE 0%, #C8EED6 100%)", title: "#11643A" },
  ];

  const go = (link?: string) => {
    if (!link) return;
    if (/^https?:\/\//i.test(link)) window.open(link, "_blank", "noopener");
    else navigate(link);
  };

  const pad = "px-3 min-[400px]:px-4 md:px-6 lg:px-8";

  return (
    <div style={{ background: homeTheme.pageBg }}>
      {/* ============ BANNER ============ */}
      <div className={`${pad} pt-2.5`}>
        {currentBanner ? (
          <div
            className="relative rounded-2xl sm:rounded-3xl overflow-hidden select-none shadow-[0_6px_16px_rgba(0,0,0,0.12)]"
            style={{ background: homeTheme.bannerBg, aspectRatio: "3 / 1" }}
          >
            <button
              key={currentBanner._id}
              type="button"
              onClick={() => go(currentBanner.link)}
              aria-label={currentBanner.headline || currentBanner.title || t("home.shopNow", "Shop Now")}
              className="absolute inset-0 w-full h-full text-left"
            >
              <picture>
                {currentBanner.mobileImage && <source media="(max-width: 640px)" srcSet={currentBanner.mobileImage} />}
                <img
                  src={currentBanner.image}
                  alt={currentBanner.headline || currentBanner.title || ""}
                  className="absolute inset-0 w-full h-full object-cover object-right"
                  loading="eager"
                  decoding="async"
                  onError={() => setFailedBanners((m) => ({ ...m, [currentBanner._id]: true }))}
                />
              </picture>
              {(currentBanner.headline || currentBanner.subtitle || currentBanner.buttonText) && (
                <div className="relative z-10 h-full w-[62%] sm:w-[55%] flex flex-col justify-center pl-3 min-[400px]:pl-4 sm:pl-7">
                  {currentBanner.headline && (
                    <h2
                      className="text-white font-bold tracking-tight leading-[1.1] line-clamp-2"
                      style={{ fontSize: "clamp(16px, 5.4vw, 40px)", textShadow: "0 2px 6px rgba(0,0,0,0.3)" }}
                    >
                      {currentBanner.headline}
                    </h2>
                  )}
                  {currentBanner.subtitle && (
                    <p className="text-white/95 font-semibold mt-1 line-clamp-2" style={{ fontSize: "clamp(9px, 2.8vw, 16px)", textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
                      {currentBanner.subtitle}
                    </p>
                  )}
                  {currentBanner.buttonText && (
                    <span
                      className="mt-1.5 self-start inline-flex items-center gap-1 bg-white text-neutral-900 font-bold rounded-full shadow"
                      style={{ fontSize: "clamp(9px, 2.6vw, 14px)", padding: "clamp(3px, 1vw, 8px) clamp(8px, 2.6vw, 16px)" }}
                    >
                      {currentBanner.buttonText}
                      <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  )}
                </div>
              )}
            </button>
            {banners.length > 1 && (
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20 flex gap-1">
                {banners.map((b, i) => (
                  <button
                    key={b._id}
                    type="button"
                    aria-label={`Banner ${i + 1}`}
                    onClick={() => setSlide(i)}
                    className={`h-1.5 rounded-full transition-all ${i === slide ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : builtIn.headline ? (
          <div
            className="relative rounded-2xl sm:rounded-3xl overflow-hidden select-none shadow-[0_6px_16px_rgba(0,0,0,0.12)]"
            style={{ background: homeTheme.bannerBg, height: "clamp(118px, 35vw, 250px)" }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 85% 20%, rgba(255,255,255,0.25) 0%, transparent 35%)" }} />
            <div className="relative z-10 flex h-full">
              <div className="flex flex-col justify-center pl-3 min-[400px]:pl-4 sm:pl-7 pr-1 w-[60%] sm:w-[55%]">
                {appSettings?.appName && (
                  <span className="text-white/95 font-semibold leading-none" style={{ fontSize: "clamp(10px, 3vw, 18px)" }}>
                    {appSettings.appName}
                  </span>
                )}
                <h2 className="text-white font-bold tracking-tight leading-[1.1] line-clamp-2 mt-0.5" style={{ fontSize: "clamp(16px, 5.4vw, 40px)", textShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
                  {builtIn.headline}
                </h2>
                {builtIn.pill && (
                  <div className="mt-1">
                    <span className="inline-block bg-[#FFD60A] text-neutral-900 font-bold px-2 py-px rounded shadow" style={{ fontSize: "clamp(10px, 3.4vw, 20px)" }}>
                      {builtIn.pill}
                    </span>
                  </div>
                )}
                {builtIn.subtitle && (
                  <p className="text-white/90 font-medium mt-1 line-clamp-1" style={{ fontSize: "clamp(8px, 2.4vw, 14px)" }}>
                    {builtIn.subtitle}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => navigate("/categories")}
                  className="mt-1.5 self-start inline-flex items-center gap-1 bg-white text-neutral-900 font-bold rounded-full shadow active:scale-95 transition-transform"
                  style={{ fontSize: "clamp(9px, 2.6vw, 14px)", padding: "clamp(3px, 1vw, 8px) clamp(8px, 2.6vw, 16px)" }}
                >
                  {t("home.shopNow", "Shop Now")}
                  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
              {builtIn.art.length > 0 && (
                <div className="relative flex-1 max-w-[300px] ml-auto">
                  <div className="absolute bottom-[12%] left-[10%] right-[8%] h-[13%] rounded-[50%] shadow-md" style={{ background: "linear-gradient(180deg, #FFE2A0 0%, #E3A53C 100%)" }} />
                  {builtIn.art[1] && <img src={builtIn.art[1]} alt="" className="absolute bottom-[20%] left-[6%] w-[36%] aspect-square object-cover rounded-xl bg-white shadow rotate-[-6deg]" />}
                  {builtIn.art[2] && <img src={builtIn.art[2]} alt="" className="absolute bottom-[20%] right-[4%] w-[34%] aspect-square object-cover rounded-xl bg-white shadow rotate-[6deg]" />}
                  <img src={builtIn.art[0]} alt="" className="absolute bottom-[18%] left-1/2 -translate-x-1/2 z-10 w-[52%] aspect-square object-cover rounded-xl bg-white shadow-lg ring-2 ring-white/70" />
                </div>
              )}
            </div>
          </div>
        ) : loading ? (
          <div className="rounded-2xl bg-neutral-100 animate-pulse" style={{ aspectRatio: "3 / 1" }} />
        ) : null}
      </div>

      {/* ============ TRUST STRIP ============ */}
      {trustItems.length > 0 && (
        <div className={`${pad} mt-2.5`}>
          <div
            className="bg-white rounded-xl border border-neutral-100 shadow-[0_1px_6px_rgba(0,0,0,0.04)] grid py-1.5 sm:py-2.5"
            style={{ gridTemplateColumns: `repeat(${trustItems.length}, minmax(0, 1fr))` }}
          >
            {trustItems.map((item, i) => {
              const content = (
                <>
                  <span className="text-neutral-800 [&>svg]:w-[18px] [&>svg]:h-[18px] sm:[&>svg]:w-6 sm:[&>svg]:h-6">
                    {TRUST_ICON_SVGS[item.icon] || TRUST_ICON_SVGS.offers}
                  </span>
                  <span className="text-[8.5px] min-[400px]:text-[9.5px] sm:text-xs font-semibold text-neutral-900 text-center leading-[1.15] tracking-tight">
                    {getTranslatedField(item, "label") || item.label}
                  </span>
                </>
              );
              const cls = `flex flex-col items-center gap-0.5 px-0.5 ${i < trustItems.length - 1 ? "border-r border-neutral-100" : ""}`;
              return item.link ? (
                <button key={item._id} type="button" onClick={() => go(item.link)} className={cls}>
                  {content}
                </button>
              ) : (
                <div key={item._id} className={cls}>
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ OFFER CARDS ============ */}
      {offerCards.length > 0 && (
        <div className={`${pad} mt-2 grid gap-2 ${offerCards.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {offerCards.map((card) => {
            const style = OFFER_STYLES[card.style] || OFFER_STYLES.blue;
            return (
              <button
                key={card._id}
                type="button"
                onClick={() => go(card.link)}
                className="text-left rounded-xl px-2 py-1.5 sm:px-3 sm:py-2 flex items-center gap-1.5 border active:scale-[0.98] transition-transform"
                style={{ background: style.bg, borderColor: style.border }}
              >
                <span className="flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5 [&>svg]:w-full [&>svg]:h-full" style={{ color: style.icon }}>
                  {OFFER_ICON_SVGS[card.icon] || OFFER_ICON_SVGS.tag}
                </span>
                <div className="flex-1 min-w-0 leading-tight">
                  <p className="font-bold tracking-tight text-[10.5px] min-[400px]:text-xs sm:text-sm truncate" style={{ color: style.title }}>
                    {getTranslatedField(card, "title") || card.title}
                  </p>
                  {card.text && (
                    <p className="text-[8.5px] min-[400px]:text-[9.5px] sm:text-xs text-neutral-700 font-medium truncate">
                      {getTranslatedField(card, "text") || card.text}
                    </p>
                  )}
                </div>
                <svg className="flex-shrink-0 w-3 h-3 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="#1f2937" strokeWidth="2.6" strokeLinecap="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            );
          })}
        </div>
      )}

      {/* ============ CRAZY DEALS ============ */}
      {deals.length > 0 && (
        <div className="mt-4">
          <div className={`flex items-center justify-between gap-2 ${pad} mb-2`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-base sm:text-xl leading-none" aria-hidden="true">🔥</span>
              <h2 className="text-[16px] sm:text-xl font-bold tracking-tight text-neutral-900 whitespace-nowrap">
                {getTranslatedField({ title: crazyTitle, translations: promoStrip?.translations }, "title") || crazyTitle}
              </h2>
              {countdown && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] min-[400px]:text-[10px] sm:text-xs font-semibold whitespace-nowrap"
                  style={{ background: homeTheme.tint, color: homeTheme.brand }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <circle cx="12" cy="13" r="8" />
                    <path d="M12 9v4l2.5 1.5M9 2h6" />
                  </svg>
                  {t("home.endsIn", "Ends in")} <b>{countdown}</b>
                </span>
              )}
            </div>
            <button type="button" onClick={() => navigate("/categories")} className="flex-shrink-0 flex items-center text-[#0056FF] font-semibold text-xs sm:text-sm">
              {t("common.viewAll", "View All")}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          <div className={`flex gap-1.5 min-[400px]:gap-2 overflow-x-auto scrollbar-hide ${pad} pb-1 snap-x`}>
            {deals.map((product: any) => (
              <div key={product.id || product._id} className="snap-start flex-shrink-0 w-[30%] min-[360px]:w-[23.5%] md:w-[18%] lg:w-[14%]">
                <DealCard product={product} theme={homeTheme} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ CATEGORY PROMO BANNERS ============ */}
      {categoryCards.length > 0 && (
        <div className={`${pad} mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3`}>
          {categoryCards.slice(0, 4).map((card, index) => {
            const imgs = subcategoryImagesMap[card.id] || card.subcategoryImages || [];
            const art = imgs[0] || card.imageUrl;
            const style = promoBackgrounds[index % promoBackgrounds.length];
            return (
              <Link
                key={card.id}
                to={card.slug || card.categoryId ? `/category/${card.slug || card.categoryId}` : "/categories"}
                className={`relative rounded-xl overflow-hidden ${index >= 2 ? "hidden lg:block" : "block"} active:scale-[0.98] transition-transform`}
                style={{ background: style.bg, height: "clamp(64px, 18vw, 150px)" }}
              >
                {art ? (
                  <img
                    src={art}
                    alt=""
                    loading="lazy"
                    className="absolute right-0 top-0 h-full w-[42%] object-cover"
                    style={{ maskImage: "linear-gradient(to right, transparent 0%, #000 35%)", WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 35%)" }}
                  />
                ) : (
                  <span className="absolute right-2 bottom-1 text-3xl opacity-80" aria-hidden="true">{categoryEmoji(card.title)}</span>
                )}
                <div className="relative z-10 h-full w-[64%] flex flex-col justify-center gap-0.5 sm:gap-1.5 pl-2 min-[400px]:pl-2.5 sm:pl-4">
                  <h3 className="font-bold tracking-tight leading-tight line-clamp-1 sm:line-clamp-2" style={{ color: style.title, fontSize: "clamp(11px, 3.3vw, 22px)" }}>
                    {getTranslatedField(card, "title") || card.title}
                  </h3>
                  {card.badge && (
                    <span className="self-start bg-[#FFD60A] text-neutral-900 font-bold px-1.5 rounded-sm whitespace-nowrap" style={{ fontSize: "clamp(7.5px, 2.2vw, 13px)" }}>
                      {card.badge}
                    </span>
                  )}
                  <span
                    className="mt-0.5 self-start inline-flex items-center gap-0.5 bg-white text-neutral-900 font-semibold rounded-full shadow-sm whitespace-nowrap"
                    style={{ fontSize: "clamp(7.5px, 2.1vw, 12px)", padding: "clamp(1px, 0.5vw, 4px) clamp(5px, 1.6vw, 10px)" }}
                  >
                    {t("home.shopNow", "Shop Now")}
                    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
