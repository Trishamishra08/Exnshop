/**
 * Marketplace category tree for the Categories page (department rail on the
 * left, continuous scroll of groups and tiles on the right):
 *
 *   Department (HeaderCategory)  →  Group (root Category)  →  Tile (child Category)
 *
 * "All …" / "View All" tiles are not stored: the page adds one as the first
 * tile of every group. Tile photos live in frontend/public/category-images and
 * are attached when the file exists (see imageFileFor + fetchCategoryImages).
 */
import fs from "fs";
import path from "path";
import type { AttrDef, DepartmentDef, GroupDef, LeafDef, RuleDef } from "./marketplaceTaxonomy";

// ── attribute helpers ───────────────────────────────────────
type Opts = Partial<Omit<AttrDef, "key" | "label" | "type" | "values">>;
const sel = (key: string, label: string, values: string[], o: Opts = {}): AttrDef => ({ key, label, type: "select", values, ...o });
const multi = (key: string, label: string, values: string[], o: Opts = {}): AttrDef => ({ key, label, type: "multiselect", values, ...o });
const txt = (key: string, label: string, o: Opts = {}): AttrDef => ({ key, label, type: "text", ...o });
const num = (key: string, label: string, unit?: string, o: Opts = {}): AttrDef => ({ key, label, type: "number", unit, ...o });
const bool = (key: string, label: string, o: Opts = {}): AttrDef => ({ key, label, type: "boolean", ...o });
const req = (a: AttrDef): AttrDef => ({ ...a, required: true });

const COLOURS = ["Black", "White", "Off White", "Beige", "Cream", "Grey", "Silver", "Gold", "Brown", "Maroon", "Red", "Pink", "Peach", "Orange", "Yellow", "Mustard", "Green", "Olive", "Teal", "Blue", "Navy Blue", "Sky Blue", "Purple", "Wine", "Transparent", "Multicolour"];
const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "Free Size"];
const WAIST = ["26", "28", "30", "32", "34", "36", "38", "40", "42", "S", "M", "L", "XL", "XXL", "Free Size"];
const KIDS_SIZES = ["0-6 Months", "6-12 Months", "1-2 Years", "2-3 Years", "3-4 Years", "4-5 Years", "5-6 Years", "6-8 Years", "8-10 Years", "10-12 Years", "12-14 Years"];
const FABRICS = ["Cotton", "Cotton Blend", "Rayon", "Viscose", "Polyester", "Silk", "Art Silk", "Georgette", "Chiffon", "Crepe", "Net", "Linen", "Denim", "Lycra", "Wool", "Fleece", "Velvet", "Satin", "Nylon", "Leather", "Other"];
const PATTERNS = ["Solid", "Printed", "Floral", "Embroidered", "Striped", "Checked", "Woven", "Graphic", "Embellished"];
const WARRANTY = ["No Warranty", "3 Months", "6 Months", "1 Year", "2 Years"];
const AGE = ["0-12 Months", "1-3 Years", "3-5 Years", "5-8 Years", "8-12 Years", "12+ Years"];

const colour = sel("colour", "Colour", COLOURS, { variant: true, filter: true });
const sizeReq = req(sel("size", "Size", SIZES, { variant: true, filter: true }));
const waistReq = req(sel("size", "Size", WAIST, { variant: true, filter: true }));
const kidsSize = req(sel("size", "Age / Size", KIDS_SIZES, { variant: true, filter: true }));
const fabricReq = req(sel("fabric", "Fabric", FABRICS, { filter: true, keySpec: "{value}" }));
const packOf = req(num("pack_of", "Pack of", undefined, { help: "Pieces in one order", keySpec: "Pack of {value}" }));

