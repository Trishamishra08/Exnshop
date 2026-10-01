// seedDefaultCredentials3.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI missing');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const pwHash = await bcrypt.hash('Demo@123', 10);
  const dollarSet = '$set';
  const dollarSetOnInsert = '$setOnInsert';

  // ── 1. Seller: update existing mobile 9999999999 seller to use exnshopseller@gmail.com ──
  const existingSeller = await db.collection('sellers').findOne({ mobile: '9999999999' });
  console.log('Existing seller with 9999999999:', existingSeller ? existingSeller.email : 'none');

  await db.collection('sellers').updateOne(
    { mobile: '9999999999' },
    {
      [dollarSet]: {
        email: 'exnshopseller@gmail.com',
        sellerName: existingSeller?.sellerName || 'Exnshop Demo Seller',
        storeName: existingSeller?.storeName || 'Exnshop Demo Store',
        password: pwHash,
        status: 'Approved',
        isShopOpen: true,
        serviceRadiusKm: 500,
        location: { type: 'Point', coordinates: [75.87186, 22.71765] },
        updatedAt: new Date(),
      },
    }
  );
  console.log('✅ Seller updated: mobile 9999999999 -> email exnshopseller@gmail.com');

  // ── 2. Delivery ──
  const existingDelivery = await db.collection('deliveries').findOne({ mobile: '9999999999' });
  console.log('Existing delivery with 9999999999:', existingDelivery ? existingDelivery.email : 'none');

  if (existingDelivery) {
    await db.collection('deliveries').updateOne(
      { mobile: '9999999999' },
      {
        [dollarSet]: {
          email: 'exnshopdriver@gmail.com',
          status: 'Active',
          isOnline: true,
          available: 'Available',
          updatedAt: new Date(),
        },
      }
    );
    console.log('✅ Delivery updated: mobile 9999999999 -> email exnshopdriver@gmail.com');
  } else {
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
  }

  // Summary
  const customer = await db.collection('customers').findOne({ phone: '9999999999' }, { projection: { email: 1, phone: 1 } });
  const seller = await db.collection('sellers').findOne({ mobile: '9999999999' }, { projection: { email: 1, mobile: 1, status: 1 } });
  const delivery = await db.collection('deliveries').findOne({ mobile: '9999999999' }, { projection: { email: 1, mobile: 1, status: 1 } });

  console.log('\n📋 Final State:');
  console.log('  Customer :', customer?.email, '| phone:', customer?.phone);
  console.log('  Seller   :', seller?.email, '| mobile:', seller?.mobile, '| status:', seller?.status);
  console.log('  Delivery :', delivery?.email, '| mobile:', delivery?.mobile, '| status:', delivery?.status);
  console.log('\n🎉 All demo accounts ready! Use OTP 123456 to login.');

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('Error:', e.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
