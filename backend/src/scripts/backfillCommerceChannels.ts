/**
 * One-off migration for the Quick Commerce / E-Commerce dual-mode feature:
 *  - Backfills `channels: ["Quick"]` on existing Seller documents that predate
 *    this field (so they keep working exactly as before — Quick-only — until
 *    the seller opts into E-Commerce).
 *  - Backfills `channel: "Quick"` on existing Cart documents, and replaces the
 *    old single-field unique index on `customer` with the new compound
 *    `{ customer, channel }` unique index (one cart per customer per mode).
 *
 * Run manually once after deploying this feature:
 *   npx ts-node src/scripts/backfillCommerceChannels.ts
 */
import mongoose from "mongoose";
import connectDB from "../config/db";
import Cart from "../models/Cart";
import Seller from "../models/Seller";

async function run() {
  await connectDB();

  const sellerResult = await Seller.updateMany(
    { channels: { $exists: false } },
    { $set: { channels: ["Quick"] } }
  );
  console.log(`Backfilled channels on ${sellerResult.modifiedCount} seller(s).`);

  const cartBackfillResult = await Cart.updateMany(
    { channel: { $exists: false } },
    { $set: { channel: "Quick" } }
  );
  console.log(`Backfilled channel on ${cartBackfillResult.modifiedCount} cart(s).`);

  const collection = Cart.collection;
  const existingIndexes = await collection.indexes();
  const oldIndex = existingIndexes.find(
    (idx) => idx.key && Object.keys(idx.key).length === 1 && idx.key.customer === 1 && idx.unique
  );
  if (oldIndex && oldIndex.name) {
    await collection.dropIndex(oldIndex.name);
    console.log(`Dropped old unique index: ${oldIndex.name}`);
  } else {
    console.log("No old single-field unique index on `customer` found (already migrated or never created).");
  }

  await collection.createIndex({ customer: 1, channel: 1 }, { unique: true });
  console.log("Ensured compound unique index on { customer, channel }.");

  await mongoose.disconnect();
  console.log("Done.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
