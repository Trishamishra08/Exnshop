import Admin from '../models/Admin';
import Seller from '../models/Seller';
import Delivery from '../models/Delivery';
import bcrypt from 'bcrypt';

export async function ensurePanelUsers(): Promise<void> {
  try {
    const passwordHash = await bcrypt.hash("Exnshop@123", 10);

    // 1. Ensure Admin (9876543210)
    const existingAdmin = await Admin.findOne({ mobile: "9876543210" });
    if (!existingAdmin) {
      await Admin.create({
        firstName: "Exnshop",
        lastName: "Admin",
        mobile: "9876543210",
        email: "admin@exnshop.io",
        role: "Super Admin",
        status: "Active",
        password: passwordHash,
      });
      console.log("✓ Default Admin ensured: 9876543210");
    }

    // 2. Ensure Seller (8839044030)
    const existingSeller = await Seller.findOne({ mobile: "8839044030" });
    if (!existingSeller) {
      await Seller.create({
        sellerName: "Exnshop Seller",
        storeName: "Exnshop Store",
        email: "seller@exnshop.io",
        mobile: "8839044030",
        password: passwordHash,
        category: "Grocery",
        categories: ["Grocery", "Fruits & Vegetables"],
        city: "Indore",
        address: "Indore, Madhya Pradesh",
        status: "Approved",
        isShopOpen: true,
        serviceRadiusKm: 100,
        latitude: "22.717650",
        longitude: "75.871860",
        location: { type: "Point", coordinates: [75.87186, 22.71765] },
        requireProductApproval: false,
        viewCustomerDetails: true,
        commission: 0,
        balance: 0,
        onHoldBalance: 0,
      });
      console.log("✓ Default Seller ensured: 8839044030");
    }

    // 3. Ensure Delivery (8839044030)
    const existingDelivery = await Delivery.findOne({ mobile: "8839044030" });
    if (!existingDelivery) {
      await Delivery.create({
        name: "Exnshop Delivery Partner",
        email: "delivery@exnshop.io",
        mobile: "8839044030",
        password: passwordHash,
        address: "Indore City, Madhya Pradesh",
        city: "Indore",
        pincode: "452001",
        status: "Active",
        isOnline: true,
        available: "Available",
        vehicleType: "Bike",
        vehicleNumber: "MP09-EX-4030",
        balance: 0,
        cashCollected: 0,
        pendingAdminPayout: 0,
        location: { type: "Point", coordinates: [75.87186, 22.71765] },
        settings: { notifications: true, location: true, sound: true },
      });
      console.log("✓ Default Delivery Partner ensured: 8839044030");
    }

    // No default customer: customers sign up themselves (email OTP → mobile),
    // and a pre-created one would block that mobile number from signing up.
  } catch (error: any) {
    console.error("Warning: Error in ensurePanelUsers:", error.message);
  }
}

export default ensurePanelUsers;
