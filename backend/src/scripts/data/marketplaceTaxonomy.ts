/**
 * Marketplace category tree, modelled on a big Indian marketplace's
 * low-price storefront (left rail of departments → section groups → tiles).
 *
 *   Department (HeaderCategory)  e.g. "Women's Fashion"
 *     └─ Group (root Category)   e.g. "Kurtas & Sets"
 *          └─ Leaf (child Category) e.g. "Kurtis"   ← products are listed here
 *
 * Each level can carry listing attributes (the seller's product form fields).
 * Deeper levels add to — or override by `key` — the levels above them, exactly
 * as services/listingConfigService.ts resolves them.
 *
 * Product already has its own fields for brand, price, MRP, stock, images,
 * HSN, weight, dimensions, manufacturer and country of origin, so none of those
 * are repeated here: these are only the category-specific specs.
 */

export type AttrType = "text" | "number" | "select" | "multiselect" | "boolean" | "date";

export interface AttrDef {
  key: string;
  label: string;
  type: AttrType;
  required?: boolean;
  variant?: boolean;
  filter?: boolean;
  values?: string[];
  unit?: string;
  help?: string;
  keySpec?: string | true;
}

export interface RuleDef {
  regulated?: boolean;
  docs?: Array<{ key: string; label: string }>;
  notes?: string;
}

export interface LeafDef {
  name: string;
  attrs?: AttrDef[];
  rule?: RuleDef;
  /** Tile image, e.g. "/category-images/kurtis.jpg" (served from frontend/public). */
  image?: string;
}

export interface GroupDef {
  name: string;
  attrs?: AttrDef[];
  items: Array<string | LeafDef>;
}

export interface DepartmentDef {
  name: string;
  slug: string;
  icon: string;
  attrs: AttrDef[];
  groups: GroupDef[];
}

// ── Builders ────────────────────────────────────────────────

type Opts = Omit<Partial<AttrDef>, "key" | "label" | "type" | "values">;
const sel = (key: string, label: string, values: string[], o: Opts = {}): AttrDef => ({ key, label, type: "select", values, ...o });
const multi = (key: string, label: string, values: string[], o: Opts = {}): AttrDef => ({ key, label, type: "multiselect", values, ...o });
const txt = (key: string, label: string, o: Opts = {}): AttrDef => ({ key, label, type: "text", ...o });
const num = (key: string, label: string, unit?: string, o: Opts = {}): AttrDef => ({ key, label, type: "number", unit, ...o });
const bool = (key: string, label: string, o: Opts = {}): AttrDef => ({ key, label, type: "boolean", ...o });
const req = (a: AttrDef): AttrDef => ({ ...a, required: true });
const optional = (a: AttrDef): AttrDef => ({ ...a, required: false, variant: false });

// ── Value lists ─────────────────────────────────────────────

const COLOURS = [
  "Black", "White", "Off White", "Beige", "Cream", "Grey", "Silver", "Gold", "Rose Gold", "Brown",
  "Tan", "Maroon", "Red", "Pink", "Peach", "Orange", "Yellow", "Mustard", "Green", "Olive",
  "Sea Green", "Teal", "Turquoise", "Blue", "Navy Blue", "Sky Blue", "Purple", "Lavender",
  "Wine", "Magenta", "Transparent", "Multicolour",
];
const APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "Free Size"];
const WAIST_SIZES = ["26", "28", "30", "32", "34", "36", "38", "40", "42", "44", "S", "M", "L", "XL", "XXL", "3XL", "Free Size"];
const KIDS_SIZES = [
  "0-3 Months", "3-6 Months", "6-9 Months", "9-12 Months", "12-18 Months", "18-24 Months",
  "2-3 Years", "3-4 Years", "4-5 Years", "5-6 Years", "6-7 Years", "7-8 Years", "8-9 Years",
  "9-10 Years", "10-11 Years", "11-12 Years", "12-13 Years", "13-14 Years", "14-15 Years", "15-16 Years",
];
const WOMEN_SHOE = ["UK 2", "UK 3", "UK 4", "UK 5", "UK 6", "UK 7", "UK 8", "UK 9"];
const MEN_SHOE = ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11", "UK 12"];
const KIDS_SHOE = [
  "Infant (0-6 Months)", "Infant (6-12 Months)", "UK 3C", "UK 4C", "UK 5C", "UK 6C", "UK 7C", "UK 8C",
  "UK 9C", "UK 10C", "UK 11C", "UK 12C", "UK 13C", "UK 1", "UK 2", "UK 3", "UK 4", "UK 5",
];
const FABRICS = [
  "Cotton", "Cotton Blend", "Rayon", "Viscose", "Polyester", "Silk", "Art Silk", "Georgette",
  "Chiffon", "Crepe", "Net", "Organza", "Linen", "Khadi", "Denim", "Lycra", "Spandex", "Modal",
  "Nylon", "Wool", "Fleece", "Velvet", "Satin", "Chanderi", "Muslin", "Leather", "Faux Leather", "Other",
];
const PATTERNS = ["Solid", "Printed", "Floral", "Embroidered", "Striped", "Checked", "Self Design", "Woven", "Graphic", "Colourblocked", "Embellished"];
const SLEEVES = ["Sleeveless", "Short Sleeve", "Half Sleeve", "Three-Quarter Sleeve", "Full Sleeve", "Cap Sleeve", "Puff Sleeve", "Roll-up Sleeve"];
const NECKS = ["Round Neck", "V-Neck", "Collar", "Mandarin Collar", "Boat Neck", "Square Neck", "Sweetheart", "Halter", "Off Shoulder", "Polo", "Hooded", "High Neck", "Keyhole", "Notched"];
const OCCASIONS = ["Casual", "Daily Wear", "Party", "Festive", "Wedding", "Formal", "Office", "Sports", "Lounge", "Beach"];
const FITS = ["Regular", "Slim", "Skinny", "Relaxed", "Loose", "Oversized", "Straight", "Tapered", "Bootcut", "Wide Leg", "Flared"];
const CLOSURES = ["Elastic", "Drawstring", "Button", "Zip", "Hook & Eye", "Slip-on", "Velcro", "Buckle", "Lace-up"];
const GENDERS_KIDS = ["Boys", "Girls", "Unisex"];
const KITCHEN_MATERIALS = ["Stainless Steel", "Aluminium", "Hard Anodised", "Cast Iron", "Iron", "Copper", "Brass", "Glass", "Borosilicate Glass", "Ceramic", "Melamine", "Plastic", "Silicone", "Wood", "Bamboo", "Other"];
const HOME_MATERIALS = ["Cotton", "Polyester", "Microfiber", "Jute", "Wood", "Engineered Wood", "MDF", "Metal", "Iron", "Brass", "Glass", "Ceramic", "Plastic", "Resin", "Paper", "Fabric", "Other"];
const WARRANTY = ["No Warranty", "7 Days", "1 Month", "3 Months", "6 Months", "1 Year", "2 Years"];
const TOY_AGES = ["0-12 Months", "1-3 Years", "3-5 Years", "5-8 Years", "8-12 Years", "12+ Years", "Adults"];