const TOP = [req(colour), sizeReq, fabricReq, sel("pattern", "Pattern", PATTERNS, { filter: true }), sel("sleeve_length", "Sleeve Length", ["Sleeveless", "Short Sleeve", "Three-Quarter Sleeve", "Full Sleeve"], { filter: true }), sel("neck", "Neck / Collar", ["Round Neck", "V-Neck", "Collar", "Mandarin Collar", "Boat Neck", "Square Neck", "Hooded"], { filter: true }), sel("fit", "Fit", ["Regular", "Slim", "Relaxed", "Oversized"], { filter: true }), sel("occasion", "Occasion", ["Casual", "Daily Wear", "Party", "Festive", "Wedding", "Formal", "Sports"], { filter: true }), txt("wash_care", "Wash Care")];
const BOTTOM = [req(colour), waistReq, fabricReq, sel("fit", "Fit", ["Regular", "Slim", "Skinny", "Relaxed", "Straight", "Wide Leg", "Flared"], { filter: true }), sel("rise", "Rise", ["High Rise", "Mid Rise", "Low Rise"]), sel("closure", "Closure", ["Elastic", "Drawstring", "Button", "Zip"]), sel("pattern", "Pattern", PATTERNS), txt("wash_care", "Wash Care")];
const ETHNIC = [req(colour), sizeReq, fabricReq, sel("pattern", "Pattern", PATTERNS, { filter: true }), sel("occasion", "Occasion", ["Daily Wear", "Party", "Festive", "Wedding", "Office"], { filter: true }), txt("wash_care", "Wash Care")];
const UNSTITCHED = [req(colour), fabricReq, sel("pattern", "Pattern", PATTERNS, { filter: true }), sel("occasion", "Occasion", ["Daily Wear", "Party", "Festive", "Wedding"], { filter: true }), req(sel("stitch_type", "Stitch Type", ["Unstitched", "Semi-Stitched", "Stitched"]))];
const INNER = [req(colour), req(sel("size", "Size", ["28", "30", "32", "34", "36", "38", "40", "XS", "S", "M", "L", "XL", "XXL", "Free Size"], { variant: true, filter: true })), fabricReq, packOf];
const KIDS_WEAR = [req(colour), kidsSize, fabricReq, req(sel("gender", "Gender", ["Boys", "Girls", "Unisex"], { filter: true })), sel("pattern", "Pattern", PATTERNS)];
const FOOT = (sizes: string[]) => [req(colour), req(sel("size", "Footwear Size", sizes, { variant: true, filter: true })), req(sel("upper_material", "Upper Material", ["Synthetic", "PU", "Leather", "Faux Leather", "Canvas", "Mesh", "Fabric", "Rubber"], { filter: true })), sel("sole_material", "Sole Material", ["Rubber", "EVA", "PU", "TPR", "PVC"]), sel("closure", "Closure", ["Slip-on", "Lace-up", "Velcro", "Buckle"])];
const WOMEN_SHOE = ["UK 2", "UK 3", "UK 4", "UK 5", "UK 6", "UK 7", "UK 8"];
const MEN_SHOE = ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"];
const KIDS_SHOE = ["UK 3C", "UK 5C", "UK 7C", "UK 9C", "UK 11C", "UK 13C", "UK 1", "UK 3"];
const JEWEL = [req(sel("base_metal", "Base Metal", ["Alloy", "Brass", "Copper", "Sterling Silver (925)", "Silver", "Other"], { filter: true })), sel("plating", "Plating", ["Gold Plated", "Rose Gold Plated", "Silver Plated", "Oxidised", "None"], { filter: true }), sel("occasion", "Occasion", ["Daily Wear", "Party", "Festive", "Wedding"], { filter: true }), packOf, colour];
const ACCESSORY = [colour, req(txt("material", "Material", { filter: true })), packOf];
const BAG = [req(colour), req(sel("material", "Material", ["PU", "Faux Leather", "Genuine Leather", "Canvas", "Nylon", "Polyester", "Fabric"], { filter: true })), num("compartments", "Number of Compartments"), sel("closure", "Closure", ["Zip", "Magnetic", "Button", "Drawstring", "Flap"])];
const BEAUTY = [req(txt("net_quantity", "Net Quantity", { help: "e.g. 100 ml, 50 g", keySpec: "{value}" })), colour, txt("key_ingredients", "Key Ingredients"), req(txt("shelf_life", "Shelf Life", { help: "e.g. 24 months from manufacture" })), sel("skin_type", "Suitable for", ["All Skin Types", "Oily", "Dry", "Combination", "Sensitive"], { filter: true })];
const HEALTH = [req(txt("net_quantity", "Net Quantity", { keySpec: "{value}" })), req(txt("shelf_life", "Shelf Life")), txt("key_ingredients", "Key Ingredients / Contents")];
const ELEC = [req(sel("warranty", "Warranty", WARRANTY, { filter: true, keySpec: "{value} warranty" })), colour, sel("connectivity", "Connectivity", ["Bluetooth", "Wired 3.5 mm", "Wired Type-C", "USB", "Wireless"], { filter: true }), bool("mic", "Built-in Mic")];
const POWER = [req(sel("warranty", "Warranty", WARRANTY, { filter: true })), colour, req(num("output_power", "Output Power", "W", { keySpec: "{value} W" })), multi("ports", "Ports", ["USB-A", "USB Type-C", "Micro USB", "Lightning"]), bool("fast_charging", "Fast Charging")];
const WATCH = [req(sel("warranty", "Warranty", WARRANTY, { filter: true })), req(colour), req(sel("display_type", "Display Type", ["Analog", "Digital", "Analog-Digital", "Smart"], { filter: true })), sel("strap_material", "Strap Material", ["Metal", "Leather", "Silicone", "Rubber", "Fabric"], { filter: true }), sel("water_resistance", "Water Resistance", ["Not Water Resistant", "Splash Resistant", "30 m", "50 m"])];
const HOME = [req(txt("material", "Material", { filter: true, keySpec: "{value}" })), colour, packOf];
const KITCHEN = [req(txt("material", "Material", { filter: true, keySpec: "{value}" })), colour, packOf, num("capacity", "Capacity", "ml"), bool("dishwasher_safe", "Dishwasher Safe")];
const COOKWARE = [req(txt("material", "Material", { filter: true })), colour, req(bool("induction_compatible", "Induction Compatible", { filter: true })), sel("coating", "Coating", ["Non-Stick", "Uncoated", "Ceramic", "Granite"], { filter: true }), num("diameter", "Diameter", "cm"), num("capacity", "Capacity", "L")];
const APPLIANCE = [req(sel("warranty", "Warranty", WARRANTY, { filter: true })), colour, num("wattage", "Power", "W"), req(sel("power_source", "Power Source", ["Corded", "Rechargeable", "Battery"]))];
const TEXTILE = [req(txt("material", "Material", { filter: true })), colour, sel("size", "Size", ["Single", "Double", "Queen", "King", "Free Size"], { variant: true, filter: true }), sel("pattern", "Pattern", PATTERNS), packOf];
const FURNITURE = [req(txt("material", "Material", { filter: true })), colour, bool("assembly_required", "Assembly Required"), txt("dimensions", "Dimensions", { help: "L x W x H" })];
const TOY = [req(sel("age_group", "Age Group", AGE, { filter: true, keySpec: "For {value}" })), txt("material", "Material"), bool("battery_operated", "Battery Operated"), num("pieces", "Number of Pieces")];
const BOOK = [req(sel("language", "Language", ["English", "Hindi", "Bilingual", "Other"], { filter: true })), num("pages", "Number of Pages"), txt("author", "Author / Publisher")];
const FOOD = [req(txt("net_quantity", "Net Quantity", { keySpec: "{value}" })), req(txt("shelf_life", "Shelf Life")), req(sel("diet", "Diet Type", ["Vegetarian", "Non-Vegetarian", "Vegan"], { filter: true })), txt("ingredients", "Ingredients")];
const PET = [req(sel("pet_type", "Pet Type", ["Dog", "Cat", "Fish", "Bird", "Small Animal", "All"], { filter: true })), txt("material", "Material"), txt("net_quantity", "Net Quantity / Size")];
const MUSIC = [req(sel("warranty", "Warranty", WARRANTY)), colour, txt("material", "Material"), sel("skill_level", "Skill Level", ["Beginner", "Intermediate", "Professional"])];
const STATIONERY = [colour, txt("material", "Material"), packOf, sel("paper_size", "Size", ["A4", "A5", "B5", "Pocket", "Other"])];
const SPORT = [colour, txt("material", "Material"), sel("size", "Size", ["XS", "S", "M", "L", "XL", "Free Size"], { variant: true }), sel("skill_level", "Skill Level", ["Beginner", "Intermediate", "Professional"])];
const AUTO = [req(sel("vehicle_type", "Vehicle Type", ["Car", "Bike", "Scooter", "Universal"], { filter: true })), txt("compatible_models", "Compatible Models", { help: "e.g. Activa 6G, Swift 2018+" }), colour, txt("material", "Material")];
const HOME_IMPROVE = [txt("material", "Material"), packOf, txt("net_quantity", "Net Quantity / Size")];

