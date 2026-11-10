/**
 * Demo products for the demo catalogue: one product per demo sub-category,
 * using the category photos in frontend/public/category-images, with real
 * listing fields filled in. Ratings/reviews are left at zero (no fake reviews).
 *
 * Products are added to the default seller "Exnshop Store" (mobile 8839044030),
 * whose channels get "ECommerce" added so they also show in Shop All. A demo
 * Quick-only seller in Noida ("Exnshop Quick Mart") gets 13 of them for Quick mode.
 * Every product is tagged "demo-seed", so they can be removed in one go.
 *
 * Usage:
 *   npx tsx src/scripts/seedDemoProducts.ts            # add (skips ones already there)
 *   npx tsx src/scripts/seedDemoProducts.ts --remove   # delete all demo-seed products
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env") });

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Product from "../models/Product";
import Category from "../models/Category";
import Seller from "../models/Seller";
import "../models/HeaderCategory";
import { resolveListingConfig, cleanAttributes } from "../services/listingConfigService";

const TAG = "demo-seed";
const SELLER_MOBILE = "8839044030";

interface DemoProduct {
  leaf: string; // sub-category name
  group: string; // its parent group
  name: string;
  price: number; // selling price
  mrp: number;
  image: string; // file in /category-images
  popular?: boolean;
  description: string;
  attributes: Record<string, any>;
}

const PRODUCTS: DemoProduct[] = [
  { group: "Ethnic Wear", leaf: "Sarees", name: "Banarasi Art Silk Saree with Blouse Piece", price: 1599, mrp: 3499, image: "sarees", popular: true,
    description: "Lightweight Banarasi-style art silk saree with zari border and a matching unstitched blouse piece.",
    attributes: { colour: "Red", fabric: "Art Silk", occasion: "Festive", saree_length: 5.5, blouse_piece: true } },
  { group: "Ethnic Wear", leaf: "Kurtis", name: "Women's Rayon Straight Kurti", price: 499, mrp: 1299, image: "kurtis", popular: true,
    description: "Comfortable everyday rayon kurti with a mandarin collar and three-quarter sleeves.",
    attributes: { colour: "Red", size: "M", fabric: "Rayon", pattern: "Solid", sleeve_length: "Three-Quarter Sleeve", neck: "Mandarin Collar", kurta_length: "Knee Length" } },
  { group: "Ethnic Wear", leaf: "Lehengas", name: "Embroidered Bridal Lehenga Choli Set", price: 4999, mrp: 11999, image: "lehengas",
    description: "Heavily embroidered lehenga with choli and dupatta, ideal for weddings and receptions.",
    attributes: { colour: "Pink", size: "M", fabric: "Silk", occasion: "Wedding", set_contents: ["Lehenga", "Choli", "Dupatta"], stitch_type: "Semi-Stitched" } },
  { group: "Western Wear", leaf: "Dresses", name: "Floral Printed Maxi Dress", price: 799, mrp: 1999, image: "dresses",
    description: "Flowy printed maxi dress with spaghetti straps — easy summer wear.",
    attributes: { colour: "Multicolour", size: "M", fabric: "Rayon", pattern: "Printed", sleeve_length: "Sleeveless", dress_length: "Maxi" } },
  { group: "Western Wear", leaf: "Tops", name: "Women's Cotton Peasant Top", price: 449, mrp: 999, image: "tops",
    description: "Breathable cotton top with full sleeves and a relaxed fit.",
    attributes: { colour: "White", size: "M", fabric: "Cotton", fit: "Relaxed", sleeve_length: "Full Sleeve" } },
  { group: "Western Wear", leaf: "Jeans", name: "Women's High Rise Straight Jeans", price: 899, mrp: 1999, image: "jeans",
    description: "Classic mid-blue denim with a high rise and straight fit.",
    attributes: { colour: "Blue", size: "30", fabric: "Denim", fit: "Straight", rise: "High Rise" } },
  { group: "Jewellery", leaf: "Earrings", name: "Pearl Drop Earrings", price: 299, mrp: 799, image: "earrings", popular: true,
    description: "Elegant faux-pearl drop earrings on a slim silver-tone bar.",
    attributes: { colour: "White", base_metal: "Alloy", plating: "Silver Plated", occasion: "Party", pack_of: 1 } },
  { group: "Jewellery", leaf: "Necklaces", name: "Gold Plated Link Chain Necklace", price: 599, mrp: 1499, image: "necklaces",
    description: "Statement gold-plated link chain necklace with a lobster clasp.",
    attributes: { colour: "Gold", base_metal: "Brass", plating: "Gold Plated", occasion: "Party", pack_of: 1 } },
  { group: "Topwear", leaf: "T-Shirts", name: "Men's Cotton Round Neck T-Shirt", price: 349, mrp: 799, image: "t-shirts", popular: true,
    description: "Soft 100% cotton round-neck t-shirt with a printed chest graphic.",
    attributes: { colour: "Red", size: "L", fabric: "Cotton", pattern: "Graphic", sleeve_length: "Short Sleeve", neck: "Round Neck", fit: "Regular" } },
  { group: "Topwear", leaf: "Shirts", name: "Men's Checked Casual Shirt", price: 699, mrp: 1599, image: "shirts",
    description: "Regular-fit cotton shirt in a light check, great for office or weekends.",
    attributes: { colour: "White", size: "L", fabric: "Cotton", pattern: "Checked", sleeve_length: "Full Sleeve", neck: "Collar", fit: "Regular" } },
  { group: "Footwear", leaf: "Sports Shoes", name: "Men's Lightweight Running Shoes", price: 1299, mrp: 2999, image: "sports-shoes", popular: true,
    description: "Breathable mesh running shoes with a cushioned EVA sole.",
    attributes: { colour: "Olive", size: "UK 8", upper_material: "Mesh", sole_material: "EVA", closure: "Lace-up", occasion: "Sports" } },
  { group: "Footwear", leaf: "Formal Shoes", name: "Men's Brogue Oxford Formal Shoes", price: 1799, mrp: 3999, image: "formal-shoes",
    description: "Polished brogue oxfords with a cushioned insole for all-day wear.",
    attributes: { colour: "Navy Blue", size: "UK 9", upper_material: "Faux Leather", sole_material: "TPR", closure: "Lace-up", occasion: "Formal" } },
  { group: "Audio", leaf: "Headphones", name: "Over-Ear Wired Headphones with Mic", price: 999, mrp: 2499, image: "headphones",
    description: "Comfortable over-ear headphones with padded cushions and an in-line mic.",
    attributes: { warranty: "1 Year", colour: "Cream", connectivity: "Wired 3.5 mm", mic: true, noise_cancellation: "None" } },
  { group: "Audio", leaf: "Wireless Earbuds", name: "True Wireless Earbuds with Charging Case", price: 1199, mrp: 2999, image: "wireless-earbuds", popular: true,
    description: "Bluetooth 5.3 earbuds with touch controls and up to 30 hours total playback.",
    attributes: { warranty: "6 Months", colour: "White", connectivity: "Bluetooth", battery_life: 30, mic: true, noise_cancellation: "ENC (calls)" } },
  { group: "Mobile Accessories", leaf: "Phone Cases", name: "Transparent Shockproof Phone Case", price: 149, mrp: 499, image: "phone-cases",
    description: "Slim clear case with raised edges to protect the screen and camera.",
    attributes: { warranty: "No Warranty", colour: "Transparent", compatible_model: "Samsung Galaxy S20 FE", material: "TPU" } },
  { group: "Wearables", leaf: "Smart Watches", name: "Smart Watch with Bluetooth Calling", price: 1499, mrp: 4999, image: "smart-watches", popular: true,
    description: "1.8\" display smart watch with calling, heart-rate tracking and 7-day battery.",
    attributes: { warranty: "1 Year", colour: "Black", display_size: 1.8, battery_life: 7, calling: true } },
  { group: "Cookware", leaf: "Pots & Pans", name: "Stainless Steel Frying Pan 24 cm", price: 649, mrp: 1499, image: "pots-and-pans",
    description: "Tri-ply stainless steel fry pan that works on gas and induction.",
    attributes: { material: "Stainless Steel", colour: "Silver", induction_compatible: true, coating: "Uncoated", diameter: 24 } },
  { group: "Cookware", leaf: "Pressure Cookers", name: "Aluminium Pressure Cooker 3 L", price: 1099, mrp: 2199, image: "pressure-cookers", popular: true,
    description: "Classic outer-lid aluminium pressure cooker for everyday cooking.",
    attributes: { material: "Aluminium", colour: "Silver", induction_compatible: false, capacity: 3 } },
  { group: "Home Decor", leaf: "Wall Clocks", name: "Hand-Painted Decorative Wall Clock", price: 899, mrp: 1999, image: "wall-clocks",
    description: "Colourful hand-painted wooden wall clock with a silent movement.",
    attributes: { material: "Wood", colour: "Green", display_type: "Analog" } },
  { group: "Home Decor", leaf: "Cushions", name: "Printed Cotton Cushion Covers (Set of 5)", price: 399, mrp: 999, image: "cushions",
    description: "Set of 5 printed cotton cushion covers, 16 x 16 inch, with zip closure.",
    attributes: { material: "Cotton", colour: "Blue", cover_size: "16 x 16 inch", filler_included: false, pack_of: 5 } },
];

/**
 * Quick is location-based (fast local delivery): a demo Quick-only seller in
 * Noida, so Quick mode has nearby products there. Shop All products stay with
 * "Exnshop Store" — no duplicates across modes.
 */
