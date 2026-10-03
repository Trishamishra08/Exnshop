/**
 * One-off migration: converts existing single-product Campaign documents
 * (old shape: `product: ObjectId`) into the new multi-product shape
 * (`products: [{product, cpcBid, spend, todaySpend, impressions, clicks}]`).
 *
 * Run this BEFORE deploying code that reads/writes the new `products[]`
 * field, so no campaign document is left in a shape nothing understands.
 *
 * Usage: npx tsx src/scripts/migrateCampaignsToMultiProduct.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import AppSettings from "../models/AppSettings";

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function migrate() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI / MONGO_URI missing in backend/.env");

  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  const settings = await AppSettings.findOne();
  const fallbackCpc = settings?.adCostPerClick ?? 2;

  const campaigns = db.collection("campaigns");
  const legacy = await campaigns
    .find({ product: { $exists: true }, products: { $exists: false } })
    .toArray();

  console.log(`Found ${legacy.length} legacy single-product campaign(s) to migrate.`);

  let migrated = 0;
  for (const doc of legacy) {
    await campaigns.updateOne(
      { _id: doc._id },
      {
        $set: {
          products: [
            {
              product: doc.product,
              // Preserve the rate they were actually being charged at
              // before cutover (the old global flat CPC).
              cpcBid: fallbackCpc,
              spend: doc.spend || 0,
              todaySpend: doc.todaySpend || 0,
              impressions: doc.impressions || 0,
              clicks: doc.clicks || 0,
            },
          ],
        },
        $unset: { product: "" },
      }
    );
    migrated++;
  }

  console.log(`✅ Migrated ${migrated} campaign(s).`);
  await mongoose.disconnect();
}

migrate().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