const CRS: RuleDef = { regulated: true, docs: [{ key: "bis_crs", label: "BIS registration (CRS) certificate" }], notes: "Chargers and power banks fall under BIS Compulsory Registration." };
const TOY_RULE: RuleDef = { regulated: true, docs: [{ key: "bis_toy", label: "BIS certificate (IS 9873 / IS 15644)" }], notes: "Toys need the BIS standard mark." };
const FSSAI: RuleDef = { regulated: true, docs: [{ key: "fssai", label: "FSSAI licence" }], notes: "Packaged food needs a valid FSSAI licence." };

// ── builders ────────────────────────────────────────────────
type LeafIn = string | [string, RuleDef];
interface GroupIn {
  name: string;
  attrs: AttrDef[];
  leaves: LeafIn[];
  featured?: boolean;
  popular?: boolean;
  /** leaf names that are in the Popular tab's "All Popular" list */
  popularLeaves?: string[];
}
const g = (name: string, attrs: AttrDef[], leaves: LeafIn[], o: Partial<GroupIn> = {}): GroupIn => ({ name, attrs, leaves, ...o });

const slug = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Where a tile's photo lives (relative to frontend/public). */
export const imageFileFor = (dept: string, group: string, leaf: string) => `category-images/${slug(dept).slice(0, 14)}-${slug(group).slice(0, 18)}-${slug(leaf).slice(0, 26)}.jpg`;
const IMAGES_ROOT = path.join(__dirname, "../../../../frontend/public");
const hasImage = (rel: string) => fs.existsSync(path.join(IMAGES_ROOT, rel));

interface DeptIn {
  name: string;
  slug: string;
  icon: string;
  attrs?: AttrDef[];
  groups: GroupIn[];
}

