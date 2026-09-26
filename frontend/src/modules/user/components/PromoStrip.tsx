import { useLayoutEffect, useRef, useState, useEffect, useCallback } from "react";
import { gsap } from "gsap";
import { Link, useNavigate } from "react-router-dom";
import { getTheme } from "../../../utils/themes";
import { getHomeContent } from "../../../services/api/customerHomeService";
import { getSubcategories } from "../../../services/api/categoryService";
import { apiCache } from "../../../utils/apiCache";
import { useLocation } from "../../../hooks/useLocation";
import { useCommerceMode } from "../../../context/CommerceModeContext";
import { useTranslation } from "../../../hooks/useTranslation";

interface PromoCard {
  id: string;
  badge: string;
  title: string;
  imageUrl?: string;
  categoryId?: string;
  slug?: string;
  bgColor?: string;
  subcategoryImages?: string[];
}

// Soft pastel backgrounds cycling through the Crazy Deals grid (matches mockup)
const DEAL_BG_COLORS = [
  "#fff7e8",
  "#eaf3ff",
  "#e9f9ee",
  "#fdeef1",
  "#f3ecff",
  "#fff7e8",
  "#eaf3ff",
  "#e9f9ee",
];

// Comprehensive Icon mappings for each category and keyword fallback
const getCategoryIcons = (categoryId: string, categoryTitle: string = ""): string[] => {
  const normalized = (categoryId || "").toLowerCase().replace(/_/g, "-");
  const titleNorm = (categoryTitle || "").toLowerCase();

  const iconMap: Record<string, string[]> = {
    "foot-wear-ladies": ["👠", "👡", "🥿", "👢"],
    "foot-wear-mens": ["👞", "👟", "🥾", "🩴"],
    "ladies-wear-fashion": ["👗", "👚", "👘", "🥻"],
    "mens-wear-fashion": ["👔", "👕", "👖", "🧥"],
    "kids-wear": ["🧒", "👕", "🧸", "👟"],
    "jewellery-item": ["💍", "💎", "👑", "📿"],
    "handicraft-hosiery-item": ["🧶", "🧵", "🧦", "🧤"],
    "ladies-jean-bag-purse": ["👜", "👛", "🎒", "👝"],
    fashion: ["👕", "👗", "👠", "👜"],
    "vegetable-fruits-fresh": ["🥬", "🥕", "🍅", "🍎"],
    "fruits-vegetable-juice": ["🧃", "🍊", "🍍", "🍉"],
    "fruits-veg": ["🥬", "🥕", "🍅", "🥒"],
    "dairy-items-milk-product": ["🥛", "🧀", "🧈", "🍦"],
    "dairy-breakfast": ["🥛", "🧀", "🍞", "🥚"],
    "dairy-milk": ["🥛", "🧀", "🧈", "🥛"],
    "bakery-biscuit-item": ["🥐", "🥖", "🍪", "🍞"],
    "bakery-biscuits": ["🥐", "🥖", "🍪", "🍞"],
    "chips-namkeen-cold-drinks": ["🍿", "🥤", "🥨", "🍫"],
    "sweet-farsan-chocolate": ["🍫", "🍬", "🧁", "🍩"],
    "icecream-faluda": ["🍨", "🍦", "🍧", "🍮"],
    "tea-coffee": ["☕", "🍵", "🧋", "🫖"],
    "all-grocery-mart": ["🛒", "🥫", "🌾", "🍯"],
    "rani-masala-spices-all": ["🌶️", "🧂", "🌿", "🥘"],
    "all-spices-wholesaler": ["🌶️", "🧂", "🌿", "🥘"],
    "oils-ghee": ["🫒", "🧈", "🫙", "🌻"],
    "pan-parlour-all-item": ["🍃", "🍬", "🍫", "💨"],
    "breakfast-instant": ["🍜", "☕", "🥛", "🍞"],
    "atta-rice": ["🌾", "🍚", "🫘", "🫒"],
    snacks: ["🍿", "🍪", "🥨", "🍫"],
    "cosmetics-item-bath-body": ["💄", "🧴", "🧼", "💅"],
    "skins-face-hair": ["✨", "🧴", "💇‍♀️", "💆"],
    "baby-care-products": ["🍼", "👶", "🧸", "🧴"],
    "personal-care": ["🧴", "💧", "🧼", "💄"],
    "electronics-all-items": ["📱", "💻", "⌚", "🎧"],
    "ac-fridge-tv-electronics": ["📺", "❄️", "🖥️", "⚡"],
    "mobile-item-accessories": ["📱", "🔌", "🔋", "🎧"],
    electronics: ["📱", "💻", "⌚", "🎧"],
    "home-decor": ["🖼️", "🪴", "🕯️", "🛋️"],
    "furniture-all": ["🛋️", "🪑", "🛏️", "🚪"],
    "home-furniture": ["🛋️", "🪑", "🛏️", "🚪"],
    "kitchen-item-vasan-bhandar": ["🍳", "🔪", "🍽️", "🥘"],
    "cleaners-refill-item": ["🧹", "🧽", "🧼", "🧴"],
    household: ["🧹", "🧽", "🧼", "🧴"],
    "toys-sports-item": ["🧸", "⚽", "🎮", "🛹"],
    "yoga-jim-item": ["🧘", "🏋️", "🏃", "🥊"],
    sports: ["⚽", "🏀", "🏋️", "🎾"],
    "stationery-games-item": ["✏️", "📚", "🎨", "🎲"],
    "pet-store-products": ["🐶", "🐱", "🦴", "🐾"],
    "medical-health-pharma": ["💊", "🩺", "🩹", "💉"],
    "puja-item": ["🪔", "🔔", "🌺", "🥥"],
    "festival-item": ["🎉", "✨", "🎁", "🪔"],
    "travel-item": ["🧳", "🎒", "✈️", "🗺️"],
    "home-essentials": ["🧹", "🧽", "🧼", "🧴"],
    "home-essentials-cleaners": ["🧹", "🧽", "🧴", "🧺"],
  };

  if (iconMap[normalized]) {
    return iconMap[normalized];
  }

  const searchStr = `${normalized} ${titleNorm}`;
  if (searchStr.includes("foot") || searchStr.includes("shoe") || searchStr.includes("heel") || searchStr.includes("sandal")) {
    return searchStr.includes("men") ? ["👞", "👟", "🥾", "🩴"] : ["👠", "👡", "🥿", "👢"];
  }
  if (searchStr.includes("ladi") || searchStr.includes("women") || searchStr.includes("dress") || searchStr.includes("saree") || searchStr.includes("kurti")) {
    return ["👗", "👚", "👘", "🥻"];
  }
  if (searchStr.includes("men") || searchStr.includes("shirt") || searchStr.includes("pant") || searchStr.includes("suit")) {
    return ["👔", "👕", "👖", "🧥"];
  }
  if (searchStr.includes("jewel") || searchStr.includes("ring") || searchStr.includes("gold")) {
    return ["💍", "💎", "👑", "📿"];
  }
  if (searchStr.includes("bag") || searchStr.includes("purse") || searchStr.includes("wallet")) {
    return ["👜", "👛", "🎒", "👝"];
  }
  if (searchStr.includes("fruit") || searchStr.includes("veg") || searchStr.includes("fresh")) {
    return ["🍎", "🍌", "🥦", "🥕"];
  }
  if (searchStr.includes("milk") || searchStr.includes("dairy") || searchStr.includes("butter") || searchStr.includes("cheese")) {
    return ["🥛", "🧀", "🧈", "🍦"];
  }
  if (searchStr.includes("spice") || searchStr.includes("masala")) {
    return ["🌶️", "🧂", "🌿", "🥘"];
  }
  if (searchStr.includes("snack") || searchStr.includes("biscuit") || searchStr.includes("bakery") || searchStr.includes("cake")) {
    return ["🍪", "🥐", "🥨", "🍫"];
  }
  if (searchStr.includes("drink") || searchStr.includes("tea") || searchStr.includes("coffee") || searchStr.includes("juice")) {
    return ["☕", "🍵", "🧃", "🥤"];
  }
  if (searchStr.includes("phone") || searchStr.includes("elect") || searchStr.includes("gadget")) {
    return ["📱", "💻", "⌚", "🎧"];
  }
  if (searchStr.includes("cosmetic") || searchStr.includes("beauty") || searchStr.includes("skin") || searchStr.includes("hair")) {
    return ["💄", "🧴", "✨", "💅"];
  }
  if (searchStr.includes("toy") || searchStr.includes("kid") || searchStr.includes("baby")) {
    return ["🧸", "🍼", "👶", "🎮"];
  }
  if (searchStr.includes("clean") || searchStr.includes("home") || searchStr.includes("essential") || searchStr.includes("household")) {
    return ["🧹", "🧽", "🧼", "🧴"];
  }

  return ["✨", "🛍️", "🏷️", "⭐"];
};

