/**
 * Adds exnshoptechnology@gmail.com as a Super Admin (login: email + OTP sent
 * over SMTP). Safe to re-run: an existing account is left as it is.
 * Usage: npx tsx src/scripts/addTechAdmin.ts
 */
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
dotenv.config({ path: path.join(__dirname, "../../.env") });
import mongoose from "mongoose";
import Admin from "../models/Admin";

const EMAIL = "exnshoptechnology@gmail.com";

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const existing = await Admin.findOne({ email: EMAIL });
  if (existing) {
    console.log(`Admin ${EMAIL} already exists (role: ${existing.role}).`);
  } else {
    await Admin.create({
      firstName: "Exnshop",
      lastName: "Technology",
      email: EMAIL,
      mobile: "9000000003", // placeholder — update in Admin Profile
      role: "Super Admin",
      password: crypto.randomBytes(24).toString("base64url"), // OTP login; no shared password
    });
    console.log(`Created Super Admin ${EMAIL}.`);
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
