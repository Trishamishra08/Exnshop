/**
 * One-shot production bootstrap for Exnshop Atlas.
 * Safe to re-run: upserts admin/seller/delivery/languages/settings;
 * catalog via seedCompleteDatabase patterns (does replace shops/promo/bestsellers CMS rows).
 */
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import path from "path";
import { spawn } from "child_process";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const SELLER_ID = new mongoose.Types.ObjectId("6a7d5b02259ec525f6753de4");

async function upsertCredentials(db: mongoose.mongo.Db) {
  const adminHash = await bcrypt.hash("Admin@123", 10);
  await db.collection("admins").updateOne(
    { email: "admin@exnshop.com" },
    {
      $set: {
        firstName: "Exnshop",
        lastName: "Admin",
        email: "admin@exnshop.com",
        mobile: "9000000001",
        password: adminHash,
        role: "Super Admin",
        status: "Active",
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  // Keep legacy admin email working too
  await db.collection("admins").updateOne(
    { email: "admin@olovely.com" },
    {
      $set: {
        firstName: "Exnshop",
        lastName: "Admin",
        email: "admin@olovely.com",
        mobile: "9876543210",
        password: adminHash,
        role: "Super Admin",
        status: "Active",
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  const sellerHash = await bcrypt.hash("Seller@123", 10);
  await db.collection("sellers").updateOne(
    { _id: SELLER_ID },
    {
      $set: {
        sellerName: "Exnshop Supermart",
        storeName: "Exnshop Supermart",
        email: "seller@exnshop.com",
        mobile: "9999999999",
        password: sellerHash,
        category: "Grocery",
        categories: [
          "Grocery",
          "Dairy, Bread & Eggs",
          "Snacks & Munchies",
          "Fruits & Vegetables",
          "Personal Care",
          "Cleaning Essentials",
        ],
        city: "Indore",
        address: "Chhoti Gwaltoli, Indore, Madhya Pradesh, 452001",
        status: "Approved",
        isShopOpen: true,
        serviceRadiusKm: 500,
        latitude: "22.717650",
        longitude: "75.871860",
        location: { type: "Point", coordinates: [75.87186, 22.71765] },
        requireProductApproval: false,
        viewCustomerDetails: true,
        commission: 0,
        balance: 0,
        onHoldBalance: 0,
        categoryCommissions: [],
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  // Also match by email if seller was created without fixed id
  await db.collection("sellers").updateOne(
    { email: "seller@olovely.com" },
    {
      $set: {
        password: sellerHash,
        status: "Approved",
        isShopOpen: true,
        serviceRadiusKm: 500,
        location: { type: "Point", coordinates: [75.87186, 22.71765] },
        updatedAt: new Date(),
      },
    }
  );

  const deliveryHash = await bcrypt.hash("Delivery@123", 10);
  await db.collection("deliveries").updateOne(
    { mobile: "9888888888" },
    {
      $set: {
        name: "Exnshop Delivery Partner",
        email: "delivery@exnshop.com",
        mobile: "9888888888",
        password: deliveryHash,
        address: "Indore City, Madhya Pradesh",
        city: "Indore",
        pincode: "452001",
        status: "Active",
        isOnline: true,
        available: "Available",
        vehicleType: "Bike",
        vehicleNumber: "MP09-EX-1234",
        balance: 0,
        cashCollected: 0,
        pendingAdminPayout: 0,
        location: { type: "Point", coordinates: [75.87186, 22.71765] },
        settings: { notifications: true, location: true, sound: true },
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  await db.collection("appsettings").updateOne(
    {},
    {
      $set: {
        appName: "Exnshop",
        appLogo: "/exnshop_logo.png",
        estimatedDeliveryTime: "10-15 mins",
        contactEmail: "contact@exnshop.in",
        contactPhone: "9000000001",
        supportEmail: "support@exnshop.in",
        supportPhone: "9000000001",
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  const languages = [
    { code: "en", name: "English", nativeName: "English", flag: "🇬🇧", isDefault: true, isActive: true, sortOrder: 1 },
    { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳", isDefault: false, isActive: true, sortOrder: 2 },
  ];
  for (const lang of languages) {
    await db.collection("supportedlanguages").updateOne(
      { code: lang.code },
      { $set: { ...lang, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
  }

  console.log("✅ Credentials / AppSettings / Languages upserted");
  console.log("   Admin:    admin@exnshop.com / Admin@123  (also admin@olovely.com)");
  console.log("   Seller:   seller@exnshop.com / Seller@123  (mobile 9999999999)");
  console.log("   Delivery: delivery@exnshop.com / Delivery@123  (mobile 9888888888)");
}

async function ensureFruitsVegSlug(db: mongoose.mongo.Db) {
  // Frontend hardcodes /category/fruits-veg
  const fruits = await db.collection("categories").findOne({
    name: "Fruits & Vegetables",
    $or: [{ parentId: null }, { parentId: { $exists: false } }],
  });
  if (fruits) {
    await db.collection("categories").updateOne(
      { _id: fruits._id },
      { $set: { slug: "fruits-veg", status: "Active", updatedAt: new Date() } }
    );
    console.log("✅ Fruits & Vegetables slug set to fruits-veg");
  }
}

async function ensureDeliveryArea(db: mongoose.mongo.Db) {
  await db.collection("deliveryareas").updateOne(
    { name: "Indore City" },
    {
      $set: {
        name: "Indore City",
        city: "Indore",
        pincode: "452001",
        status: "Active",
        isActive: true,
        coordinates: {
          type: "Polygon",
          coordinates: [
            [
              [75.75, 22.65],
              [75.95, 22.65],
              [75.95, 22.8],
              [75.75, 22.8],
              [75.75, 22.65],
            ],
          ],
        },
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
  console.log("✅ Delivery area (Indore) upserted");
}

function runScript(relativePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const full = path.join(__dirname, relativePath);
    const child = spawn("npx", ["tsx", full], {
      cwd: path.join(__dirname, "../.."),
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${relativePath} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI / MONGO_URI missing in backend/.env");

  console.log("\n=== Exnshop production bootstrap ===\n");
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  await upsertCredentials(db);
  await ensureDeliveryArea(db);
  await mongoose.disconnect();

  console.log("\n--- Seeding full catalog (categories + products + shops) ---\n");
  await runScript("seedCompleteDatabase.ts");

  await mongoose.connect(uri);
  await ensureFruitsVegSlug(mongoose.connection.db!);
  await mongoose.disconnect();

  console.log("\n🎉 Production bootstrap complete.\n");
  console.log("Next: Redeploy api.exnshop.in so in-memory category cache refreshes.");
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
