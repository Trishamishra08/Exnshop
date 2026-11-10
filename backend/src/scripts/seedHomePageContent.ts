/**
 * Creates the initial Home Page Content (banners, trust strip, offer cards,
 * product sections, Shop by Category) — the values the home page showed when
 * it was built. Does nothing if content already exists, unless --force.
 *
 * Usage: npx tsx src/scripts/seedHomePageContent.ts [--force]
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env") });

import mongoose from "mongoose";
import HomePageContent from "../models/HomePageContent";

const DEFAULT_CONTENT = {
  key: "default",
  fallbackHeadline: "Mega Shopping Fest",
  searchPlaceholder: "Search for products, brands and more…",
  banners: [
    {
      title: "Mega Shopping Fest (Shop All)",
      image: "/banners/home-shopall-1800.jpg",
      mobileImage: "/banners/home-shopall-900.jpg",
      link: "/categories",
      mode: "ECommerce",
      isActive: true,
      order: 0,
    },
    {
      title: "Daily essentials (Quick)",
      image: "/homebanner.png",
      link: "/categories",
      headline: "Daily Essentials",
      subtitle: "Fresh groceries & more, delivered fast",
      buttonText: "Shop Now",
      mode: "Quick",
      isActive: true,
      order: 1,
    },
  ],
  trustItems: [
    { label: "Free Delivery", icon: "delivery", order: 0 },
    { label: "Easy Returns", icon: "returns", order: 1 },
    { label: "Secure Payments", icon: "payments", order: 2 },
    { label: "Exnshop Prime", icon: "prime", order: 3 },
    { label: "Top Offers", icon: "offers", order: 4 },
  ],
  offerCards: [
    { title: "Bank Offer", text: "Extra 10% Instant Discount* on Credit Cards", icon: "card", style: "blue", link: "/categories", mode: "All", order: 0 },
    { title: "Exnshop Prime", text: "Join Prime at ₹299/year", icon: "crown", style: "gold", link: "/categories", mode: "All", order: 1 },
  ],
  productSections: [
    { title: "Most Popular", subtitle: "Customer favourites right now", emoji: "⭐", sort: "popular", limit: 12, tinted: false, order: 0 },
    { title: "Biggest Discounts", subtitle: "Highest % off across the store", emoji: "🏷️", sort: "discount", limit: 12, tinted: true, order: 1 },
    { title: "New Arrivals", subtitle: "Just added to Exnshop", emoji: "✨", sort: "newest", limit: 12, tinted: false, order: 2 },
  ],
  shopByCategory: { title: "Shop by Category", limit: 12, isActive: true },
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const existing = await HomePageContent.findOne({ key: "default" });
  if (existing && !process.argv.includes("--force")) {
    console.log("Home page content already exists — left unchanged (use --force to reset it).");
  } else {
    await HomePageContent.findOneAndUpdate({ key: "default" }, DEFAULT_CONTENT, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    console.log(existing ? "Home page content reset to defaults." : "Home page content created.");
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
