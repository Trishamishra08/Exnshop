/**
 * Full database reset — clears EVERY collection except Admin accounts
 * (so you're never locked out of the admin panel). This includes catalog/
 * reference data that the lighter `freshDatabaseReset.ts` deliberately
 * preserved: Category, SubCategory, HeaderCategory, Brand, Tax, Courier,
 * Policy, FAQ, Role, SupportedLanguage, HomeSection, PromoStrip,
 * BestsellerCard, LowestPricesProduct, Shop, DeliveryArea, RtoPromoBanner,
 * UITranslation, TranslationCache, AppSettings.
 *
 * AppSettings self-heals with sane defaults on next read (see
 * AppSettings.getSettings()), so clearing it is safe.
 *
 * A JSON backup of every cleared collection is written to
 * backend/backups/<timestamp>/ before anything is deleted.
 *
 * Usage: npx tsx src/scripts/fullDatabaseReset.ts
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
dotenv.config({ path: path.join(__dirname, "../../.env") });

import mongoose from "mongoose";

import Customer from "../models/Customer";
import Seller from "../models/Seller";
import Delivery from "../models/Delivery";
import Product from "../models/Product";
import Inventory from "../models/Inventory";
import Order from "../models/Order";
import OrderItem from "../models/OrderItem";
import Cart from "../models/Cart";
import CartItem from "../models/CartItem";
import Address from "../models/Address";
import Wishlist from "../models/Wishlist";
import Review from "../models/Review";
import Commission from "../models/Commission";
import Payment from "../models/Payment";
import Refund from "../models/Refund";
import WalletTransaction from "../models/WalletTransaction";
import PlatformWallet from "../models/PlatformWallet";
import CashCollection from "../models/CashCollection";
import WithdrawRequest from "../models/WithdrawRequest";
import Return from "../models/Return";
import Claim from "../models/Claim";
import RTOEvent from "../models/RTOEvent";
import Campaign from "../models/Campaign";
import Coupon from "../models/Coupon";
import Notification from "../models/Notification";
import Otp from "../models/Otp";
import EmailOtp from "../models/EmailOtp";
import DeliveryAssignment from "../models/DeliveryAssignment";
import DeliveryOrderOffer from "../models/DeliveryOrderOffer";
import DeliveryTracking from "../models/DeliveryTracking";
import SupportTicket from "../models/SupportTicket";
import CustomerSupportRequest from "../models/CustomerSupportRequest";

// Previously-kept static/reference data — now included too, per explicit request.
import Category from "../models/Category";
import SubCategory from "../models/SubCategory";
import HeaderCategory from "../models/HeaderCategory";
import Brand from "../models/Brand";
import Tax from "../models/Tax";
import Courier from "../models/Courier";
import Policy from "../models/Policy";
import FAQ from "../models/FAQ";
import Role from "../models/Role";
import SupportedLanguage from "../models/SupportedLanguage";
import HomeSection from "../models/HomeSection";
import PromoStrip from "../models/PromoStrip";
import BestsellerCard from "../models/BestsellerCard";
import LowestPricesProduct from "../models/LowestPricesProduct";
import Shop from "../models/Shop";
import DeliveryArea from "../models/DeliveryArea";
import RtoPromoBanner from "../models/RtoPromoBanner";
import UITranslation from "../models/UITranslation";
import TranslationCache from "../models/TranslationCache";
import AppSettings from "../models/AppSettings";

// NOT included: Admin (kept, so login still works).

const MODELS_TO_CLEAR: Array<{ name: string; model: mongoose.Model<any> }> = [
  { name: "Customer", model: Customer },
  { name: "Seller", model: Seller },
  { name: "Delivery", model: Delivery },
  { name: "Product", model: Product },
  { name: "Inventory", model: Inventory },
  { name: "Order", model: Order },
  { name: "OrderItem", model: OrderItem },
  { name: "Cart", model: Cart },
  { name: "CartItem", model: CartItem },
  { name: "Address", model: Address },
  { name: "Wishlist", model: Wishlist },
  { name: "Review", model: Review },
  { name: "Commission", model: Commission },
  { name: "Payment", model: Payment },
  { name: "Refund", model: Refund },
  { name: "WalletTransaction", model: WalletTransaction },
  { name: "PlatformWallet", model: PlatformWallet },
  { name: "CashCollection", model: CashCollection },
  { name: "WithdrawRequest", model: WithdrawRequest },
  { name: "Return", model: Return },
  { name: "Claim", model: Claim },
  { name: "RTOEvent", model: RTOEvent },
  { name: "Campaign", model: Campaign },
  { name: "Coupon", model: Coupon },
  { name: "Notification", model: Notification },
  { name: "Otp", model: Otp },
  { name: "EmailOtp", model: EmailOtp },
  { name: "DeliveryAssignment", model: DeliveryAssignment },
  { name: "DeliveryOrderOffer", model: DeliveryOrderOffer },
  { name: "DeliveryTracking", model: DeliveryTracking },
  { name: "SupportTicket", model: SupportTicket },
  { name: "CustomerSupportRequest", model: CustomerSupportRequest },
  { name: "Category", model: Category },
  { name: "SubCategory", model: SubCategory },
  { name: "HeaderCategory", model: HeaderCategory },
  { name: "Brand", model: Brand },
  { name: "Tax", model: Tax },
  { name: "Courier", model: Courier },
  { name: "Policy", model: Policy },
  { name: "FAQ", model: FAQ },
  { name: "Role", model: Role },
  { name: "SupportedLanguage", model: SupportedLanguage },
  { name: "HomeSection", model: HomeSection },
  { name: "PromoStrip", model: PromoStrip },
  { name: "BestsellerCard", model: BestsellerCard },
  { name: "LowestPricesProduct", model: LowestPricesProduct },
  { name: "Shop", model: Shop },
  { name: "DeliveryArea", model: DeliveryArea },
  { name: "RtoPromoBanner", model: RtoPromoBanner },
  { name: "UITranslation", model: UITranslation },
  { name: "TranslationCache", model: TranslationCache },
  { name: "AppSettings", model: AppSettings },
];

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI / MONGO_URI missing in backend/.env");

  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  console.log(`Connected to: ${mongoose.connection.db!.databaseName}\n`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(__dirname, "../../backups", `full-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`Backing up ${MODELS_TO_CLEAR.length} collections to ${backupDir} ...\n`);

  let totalBackedUp = 0;
  for (const { name, model } of MODELS_TO_CLEAR) {
    const docs = await model.find({}).lean();
    fs.writeFileSync(path.join(backupDir, `${name}.json`), JSON.stringify(docs, null, 2));
    totalBackedUp += docs.length;
    console.log(`  Backed up ${name}: ${docs.length} document(s)`);
  }
  console.log(`\nBackup complete: ${totalBackedUp} total documents saved.\n`);

  console.log("Clearing collections...\n");
  let totalDeleted = 0;
  for (const { name, model } of MODELS_TO_CLEAR) {
    const res = await model.deleteMany({});
    totalDeleted += res.deletedCount || 0;
    console.log(`  Cleared ${name}: ${res.deletedCount} document(s) deleted`);
  }

  console.log(`\n✅ Done. ${totalDeleted} total documents deleted.`);
  console.log(`Backup saved at: ${backupDir}`);
  console.log("\nOnly Admin accounts were left untouched — everything else is now empty.");

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