// ── Reusable fields ─────────────────────────────────────────

const F = {
  colour: req(sel("colour", "Colour", COLOURS, { variant: true, filter: true })),
  colourOpt: sel("colour", "Colour", COLOURS, { variant: true, filter: true }),
  size: req(sel("size", "Size", APPAREL_SIZES, { variant: true, filter: true })),
  waist: req(sel("size", "Waist Size", WAIST_SIZES, { variant: true, filter: true, help: "Waist in inches, or S/M/L" })),
  kidsSize: req(sel("size", "Age / Size", KIDS_SIZES, { variant: true, filter: true })),
  fabric: req(sel("fabric", "Fabric", FABRICS, { filter: true, keySpec: "{value}" })),
  pattern: sel("pattern", "Pattern", PATTERNS, { filter: true }),
  sleeve: sel("sleeve_length", "Sleeve Length", SLEEVES, { filter: true }),
  neck: sel("neck", "Neck / Collar", NECKS, { filter: true }),
  fit: sel("fit", "Fit", FITS, { filter: true }),
  occasion: sel("occasion", "Occasion", OCCASIONS, { filter: true }),
  closure: sel("closure", "Closure", CLOSURES),
  packOf: req(num("pack_of", "Pack of", undefined, { help: "Number of pieces in one order, e.g. 1, 3", keySpec: "Pack of {value}" })),
  washCare: txt("wash_care", "Wash Care", { help: "e.g. Machine wash cold, do not bleach" }),
  kidsGender: req(sel("gender", "Gender", GENDERS_KIDS, { filter: true })),
  material: req(txt("material", "Material", { filter: true, help: "e.g. Stainless Steel, Cotton, ABS Plastic", keySpec: "{value}" })),
  netQty: req(txt("net_quantity", "Net Quantity", { help: "e.g. 100 ml, 50 g, 1 N", keySpec: "{value}" })),
};

const APPAREL_TOP = [F.size, F.fabric, F.pattern, F.sleeve, F.neck, F.fit, F.occasion, F.washCare];
const APPAREL_BOTTOM = [
  F.waist, F.fabric, F.fit,
  sel("rise", "Rise", ["High Rise", "Mid Rise", "Low Rise"], { filter: true }),
  F.closure, F.pattern, F.washCare,
];

const footwear = (sizes: string[]): AttrDef[] => [
  req(sel("size", "Footwear Size", sizes, { variant: true, filter: true })),
  req(sel("upper_material", "Upper Material", ["Synthetic", "PU", "Leather", "Faux Leather", "Canvas", "Mesh", "Fabric", "Rubber", "EVA", "Suede"], { filter: true })),
  sel("sole_material", "Sole Material", ["Rubber", "EVA", "PU", "TPR", "PVC", "Phylon", "Leather"]),
  sel("closure", "Closure", ["Slip-on", "Lace-up", "Velcro", "Buckle", "Zip", "Strap"]),
  F.occasion,
];

const watchFields: AttrDef[] = [
  req(sel("display_type", "Display Type", ["Analog", "Digital", "Analog-Digital", "Smart"], { filter: true })),
  sel("strap_material", "Strap Material", ["Metal", "Leather", "Silicone", "Rubber", "Fabric", "Resin", "Ceramic"], { filter: true }),
  sel("dial_shape", "Dial Shape", ["Round", "Square", "Rectangle", "Oval", "Tonneau"]),
  sel("water_resistance", "Water Resistance", ["Not Water Resistant", "Splash Resistant", "30 m", "50 m", "100 m"]),
];
const eyewearFields: AttrDef[] = [
  req(sel("frame_material", "Frame Material", ["Plastic", "Metal", "TR90", "Acetate", "Polycarbonate"])),
  sel("frame_shape", "Frame Shape", ["Aviator", "Wayfarer", "Round", "Square", "Rectangle", "Cat Eye", "Oval", "Rimless", "Sports"], { filter: true }),
  sel("lens_feature", "Lens Feature", ["UV Protection", "Polarized", "Blue Light Block", "Anti-Glare", "Mirrored", "Gradient", "None"]),
];
const bagFields: AttrDef[] = [
  req(sel("material", "Material", ["PU", "Faux Leather", "Genuine Leather", "Canvas", "Nylon", "Polyester", "Jute", "Fabric"], { filter: true })),
  num("compartments", "Number of Compartments"),
  sel("closure", "Closure", ["Zip", "Magnetic", "Button", "Drawstring", "Flap", "Open"]),
];
const beltFields: AttrDef[] = [
  req(sel("size", "Belt Size", ["28", "30", "32", "34", "36", "38", "40", "42", "Free Size"], { variant: true, filter: true })),
  req(sel("material", "Material", ["Genuine Leather", "Faux Leather", "PU", "Canvas", "Fabric", "Metal"])),
];
const sockFields: AttrDef[] = [
  req(sel("size", "Size", ["Free Size", "S", "M", "L", "UK 3-6", "UK 6-10", "UK 10-12"], { variant: true })),
  sel("sock_length", "Length", ["No Show", "Ankle", "Crew", "Calf", "Knee", "Thigh High"]),
  F.packOf,
];

