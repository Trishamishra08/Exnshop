/**
 * One-time (idempotent) migration for the product listing workflow:
 *  1. SKUs become unique per seller instead of across the whole marketplace
 *     (drops the old global unique `sku_1` index, adds {seller, sku}).
 *  2. Gives every existing product (and variation) a SKU so it can be reviewed.
 *
 * Run: npx tsx src/scripts/migrateProductListing.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../models/Product";
import ProductAuditLog from "../models/ProductAuditLog";
import { ensureSkus } from "../services/productListingService";

dotenv.config();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const coll = Product.collection;

  // Pair clashes would stop the new unique index from building, so check first.
  const clashes = await coll
    .aggregate([
      { $match: { sku: { $type: "string" } } },
      { $group: { _id: { seller: "$seller", sku: "$sku" }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  if (clashes.length) {
    console.error("Cannot continue: these (seller, sku) pairs are duplicated:", JSON.stringify(clashes));
    process.exit(1);
  }

  const indexes = await coll.indexes();
  if (indexes.some((i) => i.name === "sku_1")) {
    await coll.dropIndex("sku_1");
    console.log("Dropped old global unique index sku_1");
  }

  const products = await Product.find({ $or: [{ sku: { $exists: false } }, { sku: null }, { sku: "" }, { "variations.sku": { $in: [null, ""] } }] });
  let filled = 0;
  for (const p of products) {
    const data: any = { sku: p.sku, variations: (p.variations || []).map((v: any) => ({ sku: v.sku })) };
    ensureSkus(String(p.seller), data);
    p.sku = data.sku;
    (p.variations || []).forEach((v: any, i: number) => {
      v.sku = data.variations[i].sku;
    });
    p.markModified("variations");
    await p.save({ validateBeforeSave: false });
    filled++;
  }
  console.log(`Gave SKUs to ${filled} product(s)`);

  await Product.createIndexes();
  await ProductAuditLog.createIndexes();
  console.log("Indexes ready:", (await coll.indexes()).map((i) => i.name).join(", "));
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
