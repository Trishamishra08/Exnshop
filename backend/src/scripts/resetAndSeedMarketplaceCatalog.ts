/**
 * Fresh start: wipes all old data and seeds the marketplace category tree from
 * scripts/data/marketplaceTaxonomy.ts (departments → groups → leaf categories,
 * with each level's listing fields and compliance rules).
 *
 * CLEARED: every collection except the ones in KEEP below — categories, header
 * categories, sub-categories, listing attributes/rules, products, inventory,
 * sellers, customers, delivery partners, orders, carts, wallets, returns,
 * campaigns, coupons, home sections, shops, notifications, OTPs, logs…
 *
 * KEPT: Admin logins and platform configuration (AppSettings, Tax, Policy, FAQ,
 * Role, languages/translations, Courier, DeliveryArea, Brand, RtoPromoBanner).
 * AppSettings.homeSections is emptied because it points at old categories.
 *
 * A JSON backup of everything cleared goes to backend/backups/catalog-reset-<time>/.
 *
 * Usage:
 *   npx tsx src/scripts/resetAndSeedMarketplaceCatalog.ts          # dry run: counts only
 *   npx tsx src/scripts/resetAndSeedMarketplaceCatalog.ts --yes    # back up, wipe, seed the demo catalogue
 *   add --catalog-only to keep users/sellers/orders, --full for the complete 281-category tree
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
dotenv.config({ path: path.join(__dirname, "../../.env") });

import mongoose from "mongoose";
import { FULL_DEPARTMENTS, DEMO_DEPARTMENTS, AttrDef, RuleDef } from "./data/marketplaceTaxonomy";

// Default: the small demo catalogue (with images). --full seeds the complete tree.
const DEPARTMENTS = process.argv.includes("--full") ? FULL_DEPARTMENTS : DEMO_DEPARTMENTS;

// --catalog-only: replace just the catalogue (categories, their fields/rules,
// products and anything pointing at them); users, sellers, orders etc. stay.
const CATALOG_ONLY = process.argv.includes("--catalog-only");
const CATALOG_MODELS = new Set([
  "HeaderCategory",
  "Category",
  "SubCategory",
  "CategoryAttribute",
  "CategoryListingRule",
  "Product",
  "Inventory",
  "ProductAuditLog",
  "HomeSection",
  "BestsellerCard",
  "LowestPricesProduct",
  "PromoStrip",
  "Shop",
  "Wishlist",
  "CartItem",
]);

const KEEP = new Set([
  "Admin",
  "AppSettings",
  "Tax",
  "Policy",
  "FAQ",
  "Role",
  "SupportedLanguage",
  "UITranslation",
  "TranslationCache",
  "Courier",
  "DeliveryArea",
  "Brand",
  "RtoPromoBanner",
]);

const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function loadAllModels() {
  const dir = path.join(__dirname, "../models");
  for (const f of fs.readdirSync(dir)) {
    if (/\.(ts|js)$/.test(f) && !f.endsWith(".d.ts") && !/^index\./.test(f)) require(path.join(dir, f));
  }
}

async function main() {
  const confirmed = process.argv.includes("--yes");
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI / MONGO_URI missing in backend/.env");

  loadAllModels();
  await mongoose.connect(uri);
  const dbName = mongoose.connection.db!.databaseName;
  console.log(`Connected to database "${dbName}"\n`);

  // Some models are registered twice under an alias (e.g. "Customer" and
  // "CUSTOMER") on the same collection — clear each collection once.
  const seen = new Set<string>();
  const keptCollections = new Set([...KEEP].filter((n) => mongoose.models[n]).map((n) => mongoose.model(n).collection.name));
  const toClear = mongoose
    .modelNames()
    .sort()
    .filter((n) => {
      const coll = mongoose.model(n).collection.name;
      if (KEEP.has(n) || keptCollections.has(coll) || seen.has(coll)) return false;
      if (CATALOG_ONLY && !CATALOG_MODELS.has(n)) return false;
      seen.add(coll);
      return true;
    });

  // ── Dry run ───────────────────────────────────────────────
  if (!confirmed) {
    let total = 0;
    for (const name of toClear) {
      const n = await mongoose.model(name).estimatedDocumentCount();
      total += n;
      if (n) console.log(`  would clear ${name}: ${n}`);
    }
    console.log(`\nDry run: ${total} documents in ${toClear.length} collections would be backed up and deleted.`);
    console.log(`Kept: ${[...KEEP].join(", ")}`);
    console.log(`\nRe-run with --yes to do it.`);
    await mongoose.disconnect();
    return;
  }

  // ── Backup ────────────────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(__dirname, "../../backups", `catalog-reset-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  console.log(`Backing up to ${backupDir}`);
  for (const name of [...toClear, "AppSettings"]) {
    const docs = await mongoose.model(name).find({}).lean();
    fs.writeFileSync(path.join(backupDir, `${name}.json`), JSON.stringify(docs, null, 2));
  }

  // ── Wipe ──────────────────────────────────────────────────
  let deleted = 0;
  for (const name of toClear) {
    const res = await mongoose.model(name).deleteMany({});
    deleted += res.deletedCount || 0;
    if (res.deletedCount) console.log(`  cleared ${name}: ${res.deletedCount}`);
  }
  await mongoose.model("AppSettings").updateMany({}, { $set: { homeSections: [] } });
  console.log(`Deleted ${deleted} documents.\n`);

  const Category = mongoose.model("Category");
  const HeaderCategory = mongoose.model("HeaderCategory");
  const CategoryAttribute = mongoose.model("CategoryAttribute");
  const CategoryListingRule = mongoose.model("CategoryListingRule");

  // Drops the old global unique index on Category.name in favour of
  // "unique per parent" (the same group name repeats across departments).
  await Category.syncIndexes();
  await CategoryAttribute.syncIndexes();
  await CategoryListingRule.syncIndexes();

  // ── Seed ──────────────────────────────────────────────────
  const usedSlugs = new Set<string>();
  const uniqueSlug = (name: string, parentSlug: string) => {
    let s = slugify(name);
    if (usedSlugs.has(s)) s = `${parentSlug}-${slugify(name)}`;
    for (let n = 2, base = s; usedSlugs.has(s); n++) s = `${base}-${n}`;
    usedSlugs.add(s);
    return s;
  };

  const attrDocs: any[] = [];
  const addAttrs = (scopeType: "HeaderCategory" | "Category", scopeId: any, defs: AttrDef[] = [], base: number) =>
    defs.forEach((d, i) =>
      attrDocs.push({
        scopeType,
        scopeId,
        key: d.key,
        label: d.label,
        type: d.type,
        isRequired: d.required === true,
        isVariantAttribute: d.variant === true,
        isFilterable: d.filter === true,
        isSearchable: false,
        allowedValues: d.values || [],
        unit: d.unit,
        helpText: d.help,
        keySpec: Boolean(d.keySpec),
        keySpecFormat: typeof d.keySpec === "string" ? d.keySpec : undefined,
        displayOrder: base + i * 10,
        isActive: true,
      })
    );

  const ruleDocs: any[] = [];
  const addRule = (scopeId: any, r?: RuleDef) => {
    if (r)
      ruleDocs.push({
        scopeType: "Category",
        scopeId,
        isRegulated: r.regulated === true,
        requiredDocs: r.docs || [],
        notes: r.notes,
      });
  };

  let groupCount = 0;
  let leafCount = 0;
  for (const [di, dept] of DEPARTMENTS.entries()) {
    const header = await HeaderCategory.create({
      name: dept.name,
      slug: dept.slug,
      iconLibrary: "Custom",
      iconName: dept.icon,
      order: di + 1,
      status: "Published",
    });
    addAttrs("HeaderCategory", header._id, dept.attrs, 10);

    for (const [gi, group] of dept.groups.entries()) {
      const groupSlug = uniqueSlug(group.name, dept.slug);
      const groupDoc = await Category.create({
        name: group.name,
        slug: groupSlug,
        order: gi,
        status: "Active",
        parentId: null,
        headerCategoryId: header._id,
        totalSubcategories: group.items.length,
        // Every category under a department has an image: a group uses its
        // first sub-category's photo.
        image: group.items.map((it) => (typeof it === "string" ? undefined : it.image)).find(Boolean),
      });
      addAttrs("Category", groupDoc._id, group.attrs, 100);
      groupCount++;

      for (const [li, item] of group.items.entries()) {
        const leaf = typeof item === "string" ? { name: item } : item;
        const leafDoc = await Category.create({
          name: leaf.name,
          slug: uniqueSlug(leaf.name, groupSlug),
          order: li,
          status: "Active",
          parentId: groupDoc._id,
          headerCategoryId: header._id,
          image: (leaf as any).image,
        });
        addAttrs("Category", leafDoc._id, (leaf as any).attrs, 200);
        addRule(leafDoc._id, (leaf as any).rule);
        leafCount++;
      }
    }
    console.log(`  ${dept.name}: ${dept.groups.length} groups`);
  }

  await CategoryAttribute.insertMany(attrDocs);
  if (ruleDocs.length) await CategoryListingRule.insertMany(ruleDocs);

  console.log(
    `\n✅ Seeded ${DEPARTMENTS.length} departments, ${groupCount} groups, ${leafCount} leaf categories, ` +
      `${attrDocs.length} listing fields, ${ruleDocs.length} compliance rules.`
  );
  console.log(`Backup of the old data: ${backupDir}`);
  console.log(`Restart the backend (or wait 5 min) so cached category lists refresh.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("FAILED:", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
