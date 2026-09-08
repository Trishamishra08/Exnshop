import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI!;
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  const cats = await db.collection("categories").countDocuments({
    status: "Active",
    $or: [{ parentId: null }, { parentId: { $exists: false } }],
  });
  const subs = await db.collection("categories").countDocuments({
    status: "Active",
    parentId: { $ne: null },
  });
  const products = await db.collection("products").countDocuments({ status: "Active" });
  const admins = await db.collection("admins").countDocuments({});
  const sellers = await db.collection("sellers").countDocuments({ status: "Approved" });
  const deliveries = await db.collection("deliveries").countDocuments({ status: "Active" });
  const fruits = await db.collection("categories").findOne({ slug: "fruits-veg" });
  const fruitSubs = fruits
    ? await db.collection("categories").countDocuments({ parentId: fruits._id, status: "Active" })
    : 0;
  const fruitProducts = fruits
    ? await db.collection("products").countDocuments({ category: fruits._id, status: "Active" })
    : 0;

  console.log(
    JSON.stringify(
      {
        topCategories: cats,
        subcategories: subs,
        products,
        admins,
        sellers,
        deliveries,
        fruitSubs,
        fruitProducts,
        fruitsName: fruits?.name,
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
