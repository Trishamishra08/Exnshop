import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "../dist");
const indexHtml = path.join(dist, "index.html");
const publicHtaccess = path.resolve(__dirname, "../public/.htaccess");

if (!fs.existsSync(indexHtml)) {
  console.error("spa-fallback: dist/index.html missing — run vite build first");
  process.exit(1);
}

const html = fs.readFileSync(indexHtml, "utf8");

// Remove SPA-as-404.html if a previous build created it.
// Hostinger serves 404.html for ANY missing file (including .js), which causes:
// "Failed to load module script ... MIME type of text/html"
const spaAs404 = path.join(dist, "404.html");
if (fs.existsSync(spaAs404)) {
  fs.unlinkSync(spaAs404);
}

// Physical folders so DirectoryIndex can serve the SPA when rewrite is limited.
// Dynamic segments (/product/:id, /orders/:id) still need .htaccess rewrite.
const stubs = [
  "admin",
  "admin/login",
  "seller",
  "seller/login",
  "seller/signup",
  "seller/under-review",
  "delivery",
  "delivery/login",
  "delivery/signup",
  "delivery/under-review",
  "login",
  "language-selection",
  "user",
  "user/home",
  "search",
  "orders",
  "order-again",
  "account",
  "account/wallet",
  "notifications",
  "about-us",
  "privacy-policy",
  "terms-and-conditions",
  "refund-policy",
  "customer-policy",
  "faq",
  "wishlist",
  "categories",
  "address-book",
  "checkout",
  "checkout/address",
  "cart",
  "addresses",
  "store",
  "store/spiritual",
  "store/pharma",
  "store/e-gifts",
  "store/pet",
  "store/sports",
  "store/fashion-basics",
  "store/toy",
  "store/hobby",
];

for (const stub of stubs) {
  const dir = path.join(dist, stub);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

if (!fs.existsSync(publicHtaccess)) {
  console.error("spa-fallback: public/.htaccess missing");
  process.exit(1);
}
fs.copyFileSync(publicHtaccess, path.join(dist, ".htaccess"));

const assetsDir = path.join(dist, "assets");
if (!fs.existsSync(assetsDir)) {
  console.error("spa-fallback: dist/assets missing — build output incomplete");
  process.exit(1);
}

const assetCount = fs.readdirSync(assetsDir).length;
if (assetCount < 1) {
  console.error("spa-fallback: dist/assets is empty");
  process.exit(1);
}

if (!fs.existsSync(path.join(dist, ".htaccess"))) {
  console.error("spa-fallback: missing dist/.htaccess");
  process.exit(1);
}

// Help verify deploy: these exact names must exist on the server after upload
const entryRefs = [...html.matchAll(/\/assets\/(index-[A-Za-z0-9_-]+\.(?:js|css))/g)].map(
  (m) => m[1]
);

console.log(
  `spa-fallback: Hostinger ready — .htaccess, ${stubs.length} route stubs, ${assetCount} assets`
);
console.log(`spa-fallback: entry assets → ${[...new Set(entryRefs)].join(", ")}`);
