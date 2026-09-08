/**
 * Ensure admin / seller / delivery documents match Mongoose schemas
 * and have the mobiles the login screens expect.
 */
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const SELLER_ID = new mongoose.Types.ObjectId("6a7d5b02259ec525f6753de4");

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI missing");
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  const adminHash = await bcrypt.hash("Admin@123", 10);
  const sellerHash = await bcrypt.hash("Seller@123", 10);
  const deliveryHash = await bcrypt.hash("Delivery@123", 10);

  // Admins — schema: firstName, lastName, mobile, email, role, password
  for (const admin of [
    {
      email: "admin@exnshop.com",
      mobile: "9000000001",
      firstName: "Exnshop",
      lastName: "Admin",
    },
    {
      email: "admin@olovely.com",
      mobile: "9876543210",
      firstName: "Exnshop",
      lastName: "Admin",
    },
  ]) {
    await db.collection("admins").updateOne(
      { email: admin.email },
      {
        $set: {
          ...admin,
          password: adminHash,
          role: "Super Admin",
          status: "Active",
          updatedAt: new Date(),
        },
        $unset: { name: "" },
        $setOnInsert: { createdAt: new Date(), fcmTokens: [], fcmTokenMobile: [] },
      },
      { upsert: true }
    );
  }

  // Seller
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
        categories: ["Grocery", "Fruits & Vegetables"],
        city: "Indore",
        address: "Chhoti Gwaltoli, Indore, MP 452001",
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
      $setOnInsert: { createdAt: new Date(), fcmTokens: [], fcmTokenMobile: [] },
    },
    { upsert: true }
  );

  // Also ensure mobile lookup works if duplicate sellers exist
  await db.collection("sellers").updateMany(
    { mobile: "9999999999" },
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

  // Delivery — collection "deliveries", status Active|Inactive
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
      $setOnInsert: { createdAt: new Date(), fcmTokens: [], fcmTokenMobile: [] },
    },
    { upsert: true }
  );

  // Remove wrong-collection leftovers from old seeds
  const wrong = await db.collection("deliveryboys").deleteMany({});
  if (wrong.deletedCount) {
    console.log(`Removed ${wrong.deletedCount} legacy deliveryboys docs`);
  }

  const summary = {
    admins: await db.collection("admins").find({}, { projection: { email: 1, mobile: 1, firstName: 1, lastName: 1, role: 1 } }).toArray(),
    sellers: await db.collection("sellers").find({}, { projection: { email: 1, mobile: 1, storeName: 1, status: 1 } }).toArray(),
    deliveries: await db.collection("deliveries").find({}, { projection: { email: 1, mobile: 1, name: 1, status: 1 } }).toArray(),
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nLogin mobiles:");
  console.log("  Admin:    9000000001 or 9876543210  (OTP bypass 999999 if USE_MOCK_OTP=true)");
  console.log("  Seller:   9999999999");
  console.log("  Delivery: 9888888888");

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
