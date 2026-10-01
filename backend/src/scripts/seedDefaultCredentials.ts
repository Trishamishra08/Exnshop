/**
 * seedDefaultCredentials.ts
 * Creates/updates the three default demo accounts:
 *   User     : exnshop@gmail.com        / 9999999999  (OTP 123456)
 *   Seller   : exnshopseller@gmail.com  / 9999999999  (OTP 123456)
 *   Delivery : exnshopdriver@gmail.com  / 9999999999  (OTP 123456)
 *
 * Run:  npx ts-node -r tsconfig-paths/register src/scripts/seedDefaultCredentials.ts
 */
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI missing in .env');
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;

  const pwHash = await bcrypt.hash('Demo@123', 10);

  // ─── 1. Customer / User ───────────────────────────────────────────────────
  const userResult = await db.collection('customers').updateOne(
    { email: 'exnshop@gmail.com' },
    {
      $set: {
        email: 'exnshop@gmail.com',
        phone: '9999999999',
        name: 'Exnshop Demo User',
        status: 'Active',
        walletAmount: 0,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
        refCode: 'EXNDEMO',
        preferredLanguage: 'en',
        languageSelected: true,
      },
    },
    { upsert: true }
  );
  console.log('Customer upsert:', userResult.upsertedId ? 'CREATED' : 'UPDATED');

  // ─── 2. Seller ────────────────────────────────────────────────────────────
  const sellerResult = await db.collection('sellers').updateOne(
    { email: 'exnshopseller@gmail.com' },
    {
      $set: {
        sellerName: 'Exnshop Demo Seller',
        storeName: 'Exnshop Demo Store',
        email: 'exnshopseller@gmail.com',
        mobile: '9999999999',
        password: pwHash,
        category: 'Grocery',
        categories: ['Grocery', 'Fruits & Vegetables'],
        city: 'Indore',
        address: 'Chhoti Gwaltoli, Indore, MP 452001',
        status: 'Approved',
        isShopOpen: true,
        serviceRadiusKm: 500,
        latitude: '22.717650',
        longitude: '75.871860',
        location: { type: 'Point', coordinates: [75.87186, 22.71765] },
        requireProductApproval: false,
        viewCustomerDetails: true,
        commission: 0,
        balance: 0,
        onHoldBalance: 0,
        categoryCommissions: [],
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
        fcmTokens: [],
        fcmTokenMobile: [],
      },
    },
    { upsert: true }
  );
  console.log('Seller upsert:', sellerResult.upsertedId ? 'CREATED' : 'UPDATED');

  // ─── 3. Delivery / Driver ─────────────────────────────────────────────────
  const deliveryResult = await db.collection('deliveries').updateOne(
    { email: 'exnshopdriver@gmail.com' },
    {
      $set: {
        name: 'Exnshop Demo Driver',
        email: 'exnshopdriver@gmail.com',
        mobile: '9999999999',
        password: pwHash,
        address: 'Indore City, Madhya Pradesh',
        city: 'Indore',
        pincode: '452001',
        status: 'Active',
        isOnline: true,
        available: 'Available',
        vehicleType: 'Bike',
        vehicleNumber: 'MP09-EX-9999',
        balance: 0,
        cashCollected: 0,
        pendingAdminPayout: 0,
        location: { type: 'Point', coordinates: [75.87186, 22.71765] },
        settings: { notifications: true, location: true, sound: true },
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
        fcmTokens: [],
        fcmTokenMobile: [],
      },
    },
    { upsert: true }
  );
  console.log('Delivery upsert:', deliveryResult.upsertedId ? 'CREATED' : 'UPDATED');

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\n✅ Default credentials ready:');
  console.log('  User     : exnshop@gmail.com        | mobile: 9999999999 | OTP: 123456');
  console.log('  Seller   : exnshopseller@gmail.com  | mobile: 9999999999 | OTP: 123456');
  console.log('  Delivery : exnshopdriver@gmail.com  | mobile: 9999999999 | OTP: 123456');

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
