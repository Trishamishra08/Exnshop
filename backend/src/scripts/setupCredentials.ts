import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function setupCredentials() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(uri!);
  const db = mongoose.connection.db;

  // 1. Admin Account (schema requires firstName/lastName)
  const adminPasswordHash = await bcrypt.hash('Admin@123', 10);
  await db.collection('admins').updateOne(
    { email: 'admin@exnshop.com' },
    {
      $set: {
        firstName: 'Exnshop',
        lastName: 'Admin',
        email: 'admin@exnshop.com',
        mobile: '9000000001',
        password: adminPasswordHash,
        role: 'Super Admin',
        status: 'Active',
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
  await db.collection('admins').updateOne(
    { email: 'admin@olovely.com' },
    {
      $set: {
        firstName: 'Exnshop',
        lastName: 'Admin',
        email: 'admin@olovely.com',
        mobile: '9876543210',
        password: adminPasswordHash,
        role: 'Super Admin',
        status: 'Active',
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
  console.log('✅ Admin: admin@exnshop.com / Admin@123');

  // 2. Seller Account
  const sellerPasswordHash = await bcrypt.hash('Seller@123', 10);
  await db.collection('sellers').updateOne(
    { email: 'seller@exnshop.com' },
    {
      $set: {
        sellerName: 'Exnshop Supermart',
        storeName: 'Exnshop Supermart',
        email: 'seller@exnshop.com',
        mobile: '9999999999',
        password: sellerPasswordHash,
        category: 'Grocery',
        city: 'Indore',
        address: 'Indore City, Madhya Pradesh, 452001',
        status: 'Approved',
        isShopOpen: true,
        serviceRadiusKm: 500,
        latitude: '22.717650',
        longitude: '75.871860',
        location: {
          type: 'Point',
          coordinates: [75.871860, 22.717650]
        },
        requireProductApproval: false,
        viewCustomerDetails: true,
        commission: 0,
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
  console.log('✅ Seller: seller@exnshop.com / Seller@123 (mobile: 9999999999)');

  // 3. Delivery partner (correct collection: deliveries)
  const deliveryPasswordHash = await bcrypt.hash('Delivery@123', 10);
  await db.collection('deliveries').updateOne(
    { mobile: '9888888888' },
    {
      $set: {
        name: 'Exnshop Delivery Partner',
        email: 'delivery@exnshop.com',
        mobile: '9888888888',
        password: deliveryPasswordHash,
        address: 'Indore City, Madhya Pradesh',
        city: 'Indore',
        status: 'Active',
        isOnline: true,
        available: 'Available',
        vehicleType: 'Bike',
        vehicleNumber: 'MP09-EX-1234',
        balance: 0,
        cashCollected: 0,
        pendingAdminPayout: 0,
        location: { type: 'Point', coordinates: [75.87186, 22.71765] },
        settings: { notifications: true, location: true, sound: true },
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
  console.log('✅ Delivery: delivery@exnshop.com / Delivery@123 (mobile: 9888888888)');

  // 4. App Settings
  await db.collection('appsettings').updateOne(
    {},
    {
      $set: {
        appName: 'Exnshop',
        appLogo: '/exnshop_logo.png',
        estimatedDeliveryTime: '10-15 mins',
        contactEmail: 'contact@exnshop.in',
        contactPhone: '9000000001',
        supportEmail: 'support@exnshop.in',
        supportPhone: '9000000001',
        updatedAt: new Date()
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );
  console.log('✅ AppSettings initialized: Exnshop / 10-15 mins');
  await mongoose.disconnect();
}

setupCredentials().catch(console.error);
