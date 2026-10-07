import dotenv from "dotenv";
import connectDB from "../config/db";
import HeaderCategory from "../models/HeaderCategory";

dotenv.config();

async function main() {
  await connectDB();

  const before = await HeaderCategory.countDocuments();
  console.log(`HeaderCategory documents before: ${before}`);

  const result = await HeaderCategory.deleteMany({});
  console.log(`Deleted: ${result.deletedCount}`);

  const after = await HeaderCategory.countDocuments();
  console.log(`HeaderCategory documents after: ${after}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to clear header categories:", err);
  process.exit(1);
});