const DEPTS: DeptIn[] = [
  {
    name: "Kurti, Saree & Lehenga", slug: "kurti-saree-lehenga", icon: "womens-wear",
    groups: [
      g("Sarees", [...UNSTITCHED.filter((a) => a.key !== "stitch_type"), req(num("saree_length", "Saree Length", "m", { help: "Usually 5.5 m" })), req(bool("blouse_piece", "Blouse Piece Included"))],
        ["Georgette Sarees", "Chiffon Sarees", "Cotton Sarees", "Net Sarees", "Sarees Under 299", "Silk Sarees", "New Collection Sarees", "Bridal Sarees"], { featured: true, popular: true }),
      g("Kurtis", [...ETHNIC, sel("kurta_length", "Kurta Length", ["Short", "Hip Length", "Knee Length", "Calf Length", "Ankle Length"], { filter: true }), sel("neck", "Neck / Collar", ["Round Neck", "V-Neck", "Mandarin Collar", "Boat Neck"])],
        ["Anarkali Kurtis", "Rayon Kurtis", "Cotton Kurtis", "Straight Kurtis", "Long Kurtis"], { popular: true }),
      g("Kurta Sets", [...ETHNIC, req(multi("set_contents", "Set Contains", ["Kurta", "Palazzo", "Pant", "Sharara", "Dupatta"]))],
        ["Kurta Palazzo Sets", "Kurta Pant Sets", "Sharara Sets", "Anarkali Kurta Sets", "Cotton Kurta Sets"]),
      g("Dupatta Sets", [...UNSTITCHED, req(bool("dupatta_included", "Dupatta Included"))], ["Cotton Sets", "Rayon Sets"]),
      g("Suits & Dress Material", UNSTITCHED, ["Pakistani Dress Materials", "Cotton Dress Materials", "Patiala Dress Materials", "Banarasi Dress Materials", "Party Wear Dress Materials"]),
      g("Lehengas", [...ETHNIC, req(multi("set_contents", "Set Contains", ["Lehenga", "Choli", "Dupatta"]))], ["Shoppers Favourite Lehengas", "Trending Lehengas"]),
      g("Blouses", [...ETHNIC, sel("padding", "Padding", ["Padded", "Non-Padded"])], ["Shoppers Favourite Blouses", "Trending Blouses"]),
      g("Gowns", ETHNIC, ["Shoppers Favourite Gowns", "Trending Gowns"]),
      g("Other Ethnic Wear", ETHNIC, ["Ethnic Skirts & Bottomwear", "Ethnic Jackets & Shrugs", "Islamic Fashion", "Petticoats", "Blouse Pieces", "Dupattas"]),
    ],
  },
  {
    name: "Women Western", slug: "women-western", icon: "fashion",
    groups: [
      g("Topwear", TOP, ["Tops & Tunics", "Dresses", "T-shirts", "Gowns", "Tops & Bottom Sets", "Shirts", "Jumpsuits", "New Trends"], { popular: true }),
      g("Bottomwear", BOTTOM, ["Jeans & Jeggings", "Palazzos", "Trousers & Pants", "Leggings", "Shorts & Skirts"]),
      g("Winterwear", TOP, ["Jackets", "Sweatshirts", "Sweaters", "Capes, Shrug & Ponchos", "Coats", "Blazers & Waistcoats"]),
      g("Plus Size", TOP, ["Plus Size - Dresses & Gowns", "Plus Size - Tops & Tees", "Plus Size - Bottomwear"]),
    ],
  },
  {
    name: "Lingerie", slug: "lingerie", icon: "beauty-cosmetics",
    groups: [
      g("Innerwear", [...INNER, sel("padding", "Padding", ["Padded", "Non-Padded", "Lightly Padded"], { filter: true })], ["Bra & Bralettes", "Panties", "Lingerie Sets", "Shapewear", "Camisoles & Inners", "Straps, Tapes & Pasties"], { popular: true }),
      g("Sleepwear", [req(colour), sizeReq, fabricReq, packOf], ["Women Nightsuits", "Women Nightdress", "Other Sleepwear"]),
      g("Sports Wear", [req(colour), sizeReq, fabricReq, multi("features", "Features", ["Quick Dry", "Stretchable", "Moisture Wicking"])], ["Sports Bottomwear", "Sports Bra", "Top & Bottom Sets"]),
      g("Maternity Wear", [req(colour), sizeReq, fabricReq], ["Kurti & Topwear", "Feeding Bras", "Briefs & Bottomwear"]),
    ],
  },
  {
    name: "Men", slug: "men", icon: "mens-wear",
    groups: [
      g("Top Wear", TOP, ["Summer T-Shirts", "Shirts", "T-Shirts Combos"], { popular: true }),
      g("Bottom Wear", BOTTOM, ["Jeans", "Cargos & Trousers", "Dhotis & Lungis"]),
      g("Ethnic Wear", ETHNIC, ["Kurtas", "Kurta Sets", "Nehru Jacket"]),
      g("Innerwear", INNER, ["Vests", "Briefs", "Boxers"]),
      g("Sports Wear", [req(colour), sizeReq, fabricReq, multi("features", "Features", ["Quick Dry", "Stretchable", "Moisture Wicking"])], ["Trackpants", "Tracksuits", "Gym Tshirts"]),
      g("Night Wear", [req(colour), sizeReq, fabricReq, packOf], ["Pyjamas", "Night Shorts", "Nightsuits"]),
      g("Winter Wear", TOP, ["Shrugs", "Jackets", "Sweatshirts"]),
      g("Combo Store", [req(colour), sizeReq, fabricReq, packOf], ["Rakhi Specials", "Shirts Combo", "Innerwear Combo"]),
      g("Accessories", ACCESSORY, ["Men Watches", "Wallets", "Men Jewellery", "Sunglasses & Spectacle Frames", "Belts"]),
      g("Footwear", FOOT(MEN_SHOE), ["Men Casual Shoes", "Men Sports Shoes", "Men Flip Flops and Sandals", "Men Formal Shoes", "Loafers"]),
    ],
  },
  {
    name: "Kids & Toys", slug: "kids-toys", icon: "baby",
    groups: [
      g("Kids Clothing", KIDS_WEAR, ["Girls", "Boys", "Babies", "Clothing Sets", "Frocks & Dresses", "T-Shirt & Polos"], { popular: true }),
      g("Kids Toys", TOY, [["Toys & Games", TOY_RULE], ["Perfect Gifting", TOY_RULE], ["Best Sellers", TOY_RULE], ["Baby Gears", TOY_RULE]]),
      g("Kids Accessories", ACCESSORY, ["Bags & Backpacks", "Kids Accessories", "Party Items"]),
      g("Baby Care", [...HEALTH.slice(0, 1), colour, txt("age_range", "Suitable Age")], ["Baby Bedding & Accessories", "Newborn Care", "Diapers", "Baby Mosquito Nets", "Baby Dry Sheets"]),
    ],
  },
  {
    name: "Home & Kitchen", slug: "home-kitchen", icon: "kitchen",
    groups: [
      g("Home Decor", HOME, ["Covers", "Key Holders", "Artificial Plants", "Pooja Needs", "Party Supplies", "Wallpapers & Stickers", "Showpieces & Idols", "Clocks & Wall Decor"], { popular: true }),
      g("Kitchen & Appliances", KITCHEN, ["Storage & Organizers", "Kitchen Tools", "Dinnerware", "Glasses & Barware", "Kitchen Linen"], { popular: true }),
      g("Cookware", COOKWARE, ["Pots & Pans", "Pressure Cookers", "Kadhai & Woks", "Tawa & Griddles", "Cookware Sets"], { featured: true }),
      g("Home Appliances", APPLIANCE, ["Kitchen Appliances", "Home Appliances", "Irons & Steamers", "Heaters & Fans"]),
      g("Home Textiles", TEXTILE, ["Bedsheets", "Curtains & Accessories", "Doormats & Carpets", "Pillow, Cushion & Covers", "Blankets & Comforters"], { popular: true }),
      g("Home Improvement", HOME_IMPROVE, ["Home Essentials", "Bathroom Accessories", "Cleaning Supplies", "Gardening", "Home Tools", "Insect Protection"], { popular: true }),
      g("Furniture", FURNITURE, ["Shoe Racks", "Study Tables", "Collapsible Wardrobes", "Wall Shelves", "Home Temple", "Hammock Swing"], { popular: true }),
    ],
  },
  {
    name: "Beauty & Health", slug: "beauty-health", icon: "beauty",
    groups: [
      g("Makeup", BEAUTY, ["Lipstick", "Eye Shadow and Liner", "Face Makeup", "Makeup Kits & Combos", "Hair Curlers", "Nail Makeup", "Brushes & Accessories", "Hair Removal", "Perfumes & More"], { featured: true }),
      g("Personal Care", BEAUTY, ["Body Lotion", "Hair Oil & Shampoo", "Whitening Creams", "Straighteners & Dryers", "Face Oil & Serum", "Face Wash", "Face Masks & Peels", "Soaps & Scrubs"], { popular: true }),
      g("Healthcare", HEALTH, ["Oral Care", "Winter Healthcare", "Ear Cleaner", "Health Monitor & Machines", "Foot Care", "Sexual Wellness", "Ayurveda & Nutrition", "Sanitary Pads & More"], { popular: true }),
      g("Baby & Mom", BEAUTY, ["Baby Care Essentials", "Mom Care"]),
      g("Men's Care", BEAUTY, ["Trimmers", "Beard Oil", "Men Perfumes & Deodorant", "Hair Gels, Wax & Spray", "Men's Face & Body Care", "Budget Grooming Kits"]),
    ],
  },
  {
    name: "Jewellery & Accessories", slug: "jewellery-accessories", icon: "jewelry",
    groups: [
      g("Jewellery", JEWEL, ["Jewellery Sets", "Earrings", "Mangalsutras", "Necklaces & Chains", "Bangles & Bracelets", "Anklets & Nosepins", "Kamarbandh & Maangtika"], { featured: true, popular: true }),
      g("Men Accessories", ACCESSORY, ["Men Watches", "Wallets", "Men Jewellery", "Sunglasses & Spectacle Frames", "Belts"]),
      g("Women Accessories", ACCESSORY, ["Women Watches", "Hair Accessories", "Women Belts", "Women Sunglasses & Spectacle", "Scarves, Stoles & Gloves"]),
    ],
  },
  {
    name: "Bags & Footwear", slug: "bags-footwear", icon: "footwear",
    groups: [
      g("Women Footwear", FOOT(WOMEN_SHOE), ["Heels and Sandals", "Flats", "Boots", "Flipflops & Slippers", "Bellies and Ballerinas"], { popular: true }),
      g("Men Footwear", FOOT(MEN_SHOE), ["Men Footwear", "Men Casual Shoes", "Men Sports Shoes", "Men Flip Flops and Sandals", "Men Formal Shoes", "Loafers"]),
      g("Kids Footwear", FOOT(KIDS_SHOE), ["Boys Shoes", "Girls Shoes", "Kids Casual Shoes", "Kids Flipflops & Slippers", "Kids Sandals"]),
      g("Women Bags", BAG, ["Backpacks", "Handbags", "Slingbags", "Wallets", "Clutches"]),
      g("Men Bags", BAG, ["Men Backpacks", "Waist Bags", "Crossbody Bags & Sling Bags"]),
      g("Travel Bags, Luggage and Accessories", BAG, ["Duffel & Trolley Bags", "Laptop & Messenger Bags"], { popular: true }),
    ],
  },
  {
    name: "Electronics", slug: "electronics", icon: "electronics",
    groups: [
      g("Audio & Mobiles", ELEC, ["Neckband", "Speakers", "Wired Earphone", "Bluetooth Earbuds"], { popular: true }),
      g("Accessories", ELEC, ["Cases & Covers", "Mobile Holders", ["Mobile Chargers & Cables", CRS], ["Power Banks", CRS], "Microphone", "Selfie Stick & Ringlight", "Tripod & Monopod", "Extension Cord", "Screen Expanders & Magnifiers"], { popular: true }),
    ],
  },
  {
    name: "Watches", slug: "watches", icon: "watches",
    groups: [g("Watches", WATCH, ["Analog Watches", "Digital Watches", "Sport Watches", "Couple Watch", "Bands & Boxes"], { popular: true })],
  },
  {
    name: "Sports & Fitness", slug: "sports-fitness", icon: "fitness",
    groups: [
      g("Fitness", SPORT, ["Sweat Belts", "Exercise Bands", "Tummy Trimmers", "Skipping Ropes", "Hand Grip Strengthener", "Yoga", "Fitness Accessories", "Fitness Gears"]),
      g("Sports", SPORT, ["Cricket", "Cycles & Accessories", "Skating", "Football", "Badminton", "Volleyball", "Fishing", "Swimming"], { popular: true }),
    ],
  },
  {
    name: "Car & Motorbike", slug: "car-motorbike", icon: "automotive",
    groups: [
      g("Bike & Scooty Accessories", AUTO, ["Bike LED Lights", "Bike Covers", "Bike Accessories", "Safety Gear & Clothing", "Helmets", "Scooty & Activa Accessories"]),
      g("Car Accessories", AUTO, ["Interior Accessories", "Car Care & Cleaning", "Car Repair Assistance", "Car Mobile & Holders", "Car Covers", "Car Exterior Accessories"], { popular: true }),
    ],
  },
  {
    name: "Office Supplies & Stationery", slug: "office-stationery", icon: "books",
    groups: [g("Office Supplies & Stationery", STATIONERY, ["Pens & Pencils", "Diaries & Notebooks", "Art & Craft Supplies", "Files & Desks Organizers", "Adhesives & Tapes"], { popular: true })],
  },
  {
    name: "Grocery", slug: "grocery", icon: "grocery-basket",
    groups: [g("Food & Drinks", FOOD, [["Dry Fruits", FSSAI], ["Masala and spices", FSSAI], ["Snacks and Namkeens", FSSAI], ["Pickles", FSSAI], ["Chocolates & Candies", FSSAI], ["Biscuit and cookies", FSSAI], ["Coffee", FSSAI], ["Tea", FSSAI]], { popular: true })],
  },
  {
    name: "Books", slug: "books", icon: "books",
    groups: [
      g("Fiction & Non Fiction", BOOK, ["Children's Books", "Motivational Books", "Novels", "Religious Books", "Economics & Commerce"], { popular: true }),
      g("Academic Books", BOOK, ["UPSC & Central Exam Books", "Competitive Exams Preparation", "Reference Books", "School Textbooks & Guides", "University Books & Guides"]),
    ],
  },
  {
    name: "Pet Supplies", slug: "pet-supplies", icon: "pet",
    groups: [g("Pet Supplies", PET, ["Collars & Leashes", "Clothes & Grooming", "Food & Treats", "Aquarium Accessories", "Pet Toys", "Pet Bowls"])],
  },
  {
    name: "Musical Instruments", slug: "musical-instruments", icon: "headphones",
    groups: [g("Musical Instruments", MUSIC, ["Dholaks & Drum Sets", "Piano & Keyboard", "String Instruments", "Wind Instruments", "Musical Accessories"])],
  },
];

