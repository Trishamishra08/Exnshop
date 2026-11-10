import { useCommerceMode } from "../../../../context/CommerceModeContext";

/**
 * Colours for the home page. "Shop All" (ECommerce) is the pink/red look;
 * "Quick" swaps every pink for blue — layout and content stay the same.
 */
export interface HomeTheme {
  quick: boolean;
  /** Buttons, badges, active states */
  brand: string;
  /** Darker shade for text on light tints */
  brandDark: string;
  /** Light tint for cards / circles */
  tint: string;
  /** Slightly stronger tint for borders */
  tintBorder: string;
  /** Page background behind the sections */
  pageBg: string;
  /** Top hero area (logo, location, search, circles) */
  heroBg: string;
  /** Main promo banner */
  bannerBg: string;
}

const SHOP_ALL: HomeTheme = {
  quick: false,
  brand: "#D7193F",
  brandDark: "#A50E2D",
  tint: "#FFF0F3",
  tintBorder: "#FBD3DC",
  pageBg: "#FFF8FA",
  heroBg: "linear-gradient(180deg, #F9C6D2 0%, #FBDCE4 48%, #FFF5F8 100%)",
  bannerBg: "linear-gradient(115deg, #8E0B35 0%, #C8174E 45%, #EC5A86 100%)",
};

const QUICK: HomeTheme = {
  quick: true,
  brand: "#0056FF",
  brandDark: "#003ECC",
  tint: "#EEF4FF",
  tintBorder: "#D3E2FF",
  pageBg: "#F6F9FF",
  heroBg: "linear-gradient(180deg, #BCD5FF 0%, #DAE7FF 48%, #F4F8FF 100%)",
  bannerBg: "linear-gradient(115deg, #0636B8 0%, #0056FF 45%, #4F8DFF 100%)",
};

export function useHomeTheme(): HomeTheme {
  const { mode } = useCommerceMode();
  return mode === "Quick" ? QUICK : SHOP_ALL;
}


/**
 * Admin-managed home page content (Admin › Home Page Content), delivered with
 * the /customer/home response as `pageContent` — already filtered to active
 * items for the current mode and sorted.
 */
export interface HomeBanner {
  _id: string;
  title?: string;
  image: string;
  mobileImage?: string;
  link?: string;
  headline?: string;
  subtitle?: string;
  buttonText?: string;
}
export interface HomeTrustItem {
  _id: string;
  label: string;
  icon: string;
  link?: string;
  translations?: Record<string, Record<string, string>>;
}
export interface HomeOfferCard {
  _id: string;
  title: string;
  text: string;
  icon: string;
  style: string;
  link?: string;
  translations?: Record<string, Record<string, string>>;
}
export interface HomeProductSection {
  _id: string;
  title: string;
  subtitle?: string;
  emoji?: string;
  sort: "popular" | "discount" | "newest";
  limit: number;
  tinted: boolean;
  translations?: Record<string, Record<string, string>>;
}
export interface HomePageContent {
  banners: HomeBanner[];
  fallbackHeadline?: string;
  searchPlaceholder?: string;
  trustItems: HomeTrustItem[];
  offerCards: HomeOfferCard[];
  productSections: HomeProductSection[];
  shopByCategory?: { title: string; limit: number; isActive: boolean } | null;
}

/** Colour schemes an offer card can use (chosen in admin). */
export const OFFER_STYLES: Record<string, { bg: string; border: string; title: string; icon: string }> = {
  blue: { bg: "linear-gradient(120deg, #EAF2FF 0%, #F5F9FF 100%)", border: "#D6E4FF", title: "#0056FF", icon: "#0056FF" },
  gold: { bg: "linear-gradient(120deg, #FFF8E6 0%, #FFEFC7 100%)", border: "#FBE3A6", title: "#0B3FB8", icon: "#F59E0B" },
  pink: { bg: "linear-gradient(120deg, #FFEFF3 0%, #FFE0E8 100%)", border: "#FBCFDA", title: "#C8174E", icon: "#C8174E" },
  green: { bg: "linear-gradient(120deg, #EAF8EF 0%, #DDF3E5 100%)", border: "#C4EBD2", title: "#11643A", icon: "#16A34A" },
  purple: { bg: "linear-gradient(120deg, #F3EEFF 0%, #E9E0FF 100%)", border: "#DDD0FF", title: "#5B21B6", icon: "#7C3AED" },
};

/**
 * Used only when the server sends no Home Page Content (an older backend, or
 * nothing saved in admin yet) so the page never loses its banner / strips.
 * Same values as backend/src/scripts/seedHomePageContent.ts; once the admin
 * saves content, that is what shows.
 */
export const DEFAULT_PAGE_CONTENT: HomePageContent = {
  fallbackHeadline: "Mega Shopping Fest",
  searchPlaceholder: "Search for products, brands and more…",
  banners: [],
  trustItems: [
    { _id: "d-t1", label: "Free Delivery", icon: "delivery" },
    { _id: "d-t2", label: "Easy Returns", icon: "returns" },
    { _id: "d-t3", label: "Secure Payments", icon: "payments" },
    { _id: "d-t4", label: "Exnshop Prime", icon: "prime" },
    { _id: "d-t5", label: "Top Offers", icon: "offers" },
  ],
  offerCards: [
    { _id: "d-o1", title: "Bank Offer", text: "Extra 10% Instant Discount* on Credit Cards", icon: "card", style: "blue", link: "/categories" },
    { _id: "d-o2", title: "Exnshop Prime", text: "Join Prime at ₹299/year", icon: "crown", style: "gold", link: "/categories" },
  ],
  productSections: [
    { _id: "d-s1", title: "Most Popular", subtitle: "Customer favourites right now", emoji: "⭐", sort: "popular", limit: 12, tinted: false },
    { _id: "d-s2", title: "Biggest Discounts", subtitle: "Highest % off across the store", emoji: "🏷️", sort: "discount", limit: 12, tinted: true },
    { _id: "d-s3", title: "New Arrivals", subtitle: "Just added to Exnshop", emoji: "✨", sort: "newest", limit: 12, tinted: false },
  ],
  shopByCategory: { title: "Shop by Category", limit: 12, isActive: true },
};

/** Default banners per mode (same as the seed), used with DEFAULT_PAGE_CONTENT. */
export const DEFAULT_BANNERS: Record<"Quick" | "ECommerce", HomeBanner[]> = {
  ECommerce: [
    { _id: "d-b1", title: "Mega Shopping Fest", image: "/banners/home-shopall-1800.jpg", mobileImage: "/banners/home-shopall-900.jpg", link: "/categories" },
  ],
  Quick: [
    {
      _id: "d-b2",
      title: "Daily essentials",
      image: "/homebanner.png",
      link: "/categories",
      headline: "Daily Essentials",
      subtitle: "Fresh groceries & more, delivered fast",
      buttonText: "Shop Now",
    },
  ],
};

/** The page content to render: the server's when it sent one, otherwise the defaults for this mode. */
export function resolvePageContent(serverContent: HomePageContent | null | undefined, quick: boolean): HomePageContent {
  if (serverContent) return serverContent;
  return { ...DEFAULT_PAGE_CONTENT, banners: DEFAULT_BANNERS[quick ? "Quick" : "ECommerce"] };
}
