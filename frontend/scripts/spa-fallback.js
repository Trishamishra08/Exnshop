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

// Hostinger serves 404.html for missing paths when rewrite fails / ErrorDocument fires
fs.writeFileSync(path.join(dist, "404.html"), html);

// Physical folders so DirectoryIndex can serve the SPA even if rewrite is off.
// Dynamic segments (/product/:id, /orders/:id, etc.) still need .htaccess or 404.html.
const stubs = [
  // Panels
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
  // Customer / shared static routes
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

// Vite copies public/.htaccess, but assert + overwrite so deploy always has it
if (!fs.existsSync(publicHtaccess)) {
  console.error("spa-fallback: public/.htaccess missing");
  process.exit(1);
}
fs.copyFileSync(publicHtaccess, path.join(dist, ".htaccess"));

// Sanity check — fail the build if Hostinger essentials are missing
const required = [".htaccess", "404.html", "index.html"];
for (const file of required) {
  if (!fs.existsSync(path.join(dist, file))) {
    console.error(`spa-fallback: missing required file dist/${file}`);
    process.exit(1);
  }
}

console.log(
  `spa-fallback: Hostinger ready — 404.html, .htaccess, ${stubs.length} route stubs`
);
