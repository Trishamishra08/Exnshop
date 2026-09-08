/**
 * Seed ExnShop About Us + company contact into AppSettings.
 * Run: npx tsx src/scripts/seedExnshopAbout.ts
 * Source: https://www.exnshop.in/about
 */
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import AppSettings from "../models/AppSettings";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const ABOUT_US = {
  missionText: `ExnShop was founded to solve a problem every Indian trader knows: sourcing at the right price, in the right quantity, with paperwork that actually holds up. Informal WhatsApp orders and scattered price lists make wholesale slow, opaque and hard to reconcile at tax time.

We built ExnShop to bring structure to that chaos. Sellers list goods with transparent MOQ and tier pricing; buyers source with confidence knowing every order is backed by KYC verification, GST-compliant invoicing and secure payments through Razorpay. From a single cart to bulk repeat orders, the experience is designed for the rhythm of B2B.

Today ExnShop serves businesses across 28 states, with fintech services layered on top so our partners can move money, recharge and pay bills without leaving the platform they already trust.`,
  whatWeDoText:
    "ExnShop is a B2B marketplace where verified sellers list goods with transparent MOQ and tier pricing, and buyers source with GST-compliant invoicing and secure Razorpay payments — plus fintech services like DMT, AEPS, RECHARGE and BBPS on one platform.",
  stats: [
    { value: "28", label: "States Served" },
    { value: "B2B", label: "Marketplace" },
    { value: "GST", label: "Compliant Invoicing" },
    { value: "KYC", label: "Verified Sellers" },
  ],
  whyChooseUs: [
    {
      title: "GST-compliant by design",
      description:
        "Every order generates a valid tax invoice with HSN-coded GST calculation, so your books stay clean and audit-ready.",
    },
    {
      title: "Built for wholesale",
      description:
        "MOQ enforcement and tier pricing let manufacturers, distributors and retailers trade at the right volume and the right price.",
    },
    {
      title: "Verified sellers only",
      description:
        "KYC-verified sellers, admin-controlled approvals and seller controls keep the marketplace trustworthy for every buyer.",
    },
    {
      title: "One platform, many services",
      description:
        "From sourcing to fintech services like DMT, AEPS, RECHARGE and BBPS — ExnShop supports the full B2B journey.",
    },
  ],
};

async function seed() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  let settings = await AppSettings.findOne();
  if (!settings) {
    settings = await AppSettings.create({
      appName: "Exnshop",
      appLogo: "/exnshop_logo.png",
      contactEmail: "support@exnshop.in",
      contactPhone: "6399376602",
      supportEmail: "support@exnshop.in",
      supportPhone: "6399376602",
      companyAddress: "C 119 Sector 2, Noida, Gautam Buddha Nagar, Uttar Pradesh, India, 201301",
      companyCity: "Noida",
      companyState: "Uttar Pradesh",
      companyCountry: "India",
      companyPincode: "201301",
      aboutUs: ABOUT_US,
    });
    console.log("Created AppSettings with About Us");
  } else {
    settings.appName = settings.appName || "Exnshop";
    settings.contactEmail = "support@exnshop.in";
    settings.supportEmail = "support@exnshop.in";
    settings.contactPhone = "6399376602";
    settings.supportPhone = "6399376602";
    settings.companyAddress =
      "C 119 Sector 2, Noida, Gautam Buddha Nagar, Uttar Pradesh, India, 201301";
    settings.companyCity = "Noida";
    settings.companyState = "Uttar Pradesh";
    settings.companyCountry = "India";
    settings.companyPincode = "201301";
    settings.aboutUs = ABOUT_US as any;
    await settings.save();
    console.log("Updated AppSettings About Us + registered office");
  }

  await mongoose.disconnect();
  console.log("Done.");
}

seed().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
