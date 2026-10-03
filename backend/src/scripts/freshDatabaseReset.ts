/**
 * Resets the database for a fresh testing round: clears all transactional /
 * user-generated data, leaves static/reference data untouched.
 *
 * KEPT (never touched): Admin, Category, SubCategory, HeaderCategory, Brand,
 * Tax, AppSettings, Courier, Policy, FAQ, Role, SupportedLanguage,
 * HomeSection, PromoStrip, BestsellerCard, LowestPricesProduct, Shop,
 * DeliveryArea, RtoPromoBanner, UITranslation, TranslationCache.
 *
 * CLEARED: Customer, Seller, Delivery, Product, Inventory, Order, OrderItem,
 * Cart, CartItem, Address, Wishlist, Review, Commission, Payment, Refund,
 * WalletTransaction, PlatformWallet, CashCollection, WithdrawRequest, Return,
 * Claim, RTOEvent, Campaign, Coupon, Notification, Otp, EmailOtp,
 * DeliveryAssignment, DeliveryOrderOffer, DeliveryTracking, SupportTicket,
 * CustomerSupportRequest.
 *
 * A JSON backup of every cleared collection is written to
 * backend/backups/<timestamp>/ before anything is deleted.
 *
 * Usage: npx tsx src/scripts/freshDatabaseReset.ts
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
];

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI / MONGO_URI missing in backend/.env");

  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  console.log(`Connected to: ${mongoose.connection.db!.databaseName}\n`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(__dirname, "../../backups", timestamp);
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
  console.log("\nStatic/reference data (Category, Brand, Tax, AppSettings, Admin, etc.) was left untouched.");

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
