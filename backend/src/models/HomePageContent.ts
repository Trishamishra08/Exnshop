import mongoose, { Document, Schema } from "mongoose";

/**
 * Everything on the customer home page that isn't a product: banners, the
 * trust strip, offer cards, product-section titles and the "Shop by
 * Category" block. One document (key "default"), edited from
 * Admin › Home Page Content.
 */

export const HOME_MODES = ["All", "Quick", "ECommerce"] as const;
export const TRUST_ICONS = ["delivery", "returns", "payments", "prime", "offers", "quality", "support", "cod", "fast"] as const;
export const OFFER_ICONS = ["card", "crown", "gift", "tag", "wallet", "truck"] as const;
export const OFFER_STYLES = ["blue", "gold", "pink", "green", "purple"] as const;
export const SECTION_SORTS = ["popular", "discount", "newest"] as const;

export interface IHomeBanner {
  _id?: mongoose.Types.ObjectId;
  /** Internal name shown in admin */
  title?: string;
  image: string;
  mobileImage?: string;
  link?: string;
  /** Optional text drawn over the image (leave empty for finished artwork) */
  headline?: string;
  subtitle?: string;
  buttonText?: string;
  mode: (typeof HOME_MODES)[number];
  isActive: boolean;
  order: number;
}

export interface IHomeTrustItem {
  _id?: mongoose.Types.ObjectId;
  label: string;
  icon: (typeof TRUST_ICONS)[number];
  link?: string;
  isActive: boolean;
  order: number;
  translations?: Record<string, Record<string, string>>;
}

export interface IHomeOfferCard {
  _id?: mongoose.Types.ObjectId;
  title: string;
  text: string;
  icon: (typeof OFFER_ICONS)[number];
  style: (typeof OFFER_STYLES)[number];
  link?: string;
  mode: (typeof HOME_MODES)[number];
  isActive: boolean;
  order: number;
  translations?: Record<string, Record<string, string>>;
}

export interface IHomeProductSection {
  _id?: mongoose.Types.ObjectId;
  title: string;
  subtitle?: string;
  emoji?: string;
  sort: (typeof SECTION_SORTS)[number];
  limit: number;
  tinted: boolean;
  isActive: boolean;
  order: number;
  translations?: Record<string, Record<string, string>>;
}

export interface IHomePageContent extends Document {
  key: string;
  banners: IHomeBanner[];
  /** Headline used by the built-in banner when a mode has no banner image */
  fallbackHeadline: string;
  searchPlaceholder: string;
  trustItems: IHomeTrustItem[];
  offerCards: IHomeOfferCard[];
  productSections: IHomeProductSection[];
  shopByCategory: { title: string; limit: number; isActive: boolean };
  translations?: Record<string, Record<string, string>>;
}

const BannerSchema = new Schema<IHomeBanner>({
  title: { type: String, trim: true, maxlength: 80 },
  image: { type: String, required: true, trim: true },
  mobileImage: { type: String, trim: true },
  link: { type: String, trim: true, default: "/categories" },
  headline: { type: String, trim: true, maxlength: 60 },
  subtitle: { type: String, trim: true, maxlength: 90 },
  buttonText: { type: String, trim: true, maxlength: 24 },
  mode: { type: String, enum: HOME_MODES, default: "All" },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});

const TrustItemSchema = new Schema<IHomeTrustItem>({
  label: { type: String, required: true, trim: true, maxlength: 30 },
  icon: { type: String, enum: TRUST_ICONS, default: "delivery" },
  link: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  translations: { type: Schema.Types.Mixed, default: {} },
});

const OfferCardSchema = new Schema<IHomeOfferCard>({
  title: { type: String, required: true, trim: true, maxlength: 40 },
  text: { type: String, trim: true, maxlength: 80, default: "" },
  icon: { type: String, enum: OFFER_ICONS, default: "tag" },
  style: { type: String, enum: OFFER_STYLES, default: "blue" },
  link: { type: String, trim: true, default: "/categories" },
  mode: { type: String, enum: HOME_MODES, default: "All" },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  translations: { type: Schema.Types.Mixed, default: {} },
});

const ProductSectionSchema = new Schema<IHomeProductSection>({
  title: { type: String, required: true, trim: true, maxlength: 40 },
  subtitle: { type: String, trim: true, maxlength: 80 },
  emoji: { type: String, trim: true, maxlength: 8 },
  sort: { type: String, enum: SECTION_SORTS, default: "newest" },
  limit: { type: Number, default: 12, min: 4, max: 30 },
  tinted: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  translations: { type: Schema.Types.Mixed, default: {} },
});

const HomePageContentSchema = new Schema<IHomePageContent>(
  {
    key: { type: String, default: "default", unique: true },
    banners: { type: [BannerSchema], default: [] },
    fallbackHeadline: { type: String, trim: true, default: "Mega Shopping Fest" },
    searchPlaceholder: { type: String, trim: true, default: "Search for products, brands and more…" },
    trustItems: { type: [TrustItemSchema], default: [] },
    offerCards: { type: [OfferCardSchema], default: [] },
    productSections: { type: [ProductSectionSchema], default: [] },
    shopByCategory: {
      title: { type: String, trim: true, default: "Shop by Category" },
      limit: { type: Number, default: 12, min: 4, max: 30 },
      isActive: { type: Boolean, default: true },
    },
    translations: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const HomePageContent =
  (mongoose.models.HomePageContent as mongoose.Model<IHomePageContent>) ||
  mongoose.model<IHomePageContent>("HomePageContent", HomePageContentSchema);

export default HomePageContent;

/** Cache key used by the customer home endpoint; cleared when admin saves. */
export const HOME_PAGE_CONTENT_CACHE_KEY = "home-page-content-default";