const TOY_RULE: RuleDef = {
  regulated: true,
  docs: [{ key: "bis_toy", label: "BIS certificate (IS 9873 / IS 15644)" }],
  notes: "Toys must carry the BIS standard mark under the Toys (Quality Control) Order.",
};
const CRS_RULE: RuleDef = {
  regulated: true,
  docs: [{ key: "bis_crs", label: "BIS registration (CRS) certificate" }],
  notes: "Chargers, adapters and power banks fall under BIS Compulsory Registration.",
};

// ── The tree ────────────────────────────────────────────────

/** The complete tree (6 departments, 281 sub-categories). Seeded only with --full. */
export const FULL_DEPARTMENTS: DepartmentDef[] = [
  // ═════════ Women's Fashion ═════════
  {
    name: "Women's Fashion",
    slug: "womens-fashion",
    icon: "womens-wear",
    attrs: [F.colour],
    groups: [
      {
        name: "Kurtas & Sets",
        attrs: [
          ...APPAREL_TOP,
          sel("kurta_length", "Kurta Length", ["Short", "Hip Length", "Knee Length", "Calf Length", "Ankle Length"], { filter: true }),
          sel("silhouette", "Silhouette", ["Straight", "A-Line", "Anarkali", "Flared", "Kaftan", "Asymmetric", "Peplum"], { filter: true }),
        ],
        items: [
          "Kurtis",
          {
            name: "Salwar Sets",
            attrs: [req(multi("set_contents", "Set Contains", ["Kurta", "Salwar", "Pant", "Palazzo", "Churidar", "Sharara", "Dupatta"]))],
          },
          "Kurta Sets with Dupatta",
          {
            name: "Dress Materials",
            attrs: [
              optional(F.size),
              req(sel("stitch_type", "Stitch Type", ["Unstitched", "Semi-Stitched"])),
              req(txt("top_fabric_length", "Top Fabric Length", { help: "e.g. 2.5 m" })),
              txt("bottom_fabric_length", "Bottom Fabric Length", { help: "e.g. 2 m" }),
              req(bool("dupatta_included", "Dupatta Included")),
            ],
          },
          "Tunics",
        ],
      },
      {
        name: "Sarees",
        attrs: [
          F.fabric, F.occasion,
          sel("work", "Work / Design", ["Printed", "Woven", "Zari", "Embroidered", "Sequinned", "Bandhani", "Leheriya", "Kalamkari", "Ikat", "Plain"], { filter: true }),
        ],
        items: [
          {
            name: "Sarees",
            attrs: [
              req(num("saree_length", "Saree Length", "m", { help: "Usually 5.5 m" })),
              req(bool("blouse_piece", "Blouse Piece Included")),
              num("blouse_length", "Blouse Piece Length", "m"),
            ],
          },
          { name: "Lehengas", attrs: [F.size, req(multi("set_contents", "Set Contains", ["Lehenga", "Choli", "Dupatta"])), sel("stitch_type", "Stitch Type", ["Stitched", "Semi-Stitched", "Unstitched"])] },
          { name: "Gowns", attrs: [F.size, F.sleeve, F.neck] },
          { name: "Blouses", attrs: [F.size, F.sleeve, F.neck, sel("padding", "Padding", ["Padded", "Non-Padded"]), F.closure] },
          { name: "Petticoats", attrs: [F.waist, sel("silhouette", "Silhouette", ["A-Line", "Mermaid / Shapewear", "Straight"])] },
        ],
      },
      {
        name: "Dresses",
        attrs: [
          ...APPAREL_TOP,
          sel("dress_length", "Length", ["Mini", "Above Knee", "Knee Length", "Midi", "Maxi"], { filter: true }),
        ],
        items: ["A-Line Dresses", "Printed Dresses", "Maxi Dresses", "Partywear Dresses", "Bodycon Dresses", "Jumpsuits", "Co-ord Sets"],
      },
      {
        name: "Tops & Tees",
        attrs: APPAREL_TOP,
        items: ["Tops", "T-Shirts", "Tank Tops", "Crop Tops", "Shirts", "Sweatshirts & Hoodies"],
      },
      {
        name: "Bottom Wear",
        attrs: APPAREL_BOTTOM,
        items: [
          "Trackpants", "Trousers", "Jeans & Jeggings", "Palazzos", "Leggings",
          { name: "Skirts", attrs: [sel("skirt_length", "Length", ["Mini", "Knee Length", "Midi", "Maxi"])] },
          "Shorts",
        ],
      },
      {
        name: "Lingerie & Nightwear",
        attrs: [F.size, F.fabric, F.pattern, F.packOf],
        items: [
          {
            name: "Bras",
            attrs: [
              req(sel("size", "Bra Size", ["28B", "30A", "30B", "30C", "32A", "32B", "32C", "32D", "34A", "34B", "34C", "34D", "36B", "36C", "36D", "38B", "38C", "38D", "40B", "40C", "40D", "42C", "42D", "S", "M", "L", "XL", "XXL"], { variant: true, filter: true })),
              req(sel("padding", "Padding", ["Padded", "Non-Padded", "Lightly Padded"], { filter: true })),
              sel("wiring", "Wiring", ["Wired", "Non-Wired"], { filter: true }),
              sel("coverage", "Coverage", ["Full", "Medium", "Demi"]),
              sel("bra_type", "Type", ["T-Shirt", "Push-Up", "Sports", "Minimiser", "Bralette", "Strapless", "Nursing", "Everyday"]),
            ],
          },
          { name: "Panties", attrs: [sel("panty_type", "Type", ["Hipster", "Bikini", "Brief", "Boyshort", "Thong", "High Waist"])] },
          "Lingerie Sets", "Nightsuits", "Pajamas", "Camisoles", "Shapewear",
          { name: "Sportswear", attrs: [multi("features", "Features", ["Quick Dry", "Stretchable", "Anti-Odour", "Moisture Wicking"])] },
        ],
      },
      {
        name: "Jewellery",
        attrs: [
          req(sel("base_metal", "Base Metal", ["Alloy", "Brass", "Copper", "Stainless Steel", "Sterling Silver (925)", "Silver", "German Silver", "Oxidised Silver", "Other"], { filter: true })),
          sel("plating", "Plating", ["Gold Plated", "Rose Gold Plated", "Silver Plated", "Rhodium Plated", "Oxidised", "Micron Gold", "None"], { filter: true }),
          sel("stone", "Stone / Work", ["None", "American Diamond", "Cubic Zirconia", "Kundan", "Pearl", "Polki", "Meenakari", "Crystal", "Beads"], { filter: true }),
          F.occasion,
          F.packOf,
        ],
        items: [
          "Earrings",
          { name: "Necklaces & Sets", attrs: [multi("set_contents", "Set Contains", ["Necklace", "Earrings", "Maang Tikka", "Ring", "Bracelet"])] },
          { name: "Rings", attrs: [req(sel("size", "Ring Size", ["Adjustable", "6", "8", "10", "12", "14", "16", "18", "20"], { variant: true }))] },
          "Bracelets",
          { name: "Bangles", attrs: [req(sel("size", "Bangle Size", ["2.2", "2.4", "2.6", "2.8", "2.10", "Adjustable"], { variant: true }))] },
          "Pendants", "Anklets", "Mangalsutras", "Nose Pins",
        ],
      },
      {
        name: "Footwear",
        attrs: footwear(WOMEN_SHOE),
        items: [
          "Flats",
          { name: "Heels", attrs: [sel("heel_type", "Heel Type", ["Block", "Stiletto", "Wedge", "Kitten", "Platform"]), num("heel_height", "Heel Height", "inch")] },
          "Sandals", "Casual Shoes", "Sports Shoes", "Flip Flops & Slippers", "Juttis",
        ],
      },
      {
        name: "Beauty",
        attrs: [F.colourOpt, F.netQty, txt("key_ingredients", "Key Ingredients"), txt("shelf_life", "Shelf Life", { help: "e.g. 24 months from manufacture" })],
        items: [
          { name: "Makeup", attrs: [sel("finish", "Finish", ["Matte", "Glossy", "Satin", "Shimmer", "Dewy", "Natural"]), txt("shade", "Shade")] },
          { name: "Skincare", attrs: [req(sel("skin_type", "Skin Type", ["All Skin Types", "Oily", "Dry", "Combination", "Sensitive", "Normal"], { filter: true }))] },
          { name: "Haircare", attrs: [sel("hair_type", "Hair Type", ["All Hair Types", "Dry", "Oily", "Frizzy", "Curly", "Coloured", "Damaged"])] },
          { name: "Fragrances", attrs: [req(sel("fragrance_type", "Type", ["Eau de Parfum", "Eau de Toilette", "Body Mist", "Deodorant", "Attar"]))] },
          "Nail Care",
          { name: "Makeup Organisers", attrs: [optional(F.netQty), F.material] },
        ],
      },
      {
        name: "Accessories",
        items: [
          { name: "Handbags", attrs: bagFields },
          { name: "Clutches & Wallets", attrs: bagFields },
          { name: "Watches", attrs: watchFields },
          { name: "Eyewear", attrs: eyewearFields },
          { name: "Sunglasses", attrs: eyewearFields },
          { name: "Belts", attrs: beltFields },
          { name: "Socks & Stockings", attrs: sockFields },
          { name: "Hair Accessories", attrs: [F.material, F.packOf] },
          { name: "Scarves & Stoles", attrs: [F.fabric, F.pattern] },
        ],
      },
    ],
  },

  // ═════════ Men's Fashion ═════════
  {
    name: "Men's Fashion",
    slug: "mens-fashion",
    icon: "mens-wear",
    attrs: [F.colour],
    groups: [
      {
        name: "T-Shirts",
        attrs: APPAREL_TOP,
        items: ["T-Shirts", "Polo T-Shirts", "Sleeveless T-Shirts", "Active Wear T-Shirts", "Oversized T-Shirts"],
      },
      {
        name: "Shirts",
        attrs: APPAREL_TOP,
        items: ["Casual Shirts", "Formal Shirts", "Printed Shirts", "Denim Shirts"],
      },
      {
        name: "Bottom Wear",
        attrs: APPAREL_BOTTOM,
        items: ["Trackpants", "Trousers", "Jeans", "Cargos", "Shorts", "Joggers"],
      },
      {
        name: "Winterwear",
        attrs: [...APPAREL_TOP, sel("hood", "Hooded", ["Hooded", "Non-Hooded"])],
        items: ["Jackets", "Hoodies & Sweatshirts", "Sweaters", "Thermals"],
      },
      {
        name: "Ethnicwear",
        attrs: [F.size, F.fabric, F.pattern, F.sleeve, F.occasion],
        items: [
          "Kurtas",
          { name: "Kurta Sets", attrs: [req(multi("set_contents", "Set Contains", ["Kurta", "Pyjama", "Churidar", "Dhoti", "Jacket"]))] },
          { name: "Dhotis", attrs: [F.waist] },
          "Nehru Jackets",
          { name: "Juttis & Mojaris", attrs: [optional(F.fabric), ...footwear(MEN_SHOE)] },
        ],
      },
      {
        name: "Innerwear",
        attrs: [F.waist, F.fabric, F.packOf],
        items: ["Briefs", "Boxers", "Trunks", { name: "Vests", attrs: [F.size] }, "Combo Packs"],
      },
      {
        name: "Footwear",
        attrs: footwear(MEN_SHOE),
        items: ["Casual Shoes", "Sports Shoes", "Formal Shoes", "Sandals & Floaters", "Flip Flops & Slippers", "Loafers"],
      },
      {
        name: "Accessories",
        items: [
          { name: "Watches", attrs: watchFields },
          { name: "Eyewear", attrs: eyewearFields },
          { name: "Sunglasses", attrs: eyewearFields },
          { name: "Belts", attrs: beltFields },
          { name: "Wallets", attrs: bagFields },
          { name: "Bags & Backpacks", attrs: [...bagFields, num("capacity", "Capacity", "L")] },
          { name: "Caps & Hats", attrs: [F.material, sel("size", "Size", ["Free Size", "S", "M", "L"], { variant: true })] },
          { name: "Socks", attrs: sockFields },
        ],
      },
    ],
  },

  // ═════════ Home and Living ═════════
  {
    name: "Home and Living",
    slug: "home-and-living",
    icon: "home",
    attrs: [F.colourOpt],
    groups: [
      {
        name: "Home Decor",
        attrs: [req(sel("material", "Material", HOME_MATERIALS, { filter: true }))],
        items: [
          { name: "Puja Essentials", attrs: [F.packOf] },
          "Wall Decor",
          { name: "Planters", attrs: [sel("planter_type", "Type", ["Table Top", "Hanging", "Floor", "Wall Mounted"]), bool("plant_included", "Plant Included")] },
          { name: "Lights & Candles", attrs: [req(sel("power_source", "Power Source", ["Electric", "Battery", "USB", "Solar", "Candle / Wax"])), F.packOf] },
          "Showpieces & Idols",
          "Mirrors & Frames",
          { name: "Wall Clocks", attrs: [sel("display_type", "Display Type", ["Analog", "Digital"])] },
          "Artificial Flowers",
        ],
      },
      {
        name: "Furnishing",
        attrs: [req(sel("material", "Material", ["Cotton", "Polyester", "Microfiber", "Poly Cotton", "Glace Cotton", "Silk", "Velvet", "Jute", "Wool", "Fleece", "Other"], { filter: true })), F.pattern],
        items: [
          {
            name: "Bedsheets",
            attrs: [
              req(sel("size", "Bed Size", ["Single", "Double", "Queen", "King", "Super King"], { variant: true, filter: true })),
              num("thread_count", "Thread Count", "TC"),
              req(num("pillow_covers", "Pillow Covers Included")),
            ],
          },
          { name: "Towels", attrs: [req(sel("size", "Towel Type", ["Face", "Hand", "Bath", "Set"], { variant: true })), num("gsm", "GSM", "gsm"), F.packOf] },
          { name: "Curtains", attrs: [req(sel("size", "Length", ["Window (5 ft)", "Door (7 ft)", "Long Door (9 ft)"], { variant: true })), sel("light_control", "Light Control", ["Sheer", "Semi Blackout", "Blackout"]), F.packOf] },
          { name: "Rugs & Carpets", attrs: [req(txt("rug_size", "Size", { help: "e.g. 4 x 6 ft" }))] },
          { name: "Cushions & Pillow Covers", attrs: [req(txt("cover_size", "Size", { help: "e.g. 16 x 16 inch" })), bool("filler_included", "Filler Included"), F.packOf] },
          { name: "Blankets & Quilts", attrs: [req(sel("size", "Bed Size", ["Single", "Double", "Queen", "King"], { variant: true }))] },
          { name: "Mattress Protectors", attrs: [req(sel("size", "Bed Size", ["Single", "Double", "Queen", "King"], { variant: true })), bool("waterproof", "Waterproof")] },
          { name: "Doormats", attrs: [txt("rug_size", "Size"), F.packOf] },
        ],
      },
      {
        name: "Organisers",
        attrs: [F.material, F.packOf],
        items: ["Storage Boxes", "Hangers", "Shoe Racks", "Laundry Baskets", "Wardrobe Organisers", "Hooks & Wall Hangers"],
      },
      {
        name: "Cleaning",
        attrs: [F.material, F.packOf],
        items: [
          { name: "Mops", attrs: [sel("mop_type", "Type", ["Spin Mop", "Flat Mop", "Wet & Dry", "Microfiber Refill"])] },
          "Sponges & Scrubbers", "Brushes",
          { name: "Garbage Bags", attrs: [req(sel("bag_size", "Size", ["Small (17 x 19 in)", "Medium (19 x 21 in)", "Large (24 x 32 in)", "Extra Large"])), num("bags_per_roll", "Bags per Pack")] },
          "Cleaning Cloths", "Dustbins",
        ],
      },
      {
        name: "Tools & Utility",
        attrs: [F.material, F.packOf],
        items: ["Bath Accessories", "Hardware Supplies", "Scissors", "Gloves", "Masks", "Umbrellas", "Tool Kits"],
      },
      {
        name: "Office Supplies",
        attrs: [F.packOf],
        items: [
          "Craft Supplies",
          { name: "Notebooks & Diaries", attrs: [req(num("pages", "Number of Pages")), sel("ruling", "Ruling", ["Ruled", "Plain", "Grid", "Dotted"]), sel("paper_size", "Size", ["A4", "A5", "B5", "Pocket"])] },
          { name: "Pens & Pencils", attrs: [sel("pen_type", "Type", ["Ball Pen", "Gel Pen", "Fountain Pen", "Pencil", "Marker", "Highlighter"]), sel("ink_colour", "Ink Colour", ["Blue", "Black", "Red", "Green", "Multicolour"])] },
          "Pencil Cases", "Files & Folders", "Labels & Stickers", "Desk Organisers",
        ],
      },
      {
        name: "Automotive",
        attrs: [req(sel("vehicle_type", "Vehicle Type", ["Car", "Bike", "Scooter", "Universal"], { filter: true })), txt("compatible_models", "Compatible Models", { help: "e.g. Activa 6G, Swift 2018+" })],
        items: [
          "Car & Bike Cleaning",
          { name: "Seat Covers", attrs: [F.material] },
          { name: "Vehicle Lighting", attrs: [num("wattage", "Wattage", "W"), sel("voltage", "Voltage", ["12V", "24V", "12-24V"])] },
          "Keychains", "Decals & Stickers", "Car Accessories", "Helmets & Riding Gear",
        ],
      },
    ],
  },

  // ═════════ Kitchen ═════════
  {
    name: "Kitchen",
    slug: "kitchen",
    icon: "kitchen",
    attrs: [
      req(sel("material", "Material", KITCHEN_MATERIALS, { filter: true, keySpec: "{value}" })),
      sel("colour", "Colour", COLOURS, { variant: true, filter: true }),
      F.packOf,
    ],
    groups: [
      {
        name: "Storage",
        attrs: [num("capacity", "Capacity", "ml", { help: "Per container" }), bool("airtight", "Airtight"), bool("microwave_safe", "Microwave Safe"), bool("bpa_free", "BPA Free / Food Grade")],
        items: ["Storage Containers", "Lunch Boxes & Bags", "Spice Racks & Boxes", "Racks & Holders", "Ice Cube Trays", "Oil Dispensers"],
      },
      {
        name: "Cookware",
        attrs: [
          req(bool("induction_compatible", "Induction Compatible", { filter: true })),
          sel("coating", "Coating", ["Non-Stick", "Uncoated", "Ceramic", "Granite", "Enamel"], { filter: true }),
          num("diameter", "Diameter", "cm"),
          bool("lid_included", "Lid Included"),
        ],
        items: [
          "Pots & Pans", "Kadhai & Woks", "Tawa", "Cookware Sets",
          { name: "Pressure Cookers", attrs: [req(num("capacity", "Capacity", "L")), sel("lid_type", "Lid Type", ["Inner Lid", "Outer Lid"])] },
          "Appam & Paniyaram Pans",
        ],
      },
      {
        name: "Kitchen Tools",
        items: ["Knives & Peelers", "Graters & Mashers", "Choppers & Slicers", "Water Filters", "Gas Lighters", "Strainers & Sieves", "Rolling Pins & Boards"],
      },
      {
        name: "Dinnerware & Utensils",
        attrs: [bool("microwave_safe", "Microwave Safe"), bool("dishwasher_safe", "Dishwasher Safe")],
        items: [
          { name: "Dinner Sets", attrs: [req(num("pieces", "Number of Pieces"))] },
          "Plates", "Bowls", "Cutlery", "Spatulas & Ladles", "Serving Trays",
        ],
      },
      {
        name: "Bottles & Drinkware",
        attrs: [req(num("capacity", "Capacity", "ml"))],
        items: [
          { name: "Water Bottles", attrs: [bool("insulated", "Insulated (Hot & Cold)"), bool("leak_proof", "Leak Proof")] },
          { name: "Flasks & Thermos", attrs: [num("insulation_hours", "Keeps Hot/Cold for", "hours")] },
          "Glass Sets", "Mugs & Cups", "Beer Mugs", "Sippers & Shakers",
        ],
      },
      {
        name: "Aprons & Towels",
        attrs: [req(sel("material", "Material", ["Cotton", "Polyester", "Microfiber", "Silicone", "PVC"]))],
        items: ["Aprons", "Kitchen Towels", "Oven Mitts", "Table Mats & Runners", "Fridge Mats"],
      },
    ],
  },

  // ═════════ Electronics ═════════
  {
    name: "Electronics",
    slug: "electronics",
    icon: "electronics",
    attrs: [
      req(sel("warranty", "Warranty", WARRANTY, { filter: true, keySpec: "{value} warranty" })),
      sel("colour", "Colour", COLOURS, { variant: true, filter: true }),
    ],
    groups: [
      {
        name: "Cases & Protection",
        attrs: [req(txt("compatible_model", "Compatible Model", { filter: true, help: "e.g. Redmi Note 13 5G, iPhone 15" }))],
        items: [
          { name: "Phone Cases & Covers", attrs: [sel("material", "Material", ["Silicone", "TPU", "Polycarbonate", "Leather", "Glass", "Metal"])] },
          { name: "Screen Protectors", attrs: [req(sel("protector_type", "Type", ["Tempered Glass", "Matte", "Privacy", "Hydrogel", "Camera Lens"])), F.packOf] },
          { name: "Tablet Covers", attrs: [sel("material", "Material", ["PU Leather", "Silicone", "TPU", "Fabric"])] },
          { name: "Gaming Finger Sleeves", attrs: [optional(txt("compatible_model", "Compatible Model")), F.packOf] },
        ],
      },
      {
        name: "Audio",
        attrs: [
          req(sel("connectivity", "Connectivity", ["Bluetooth", "Wired 3.5 mm", "Wired Type-C", "Wired Lightning"], { filter: true, keySpec: "{value}" })),
          sel("bluetooth_version", "Bluetooth Version", ["4.2", "5.0", "5.1", "5.2", "5.3", "5.4"]),
          num("battery_life", "Battery Life", "hours", { keySpec: "Up to {value} h playback" }),
          bool("mic", "Built-in Mic"),
          sel("noise_cancellation", "Noise Cancellation", ["None", "ENC (calls)", "ANC"], { filter: true }),
          sel("water_resistance", "Water Resistance", ["None", "IPX4", "IPX5", "IPX7"]),
        ],
        items: [
          { name: "Wired Earphones", attrs: [optional(num("battery_life", "Battery Life", "hours"))] },
          "Wireless Earbuds", "Neckbands", "Headphones",
          { name: "Bluetooth Speakers", attrs: [req(num("output_power", "Output Power", "W"))] },
        ],
      },
      {
        name: "Chargers & Power",
        attrs: [req(num("output_power", "Output Power", "W", { keySpec: "{value} W" })), multi("ports", "Ports", ["USB-A", "USB Type-C", "Micro USB", "Lightning", "Wireless"]), bool("fast_charging", "Fast Charging")],
        items: [
          { name: "Mobile Chargers", rule: CRS_RULE },
          { name: "Power Banks", attrs: [req(num("battery_capacity", "Capacity", "mAh", { keySpec: "{value} mAh" }))], rule: CRS_RULE },
          { name: "Car Chargers", rule: CRS_RULE },
          "Wireless Chargers",
        ],
      },
      {
        name: "Cables",
        attrs: [
          req(num("cable_length", "Cable Length", "m")),
          req(sel("connector", "Connector", ["USB-A to Type-C", "Type-C to Type-C", "USB-A to Lightning", "Type-C to Lightning", "USB-A to Micro USB", "3-in-1", "RJ45 (LAN)", "HDMI", "3.5 mm AUX", "Electrical Wire"], { filter: true })),
        ],
        items: ["Charging Cables", "LAN Cables", "HDMI & AUX Cables", { name: "Wires", attrs: [txt("wire_gauge", "Gauge / Size", { help: "e.g. 1.5 sq mm" })] }],
      },
      {
        name: "Computer Accessories",
        attrs: [sel("connectivity", "Connectivity", ["Wired USB", "Wireless 2.4 GHz", "Bluetooth", "Type-C"]), txt("compatible_devices", "Compatible Devices")],
        items: [
          "Mouse", "Keyboards", "Laptop Stands & Tables", "USB Hubs", "Webcams",
          { name: "Pen Drives & Memory Cards", attrs: [req(sel("storage", "Capacity", ["8 GB", "16 GB", "32 GB", "64 GB", "128 GB", "256 GB", "512 GB", "1 TB"], { variant: true, filter: true }))] },
        ],
      },
      {
        name: "Mobile Holders & Stands",
        items: ["Phone Holders & Stands", "Car Mounts", "Bike Mounts", "Selfie Sticks & Tripods", "Ring Lights"],
      },
      {
        name: "Smart Wearables",
        attrs: [num("display_size", "Display Size", "inch"), num("battery_life", "Battery Life", "days"), bool("calling", "Bluetooth Calling", { filter: true }), sel("compatible_os", "Compatible OS", ["Android & iOS", "Android", "iOS"])],
        items: ["Smart Watches", "Fitness Bands"],
      },
      {
        name: "Personal Care Appliances",
        attrs: [req(sel("power_source", "Power Source", ["Rechargeable", "Corded", "Battery", "Corded & Cordless"])), num("runtime", "Runtime", "min"), num("wattage", "Power", "W")],
        items: ["Trimmers & Shavers", "Hair Dryers", "Hair Straighteners", "Electric Massagers"],
      },
      {
        name: "Gadget Accessories",
        items: ["Remotes", "Circuit Boards & DIY Kits", "Wire Organisers", "LED Strip Lights", "Batteries"],
      },
    ],
  },

  // ═════════ Kids' Fashion ═════════
  {
    name: "Kids' Fashion",
    slug: "kids-fashion",
    icon: "baby",
    attrs: [F.colourOpt],
    groups: [
      {
        name: "Dresses",
        attrs: [F.kidsSize, F.fabric, F.pattern, F.sleeve, F.occasion],
        items: ["Frocks", "Partywear Dresses", "Midi Dresses", "Ethnic Dresses"],
      },
      {
        name: "Tees & Shirts",
        attrs: [F.kidsSize, F.kidsGender, F.fabric, F.pattern, F.sleeve, F.neck],
        items: ["Boys T-Shirts", "Boys Polos", "Boys Shirts", "Girls T-Shirts", "Girls Tops", "Baby Clothing Sets"],
      },
      {
        name: "Bottoms",
        attrs: [F.kidsSize, F.kidsGender, F.fabric, F.closure],
        items: ["Boys Trackpants", "Girls Trackpants", "Boys Shorts", "Girls Shorts", "Jeans", "Leggings", "Skirts"],
      },
      {
        name: "Ethnic Wear",
        attrs: [F.kidsSize, F.kidsGender, F.fabric, req(multi("set_contents", "Set Contains", ["Kurta", "Pyjama", "Dhoti", "Jacket", "Lehenga", "Choli", "Dupatta"]))],
        items: ["Boys Kurta Sets", "Girls Lehenga Choli"],
      },
      {
        name: "Innerwear & Nightwear",
        attrs: [F.kidsSize, F.kidsGender, F.fabric, F.packOf],
        items: ["Innerwear", "Briefs & Bloomers", "Pajamas & Nightsuits", "Vests", "Beginner Bras"],
      },
      {
        name: "Footwear",
        attrs: [...footwear(KIDS_SHOE), F.kidsGender],
        items: ["Boys Shoes", "Boys Flip Flops", "Girls Shoes", "Girls Flip Flops", "School Shoes", "Baby Booties"],
      },
      {
        name: "Bags & Accessories",
        attrs: [F.material, F.kidsGender],
        items: ["School Bags", "Girls Handbags", "Pencil Pouches", "Water Bottles", "Hair Accessories"],
      },
      {
        name: "Play and Learn",
        attrs: [
          req(sel("age_group", "Age Group", TOY_AGES, { filter: true, keySpec: "For {value}" })),
          F.material,
          bool("battery_operated", "Battery Operated"),
          bool("battery_included", "Batteries Included"),
          num("pieces", "Number of Pieces"),
        ],
        items: [
          { name: "Educational Toys", rule: TOY_RULE },
          { name: "Infant Toys", rule: TOY_RULE },
          { name: "Building Blocks", rule: TOY_RULE },
          { name: "Board Games & Puzzles", rule: TOY_RULE },
          { name: "Plush Toys", rule: TOY_RULE },
          { name: "Toy Vehicles", rule: TOY_RULE },
          { name: "Toy Guns", rule: TOY_RULE },
          { name: "Action Figures", rule: TOY_RULE },
          {
            name: "Educational Books",
            attrs: [
              optional(F.material),
              req(sel("language", "Language", ["English", "Hindi", "Bilingual", "Other"], { filter: true })),
              num("pages", "Number of Pages"),
              txt("author", "Author / Publisher"),
            ],
          },
          { name: "Party Decor", attrs: [optional(sel("age_group", "Age Group", TOY_AGES)), sel("party_occasion", "Occasion", ["Birthday", "Anniversary", "Baby Shower", "Festival", "Bachelorette", "General"]), F.packOf] },
        ],
      },
    ],
  },
];