// Positions subcategory photos so they read as one overlapping collage (matches mockup)
const getCollageLayout = (count: number, index: number) => {
  if (count <= 1) {
    return { size: "w-full h-full", pos: "inset-0", z: "z-10" };
  }
  if (count === 2) {
    const layouts = [
      { size: "w-[58%] h-[82%]", pos: "bottom-0 left-0", z: "z-10" },
      { size: "w-[58%] h-[82%]", pos: "bottom-0 right-0", z: "z-20" },
    ];
    return layouts[index] || layouts[0];
  }
  const layouts = [
    { size: "w-[46%] h-[58%]", pos: "bottom-0 left-0", z: "z-10" },
    { size: "w-[46%] h-[58%]", pos: "bottom-0 left-[26%]", z: "z-20" },
    { size: "w-[50%] h-[76%]", pos: "bottom-0 right-0", z: "z-30" },
  ];
  return layouts[index] || layouts[0];
};

interface PromoStripProps {
  activeTab?: string;
}

export default function PromoStrip({ activeTab = "all" }: PromoStripProps) {
  const { location } = useLocation();
  const { mode } = useCommerceMode();
  const { t, getTranslatedField } = useTranslation();
  const theme = getTheme(activeTab);
  const navigate = useNavigate();
  const [categoryCards, setCategoryCards] = useState<PromoCard[]>([]);
  const [headingText, setHeadingText] = useState(theme.bannerText);
  const [saleTextValue, setSaleTextValue] = useState(theme.saleText);
  const [dateRange, setDateRange] = useState("");
  const [crazyDealsTitle, setCrazyDealsTitle] = useState("CRAZY DEALS");
  const [subcategoryImagesMap, setSubcategoryImagesMap] = useState<Record<string, string[]>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const bannerTextRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [bannerImgOk, setBannerImgOk] = useState(true);

  // Fetch subcategory images for category cards - DEFERRED for faster initial load
  const fetchSubcategoryImages = useCallback(async (cards: PromoCard[]) => {
    setTimeout(async () => {
      const imagesMap: Record<string, string[]> = {};
      const batchSize = 2;
      for (let i = 0; i < cards.length; i += batchSize) {
        const batch = cards.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (card) => {
            const categoryId = card.categoryId;
            if (!categoryId) return;
            try {
              const response = await getSubcategories(categoryId, { limit: 4 });
              if (response.success && response.data) {
                const images = response.data
                  .filter((subcat) => subcat.subcategoryImage)
                  .map((subcat) => subcat.subcategoryImage!)
                  .slice(0, 4);
                if (images.length > 0) {
                  imagesMap[card.id] = images;
                }
              }
            } catch (error) {
              console.error(`Error fetching subcategories for category ${categoryId}:`, error);
            }
          })
        );
        if (i + batchSize < cards.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      setSubcategoryImagesMap(imagesMap);
    }, 300);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const cacheKey = `home-content-${activeTab || 'all'}`;
      const cachedData = apiCache.getSync(cacheKey);
      if (!cachedData) {
        setLoading(true);
      }

      try {
        const response = await getHomeContent(
          activeTab,
          location?.latitude,
          location?.longitude,
          true,
          5 * 60 * 1000,
          false,
          mode
        );

        let fetchedCards: PromoCard[] = [];
        let newHeadingText = theme.bannerText;
        let newSaleTextValue = theme.saleText;
        let newDateRange = "";

        if (response.success && response.data) {
          if (response.data.promoStrip && response.data.promoStrip.isActive) {
            const promoStrip = response.data.promoStrip;
            newHeadingText = promoStrip.heading || newHeadingText;
            newSaleTextValue = promoStrip.saleText || newSaleTextValue;
            if (promoStrip.crazyDealsTitle) {
              setCrazyDealsTitle(promoStrip.crazyDealsTitle);
            } else {
              setCrazyDealsTitle("CRAZY DEALS");
            }

            if (promoStrip.startDate && promoStrip.endDate) {
              const start = new Date(promoStrip.startDate);
              const end = new Date(promoStrip.endDate);
              newDateRange = `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()} - ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}`;
            }

            if (promoStrip.categoryCards && promoStrip.categoryCards.length > 0) {
              fetchedCards = promoStrip.categoryCards
                .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                .map((card: any) => {
                  const category = typeof card.categoryId === 'object' ? card.categoryId : null;
                  return {
                    id: card._id || card.categoryId?._id || card.categoryId,
                    badge: card.badge || `Up to ${card.discountPercentage || 0}% OFF`,
                    title: card.title || category?.name || "",
                    categoryId: category?._id || card.categoryId,
                    slug: category?.slug || card.categoryId,
                    imageUrl: category?.image,
                    bgColor: "bg-yellow-50",
                  };
                });
            }
          } else if (response.data.promoCards && response.data.promoCards.length > 0) {
            fetchedCards = response.data.promoCards;
          } else if (
            response.data.categories &&
            response.data.categories.length > 0
          ) {
            fetchedCards = response.data.categories
              .slice(0, 6)
              .map((c: any) => ({
                id: c._id || c.id,
                badge: "Up to 50% OFF",
                title: c.name,
                categoryId: c.slug || c._id,
                slug: c.slug,
                bgColor: c.color || "bg-yellow-50",
              }));
          }
        }

        setCategoryCards(fetchedCards);
        setHeadingText(newHeadingText);
        setSaleTextValue(newSaleTextValue);
        setDateRange(newDateRange);
        if (!response.data?.promoStrip || !response.data.promoStrip.isActive) {
          setCrazyDealsTitle("CRAZY DEALS");
        }
        setHasData(fetchedCards.length > 0);

        if (fetchedCards.length > 0) {
          fetchSubcategoryImages(fetchedCards);
        }
      } catch (error) {
        console.error("Error fetching home content for PromoStrip:", error);
        setCategoryCards([]);
        setHasData(false);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, theme.bannerText, theme.saleText, mode]);

  // Card entrance animation
  useLayoutEffect(() => {
    if (!hasData) return;
    const container = containerRef.current;
    if (!container) return;

    let ctx: gsap.Context | null = null;
    const timeoutId = setTimeout(() => {
      ctx = gsap.context(() => {
        const cards = container.querySelectorAll(".promo-card");
        if (cards.length > 0) {
          gsap.fromTo(
            cards,
            { y: 20, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.4,
              stagger: 0.05,
              ease: "power2.out",
            }
          );
        }
      }, container);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (ctx) ctx.revert();
    };
  }, [hasData]);

  // Banner text entrance animation
  useLayoutEffect(() => {
    const el = bannerTextRef.current;
    if (!el) return;
    const timeoutId = setTimeout(() => {
      gsap.fromTo(
        el,
        { scale: 0.9, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.55, ease: "back.out(1.6)" }
      );
    }, 120);
    return () => {
      clearTimeout(timeoutId);
      gsap.killTweensOf(el);
    };
  }, [headingText, saleTextValue]);

  // Helper to extract max discount % from badges for the banner seal
  const maxDiscount = (() => {
    let max = 0;
    for (const card of categoryCards) {
      const match = (card.badge || "").match(/(\d+)\s*%/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    return max > 0 ? max : 55;
  })();

  const showCrazyDeals = !loading && categoryCards.length > 0;

  return (
    <div className="bg-[#f7fbff]">
      {/* ============ HERO BANNER (homebanner.png) ============ */}
      <div className="px-4 pt-3 md:px-6 md:pt-4">
        <div
          className="relative rounded-2xl overflow-hidden shadow-sm select-none"
          style={{
            background: "linear-gradient(135deg, #0056FF 0%, #2b7cff 55%, #55a3ff 100%)",
            minHeight: "150px",
          }}
        >
          {/* Banner image */}
          {bannerImgOk ? (
            <img
              src="/homebanner.png"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover object-right"
              loading="eager"
              decoding="async"
              onError={() => setBannerImgOk(false)}
            />
          ) : null}

          {/* Left-side content overlay */}
          <div
            ref={bannerTextRef}
            className="relative z-10 flex flex-col justify-center gap-1 px-4 sm:px-6 py-5 sm:py-7"
            style={{ maxWidth: "72%" }}
          >
            <div className="flex items-center gap-1.5">
              <svg width="18" height="24" viewBox="0 0 24 30" fill="none" aria-hidden="true">
                <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="#FFD700" stroke="#FFA500" strokeWidth="0.5" />
              </svg>
              <h2
                className="font-black text-white leading-none"
                style={{
                  fontFamily: '"Poppins", sans-serif',
                  fontSize: "clamp(22px, 6vw, 40px)",
                  letterSpacing: "1px",
                  textShadow: "0 2px 6px rgba(0,0,0,0.35)",
                  fontStyle: "italic",
                }}
              >
                {headingText}
              </h2>
            </div>
            <h3
              className="font-black leading-none"
              style={{
                fontFamily: '"Poppins", sans-serif',
                fontSize: "clamp(20px, 5.5vw, 36px)",
                letterSpacing: "1px",
                color: "#FFE14D",
                textShadow: "0 2px 6px rgba(0,0,0,0.35)",
                fontStyle: "italic",
                marginTop: "-2px",
              }}
            >
              {saleTextValue}
            </h3>
            <p
              className="text-white/95 font-semibold leading-snug mt-1"
              style={{ fontSize: "clamp(11px, 2.8vw, 14px)", textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
            >
              {t("home.bannerSubtitle", "Daily essentials at unbeatable prices")}
            </p>

            {/* Discount seal */}
            <div className="mt-2 inline-flex">
              <div
                className="bg-[#FFD700] text-[#c1121f] font-black rounded-full flex items-center justify-center text-center shadow-md"
                style={{ width: "72px", height: "72px", lineHeight: 1.05, fontSize: "11px", padding: "6px" }}
              >
                <span>
                  UP TO
                  <br />
                  <span style={{ fontSize: "18px" }}>{maxDiscount}%</span>
                  <br />
                  OFF
                </span>
              </div>
            </div>
          </div>

          {/* Carousel dots (decorative single-slide indicator) */}
          <div className="absolute bottom-2.5 left-4 z-10 flex gap-1.5" aria-hidden="true">
            <span className="w-2 h-2 rounded-full bg-white" />
            <span className="w-2 h-2 rounded-full bg-white/45" />
            <span className="w-2 h-2 rounded-full bg-white/45" />
          </div>

          {/* Date range chip if configured */}
          {dateRange && (
            <div className="absolute top-2.5 right-3 z-10 bg-white/90 text-neutral-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {dateRange}
            </div>
          )}
        </div>
      </div>

      {/* ============ CRAZY DEALS ============ */}
      <div className="px-4 mt-4 md:px-6">
        <div ref={containerRef} className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="flex items-center gap-1.5 text-lg md:text-xl font-black text-neutral-900 tracking-tight">
              <span aria-hidden="true">🔥</span>
              {getTranslatedField({ title: crazyDealsTitle }, "title") || crazyDealsTitle}
            </h2>
            <button
              type="button"
              onClick={() => navigate("/categories")}
              className="flex items-center gap-1 text-primary font-bold text-sm hover:underline"
            >
              {t("common.viewAll", "View All")}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-xl h-32 bg-neutral-100 animate-pulse" />
              ))}
            </div>
          ) : showCrazyDeals ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {categoryCards.map((card, index) => {
                const subcategoryImages = subcategoryImagesMap[card.id] || card.subcategoryImages || [];
                const hasSubcategoryImages = subcategoryImages.length > 0;
                const categoryIcons = getCategoryIcons(card.slug || card.categoryId || "", card.title || "");
                const bg = DEAL_BG_COLORS[index % DEAL_BG_COLORS.length];

                return (
                  <Link
                    key={card.id}
                    to={card.slug || card.categoryId ? `/category/${card.slug || card.categoryId}` : "#"}
                    className="promo-card group relative rounded-xl overflow-hidden flex flex-col min-h-[140px] transition-shadow hover:shadow-md active:scale-[0.98]"
                    style={{ background: bg }}
                  >
                    {/* Orange discount badge */}
                    <div className="px-2.5 pt-2.5">
                      <span className="inline-block bg-[#ff5b2e] text-white text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-md shadow-sm">
                        {card.badge}
                      </span>
                    </div>

                    {/* Title */}
                    <div className="px-2.5 mt-1.5">
                      <span className="text-[13px] sm:text-sm font-extrabold text-neutral-900 leading-tight line-clamp-2">
                        {getTranslatedField(card, "title") || card.title}
                      </span>
                    </div>

                    {/* Product image collage + arrow */}
                    <div className="relative mt-auto flex-1 min-h-[74px] px-2.5 pb-2.5">
                      {hasSubcategoryImages ? (
                        <div className="relative w-full h-full">
                          {subcategoryImages.slice(0, 3).map((imageUrl, idx) => {
                            const shown = subcategoryImages.slice(0, 3);
                            const layout = getCollageLayout(shown.length, idx);
                            return (
                              <img
                                key={idx}
                                src={imageUrl}
                                alt=""
                                className={`absolute object-cover rounded-lg shadow-md ring-2 ring-white ${layout.size} ${layout.pos} ${layout.z}`}
                                loading="lazy"
                                decoding="async"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.visibility = "hidden";
                                }}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex items-end justify-end h-full">
                          <span className="text-3xl opacity-70" aria-hidden="true">
                            {categoryIcons[0] || "✨"}
                          </span>
                        </div>
                      )}

                      {/* Blue circular arrow overlapping the collage */}
                      <div className="absolute bottom-2.5 right-2.5 z-40 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-neutral-400 text-sm text-center py-4">
              {t("home.noPromotions", "No active promotions")}
            </p>
          )}
        </div>
      </div>

      {/* ============ FEATURES STRIP ============ */}
      <div className="px-4 mt-3 md:px-6">
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 px-2 py-3.5">
          <div className="grid grid-cols-4">
            <FeatureItem
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="9" r="2" />
                  <circle cx="15" cy="15" r="2" />
                  <path d="M19 5L5 19" />
                </svg>
              }
              label={t("home.featureOffers", "Special Offers")}
            />
            <FeatureItem
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              }
              label={t("home.featureDelivery", "12–15 Mins Delivery")}
            />
            <FeatureItem
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              }
              label={t("home.featureQuality", "Best Quality")}
            />
            <FeatureItem
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <path d="M2 10h20" />
                </svg>
              }
              label={t("home.featurePayments", "Safe & Easy Payments")}
              isLast
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({
  icon,
  label,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  isLast?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1.5 px-1 ${
        isLast ? "" : "border-r border-neutral-100"
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
        {icon}
      </div>
      <span className="text-[10px] sm:text-[11px] font-bold text-neutral-700 text-center leading-tight">
        {label}
      </span>
    </div>
  );
}
