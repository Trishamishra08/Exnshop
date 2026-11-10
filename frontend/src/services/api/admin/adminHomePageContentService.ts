import api from "../config";

export type HomeMode = "All" | "Quick" | "ECommerce";

export interface AdminHomeBanner {
  _id?: string;
  title?: string;
  image: string;
  mobileImage?: string;
  link?: string;
  headline?: string;
  subtitle?: string;
  buttonText?: string;
  mode: HomeMode;
  isActive: boolean;
}

export interface AdminTrustItem {
  _id?: string;
  label: string;
  icon: string;
  link?: string;
  isActive: boolean;
}

export interface AdminOfferCard {
  _id?: string;
  title: string;
  text: string;
  icon: string;
  style: string;
  link?: string;
  mode: HomeMode;
  isActive: boolean;
}

export interface AdminProductSection {
  _id?: string;
  title: string;
  subtitle?: string;
  emoji?: string;
  sort: "popular" | "discount" | "newest";
  limit: number;
  tinted: boolean;
  isActive: boolean;
}

export interface AdminHomePageContent {
  banners: AdminHomeBanner[];
  fallbackHeadline: string;
  searchPlaceholder: string;
  trustItems: AdminTrustItem[];
  offerCards: AdminOfferCard[];
  productSections: AdminProductSection[];
  shopByCategory: { title: string; limit: number; isActive: boolean };
}

export const EMPTY_HOME_PAGE_CONTENT: AdminHomePageContent = {
  banners: [],
  fallbackHeadline: "",
  searchPlaceholder: "",
  trustItems: [],
  offerCards: [],
  productSections: [],
  shopByCategory: { title: "Shop by Category", limit: 12, isActive: true },
};

export const getHomePageContent = async (): Promise<AdminHomePageContent | null> => {
  const res = await api.get("/admin/home-page-content");
  return res.data?.data || null;
};

export const saveHomePageContent = async (content: AdminHomePageContent): Promise<AdminHomePageContent> => {
  const res = await api.put("/admin/home-page-content", content);
  return res.data?.data;
};
