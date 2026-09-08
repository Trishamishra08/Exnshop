import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "../dist");
const indexHtml = path.join(dist, "index.html");

if (!fs.existsSync(indexHtml)) {
  console.error("spa-fallback: dist/index.html missing — run vite build first");
  process.exit(1);
}

// LiteSpeed / static hosts often use 404.html as SPA fallback
fs.copyFileSync(indexHtml, path.join(dist, "404.html"));

// Physical entry folders so /admin /seller /delivery work even when
// rewrite rules are missing (common on Hostinger when empty dirs exist).
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
];

for (const stub of stubs) {
  const dir = path.join(dist, stub);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(indexHtml, path.join(dir, "index.html"));
}

// Ensure .htaccess is present (Vite copies public/, but assert anyway)
const htaccessSrc = path.resolve(__dirname, "../public/.htaccess");
const htaccessDest = path.join(dist, ".htaccess");
if (fs.existsSync(htaccessSrc)) {
  fs.copyFileSync(htaccessSrc, htaccessDest);
}

console.log(`spa-fallback: wrote 404.html + ${stubs.length} panel entry stubs`);
