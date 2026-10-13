/**
 * Adds a starter set of listing attributes to the existing departments (header
 * categories). Idempotent and non-destructive: an attribute that already exists
 * for a department is left exactly as the admin configured it.
 *
 * Run: npx tsx src/scripts/seedListingSetup.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import HeaderCategory from "../models/HeaderCategory";
import CategoryAttribute from "../models/CategoryAttribute";

dotenv.config();

type Def = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "multiselect" | "boolean" | "date";
  required?: boolean;
  variant?: boolean;
  filterable?: boolean;
  values?: string[];
  unit?: string;
  help?: string;
};

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "Free Size"];
const COLOURS = ["Black", "White", "Blue", "Red", "Green", "Yellow", "Pink", "Grey", "Brown", "Multicolour"];

const COMMON_APPAREL: Def[] = [
  { key: "size", label: "Size", type: "select", variant: true, filterable: true, values: SIZES },
  { key: "colour", label: "Colour", type: "select", variant: true, filterable: true, values: COLOURS },
  { key: "material", label: "Material", type: "text", required: true, filterable: true, help: "e.g. 100% Cotton, Leather" },
];

const STARTERS: Record<string, Def[]> = {
  "Electronics & Accessories": [
    { key: "warranty", label: "Warranty", type: "select", required: true, filterable: true, values: ["No warranty", "3 months", "6 months", "1 year", "2 years"] },
    { key: "colour", label: "Colour", type: "select", variant: true, filterable: true, values: COLOURS },
    { key: "connectivity", label: "Connectivity", type: "text", help: "e.g. Bluetooth 5.0, USB-C" },
    { key: "power", label: "Power rating", type: "number", unit: "W" },
  ],
  "Men Accessories": COMMON_APPAREL,
  "Women Accessories": COMMON_APPAREL,
  Kids: [
    { key: "age_group", label: "Age group", type: "select", required: true, filterable: true, values: ["0-2 years", "3-5 years", "6-8 years", "9-12 years", "13+ years"] },
    ...COMMON_APPAREL.slice(0, 2),
    { key: "material", label: "Material", type: "text" },
  ],
  "Home & Kitchen": [
    { key: "material", label: "Material", type: "text", required: true, filterable: true },
    { key: "capacity", label: "Capacity", type: "text", help: "e.g. 1.5 L" },
    { key: "colour", label: "Colour", type: "select", variant: true, filterable: true, values: COLOURS },
  ],
  "Home & Living": [
    { key: "material", label: "Material", type: "text", required: true, filterable: true },
    { key: "assembly_required", label: "Assembly required", type: "boolean" },
    { key: "colour", label: "Colour", type: "select", variant: true, filterable: true, values: COLOURS },
  ],
  "Personal Care & Wellness": [
    { key: "net_quantity", label: "Net quantity", type: "text", required: true, help: "e.g. 100 ml, 250 g" },
    { key: "skin_type", label: "Suitable for", type: "select", filterable: true, values: ["All skin types", "Oily", "Dry", "Sensitive", "Normal"] },
    { key: "ingredients", label: "Key ingredients", type: "text" },
  ],
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  let created = 0;
  for (const [name, defs] of Object.entries(STARTERS)) {
    const header = await HeaderCategory.findOne({ name });
    if (!header) {
      console.log(`Skipped "${name}" (no such department)`);
      continue;
    }
    let order = 0;
    for (const d of defs) {
      order += 10;
      const res = await CategoryAttribute.updateOne(
        { scopeType: "HeaderCategory", scopeId: header._id, key: d.key },
        {
          $setOnInsert: {
            label: d.label,
            type: d.type,
            isRequired: d.required === true,
            isVariantAttribute: d.variant === true,
            isFilterable: d.filterable === true,
            isSearchable: false,
            allowedValues: d.values || [],
            unit: d.unit,
            helpText: d.help,
            displayOrder: order,
            isActive: true,
          },
        },
        { upsert: true }
      );
      if (res.upsertedCount) created++;
    }
    console.log(`"${name}": ${defs.length} starter attributes checked`);
  }
  await CategoryAttribute.createIndexes();
  console.log(`Created ${created} new attribute(s).`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