const QUICK_SELLER = {
  email: "quickmart@exnshop.io",
  mobile: "9000000002",
  sellerName: "Exnshop Quick Mart",
  storeName: "Exnshop Quick Mart",
  city: "Noida",
  address: "Sector 18, Noida, Uttar Pradesh 201301",
  latitude: 28.5708,
  longitude: 77.326,
  serviceRadiusKm: 25,
};
const QUICK_LEAVES = [
  "Kurtis", "Tops", "Earrings", "T-Shirts", "Sports Shoes", "Headphones", "Wireless Earbuds",
  "Phone Cases", "Smart Watches", "Pots & Pans", "Pressure Cookers", "Wall Clocks", "Cushions",
];
const QUICK_POPULAR = new Set(["Kurtis", "Wireless Earbuds", "Pressure Cookers", "T-Shirts", "Phone Cases"]);

async function addProducts(seller: any, list: DemoProduct[]) {
  let created = 0;
  for (const [i, p] of list.entries()) {
    const group: any = await Category.findOne({ name: p.group, parentId: null }).lean();
    const leaf: any = group && (await Category.findOne({ name: p.leaf, parentId: group._id }).lean());
    if (!leaf) {
      console.log(`  skip "${p.name}": category ${p.group} > ${p.leaf} not found`);
      continue;
    }
    if (await Product.exists({ productName: p.name, seller: seller._id })) {
      console.log(`  exists: ${p.name}`);
      continue;
    }

    // Check the listing fields against the category's configured attributes
    const { attributes: defs } = await resolveListingConfig({ headerCategoryId: leaf.headerCategoryId, category: group._id, subcategory: leaf._id });
    const { values, errors } = cleanAttributes(defs, p.attributes);
    const missing = defs.filter((d) => d.isRequired && (values[d.key] === undefined || values[d.key] === "")).map((d) => d.label);
    if (errors.length || missing.length) console.log(`  ⚠ ${p.name}: ${[...errors, ...missing.map((m) => `missing ${m}`)].join("; ")}`);

    await Product.create({
      productName: p.name,
      smallDescription: p.description,
      description: p.description,
      headerCategoryId: leaf.headerCategoryId,
      category: group._id,
      subcategory: leaf._id,
      seller: seller._id,
      mainImage: `/category-images/${p.image}.jpg`,
      galleryImages: [`/category-images/${p.image}.jpg`],
      price: p.price,
      compareAtPrice: p.mrp,
      stock: 50,
      status: "Active",
      publish: true,
      popular: Boolean(p.popular),
      condition: "New",
      madeIn: "India",
      isReturnable: true,
      maxReturnDays: 7,
      attributes: values,
      tags: [TAG],
      // Spread creation times so "New Arrivals" has a stable order
      createdAt: new Date(Date.now() - (list.length - i) * 60_000),
    });
    created++;
    console.log(`  + ${p.name}  ₹${p.price} (MRP ₹${p.mrp})`);
  }
  return created;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);

  if (process.argv.includes("--remove")) {
    const res = await Product.deleteMany({ tags: TAG });
    const s = await Seller.deleteOne({ email: QUICK_SELLER.email });
    console.log(`Removed ${res.deletedCount} demo products and ${s.deletedCount} demo Quick seller.`);
    await mongoose.disconnect();
    return;
  }

  // Shop All: the default "Exnshop Store"
  const seller = await Seller.findOne({ mobile: SELLER_MOBILE });
  if (!seller) throw new Error(`Seller with mobile ${SELLER_MOBILE} not found`);
  await Seller.updateOne({ _id: seller._id }, { $addToSet: { channels: { $each: ["Quick", "ECommerce"] } } });
  console.log(`Seller "${seller.storeName}" — Shop All products:`);
  let created = await addProducts(seller, PRODUCTS);

  // Quick: a demo seller that delivers around Noida
  let quickSeller: any = await Seller.findOne({ email: QUICK_SELLER.email });
  if (!quickSeller) {
    quickSeller = await Seller.create({
      sellerName: QUICK_SELLER.sellerName,
      storeName: QUICK_SELLER.storeName,
      email: QUICK_SELLER.email,
      mobile: QUICK_SELLER.mobile,
      password: await bcrypt.hash("Exnshop@123", 10),
      category: "Electronics",
      categories: ["Women's Fashion", "Men's Fashion", "Electronics", "Home & Kitchen"],
      city: QUICK_SELLER.city,
      address: QUICK_SELLER.address,
      status: "Approved",
      channels: ["Quick"],
      isShopOpen: true,
      serviceRadiusKm: QUICK_SELLER.serviceRadiusKm,
      latitude: String(QUICK_SELLER.latitude),
      longitude: String(QUICK_SELLER.longitude),
      location: { type: "Point", coordinates: [QUICK_SELLER.longitude, QUICK_SELLER.latitude] },
      requireProductApproval: false,
      viewCustomerDetails: true,
      commission: 0,
      balance: 0,
      onHoldBalance: 0,
    });
    console.log(`\nCreated demo Quick seller "${QUICK_SELLER.storeName}" (Noida, ${QUICK_SELLER.serviceRadiusKm} km, Quick only).`);
  }
  console.log(`Seller "${quickSeller.storeName}" — Quick products:`);
  const quickList = PRODUCTS.filter((p) => QUICK_LEAVES.includes(p.leaf)).map((p) => ({ ...p, popular: QUICK_POPULAR.has(p.leaf) }));
  created += await addProducts(quickSeller, quickList);

  console.log(`\nCreated ${created} demo products (tag "${TAG}").`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
