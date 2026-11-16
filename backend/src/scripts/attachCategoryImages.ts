/**
 * Attaches tile photos from frontend/public/category-images to the categories
 * of the marketplace tree (meeshoTaxonomy), without re-seeding. Only fills
 * categories that have no image yet, so photos uploaded in admin are kept.
 * Groups without an image get their first tile's photo.
 *
 * Usage: npx tsx src/scripts/attachCategoryImages.ts
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
dotenv.config({ path: path.join(__dirname, "../../.env") });
import mongoose from "mongoose";
import Category from "../models/Category";
import HeaderCategory from "../models/HeaderCategory";
import { imageManifest } from "./data/meeshoTaxonomy";

const PUBLIC = path.join(__dirname, "../../../frontend/public");
const empty = { $or: [{ image: null }, { image: "" }, { image: { $exists: false } }] };

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const headers = new Map((await HeaderCategory.find().lean()).map((h: any) => [h.name, h._id]));
  let tiles = 0;
  for (const t of imageManifest()) {
    if (!fs.existsSync(path.join(PUBLIC, t.file))) continue;
    const headerId = headers.get(t.department);
    const group: any = headerId && (await Category.findOne({ name: t.group, parentId: null, headerCategoryId: headerId }).lean());
    if (!group) continue;
    const r = await Category.updateOne({ name: t.name, parentId: group._id, ...empty }, { $set: { image: `/${t.file}` } });
    tiles += r.modifiedCount;
  }
  let groups = 0;
  for (const g of await Category.find({ parentId: null, ...empty }).lean()) {
    const child: any = await Category.findOne({ parentId: (g as any)._id, image: { $nin: [null, ""] } }).sort({ order: 1 }).lean();
    if (child) groups += (await Category.updateOne({ _id: (g as any)._id }, { $set: { image: child.image } })).modifiedCount;
  }
  const withImage = await Category.countDocuments({ parentId: { $ne: null }, image: { $nin: [null, ""] } });
  const total = await Category.countDocuments({ parentId: { $ne: null } });
  console.log(`Attached ${tiles} tile photos and ${groups} group photos. Tiles with a photo: ${withImage}/${total}.`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
