import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import Category from "../models/Category";
import HeaderCategory from "../models/HeaderCategory";
import { cache } from "../utils/cache";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

/** Essential customer-facing categories (Active) for empty production DBs */
const ESSENTIAL_CATEGORIES: Array<{
  name: string;
  slug: string;
  image: string;
  order: number;
}> = [
  { name: "Fruits & Vegetables", slug: "fruits-veg", image: "/assets/category-fruits-veg.png", order: 1 },
  { name: "Dairy, Bread & Eggs", slug: "dairy", image: "/assets/category-dairy.png", order: 2 },
  { name: "Atta, Rice & Dal", slug: "atta-rice", image: "/assets/category-atta-rice.png", order: 3 },
  { name: "Masala, Oil & More", slug: "masala", image: "/assets/category-masala.png", order: 4 },
  { name: "Snacks & Munchies", slug: "snacks", image: "/assets/category-snacks.png", order: 5 },
  { name: "Bakery & Biscuits", slug: "biscuits", image: "/assets/category-biscuits.png", order: 6 },
  { name: "Breakfast & Instant Food", slug: "breakfast", image: "/assets/category-breakfast.png", order: 7 },
  { name: "Cold Drinks & Juices", slug: "drinks", image: "/assets/category-drinks.png", order: 8 },
  { name: "Sweet Tooth", slug: "sweet-tooth", image: "/assets/category-sweet-tooth.png", order: 9 },
  { name: "Tea, Coffee & Health Drink", slug: "tea-coffee", image: "/assets/category-tea,-coffe-&-health-drink.png", order: 10 },
  { name: "Personal Care", slug: "personal-care", image: "/assets/category-personal-care.png", order: 11 },
  { name: "Cleaning Essentials", slug: "cleaning", image: "/assets/category-cleaning.png", order: 12 },
  { name: "Baby Care", slug: "baby-care", image: "/assets/category-baby-care.png", order: 13 },
  { name: "Pharma & Wellness", slug: "pharma", image: "/assets/category-pharma-&-wellness.png", order: 14 },
  { name: "Home & Office", slug: "home-office", image: "/assets/category-home-&-office.png", order: 15 },
  { name: "Pet Care", slug: "pet-care", image: "/assets/category-pet-care.png", order: 16 },
];

async function seedEssentialCategories() {
  if (!MONGO_URI) {
    throw new Error("MONGODB_URI is missing");
  }

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const groceryHeader = await HeaderCategory.findOne({ slug: "grocery" });
  const headerCategoryId = groceryHeader?._id;

  let created = 0;
  let skipped = 0;

  for (const item of ESSENTIAL_CATEGORIES) {
    const existing = await Category.findOne({
      $or: [{ slug: item.slug }, { name: item.name }],
    });

    if (existing) {
      // Ensure Active so customer API can see it
      if (existing.status !== "Active") {
        existing.status = "Active";
        await existing.save();
        console.log(`Activated: ${existing.name} (${existing.slug})`);
      } else {
        console.log(`Skip existing: ${existing.name} (${existing.slug})`);
      }
      skipped++;
      continue;
    }

    await Category.create({
      name: item.name,
      slug: item.slug,
      image: item.image,
      order: item.order,
      status: "Active",
      headerCategoryId: headerCategoryId || undefined,
      parentId: null,
    });
    created++;
    console.log(`Created: ${item.name} (${item.slug})`);
  }

  cache.delete("customer-categories-list-v2");
  cache.delete("customer-categories-tree");

  console.log(`Done. created=${created}, skipped=${skipped}`);
  await mongoose.disconnect();
}

seedEssentialCategories().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
