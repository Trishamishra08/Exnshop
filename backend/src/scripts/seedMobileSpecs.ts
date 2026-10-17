/**
 * Adds a smartphone specification template to the "Mobiles & Accessories" category:
 * grouped attributes (General, Performance, Display, cameras, Battery, Connectivity,
 * Design) with the short "key spec" bullets. Idempotent and non-destructive: an
 * attribute that already exists is left exactly as the admin configured it.
 *
 * Run: npx tsx src/scripts/seedMobileSpecs.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import Category from "../models/Category";
import HeaderCategory from "../models/HeaderCategory";
import CategoryAttribute from "../models/CategoryAttribute";

dotenv.config();

type T = "text" | "number" | "select" | "multiselect" | "boolean" | "date";
interface Def {
  key: string;
  label: string;
  type?: T;
  unit?: string;
  key_spec?: string | true; // true = "{label}: {value}"; a string is the bullet wording
  help?: string;
}

const SPECS: Array<{ group: string; defs: Def[] }> = [
  {
    group: "General",
    defs: [
      { key: "launch_date", label: "Launch date", type: "date" },
      { key: "os", label: "Operating system", help: "e.g. iOS 27, Android 16" },
      { key: "os_updates", label: "OS updates", help: "e.g. 5 years" },
      { key: "security_updates", label: "Security updates", help: "e.g. 7 years" },
    ],
  },
  {
    group: "Performance",
    defs: [
      { key: "chipset", label: "Chipset", key_spec: "{value}" },
      { key: "processor", label: "Processor", key_spec: "{value}", help: "Cores and clock speeds" },
      { key: "architecture", label: "Architecture", help: "e.g. 64 bit" },
      { key: "fabrication", label: "Fabrication", help: "e.g. 3 nm" },
      { key: "gpu", label: "Graphics (GPU)" },
      { key: "ram", label: "RAM", type: "number", unit: "GB", key_spec: "{value} RAM" },
      { key: "ram_type", label: "RAM type", help: "e.g. LPDDR5X" },
      { key: "storage", label: "Internal storage", key_spec: "{value} internal storage", help: "e.g. 256 GB / 512 GB" },
      { key: "cooling", label: "Cooling technology" },
    ],
  },
  {
    group: "Display",
    defs: [
      { key: "display_type", label: "Display type", key_spec: "{value}", help: "e.g. Super Retina XDR OLED" },
      { key: "screen_size", label: "Screen size", type: "number", unit: "inches", key_spec: "{value} screen" },
      { key: "resolution", label: "Resolution", key_spec: "{value}", help: "e.g. 1206 x 2622 px" },
      { key: "peak_brightness", label: "Peak brightness", type: "number", unit: "nits" },
      { key: "refresh_rate", label: "Refresh rate", type: "number", unit: "Hz", key_spec: "{value} refresh rate" },
      { key: "aspect_ratio", label: "Aspect ratio", help: "e.g. 19.5:9" },
      { key: "pixel_density", label: "Pixel density", type: "number", unit: "ppi" },
    ],
  },
  {
    group: "Rear Camera",
    defs: [
      { key: "rear_setup", label: "Camera setup", key_spec: "{value}", help: "e.g. Triple camera" },
      { key: "rear_primary", label: "Primary camera", key_spec: "{value}", help: "e.g. 48 MP, 1/1.28 inch sensor" },
      { key: "rear_telephoto", label: "Telephoto camera", key_spec: "{value}" },
      { key: "rear_ultrawide", label: "Ultra-wide camera", key_spec: "{value}" },
      { key: "rear_flash", label: "Flash", key_spec: "{value}" },
      { key: "rear_video", label: "Video recording", key_spec: "{value}", help: "e.g. 4K @ 60 fps" },
    ],
  },
  {
    group: "Front Camera",
    defs: [
      { key: "front_camera", label: "Camera", key_spec: "{value}", help: "e.g. 18 MP wide angle" },
      { key: "front_features", label: "Features", key_spec: "{value}" },
      { key: "front_video", label: "Video recording", key_spec: "{value}" },
    ],
  },
  {
    group: "Battery",
    defs: [
      { key: "battery_capacity", label: "Capacity", type: "number", unit: "mAh", key_spec: "{value} battery" },
      { key: "battery_type", label: "Battery type", help: "e.g. Li-ion" },
      { key: "charging", label: "Charging", key_spec: "{value}", help: "e.g. 60 W fast charging" },
      { key: "charging_port", label: "Charging port", help: "e.g. USB Type-C" },
    ],
  },
  {
    group: "Connectivity",
    defs: [
      { key: "sim", label: "SIM", key_spec: "{value}", help: "e.g. Nano + eSIM" },
      { key: "network", label: "Network", key_spec: "{value}", help: "e.g. 5G supported" },
      { key: "wifi", label: "Wi-Fi", help: "e.g. Wi-Fi 7" },
      { key: "bluetooth", label: "Bluetooth", help: "e.g. 5.4" },
      { key: "nfc", label: "NFC", type: "boolean" },
    ],
  },
  {
    group: "Design",
    defs: [
      { key: "dimensions", label: "Dimensions", help: "H x W x D in mm" },
      { key: "weight", label: "Weight", type: "number", unit: "g" },
      { key: "protection", label: "Water & dust resistance", key_spec: "{value}", help: "e.g. IP68" },
      { key: "build", label: "Build", help: "e.g. Glass front, titanium frame" },
    ],
  },
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const category = await Category.findOne({ name: "Mobiles & Accessories", parentId: null });
  if (!category) {
    console.log('Category "Mobiles & Accessories" not found. Nothing seeded.');
    await mongoose.disconnect();
    return;
  }

  let created = 0;
  let order = 1000; // after the department-level attributes
  for (const { group, defs } of SPECS) {
    for (const d of defs) {
      order += 10;
      const keySpec = Boolean(d.key_spec);
      const res = await CategoryAttribute.updateOne(
        { scopeType: "Category", scopeId: category._id, key: d.key },
        {
          $setOnInsert: {
            label: d.label,
            type: d.type || "text",
            group,
            keySpec,
            keySpecFormat: typeof d.key_spec === "string" ? d.key_spec : undefined,
            isRequired: false,
            isVariantAttribute: false,
            isFilterable: false,
            isSearchable: false,
            allowedValues: [],
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
  }
  console.log(`Created ${created} smartphone specification attribute(s) for "${category.name}".`);

  // The electronics starter attributes were created before sections existed; file them under
  // sensible headings (only where an admin hasn't already chosen one).
  const header = await HeaderCategory.findOne({ name: "Electronics & Accessories" });
  if (header) {
    for (const [key, group] of [["warranty", "General"], ["connectivity", "Connectivity"], ["power", "Battery"]] as const) {
      await CategoryAttribute.updateOne(
        { scopeType: "HeaderCategory", scopeId: header._id, key, $or: [{ group: { $exists: false } }, { group: null }, { group: "" }] },
        { $set: { group } }
      );
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
