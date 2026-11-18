/**
 * Creates/updates a test admin: admin@gmail.com / 123456 (Super Admin).
 * Usage: npx tsx src/scripts/seedTestAdmin.ts
 * WARNING: weak password - delete or change it before real users go live.
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../../.env") });
import mongoose from "mongoose";
import Admin from "../models/Admin";

const EMAIL = "admin@gmail.com";

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  let admin = await Admin.findOne({ email: EMAIL });
  if (!admin) {
    admin = new Admin({ firstName: "Test", lastName: "Admin", email: EMAIL, mobile: "9000000004", role: "Super Admin", password: "123456" });
  } else {
    admin.password = "123456"; // hashed by the model's pre-save hook
  }
  await admin.save();
  console.log(`Test admin ready: ${EMAIL} (${admin.role})`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
