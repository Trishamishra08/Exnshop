/**
 * Upsert ExnShop Terms & Conditions + Refund Policy into MongoDB.
 * Run: npx tsx src/scripts/seedExnshopTermsPolicy.ts
 */
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Policy from "../models/Policy";
import AppSettings from "../models/AppSettings";
import {
  EXNSHOP_TERMS_AND_CONDITIONS,
  EXNSHOP_REFUND_POLICY,
} from "../constants/exnshopTermsPolicy";

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function seed() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  let policy = await Policy.findOne({ type: "customer" }).sort({ createdAt: -1 });
  if (policy) {
    policy.title = "Terms & Conditions";
    policy.content = EXNSHOP_TERMS_AND_CONDITIONS;
    policy.version = "2.1";
    policy.isActive = true;
    await policy.save();
    console.log("Updated Terms & Conditions:", policy._id);
  } else {
    policy = await Policy.create({
      type: "customer",
      title: "Terms & Conditions",
      content: EXNSHOP_TERMS_AND_CONDITIONS,
      version: "2.1",
      isActive: true,
    });
    console.log("Created Terms & Conditions:", policy._id);
  }

  let settings = await AppSettings.findOne();
  if (!settings) {
    settings = await AppSettings.create({
      appName: "Exnshop",
      appLogo: "/exnshop_logo.png",
      contactEmail: "support@exnshop.in",
      contactPhone: "6399376602",
      termsOfService: EXNSHOP_TERMS_AND_CONDITIONS,
      returnPolicy: EXNSHOP_REFUND_POLICY,
      refundPolicy: EXNSHOP_REFUND_POLICY,
      customerAppPolicy: EXNSHOP_TERMS_AND_CONDITIONS,
    });
    console.log("Created AppSettings with Terms + Refund Policy");
  } else {
    settings.termsOfService = EXNSHOP_TERMS_AND_CONDITIONS;
    settings.customerAppPolicy = EXNSHOP_TERMS_AND_CONDITIONS;
    settings.returnPolicy = EXNSHOP_REFUND_POLICY;
    settings.refundPolicy = EXNSHOP_REFUND_POLICY;
    await settings.save();
    console.log("Updated AppSettings refundPolicy / termsOfService");
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
