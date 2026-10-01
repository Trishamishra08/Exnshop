// seedDefaultCredentials.js
// Run: node seedDefaultCredentials.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI missing in .env');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const pwHash = await bcrypt.hash('Demo@123', 10);

  // ── 1. Customer ──
  const dollarSet = '$set';
  const dollarSetOnInsert = '$setOnInsert';

  await db.collection('customers').updateOne(
    { email: 'exnshop@gmail.com' },
    {
      [dollarSet]: { email: 'exnshop@gmail.com', phone: '9999999999', name: 'Exnshop Demo User', status: 'Active', walletAmount: 0, updatedAt: new Date() },
      [dollarSetOnInsert]: { createdAt: new Date(), refCode: 'EXNDEMO', preferredLanguage: 'en', languageSelected: true },
    },
    { upsert: true }
  );
  console.log('✅ Customer seeded: exnshop@gmail.com');

  // ── 2. Seller ──
  await db.collection('sellers').updateOne(
    { email: 'exnshopseller@gmail.com' },
    {
      [dollarSet]: {
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
      [dollarSetOnInsert]: { createdAt: new Date(), fcmTokens: [], fcmTokenMobile: [] },
    },
    { upsert: true }
  );
  console.log('✅ Seller seeded: exnshopseller@gmail.com');

  // ── 3. Delivery ──
  await db.collection('deliveries').updateOne(
    { email: 'exnshopdriver@gmail.com' },
    {
      [dollarSet]: {
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
      [dollarSetOnInsert]: { createdAt: new Date(), fcmTokens: [], fcmTokenMobile: [] },
    },
    { upsert: true }
  );
  console.log('✅ Delivery seeded: exnshopdriver@gmail.com');

  console.log('\n🎉 All done! Default demo credentials:');
  console.log('   User     : exnshop@gmail.com        | OTP: 123456');
  console.log('   Seller   : exnshopseller@gmail.com  | OTP: 123456');
  console.log('   Delivery : exnshopdriver@gmail.com  | OTP: 123456');

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('Error:', e.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