/** Search hints for photo lookup where the tile name alone would match unrelated pictures. */
export const IMAGE_QUERY_HINTS: Record<string, string> = {
  "Georgette Sarees": "georgette saree", "Chiffon Sarees": "chiffon saree", "Cotton Sarees": "cotton saree woman", "Net Sarees": "net saree",
  "Sarees Under 299": "saree draped woman", "Silk Sarees": "silk saree", "New Collection Sarees": "saree woman fashion", "Bridal Sarees": "bridal saree",
  "Anarkali Kurtis": "anarkali kurti", "Rayon Kurtis": "kurti woman", "Cotton Kurtis": "cotton kurti", "Straight Kurtis": "straight kurti", "Long Kurtis": "long kurti",
  "Kurta Palazzo Sets": "kurta palazzo set", "Kurta Pant Sets": "kurta pant set woman", "Sharara Sets": "sharara suit", "Anarkali Kurta Sets": "anarkali suit", "Cotton Kurta Sets": "kurta set woman",
  "Cotton Sets": "dupatta set", "Rayon Sets": "dupatta", "Pakistani Dress Materials": "salwar kameez suit", "Cotton Dress Materials": "dress material fabric", "Patiala Dress Materials": "patiala suit",
  "Banarasi Dress Materials": "banarasi fabric", "Party Wear Dress Materials": "indian party wear suit", "Shoppers Favourite Lehengas": "lehenga choli", "Trending Lehengas": "lehenga",
  "Shoppers Favourite Blouses": "saree blouse", "Trending Blouses": "blouse designs indian", "Shoppers Favourite Gowns": "evening gown woman", "Trending Gowns": "gown dress woman",
  "Ethnic Skirts & Bottomwear": "long skirt ethnic", "Ethnic Jackets & Shrugs": "ethnic jacket woman", "Islamic Fashion": "abaya", "Petticoats": "petticoat saree", "Blouse Pieces": "blouse fabric", "Dupattas": "dupatta",
  "Tops & Tunics": "woman top tunic", "Dresses": "woman dress", "T-shirts": "woman t-shirt", "Gowns": "woman gown", "Tops & Bottom Sets": "woman co-ord set", "Shirts": "woman shirt", "Jumpsuits": "jumpsuit woman", "New Trends": "women fashion",
  "Jeans & Jeggings": "jeans woman", "Palazzos": "palazzo pants", "Trousers & Pants": "woman trousers", "Leggings": "leggings", "Shorts & Skirts": "skirt woman",
  "Jackets": "jacket", "Sweatshirts": "sweatshirt hoodie", "Sweaters": "sweater", "Capes, Shrug & Ponchos": "poncho", "Coats": "coat woman", "Blazers & Waistcoats": "blazer woman",
  "Plus Size - Dresses & Gowns": "plus size dress", "Plus Size - Tops & Tees": "plus size woman", "Plus Size - Bottomwear": "plus size jeans",
  "Bra & Bralettes": "bra", "Panties": "women underwear", "Lingerie Sets": "lingerie", "Shapewear": "shapewear", "Camisoles & Inners": "camisole", "Straps, Tapes & Pasties": "bra straps",
  "Women Nightsuits": "pajama set woman", "Women Nightdress": "nightdress", "Other Sleepwear": "robe sleepwear", "Sports Bottomwear": "sports leggings", "Sports Bra": "sports bra", "Top & Bottom Sets": "gym wear set",
  "Kurti & Topwear": "maternity dress", "Feeding Bras": "nursing bra", "Briefs & Bottomwear": "maternity",
  "Summer T-Shirts": "men t-shirt", "Cargos & Trousers": "cargo pants", "Dhotis & Lungis": "dhoti", "Kurtas": "men kurta", "Nehru Jacket": "nehru jacket", "Vests": "men vest", "Briefs": "men briefs", "Boxers": "boxer shorts",
  "Trackpants": "track pants", "Tracksuits": "tracksuit", "Gym Tshirts": "gym t-shirt", "Pyjamas": "pajama pants", "Night Shorts": "men shorts", "Nightsuits": "men pajamas", "Shrugs": "cardigan", "Rakhi Specials": "rakhi", "Shirts Combo": "men shirts",
  "Innerwear Combo": "men underwear", "Men Watches": "men wrist watch", "Wallets": "wallet", "Men Jewellery": "men gold chain", "Sunglasses & Spectacle Frames": "sunglasses", "Belts": "leather belt",
  "Girls": "girl child dress", "Boys": "boy child clothes", "Babies": "baby clothes", "Clothing Sets": "kids clothes", "Frocks & Dresses": "girl frock", "T-Shirt & Polos": "boy t-shirt",
  "Toys & Games": "toys", "Perfect Gifting": "gift box", "Best Sellers": "toy blocks", "Baby Gears": "baby stroller", "Bags & Backpacks": "school bag", "Kids Accessories": "kids hat", "Party Items": "party balloons",
  "Baby Bedding & Accessories": "baby bed", "Newborn Care": "newborn baby", "Diapers": "diaper", "Baby Mosquito Nets": "baby crib net", "Baby Dry Sheets": "baby blanket",
  "Covers": "sofa cover", "Key Holders": "key holder wall", "Artificial Plants": "artificial plant", "Pooja Needs": "puja thali", "Party Supplies": "party decoration", "Wallpapers & Stickers": "wall sticker", "Showpieces & Idols": "buddha statue", "Clocks & Wall Decor": "wall clock",
  "Storage & Organizers": "kitchen storage jars", "Kitchen Tools": "kitchen utensils", "Dinnerware": "dinner plates set", "Glasses & Barware": "drinking glasses", "Kitchen Linen": "kitchen towel",
  "Pots & Pans": "frying pan", "Pressure Cookers": "pressure cooker", "Kadhai & Woks": "wok", "Tawa & Griddles": "tawa", "Cookware Sets": "cookware set",
  "Kitchen Appliances": "mixer grinder", "Home Appliances": "vacuum cleaner", "Irons & Steamers": "clothes iron", "Heaters & Fans": "table fan",
  "Bedsheets": "bedsheet bed", "Curtains & Accessories": "curtains window", "Doormats & Carpets": "doormat", "Pillow, Cushion & Covers": "cushion", "Blankets & Comforters": "blanket",
  "Home Essentials": "household cleaning supplies", "Bathroom Accessories": "bathroom accessories", "Cleaning Supplies": "cleaning supplies", "Gardening": "gardening tools", "Home Tools": "hand tools toolbox", "Insect Protection": "mosquito net",
  "Shoe Racks": "shoe rack", "Study Tables": "study table", "Collapsible Wardrobes": "portable wardrobe", "Wall Shelves": "wall shelf", "Home Temple": "home temple mandir", "Hammock Swing": "hammock chair",
  "Lipstick": "lipstick", "Eye Shadow and Liner": "eye shadow palette", "Face Makeup": "face powder compact", "Makeup Kits & Combos": "makeup kit", "Hair Curlers": "hair curler", "Nail Makeup": "nail polish", "Brushes & Accessories": "makeup brushes", "Hair Removal": "epilator", "Perfumes & More": "perfume bottle",
  "Body Lotion": "body lotion bottle", "Hair Oil & Shampoo": "shampoo bottle", "Whitening Creams": "face cream jar", "Straighteners & Dryers": "hair dryer", "Face Oil & Serum": "serum bottle dropper", "Face Wash": "face wash", "Face Masks & Peels": "face mask skincare", "Soaps & Scrubs": "soap bar",
  "Oral Care": "toothbrush", "Winter Healthcare": "hot water bag", "Ear Cleaner": "ear cleaning", "Health Monitor & Machines": "blood pressure monitor", "Foot Care": "foot massager", "Sexual Wellness": "wellness", "Ayurveda & Nutrition": "ayurveda herbs", "Sanitary Pads & More": "hygiene",
  "Baby Care Essentials": "baby care products", "Mom Care": "mother baby", "Trimmers": "hair trimmer", "Beard Oil": "beard oil", "Men Perfumes & Deodorant": "deodorant", "Hair Gels, Wax & Spray": "hair gel", "Men's Face & Body Care": "men skincare", "Budget Grooming Kits": "grooming kit",
  "Jewellery Sets": "indian jewellery set", "Earrings": "earrings", "Mangalsutras": "mangalsutra", "Necklaces & Chains": "gold necklace", "Bangles & Bracelets": "bangles", "Anklets & Nosepins": "anklet", "Kamarbandh & Maangtika": "maang tikka",
  "Women Watches": "women wrist watch", "Hair Accessories": "hair clip", "Women Belts": "women belt", "Women Sunglasses & Spectacle": "sunglasses woman", "Scarves, Stoles & Gloves": "scarf",
  "Heels and Sandals": "high heels", "Flats": "ballet flats", "Boots": "boots", "Flipflops & Slippers": "flip flops", "Bellies and Ballerinas": "ballerina shoes", "Men Footwear": "men shoes", "Men Casual Shoes": "men casual shoes sneakers",
  "Men Sports Shoes": "running shoes", "Men Flip Flops and Sandals": "men sandals", "Men Formal Shoes": "oxford shoes leather", "Loafers": "loafers shoes", "Boys Shoes": "boy shoes", "Girls Shoes": "girl shoes", "Kids Casual Shoes": "kids sneakers", "Kids Flipflops & Slippers": "kids slippers", "Kids Sandals": "kids sandals",
  "Backpacks": "backpack", "Handbags": "handbag", "Slingbags": "sling bag", "Clutches": "clutch purse", "Men Backpacks": "laptop backpack", "Waist Bags": "waist bag", "Crossbody Bags & Sling Bags": "crossbody bag", "Duffel & Trolley Bags": "trolley luggage", "Laptop & Messenger Bags": "messenger bag",
  "Neckband": "bluetooth neckband", "Speakers": "bluetooth speaker", "Wired Earphone": "earphones", "Bluetooth Earbuds": "wireless earbuds", "Cases & Covers": "phone case", "Mobile Holders": "phone holder", "Mobile Chargers & Cables": "usb charger", "Power Banks": "power bank",
  "Microphone": "microphone", "Selfie Stick & Ringlight": "ring light", "Tripod & Monopod": "tripod", "Extension Cord": "extension cord", "Screen Expanders & Magnifiers": "phone screen magnifier",
  "Analog Watches": "analog wristwatch", "Digital Watches": "digital watch", "Sport Watches": "sports watch", "Couple Watch": "watches pair", "Bands & Boxes": "watch strap",
  "Sweat Belts": "waist trimmer belt", "Exercise Bands": "resistance bands", "Tummy Trimmers": "ab roller", "Skipping Ropes": "skipping rope", "Hand Grip Strengthener": "hand gripper", "Yoga": "yoga mat", "Fitness Accessories": "dumbbells", "Fitness Gears": "gym equipment",
  "Cricket": "cricket bat", "Cycles & Accessories": "bicycle", "Skating": "roller skates", "Football": "football", "Badminton": "badminton racket", "Volleyball": "volleyball", "Fishing": "fishing rod", "Swimming": "swimming goggles",
  "Bike LED Lights": "motorcycle headlight", "Bike Covers": "motorcycle cover", "Bike Accessories": "motorcycle mirror", "Safety Gear & Clothing": "riding jacket", "Helmets": "motorcycle helmet", "Scooty & Activa Accessories": "scooter",
  "Interior Accessories": "car interior", "Car Care & Cleaning": "car wash", "Car Repair Assistance": "car tool kit", "Car Mobile & Holders": "car phone holder", "Car Covers": "car cover", "Car Exterior Accessories": "car exterior",
  "Pens & Pencils": "pens pencils", "Diaries & Notebooks": "notebook diary", "Art & Craft Supplies": "craft supplies", "Files & Desks Organizers": "desk organizer", "Adhesives & Tapes": "adhesive tape",
  "Dry Fruits": "dry fruits nuts", "Masala and spices": "indian spices", "Snacks and Namkeens": "namkeen snacks", "Pickles": "pickle jar", "Chocolates & Candies": "chocolates", "Biscuit and cookies": "cookies biscuits", "Coffee": "coffee beans cup", "Tea": "tea leaves",
  "Children's Books": "children books", "Motivational Books": "self help book", "Novels": "novel book", "Religious Books": "bhagavad gita book", "Economics & Commerce": "economics textbook",
  "UPSC & Central Exam Books": "exam books", "Competitive Exams Preparation": "study books", "Reference Books": "reference books", "School Textbooks & Guides": "school textbooks", "University Books & Guides": "university textbooks",
  "Collars & Leashes": "dog collar leash", "Clothes & Grooming": "dog clothes", "Food & Treats": "dog food", "Aquarium Accessories": "aquarium", "Pet Toys": "dog toy", "Pet Bowls": "pet bowl",
  "Dholaks & Drum Sets": "dholak", "Piano & Keyboard": "electronic keyboard", "String Instruments": "acoustic guitar", "Wind Instruments": "flute", "Musical Accessories": "guitar accessories",
};

// ── final shape for the seed script ─────────────────────────
const build = (d: DeptIn): DepartmentDef => ({
  name: d.name,
  slug: d.slug,
  icon: d.icon,
  attrs: d.attrs || [],
  groups: d.groups.map((grp): GroupDef => ({
    name: grp.name,
    attrs: grp.attrs,
    featured: grp.featured,
    popular: grp.popular,
    items: grp.leaves.map((l): LeafDef => {
      const [name, rule] = typeof l === "string" ? [l, undefined] : l;
      const file = imageFileFor(d.name, grp.name, name);
      return { name, rule, image: hasImage(file) ? `/${file}` : undefined };
    }),
  })),
});

export const MARKETPLACE_DEPARTMENTS: DepartmentDef[] = DEPTS.map(build);

/** Every tile with the file its photo should be saved as and a search phrase — read by the image fetcher. */
export const imageManifest = () =>
  DEPTS.flatMap((d) =>
    d.groups.flatMap((grp) =>
      grp.leaves.map((l) => {
        const name = typeof l === "string" ? l : l[0];
        return { department: d.name, group: grp.name, name, file: imageFileFor(d.name, grp.name, name), query: IMAGE_QUERY_HINTS[name] || name };
      })
    )
  );