// ── Demo set ────────────────────────────────────────────────
// A small catalogue for demos: same structure and listing fields as the full
// tree, every tile with a photo from frontend/public/category-images/.

const img = (file: string) => `/category-images/${file}.jpg`;

export const DEMO_DEPARTMENTS: DepartmentDef[] = [
  {
    name: "Women's Fashion",
    slug: "womens-fashion",
    icon: "womens-wear",
    attrs: [F.colour],
    groups: [
      {
        name: "Ethnic Wear",
        attrs: [F.size, F.fabric, F.pattern, F.occasion, F.washCare],
        items: [
          {
            name: "Sarees",
            image: img("sarees"),
            attrs: [
              optional(F.size),
              req(num("saree_length", "Saree Length", "m", { help: "Usually 5.5 m" })),
              req(bool("blouse_piece", "Blouse Piece Included")),
            ],
          },
          {
            name: "Kurtis",
            image: img("kurtis"),
            attrs: [F.sleeve, F.neck, sel("kurta_length", "Kurta Length", ["Short", "Hip Length", "Knee Length", "Calf Length", "Ankle Length"], { filter: true })],
          },
          {
            name: "Lehengas",
            image: img("lehengas"),
            attrs: [req(multi("set_contents", "Set Contains", ["Lehenga", "Choli", "Dupatta"])), sel("stitch_type", "Stitch Type", ["Stitched", "Semi-Stitched", "Unstitched"])],
          },
        ],
      },
      {
        name: "Western Wear",
        attrs: [F.size, F.fabric, F.pattern, F.fit, F.occasion, F.washCare],
        items: [
          { name: "Dresses", image: img("dresses"), attrs: [F.sleeve, F.neck, sel("dress_length", "Length", ["Mini", "Knee Length", "Midi", "Maxi"], { filter: true })] },
          { name: "Tops", image: img("tops"), attrs: [F.sleeve, F.neck] },
          { name: "Jeans", image: img("jeans"), attrs: [F.waist, sel("rise", "Rise", ["High Rise", "Mid Rise", "Low Rise"], { filter: true })] },
        ],
      },
      {
        name: "Jewellery",
        attrs: [
          req(sel("base_metal", "Base Metal", ["Alloy", "Brass", "Copper", "Sterling Silver (925)", "Silver", "Other"], { filter: true })),
          sel("plating", "Plating", ["Gold Plated", "Rose Gold Plated", "Silver Plated", "Oxidised", "None"], { filter: true }),
          F.occasion,
          F.packOf,
        ],
        items: [
          { name: "Earrings", image: img("earrings") },
          { name: "Necklaces", image: img("necklaces") },
        ],
      },
    ],
  },
  {
    name: "Men's Fashion",
    slug: "mens-fashion",
    icon: "mens-wear",
    attrs: [F.colour],
    groups: [
      {
        name: "Topwear",
        attrs: APPAREL_TOP,
        items: [
          { name: "T-Shirts", image: img("t-shirts") },
          { name: "Shirts", image: img("shirts") },
        ],
      },
      {
        name: "Footwear",
        attrs: footwear(MEN_SHOE),
        items: [
          { name: "Sports Shoes", image: img("sports-shoes") },
          { name: "Formal Shoes", image: img("formal-shoes") },
        ],
      },
    ],
  },
  {
    name: "Electronics",
    slug: "electronics",
    icon: "electronics",
    attrs: [
      req(sel("warranty", "Warranty", WARRANTY, { filter: true, keySpec: "{value} warranty" })),
      sel("colour", "Colour", COLOURS, { variant: true, filter: true }),
    ],
    groups: [
      {
        name: "Audio",
        attrs: [
          req(sel("connectivity", "Connectivity", ["Bluetooth", "Wired 3.5 mm", "Wired Type-C"], { filter: true, keySpec: "{value}" })),
          num("battery_life", "Battery Life", "hours", { keySpec: "Up to {value} h playback" }),
          bool("mic", "Built-in Mic"),
          sel("noise_cancellation", "Noise Cancellation", ["None", "ENC (calls)", "ANC"], { filter: true }),
        ],
        items: [
          { name: "Headphones", image: img("headphones") },
          { name: "Wireless Earbuds", image: img("wireless-earbuds") },
        ],
      },
      {
        name: "Mobile Accessories",
        items: [
          {
            name: "Phone Cases",
            image: img("phone-cases"),
            attrs: [req(txt("compatible_model", "Compatible Model", { filter: true, help: "e.g. Redmi Note 13 5G, iPhone 15" })), sel("material", "Material", ["Silicone", "TPU", "Polycarbonate", "Leather"])],
          },
          {
            name: "Chargers",
            image: img("chargers"),
            attrs: [req(num("output_power", "Output Power", "W", { keySpec: "{value} W" })), multi("ports", "Ports", ["USB-A", "USB Type-C"]), bool("fast_charging", "Fast Charging")],
            rule: CRS_RULE,
          },
        ],
      },
      {
        name: "Wearables",
        attrs: [num("display_size", "Display Size", "inch"), num("battery_life", "Battery Life", "days"), bool("calling", "Bluetooth Calling", { filter: true })],
        items: [{ name: "Smart Watches", image: img("smart-watches") }],
      },
    ],
  },
  {
    name: "Home & Kitchen",
    slug: "home-and-kitchen",
    icon: "kitchen",
    attrs: [req(sel("material", "Material", [...new Set([...KITCHEN_MATERIALS, ...HOME_MATERIALS])], { filter: true })), F.colourOpt],
    groups: [
      {
        name: "Cookware",
        attrs: [req(bool("induction_compatible", "Induction Compatible", { filter: true })), num("capacity", "Capacity", "L")],
        items: [
          { name: "Pots & Pans", image: img("pots-and-pans"), attrs: [sel("coating", "Coating", ["Non-Stick", "Uncoated", "Ceramic"]), num("diameter", "Diameter", "cm")] },
          { name: "Pressure Cookers", image: img("pressure-cookers"), attrs: [req(num("capacity", "Capacity", "L"))] },
        ],
      },
      {
        name: "Home Decor",
        items: [
          { name: "Wall Clocks", image: img("wall-clocks"), attrs: [sel("display_type", "Display Type", ["Analog", "Digital"])] },
          { name: "Cushions", image: img("cushions"), attrs: [req(txt("cover_size", "Size", { help: "e.g. 16 x 16 inch" })), bool("filler_included", "Filler Included"), F.packOf] },
        ],
      },
    ],
  },
];
