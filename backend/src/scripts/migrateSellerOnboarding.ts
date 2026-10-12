/**
 * One-time, idempotent migration of pre-onboarding sellers onto the
 * onboarding/KYC status model. Only touches sellers without onboardingStatus.
 *   npx tsx src/scripts/migrateSellerOnboarding.ts
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import Seller from "../models/Seller";
import Product from "../models/Product";
import { auditSeller, effectiveStatus, setOnboardingStatus } from "../services/sellerOnboardingService";

dotenv.config();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const sellers = await Seller.find({ onboardingStatus: { $exists: false } });
  const summary: Record<string, number> = {};

  for (const seller of sellers) {
    const before = seller.status;
    let next = effectiveStatus(seller);

    if (seller.status === "Approved") {
      const approved = { status: "Approved", remarks: "Approved before KYC onboarding existed", reviewedAt: new Date() };
      seller.onboardingReview = { business: approved, kyc: approved, bank: approved, store: approved } as any;
      const hasBank = Boolean(seller.accountNumber && seller.ifsc);
      seller.bankVerificationStatus = hasBank ? "Verified" : "Unverified";
      seller.bankVerificationMethod = hasBank ? "Legacy" : undefined;
      if (await Product.exists({ seller: seller._id, status: "Active", publish: true })) next = "Active";
    }

    setOnboardingStatus(seller, next);
    await seller.save({ validateBeforeSave: false });
    await auditSeller({
      sellerId: seller._id,
      actorType: "System",
      action: "MIGRATED_TO_ONBOARDING",
      changes: [{ field: "status", from: before, to: next }],
    });
    summary[next] = (summary[next] || 0) + 1;
  }

  console.log(`Migrated ${sellers.length} seller(s):`, summary);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
