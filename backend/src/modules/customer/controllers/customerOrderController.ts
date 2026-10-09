import { Request, Response } from "express";
import Order from "../../../models/Order";
import Product from "../../../models/Product";
import OrderItem from "../../../models/OrderItem";
import Customer from "../../../models/Customer";
import Seller from "../../../models/Seller";
import mongoose from "mongoose";
import { calculateDistance } from "../../../utils/locationHelper";
import { notifySellersOfOrderUpdate } from "../../../services/sellerNotificationService";
import { dispatchOrderToDeliveryBoys } from "../../../services/orderNotificationService";
import { sendOrderStatusNotification } from "../../../services/notificationService";
import { generateDeliveryOtp } from "../../../services/deliveryOtpService";
import AppSettings from "../../../models/AppSettings";
import { getRoadDistances } from "../../../services/mapService";
import { Server as SocketIOServer } from "socket.io";
import { getOrderItemCommissionRate } from "../../../services/commissionService";
import DeliveryAssignment from "../../../models/DeliveryAssignment";
import Coupon from "../../../models/Coupon";
import Return from "../../../models/Return";
import { debitWallet } from "../../../services/walletManagementService";
import { commitCouponUsage } from "../../../services/couponService";
import { createShiprocketOrder } from "../../../services/shiprocketService";
import { resolveSellerChannel, CommerceChannel } from "../../../utils/commerceChannelHelper";
import { computeItemGst, GstLineInput } from "../../../services/taxService";

type ChannelOrderResult =
  | { success: true; order: any; walletAmountUsed: number }
  | { success: false; status: number; message: string; data?: any };

/**
 * Builds, prices, and saves (but does not commit) ONE order for ONE channel's
 * worth of items. Called once for a single-channel checkout (the common case
 * — behavior is byte-for-byte identical to the pre-split implementation), or
 * twice — once per channel — when a checkout's cart has both Quick and
 * E-commerce items, sharing one transaction so both succeed or neither does.
 *
 * Shared fees (platform fee, GST, packaging fee, tip) are computed once per
 * checkout and attributed entirely to the "shared fee owner" order (Quick if
 * present, else E-commerce) — the other linked order carries zero for these,
 * per the confirmed design: only each group's own item subtotal and delivery
 * fee differ between linked orders.
 */
async function buildAndSaveChannelOrder(params: {
  req: Request;
  session: mongoose.ClientSession | null;
  userId: string;
  customer: any;
  address: any;
  deliveryLat: number;
  deliveryLng: number;
  items: any[];
  channel: CommerceChannel;
  paymentMethod: string;
  fees: any;
  deliveryOption: string;
  settings: any;
  coupon: any | null;
  isSharedFeeOwner: boolean;
  tipAmount: any;
  giftPackaging: any;
  walletAvailable: number;
  checkoutGroupId?: string;
}): Promise<ChannelOrderResult> {
  const {
    session,
    userId,
    customer,
    address,
    deliveryLat,
    deliveryLng,
    items,
    channel,
    paymentMethod,
    fees,
    deliveryOption,
    settings,
    coupon,
    isSharedFeeOwner,
    tipAmount,
    giftPackaging,
    walletAvailable,
    checkoutGroupId,
  } = params;

  const newOrder = new Order({
    customer: new mongoose.Types.ObjectId(userId),
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    deliveryAddress: {
      address: address.address || address.street || "N/A",
      city: address.city || "N/A",
      state: address.state || "",
      pincode: address.pincode || "000000",
      landmark: address.landmark || "",
      latitude: deliveryLat,
      longitude: deliveryLng,
    },
    paymentMethod: paymentMethod || "COD",
    paymentStatus: "Pending",
    status: (paymentMethod === "Online" || paymentMethod === "razorpay") ? "Pending" : "Received",
    deliveryOption: deliveryOption || "Standard",
    channel,
    checkoutGroupId,
    subtotal: 0,
    tax: 0,
    shipping: fees?.deliveryFee || 0,
    platformFee: fees?.platformFee || 0,
    discount: 0,
    total: 0,
    items: [],
    tipAmount: isSharedFeeOwner ? (Number(tipAmount) || 0) : 0,
    giftPackaging: isSharedFeeOwner ? !!giftPackaging : false,
    sellerConfirmationStatus: "Pending",
    deliveryAssignmentStatus: "NotStarted",
  });

  let calculatedSubtotal = 0;
  const orderItemIds: mongoose.Types.ObjectId[] = [];
  const sellerIds = new Set<string>();
  const gstLineInputs: GstLineInput[] = [];

  for (const item of items) {
    if (!item.product || !item.product.id) {
      throw new Error("Invalid item structure: product.id is missing");
    }

    const qty = Number(item.quantity) || 0;
    if (qty <= 0) {
      throw new Error("Invalid item quantity");
    }

    // Atomically check stock and decrement to prevent race conditions (stock === 0 is treated as Unlimited)
    let product;
    const variationValue = item.variant || item.variation;

    if (variationValue) {
      // Check if variation has limited stock (> 0) or unlimited stock (=== 0)
      const checkTarget = await Product.findById(item.product.id).populate("category subcategory subSubCategory");
      if (checkTarget && checkTarget.variations && checkTarget.variations.length > 0) {
        const matchedVariant: any = checkTarget.variations.find((v: any) =>
          (v._id && v._id.toString() === variationValue.toString()) ||
          v.value === variationValue ||
          v.title === variationValue ||
          v.pack === variationValue
        );

        if (matchedVariant) {
          if (matchedVariant.status === "Sold out") {
            throw new Error(`Variant "${matchedVariant.title || matchedVariant.value}" is sold out`);
          }
          // If limited stock (> 0), atomically check and decrement
          if (matchedVariant.stock !== undefined && matchedVariant.stock !== null && matchedVariant.stock > 0) {
            product = session
              ? await Product.findOneAndUpdate(
                {
                  _id: item.product.id,
                  "variations._id": matchedVariant._id,
                  "variations.stock": { $gte: qty },
                },
                { $inc: { "variations.$.stock": -qty, stock: -qty } },
                { session, new: true },
              ).populate("category subcategory subSubCategory")
              : await Product.findOneAndUpdate(
                {
                  _id: item.product.id,
                  "variations._id": matchedVariant._id,
                  "variations.stock": { $gte: qty },
                },
                { $inc: { "variations.$.stock": -qty, stock: -qty } },
                { new: true },
              ).populate("category subcategory subSubCategory");

            if (!product) {
              throw new Error(`Insufficient stock for variation: ${matchedVariant.title || variationValue}`);
            }
          } else {
            // stock === 0 (or null/undefined) represents Unlimited Stock
            product = checkTarget;
          }
        }
      }
    }

    if (!product) {
      const checkProduct = await Product.findById(item.product.id).populate(
        "category subcategory subSubCategory",
      );

      if (checkProduct) {
        if ((checkProduct.status as string) === "Sold out" || checkProduct.status === "Inactive") {
          throw new Error(`Product "${checkProduct.productName}" is unavailable`);
        }

        if (
          checkProduct.variations &&
          checkProduct.variations.length > 0
        ) {
          // Product has variations but specific one was not matched or not supplied
          if (variationValue) {
            throw new Error(
              `Variant not found or out of stock: ${variationValue}`,
            );
          }

          const firstVar: any = checkProduct.variations[0];
          if (firstVar.status === "Sold out") {
            throw new Error(`Product "${checkProduct.productName}" is sold out`);
          }

          if (firstVar.stock !== undefined && firstVar.stock !== null && firstVar.stock > 0) {
            product = session
              ? await Product.findOneAndUpdate(
                {
                  _id: item.product.id,
                  "variations.0.stock": { $gte: qty },
                },
                { $inc: { "variations.0.stock": -qty, stock: -qty } },
                { session, new: true },
              ).populate("category subcategory subSubCategory")
              : await Product.findOneAndUpdate(
                {
                  _id: item.product.id,
                  "variations.0.stock": { $gte: qty },
                },
                { $inc: { "variations.0.stock": -qty, stock: -qty } },
                { new: true },
              ).populate("category subcategory subSubCategory");
          } else {
            // Unlimited stock for variation 0
            product = checkProduct;
          }
        } else {
          // No variations, top-level product stock
          if (checkProduct.stock !== undefined && checkProduct.stock !== null && checkProduct.stock > 0) {
            product = session
              ? await Product.findOneAndUpdate(
                { _id: item.product.id, stock: { $gte: qty } },
                { $inc: { stock: -qty } },
                { session, new: true },
              ).populate("category subcategory subSubCategory")
              : await Product.findOneAndUpdate(
                { _id: item.product.id, stock: { $gte: qty } },
                { $inc: { stock: -qty } },
                { new: true },
              ).populate("category subcategory subSubCategory");
          } else {
            // Top-level stock === 0 represents Unlimited Stock
            product = checkProduct;
          }
        }
      }
    }

    if (!product) {
      throw new Error(
        `Insufficient stock or product not found: ${item.product.name || "ID: " + item.product.id}${variationValue ? " (" + variationValue + ")" : ""}`,
      );
    }

    // Track seller IDs to validate location
    if (product.seller) {
      sellerIds.add(product.seller.toString());
    }

    // Determine the price based on variation and discounts
    let selectedVariation;
    if (variationValue && product.variations) {
      selectedVariation = product.variations.find(
        (v: any) =>
          (v._id && v._id.toString() === variationValue) ||
          v.value === variationValue ||
          v.title === variationValue ||
          v.pack === variationValue,
      );
    }
    if (
      !selectedVariation &&
      product.variations &&
      product.variations.length > 0
    ) {
      // Fallback to first if no variation spec or not found (consistent with stock fallback)
      selectedVariation = product.variations[0];
    }

    const itemPrice =
      selectedVariation?.discPrice && selectedVariation.discPrice > 0
        ? selectedVariation.discPrice
        : product.discPrice && product.discPrice > 0
          ? product.discPrice
          : selectedVariation?.price || product.price || 0;
    const itemTotal = itemPrice * qty;
    calculatedSubtotal += itemTotal;

    // Calculate commission rate snapshot
    const commRate = await getOrderItemCommissionRate(
      product,
      product.seller.toString(),
      settings,
    );
    const commAmount = (itemTotal * commRate) / 100;

    // Calculate return policy snapshot
    const returnsEnabled = settings?.returnConfig?.returnsEnabled !== false;
    const productIsReturnable = product.isReturnable !== false;
    const isReturnableSnapshot = returnsEnabled && productIsReturnable;
    const returnDaysSnapshot = product.maxReturnDays && product.maxReturnDays > 0
      ? product.maxReturnDays
      : settings?.returnConfig?.defaultReturnWindowDays ?? 7;

    // Create OrderItem
    const newOrderItemData = {
      order: newOrder._id,
      product: product._id,
      seller: product.seller,
      productName: product.productName,
      productImage: product.mainImage,
      sku: product.sku,
      unitPrice: itemPrice,
      quantity: qty,
      total: itemTotal,
      commissionRate: commRate,
      commissionAmount: commAmount,
      variation: variationValue,
      status: "Pending",
      isReturnable: isReturnableSnapshot,
      returnWindowDays: returnDaysSnapshot,
    };

    const newOrderItem = new OrderItem(newOrderItemData);
    if (session) {
      await newOrderItem.save({ session });
    } else {
      await newOrderItem.save();
    }
    orderItemIds.push(newOrderItem._id as mongoose.Types.ObjectId);

    const categoryRef: any = product.category;
    const categoryId = categoryRef?._id
      ? new mongoose.Types.ObjectId(categoryRef._id)
      : categoryRef && mongoose.isValidObjectId(categoryRef)
        ? new mongoose.Types.ObjectId(categoryRef)
        : null;
    gstLineInputs.push({
      orderItemId: newOrderItem._id as mongoose.Types.ObjectId,
      categoryId,
      itemTotal,
    });
  }

  // Enforce minimum order value against THIS group's own item subtotal.
  const minimumOrderValue = Number(settings?.minimumOrderValue) || 0;
  if (minimumOrderValue > 0 && calculatedSubtotal < minimumOrderValue) {
    const shortfall = Number((minimumOrderValue - calculatedSubtotal).toFixed(2));
    return {
      success: false,
      status: 400,
      message: `Minimum order value is ₹${minimumOrderValue}. Please add ₹${shortfall} more to place your order.`,
      data: {
        minimumOrderValue,
        currentSubtotal: Number(calculatedSubtotal.toFixed(2)),
        shortfall,
      },
    };
  }

  // Validate all sellers can deliver to user's location.
  // This service-radius check only applies to Quick Commerce (instant, local delivery) —
  // E-Commerce orders ship nationally via Shiprocket, so radius doesn't apply.
  if (channel === "Quick" && sellerIds.size > 0) {
    const uniqueSellerIds = Array.from(sellerIds).map(
      (id) => new mongoose.Types.ObjectId(id),
    );

    // Find sellers and check if user is within their service radius
    const sellers = await Seller.find({
      _id: { $in: uniqueSellerIds },
      status: "Approved",
      location: { $exists: true, $ne: null },
    });

    // Check each seller can deliver to user's location
    for (const seller of sellers) {
      if (!seller.location || !seller.location.coordinates) {
        return {
          success: false,
          status: 403,
          message: `Seller ${seller.storeName} does not have a valid location. Order cannot be placed.`,
        };
      }

      const sellerLng = seller.location.coordinates[0];
      const sellerLat = seller.location.coordinates[1];
      const distance = calculateDistance(
        deliveryLat,
        deliveryLng,
        sellerLat,
        sellerLng,
      );
      const serviceRadius = seller.serviceRadiusKm || 10;

      if (distance > serviceRadius) {
        return {
          success: false,
          status: 403,
          message: `Your delivery address is ${distance.toFixed(2)} km away from ${seller.storeName}. They only deliver within ${serviceRadius} km. Please select products from sellers in your area.`,
        };
      }
    }
  }

  // Apply fees. Shared fees (platform fee) only apply to the checkout's
  // designated "shared fee owner" order.
  let platformFee = isSharedFeeOwner ? (Number(fees?.platformFee) || 0) : 0;
  let deliveryFee = Number(fees?.deliveryFee) || 0;
  let deliveryDistanceKm = 0;

  // --- Delivery Charge Calculation (Standard vs Instant) ---
  // E-commerce never incurs a rider delivery fee — those items ship via the
  // standard courier flow instead.
  if (channel === "ECommerce") {
    deliveryFee = 0;
  } else {
    try {
      const freeDeliveryThreshold = settings?.freeDeliveryThreshold || 0;

      // Standard Delivery flow: Always Fixed Price, waived above the
      // free-delivery threshold. That waiver is Standard-only — Instant is a
      // premium, rider-dispatched service and always carries its own
      // distance-based fee below, regardless of cart value.
      if (deliveryOption === "Standard") {
        deliveryFee =
          freeDeliveryThreshold > 0 && calculatedSubtotal >= freeDeliveryThreshold
            ? 0
            : settings.deliveryCharges ?? 0;
      }
      // Instant Delivery flow: Distance Based calculation
      else if (deliveryOption === "Instant" && settings.deliveryConfig) {
        const config = settings.deliveryConfig;

        // Collect seller locations
        const sellerLocations: { lat: number; lng: number }[] = [];
        const uniqueSellerIds = Array.from(sellerIds).map(
          (id) => new mongoose.Types.ObjectId(id),
        );
        const sellers = await Seller.find({
          _id: { $in: uniqueSellerIds },
        }).select("location latitude longitude storeName");

        sellers.forEach((seller) => {
          let lat, lng;
          if (seller.location?.coordinates?.length === 2) {
            lng = seller.location.coordinates[0];
            lat = seller.location.coordinates[1];
          } else if (seller.latitude && seller.longitude) {
            lat = parseFloat(seller.latitude);
            lng = parseFloat(seller.longitude);
          }

          if (lat && lng) {
            sellerLocations.push({ lat, lng });
          }
        });

        if (sellerLocations.length > 0 && deliveryLat && deliveryLng) {
          // Get distances (Road or Air based on API Key presence)
          const distances = await getRoadDistances(
            sellerLocations,
            { lat: deliveryLat, lng: deliveryLng },
            config.googleMapsKey,
          );

          // Take the maximum distance (furthest seller)
          deliveryDistanceKm = Math.max(...distances);

          // Calculate Fee
          // Formula: BaseCharge + (Max(0, Distance - BaseDistance) * KmRate)
          const extraKm = Math.max(0, deliveryDistanceKm - config.baseDistance);
          const calculatedDeliveryFee =
            config.baseCharge + extraKm * config.kmRate;

          // Override the delivery fee
          deliveryFee = Math.ceil(calculatedDeliveryFee);

          console.log(
            `DEBUG: Instant Delivery (Distance-based): MaxDistance=${deliveryDistanceKm}km, Fee=${deliveryFee} (Base: ${config.baseCharge}, Rate: ${config.kmRate}/km)`,
          );
        }
      } else {
        // Fallback: If no settings or unhandled option, use provided fee or default
        const providedDeliveryFee = Number(fees?.deliveryFee);
        deliveryFee = Number.isFinite(providedDeliveryFee)
          ? providedDeliveryFee
          : settings?.deliveryCharges ?? 0;
      }
    } catch (calcError) {
      console.error("Error calculating delivery fee:", calcError);
      // Fallback to provided fee or settings default (using pre-fetched settings)
      const providedDeliveryFee = Number(fees?.deliveryFee);
      deliveryFee = Number.isFinite(providedDeliveryFee)
        ? providedDeliveryFee
        : settings?.deliveryCharges ?? 0;
    }
  }

  const finalTipAmount = isSharedFeeOwner ? (Number(tipAmount) || 0) : 0;
  const giftPackagingFee = isSharedFeeOwner && giftPackaging ? (Number(settings?.packagingFee) || 0) : 0;

  // BUSINESS RULE: Coupon applies strictly to PRODUCT SUBTOTAL (calculatedSubtotal),
  // scoped to this channel group only. A coupon whose admin-configured
  // applicableChannel doesn't cover this channel arrives here as `coupon: null`.
  const productSubtotalForCoupon = calculatedSubtotal;
  let discountAmount = 0;

  if (coupon) {
    try {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);

      // Use the same leniency as getCoupons
      if (now >= coupon.startDate && startOfToday <= coupon.endDate) {
        // Check usage limit
        if (
          !coupon.usageLimit ||
          coupon.usageCount < coupon.usageLimit
        ) {
          // Check minimum purchase (strictly on product subtotal)
          if (
            !coupon.minimumPurchase ||
            productSubtotalForCoupon >= coupon.minimumPurchase
          ) {
            // Calculate discount strictly on product subtotal
            if (coupon.discountType === "Percentage") {
              discountAmount =
                (productSubtotalForCoupon * coupon.discountValue) / 100;
              if (
                coupon.maximumDiscount &&
                discountAmount > coupon.maximumDiscount
              ) {
                discountAmount = coupon.maximumDiscount;
              }
            } else {
              // Fixed discount cannot exceed product subtotal
              discountAmount = Math.min(
                coupon.discountValue,
                productSubtotalForCoupon
              );
            }

            newOrder.couponCode = coupon.code;
            newOrder.discount = Number(discountAmount.toFixed(2));

            console.log(`[COUPON CALCULATION]
Coupon Code: ${coupon.code}
Channel: ${channel}
Product Subtotal: ₹${productSubtotalForCoupon}
Discount Type: ${coupon.discountType}
Discount Value: ${coupon.discountValue}${coupon.discountType === "Percentage" ? "%" : ""}
Coupon Discount: ₹${discountAmount.toFixed(2)}
Delivery Fee: ₹${deliveryFee}
Platform Fee: ₹${platformFee}
Tip: ₹${finalTipAmount}
Gift Packaging Fee: ₹${giftPackagingFee}`);
          } else {
            console.warn(
              `⚠️ Coupon ${coupon.code} rejected: min purchase ₹${coupon.minimumPurchase} not met (Product Subtotal: ₹${productSubtotalForCoupon})`,
            );
          }
        } else {
          console.warn(
            `⚠️ Coupon ${coupon.code} rejected: usage limit ${coupon.usageLimit} reached`,
          );
        }
      } else {
        console.warn(`⚠️ Coupon ${coupon.code} rejected: expired or not yet valid`);
      }
    } catch (couponError) {
      console.error("❌ Error applying coupon:", couponError);
      // We continue with the order even if coupon fails
    }
  }

  // GST is category-driven: each item is taxed at its own category's tax
  // rate (set by admin on the category), not one flat marketplace-wide rate.
  // Like the other shared fees, it's only charged on the order that owns
  // them for this checkout (delivery fees, platform fees, tips, and gift
  // packaging are not taxed).
  const gstEnabledForOrder = isSharedFeeOwner && !!settings?.gstEnabled;
  const { lines: gstLines, totalGst: gstAmount } = await computeItemGst(
    gstLineInputs,
    productSubtotalForCoupon,
    discountAmount,
    gstEnabledForOrder,
  );
  newOrder.tax = gstAmount;

  if (gstEnabledForOrder && gstLines.length > 0) {
    const bulkOps = gstLines.map((line) => ({
      updateOne: {
        filter: { _id: line.orderItemId },
        update: {
          $set: {
            categoryId: line.categoryId ?? undefined,
            gstRate: line.gstRate,
            gstAmount: line.gstAmount,
          },
        },
      },
    }));
    await OrderItem.bulkWrite(bulkOps, session ? { session } : undefined);
  }

  const finalTotal = Math.max(
    0,
    productSubtotalForCoupon -
      discountAmount +
      gstAmount +
      platformFee +
      deliveryFee +
      finalTipAmount +
      giftPackagingFee
  );

  let walletAmountUsed = 0;
  if (walletAvailable > 0) {
    walletAmountUsed = Math.min(walletAvailable, finalTotal);
    const debitRes = await debitWallet(
      userId,
      "CUSTOMER",
      walletAmountUsed,
      `Payment for order #${newOrder.orderNumber}`,
      newOrder._id.toString(),
      session || undefined,
      `CUSTOMER_WALLET_DEBIT_ORDER_${newOrder._id.toString()}`,
      "ORDER_PAYMENT"
    );

    if (!debitRes.success) {
      return {
        success: false,
        status: 400,
        message: debitRes.message || "Failed to debit customer wallet for order payment",
      };
    }
  }

  const remainingPayable = Number((finalTotal - walletAmountUsed).toFixed(2));
  newOrder.walletAmountUsed = Number(walletAmountUsed.toFixed(2));

  if (walletAmountUsed > 0 && remainingPayable === 0) {
    newOrder.paymentMethod = "Wallet";
    newOrder.paymentStatus = "Paid";
    newOrder.status = "Received";
    newOrder.onlineAmountPaid = 0;
    newOrder.codAmountPending = 0;
  } else {
    if (paymentMethod === "Online" || paymentMethod === "razorpay") {
      newOrder.paymentMethod = paymentMethod;
      newOrder.paymentStatus = "Pending";
      newOrder.status = "Pending";
      newOrder.onlineAmountPaid = remainingPayable;
      newOrder.codAmountPending = 0;
    } else {
      newOrder.paymentMethod = "COD";
      newOrder.paymentStatus = "Pending";
      newOrder.status = "Received";
      newOrder.codAmountPending = remainingPayable;
      newOrder.onlineAmountPaid = 0;
    }
  }

  // Update Order with calculated values and items
  newOrder.subtotal = Number(calculatedSubtotal.toFixed(2));
  newOrder.total = Number(finalTotal.toFixed(2));
  newOrder.grandTotal = Number(finalTotal.toFixed(2)); // Sync grandTotal alias
  newOrder.items = orderItemIds;
  newOrder.shipping = deliveryFee; // Update with calculated fee
  newOrder.deliveryDistanceKm = deliveryDistanceKm; // Store distance for commission calc

  if (session) {
    await newOrder.save({ session });
  } else {
    // Validate before saving to catch errors with details
    const validationError = newOrder.validateSync();
    if (validationError) {
      console.error("DEBUG: Order Validation Error:", validationError.errors);
      throw validationError;
    }
    await newOrder.save();
  }

  return { success: true, order: newOrder, walletAmountUsed };
}

// Create a new order
export const createOrder = async (req: Request, res: Response) => {
  let session: mongoose.ClientSession | null = null;
  try {
    // Only start session if we are on a replica set (required for transactions)
    // For simplicity in local dev, we check and fallback if it fails
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch (txError) {
      console.warn(
        "MongoDB Transactions not supported or failed to start. Proceeding without transaction.",
      );
      session = null;
    }

    const { items, address, paymentMethod, fees, deliveryOption, couponCode, tipAmount, giftPackaging, useWallet, channel: requestedChannel } = req.body;
    const userId = req.user!.userId;

    // Log incoming request for debugging (development mode only)
    if (process.env.NODE_ENV !== "production") {
      console.log("DEBUG: Order creation request:", {
        userId,
        itemsCount: items?.length,
        hasAddress: !!address,
        paymentMethod,
        deliveryOption,
      });
    }

    if (!items || items.length === 0) {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Order must have at least one item",
      });
    }

    if (!address) {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Delivery address is required",
      });
    }

    // Validate required address fields
    if (
      !address.city ||
      (typeof address.city === "string" && address.city.trim() === "")
    ) {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "City is required in delivery address",
        details: {
          receivedCity: address.city,
          addressObject: address,
        },
      });
    }

    if (
      !address.pincode ||
      (typeof address.pincode === "string" && address.pincode.trim() === "")
    ) {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Pincode is required in delivery address",
        details: {
          receivedPincode: address.pincode,
          addressObject: address,
        },
      });
    }

    // Fetch customer details
    const customer = await Customer.findById(userId);
    if (!customer) {
      if (session) await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Validate delivery address location
    // Handle both string and number types, and check for null/undefined (not truthy, since 0 is valid)
    const deliveryLat =
      address.latitude != null
        ? typeof address.latitude === "number"
          ? address.latitude
          : parseFloat(address.latitude)
        : null;
    const deliveryLng =
      address.longitude != null
        ? typeof address.longitude === "number"
          ? address.longitude
          : parseFloat(address.longitude)
        : null;

    if (
      deliveryLat == null ||
      deliveryLng == null ||
      isNaN(deliveryLat) ||
      isNaN(deliveryLng)
    ) {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Delivery address location (latitude/longitude) is required",
        details: {
          receivedLatitude: address.latitude,
          receivedLongitude: address.longitude,
          parsedLatitude: deliveryLat,
          parsedLongitude: deliveryLng,
        },
      });
    }

    // Validate coordinates
    if (
      deliveryLat < -90 ||
      deliveryLat > 90 ||
      deliveryLng < -180 ||
      deliveryLng > 180
    ) {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid delivery address coordinates",
      });
    }

    // Pre-fetch settings for various calculations
    const settings = await AppSettings.getSettings();

    // ── Partition items by the channel of their product's seller ──
    // A product belongs to its seller's channel (a seller enabled for both
    // defaults to Quick) — the same rule used by the cart (see
    // customerCartController.ts's addToCart). This lets one checkout produce
    // two linked orders — one per channel — when the cart has both, while a
    // single-channel cart (the common case) takes the exact same path it
    // always has.
    const itemsByChannel: Record<CommerceChannel, any[]> = { Quick: [], ECommerce: [] };
    for (const item of items) {
      if (!item.product || !item.product.id) {
        if (session) await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Invalid item structure: product.id is missing",
        });
      }
      const productSeller = await Product.findById(item.product.id)
        .select("seller")
        .populate("seller", "channels");
      // Same dual-channel ambiguity as addToCart: a seller enabled for both
      // channels is otherwise resolved independently of which cart the item
      // was actually added to, so it could silently re-land in the Quick
      // channel at checkout even though it was added (and shown) in the
      // ECommerce cart — skipping Shiprocket, which only fires for ECommerce
      // orders. Honor the checkout request's declared channel for those.
      const itemChannel = resolveSellerChannel((productSeller?.seller as any)?.channels, requestedChannel);
      itemsByChannel[itemChannel].push(item);
    }

    const channelGroupsPresent = (["Quick", "ECommerce"] as CommerceChannel[]).filter(
      (ch) => itemsByChannel[ch].length > 0
    );
    const isMixedCheckout = channelGroupsPresent.length === 2;
    const checkoutGroupId = isMixedCheckout ? new mongoose.Types.ObjectId().toString() : undefined;

    // Resolve the coupon ONCE for the whole checkout — its own admin-set
    // applicableChannel determines which channel-group(s) it discounts. The
    // customer never picks a channel for a coupon at checkout.
    let resolvedCoupon: any = null;
    if (couponCode && typeof couponCode === "string" && couponCode.trim()) {
      try {
        resolvedCoupon = await Coupon.findOne({
          code: couponCode.trim().toUpperCase(),
          isActive: true,
        });
      } catch (couponLookupErr) {
        console.error("Error looking up coupon:", couponLookupErr);
      }
    }
    const couponAppliesToChannel = (ch: CommerceChannel) =>
      !!resolvedCoupon &&
      (!resolvedCoupon.applicableChannel ||
        resolvedCoupon.applicableChannel === "Both" ||
        resolvedCoupon.applicableChannel === ch);

    // Shared fees (platform fee, GST, packaging fee, tip) are attributed
    // entirely to the "shared fee owner" group — Quick if present, else
    // E-commerce — per the confirmed design.
    const sharedFeeOwnerChannel: CommerceChannel = channelGroupsPresent.includes("Quick")
      ? "Quick"
      : "ECommerce";

    let walletRemaining = useWallet ? (customer.walletAmount || 0) : 0;
    const builtOrders: any[] = [];
    let anyOrderUsedCoupon: any = null;

    for (const ch of channelGroupsPresent) {
      const isSharedFeeOwner = ch === sharedFeeOwnerChannel;
      const result = await buildAndSaveChannelOrder({
        req,
        session,
        userId,
        customer,
        address,
        deliveryLat,
        deliveryLng,
        items: itemsByChannel[ch],
        channel: ch,
        paymentMethod,
        fees,
        deliveryOption,
        settings,
        coupon: couponAppliesToChannel(ch) ? resolvedCoupon : null,
        isSharedFeeOwner,
        tipAmount,
        giftPackaging,
        walletAvailable: walletRemaining,
        checkoutGroupId,
      });

      if (!result.success) {
        if (session) await session.abortTransaction();
        return res.status(result.status).json({
          success: false,
          message: result.message,
          ...(result.data ? { data: result.data } : {}),
        });
      }

      walletRemaining = Math.max(0, walletRemaining - result.walletAmountUsed);
      builtOrders.push(result.order);
      if (result.order.couponCode && !anyOrderUsedCoupon) {
        anyOrderUsedCoupon = result.order;
      }
    }

    if (session) {
      await session.commitTransaction();
    }

    // Commit coupon usage once per checkout (not once per linked order), so a
    // coupon scoped to "Both" doesn't get double-counted against its usage limit.
    if (
      anyOrderUsedCoupon &&
      (anyOrderUsedCoupon.paymentStatus === "Paid" || anyOrderUsedCoupon.paymentMethod === "COD")
    ) {
      await commitCouponUsage(anyOrderUsedCoupon);
    }

    // Post-save side effects (notifications, Shiprocket) — same logic as the
    // original single-order flow, run once per linked order.
    for (const builtOrder of builtOrders) {
      // Emit notification to all involved sellers (non-blocking for performance)
      try {
        const io: SocketIOServer = req.app.get("io") as SocketIOServer;
        if (io) {
          // Only notify sellers immediately if it's a COD (or fully wallet-paid) order
          // Online orders will notify after payment verification in paymentService
          if (builtOrder.paymentMethod === "COD" || builtOrder.paymentMethod === "Wallet") {
            notifySellersOfOrderUpdate(io, builtOrder, "NEW_ORDER");
            console.log(
              `📢 [COD] Async seller notification triggered for order ${builtOrder.orderNumber}`,
            );
            // Quick-commerce orders dispatch to nearby delivery partners
            // immediately — customers shouldn't wait on seller acceptance for
            // a rider to get a request.
            dispatchOrderToDeliveryBoys(builtOrder, io).catch((e) =>
              console.error("Error dispatching order to delivery boys:", e)
            );
          } else {
            console.log(
              `⏳ [Online] Seller notification deferred for order ${builtOrder.orderNumber} until payment success`,
            );
          }
        }
      } catch (notificationError) {
        // Log error but don't fail the order creation
        console.error("Error notifying sellers:", notificationError);
      }

      // Send status notification to customer for order placement (COD or 100% Wallet paid orders ONLY)
      // For ONLINE orders, the customer and seller notifications are sent upon successful payment capture in paymentService.ts
      if (builtOrder.paymentStatus === "Paid" || builtOrder.paymentMethod === "COD") {
        try {
          const io: SocketIOServer = req.app.get("io") as SocketIOServer;
          sendOrderStatusNotification(builtOrder._id.toString(), userId, builtOrder.status, io).catch((e) =>
            console.error("Error sending Order Placed notification to customer:", e)
          );
        } catch (custNotifErr) {
          console.error("Error triggering customer order notification:", custNotifErr);
        }
      }

      // For confirmed E-Commerce orders, push the shipment to Shiprocket (non-blocking — never fails order creation)
      if (
        builtOrder.channel === "ECommerce" &&
        (builtOrder.paymentStatus === "Paid" || builtOrder.paymentMethod === "COD")
      ) {
        createShiprocketOrder(builtOrder)
          .then(async (result) => {
            if (result.success) {
              builtOrder.shiprocket = {
                orderId: result.orderId,
                shipmentId: result.shipmentId,
                status: result.isMock ? "Mock: Order Created" : "Order Created",
              };
              await builtOrder.save();
            } else {
              console.error(`[Shiprocket] Failed to create shipment for order ${builtOrder.orderNumber}:`, result.message);
            }
          })
          .catch((err) => console.error("[Shiprocket] Unexpected error creating shipment:", err));
      }
    }

    // Single-channel checkout (the overwhelming common case): identical
    // response shape to before this feature existed.
    if (builtOrders.length === 1) {
      return res.status(201).json({
        success: true,
        message: "Order placed successfully",
        data: builtOrders[0],
      });
    }

    // Mixed checkout: both linked orders, plus the shared checkout group id.
    return res.status(201).json({
      success: true,
      message: "Orders placed successfully",
      data: {
        orders: builtOrders,
        checkoutGroupId,
      },
    });
  } catch (error: any) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    if (error.message && error.message.includes("Insufficient stock")) {
      console.warn(`[ORDER] Order creation rejected: ${error.message}`);
    } else {
      console.error(`[ORDER] Order Creation Failed: ${error.message || error}`);
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("DEBUG: Order Creation Error Detail:", {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
    }

    // Return a more informative error message if it's a validation error
    let errorMessage = "Error creating order. " + error.message;
    if (error.name === "ValidationError") {
      const fields = Object.keys(error.errors).join(", ");
      errorMessage = `Validation failed for fields: ${fields}. ${error.message}`;
    }

    return res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message,
      details: error.errors,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  } finally {
    if (session) session.endSession();
  }
};

// Get authenticated customer's orders
export const getMyOrders = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { status, page = 1, limit = 10 } = req.query;

    const query: any = { customer: userId };

    if (status) {
      query.status = status; // Note: Model field is 'status', not 'orderStatus'
    }

    const skip = (Number(page) - 1) * Number(limit);

    const orders = await Order.find(query)
      .populate({
        path: "items",
        populate: { path: "product", select: "productName mainImage price" },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Order.countDocuments(query);

    // Batch-fetch sibling orders sharing a checkoutGroupId so linked
    // (mixed-checkout) orders can be shown together on the frontend, without
    // storing the link redundantly on each order.
    const groupIds = Array.from(
      new Set(orders.map((o: any) => o.checkoutGroupId).filter(Boolean))
    );
    const siblingsByGroup = new Map<string, any[]>();
    if (groupIds.length > 0) {
      const siblingOrders = await Order.find({ checkoutGroupId: { $in: groupIds } })
        .select("orderNumber channel status total checkoutGroupId")
        .lean();
      for (const sib of siblingOrders) {
        const key = (sib as any).checkoutGroupId;
        if (!siblingsByGroup.has(key)) siblingsByGroup.set(key, []);
        siblingsByGroup.get(key)!.push(sib);
      }
    }

    // Transform orders to match frontend Order type
    const transformedOrders = orders.map((order) => {
      const orderObj = order.toObject();
      const linkedOrder = orderObj.checkoutGroupId
        ? (siblingsByGroup.get(orderObj.checkoutGroupId) || []).find(
          (sib: any) => sib._id.toString() !== orderObj._id.toString()
        )
        : undefined;
      return {
        ...orderObj,
        id: orderObj._id.toString(),
        totalItems: Array.isArray(orderObj.items) ? orderObj.items.length : 0,
        totalAmount: orderObj.total,
        fees: {
          platformFee: orderObj.platformFee || 0,
          deliveryFee: orderObj.shipping || 0,
          gst: orderObj.tax || 0,
        },
        // Keep original fields for backward compatibility
        subtotal: orderObj.subtotal,
        address: orderObj.deliveryAddress,
        linkedOrder: linkedOrder
          ? {
            id: linkedOrder._id.toString(),
            orderNumber: linkedOrder.orderNumber,
            channel: linkedOrder.channel,
            status: linkedOrder.status,
            total: linkedOrder.total,
          }
          : undefined,
      };
    });

    return res.status(200).json({
      success: true,
      data: transformedOrders,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Error fetching orders",
      error: error.message,
    });
  }
};

// Get single order details
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Find order and ensure it belongs to the user
    const order = await Order.findOne({ _id: id, customer: userId })
      .populate({
        path: "items",
        populate: [
          {
            path: "product",
            select: "productName mainImage pack manufacturer price",
          },
          { path: "seller", select: "storeName city phone fssaiLicNo" },
        ],
      })
      .populate("deliveryBoy", "name mobile phone profileImage vehicleNumber");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Suppress OTP for delivered/cancelled orders
    const customer = await Customer.findById(userId).select("deliveryOtp");
    const deliveryOtp = (order.status === "Delivered" || order.status === "Cancelled")
      ? null
      : customer?.deliveryOtp;


    // Transform order to match frontend Order type
    const orderObj = order.toObject();

    // If this order is part of a mixed (Quick + E-commerce) checkout, find
    // its sibling order for display linking.
    let linkedOrder: any = undefined;
    if ((orderObj as any).checkoutGroupId) {
      const sibling = await Order.findOne({
        checkoutGroupId: (orderObj as any).checkoutGroupId,
        _id: { $ne: orderObj._id },
      }).select("orderNumber channel status total");
      if (sibling) {
        linkedOrder = {
          id: sibling._id.toString(),
          orderNumber: sibling.orderNumber,
          channel: sibling.channel,
          status: sibling.status,
          total: sibling.total,
        };
      }
    }

    // Fetch existing return requests for items in this order
    const itemIds = (orderObj.items || []).map((i: any) => i._id);
    const existingReturns = await Return.find({
      orderItem: { $in: itemIds },
    }).sort({ createdAt: -1 });
    const returnMap = new Map(existingReturns.map((r: any) => [r.orderItem.toString(), r]));

    const enrichedItems = await Promise.all(
      (orderObj.items || []).map(async (item: any) => {
        const prodId = item.product?._id || item.product;
        const prod = prodId ? await Product.findById(prodId).select("isReturnable maxReturnDays") : null;
        const isReturnable = prod?.isReturnable || false;
        const maxReturnDays = prod?.maxReturnDays || 7;

        const deliveryDate = orderObj.deliveredAt || orderObj.updatedAt || orderObj.createdAt;
        const expiryDate = new Date(deliveryDate);
        expiryDate.setDate(expiryDate.getDate() + maxReturnDays);
        const isReturnWindowActive = new Date() <= expiryDate;

        const activeReturn: any = returnMap.get(item._id.toString());

        return {
          ...item,
          isReturnable,
          maxReturnDays,
          returnExpiryDate: expiryDate.toISOString(),
          isReturnWindowActive,
          activeReturnStatus: activeReturn ? activeReturn.status : null,
          activeReturnId: activeReturn ? activeReturn._id : null,
          activeReturnRejectionReason: activeReturn?.rejectionReason || null,
        };
      })
    );


    const isDeliveredOrCompleted = ["Delivered", "Completed"].includes(orderObj.status);
    const isPaymentCompleted = orderObj.paymentStatus === "Paid" || (orderObj.paymentMethod === "COD" && isDeliveredOrCompleted);
    const hasRequiredInvoiceData = Boolean(orderObj._id && orderObj.items && orderObj.items.length > 0 && orderObj.total != null);
    const invoiceEnabled = orderObj.invoiceEnabled === true || (isDeliveredOrCompleted && isPaymentCompleted && hasRequiredInvoiceData);

    const transformedOrder = {
      ...orderObj,
      items: enrichedItems,
      id: orderObj._id.toString(),
      totalItems: Array.isArray(orderObj.items) ? orderObj.items.length : 0,
      totalAmount: orderObj.total,
      fees: {
        platformFee: orderObj.platformFee || 0,
        deliveryFee: orderObj.shipping || 0,
        gst: orderObj.tax || 0,
      },
      // Keep original fields for backward compatibility
      subtotal: orderObj.subtotal,
      address: orderObj.deliveryAddress,
      // Strict business rule for invoice enablement
      invoiceEnabled,
      // Include saved instructions / requests for read-only post-delivery display
      deliveryInstructions: orderObj.deliveryInstructions || (orderObj as any).instructions || "",
      specialRequests: orderObj.specialRequests || "",
      // Include customer's permanent delivery OTP (null if delivered)
      deliveryOtp,
      // Map deliveryBoy to deliveryPartner for frontend with phone/mobile fallback
      deliveryPartner: orderObj.deliveryBoy
        ? {
            ...orderObj.deliveryBoy,
            phone: (orderObj.deliveryBoy as any).mobile || (orderObj.deliveryBoy as any).phone || "",
            mobile: (orderObj.deliveryBoy as any).mobile || (orderObj.deliveryBoy as any).phone || "",
          }
        : undefined,
      linkedOrder,
    };

    console.log(`\n[CUSTOMER ORDER RESPONSE]\nOrder ID: ${transformedOrder.id}\nstatus: ${transformedOrder.status}\npaymentStatus: ${transformedOrder.paymentStatus}\npaymentId: ${transformedOrder.paymentId || 'N/A'}`);

    return res.status(200).json({
      success: true,
      data: transformedOrder,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Error fetching order detail",
      error: error.message,
    });
  }
};

/**
 * Refresh Delivery OTP
 */
export const refreshDeliveryOtp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const order = await Order.findOne({ _id: id, customer: userId });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.status === "Delivered") {
      return res
        .status(400)
        .json({ success: false, message: "Order is already delivered" });
    }

    // Generate and send new OTP
    const result = await generateDeliveryOtp(id);

    // Emit socket event if needed (customer room). Re-fetch: generateDeliveryOtp
    // updates its own separate document instance, so the `order` fetched above
    // doesn't reflect the new value.
    const io = (req.app as any).get("io");
    if (io) {
      const refreshedOrder = await Order.findById(id).select("deliveryOtp deliveryOtpExpiresAt");
      io.to(`order-${id}`).emit("delivery-otp-refreshed", {
        orderId: id,
        deliveryOtp: refreshedOrder?.deliveryOtp,
        expiresAt: refreshedOrder?.deliveryOtpExpiresAt,
      });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error refreshing delivery OTP:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to refresh delivery OTP",
      error: error.message,
    });
  }
};

// Cancel Order
export const cancelOrder = async (req: Request, res: Response) => {
  let session: mongoose.ClientSession | null = null;
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user!.userId;

    if (!reason) {
      return res
        .status(400)
        .json({ success: false, message: "Cancellation reason is required" });
    }

    // Only start session if we are on a replica set (required for transactions)
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch (sessionError) {
      console.warn(
        "MongoDB Transactions not supported or failed to start. Proceeding without transaction.",
      );
      session = null;
    }

    const order = session
      ? await Order.findOne({ _id: id, customer: userId }).session(session)
      : await Order.findOne({ _id: id, customer: userId });

    if (!order) {
      if (session) await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (
      [
        "Delivered",
        "Cancelled",
        "Returned",
        "Rejected",
        "Out for Delivery",
        "Shipped",
      ].includes(order.status)
    ) {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled as it is already ${order.status}`,
      });
    }

    // Restore stock
    for (const item of order.items) {
      const orderItem = session
        ? await OrderItem.findById(item).session(session)
        : await OrderItem.findById(item);

      if (orderItem) {
        const product = session
          ? await Product.findById(orderItem.product).session(session)
          : await Product.findById(orderItem.product);

        if (product) {
          // Check if it was a variation
          if (orderItem.variation) {
            // Try to find matching variation
            const variationIndex = product.variations?.findIndex(
              (v: any) =>
                v.value === orderItem.variation ||
                v.title === orderItem.variation ||
                v.pack === orderItem.variation,
            );

            if (
              variationIndex !== undefined &&
              variationIndex !== -1 &&
              product.variations &&
              product.variations[variationIndex]
            ) {
              const currentStock =
                product.variations[variationIndex].stock || 0;
              product.variations[variationIndex].stock =
                currentStock + orderItem.quantity;
            } else if (product.variations && product.variations.length > 0) {
              // Fallback to first variation if specific one not found (should be rare)
              const currentStock = product.variations[0].stock || 0;
              product.variations[0].stock = currentStock + orderItem.quantity;
            }
          }

          // Helper: also increment main stock if variations are just attributes or if simple product
          product.stock += orderItem.quantity;
          if (session) {
            await product.save({ session });
          } else {
            await product.save();
          }
        }

        orderItem.status = "Cancelled";
        if (session) {
          await orderItem.save({ session });
        } else {
          await orderItem.save();
        }
      }
    }

    order.status = "Cancelled";
    // So delivery boy is no longer "busy" and can take next order
    if (order.deliveryBoy) {
      order.deliveryBoyStatus = "Failed";
    }

    if (session) {
      await order.save({ session });
      await session.commitTransaction();
    } else {
      await order.save();
    }

    // ─── PRE-FULFILLMENT CANCELLATION REFUND ────────────────────────────
    // BUG FIX: Old code only triggered for paymentMethod === "Online",
    // causing wallet-only orders to lose money on customer self-cancellation.
    const customerActuallyPaid =
      (order.walletAmountUsed && order.walletAmountUsed > 0) ||
      (order.onlineAmountPaid && order.onlineAmountPaid > 0);

    if (customerActuallyPaid && order.paymentStatus !== "Refunded") {
      try {
        const { handleOnlineOrderCancellation } = await import("../../../services/refundSettlementService");
        await handleOnlineOrderCancellation(order._id.toString(), reason);
        console.log(`[Customer Cancel] Refund issued for order ${order.orderNumber} (wallet: ₹${order.walletAmountUsed || 0}, online: ₹${order.onlineAmountPaid || 0})`);
      } catch (refundErr) {
        console.error("Error issuing refund on customer cancellation:", refundErr);
      }
    }

    // Mark DeliveryAssignment as Cancelled so delivery boy is available for new orders
    if (order.deliveryBoy) {
      await DeliveryAssignment.findOneAndUpdate(
        { order: order._id },
        { status: "Cancelled", failedAt: new Date(), failureReason: "Order cancelled by customer" },
        { new: true }
      ).exec();
    }

    // Notify
    try {
      const io = (req.app as any).get("io");
      if (io) {
        await notifySellersOfOrderUpdate(io, order, "ORDER_CANCELLED");

        if (order.deliveryBoy) {
          const deliveryBoyId = order.deliveryBoy.toString();
          io.to(`delivery-${deliveryBoyId}`).emit("order-cancelled", {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: "Cancelled",
            message: "Order has been cancelled by the customer. You are now available for the next order.",
          });
        }

        io.to(`order-${order._id}`).emit("order-cancelled", {
          orderId: order._id,
          status: "Cancelled",
          message: "Order has been cancelled",
        });
      }
    } catch (err) {
      console.error("Notification error:", err);
    }

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      data: {
        id: order._id,
        status: order.status,
        cancelledAt: order.cancelledAt,
      },
    });
  } catch (error: any) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch (e) { }
    }
    console.error("Error cancelling order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel order",
      error: error.message,
    });
  } finally {
    if (session) session.endSession();
  }
};

/**
 * Update Order Notes (Instructions/Special Requests)
 */
export const updateOrderNotes = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { deliveryInstructions, specialRequests } = req.body;
    const userId = req.user!.userId;

    const order = await Order.findOne({ _id: id, customer: userId });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (["Delivered", "Cancelled", "Returned"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot update notes for ${order.status} order`,
      });
    }

    if (deliveryInstructions !== undefined) order.deliveryInstructions = deliveryInstructions;
    if (specialRequests !== undefined) order.specialRequests = specialRequests;

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Order notes updated",
      data: {
        deliveryInstructions: order.deliveryInstructions,
        specialRequests: order.specialRequests,
      },
    });
  } catch (error: any) {
    console.error("Error updating order notes:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update order notes",
      error: error.message,
    });
  }
};

/**
 * Customer Return Request Endpoint with Backend Validation
 */
export const requestItemReturn = async (req: Request, res: Response) => {
  try {
    const id = req.params.id || req.params.orderId;
    const { orderItemId, reason, description, quantity, requestType: rawRequestType } = req.body;
    const userId = req.user!.userId;
    const requestType: "RETURN" | "EXCHANGE" = rawRequestType === "EXCHANGE" ? "EXCHANGE" : "RETURN";
    const typeLabel = requestType === "EXCHANGE" ? "Exchange" : "Return";

    if (!orderItemId || !reason) {
      return res.status(400).json({ success: false, message: `Order item ID and ${typeLabel.toLowerCase()} reason are required` });
    }

    const order = await Order.findOne({ _id: id, customer: userId }).populate("items");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status !== "Delivered") {
      return res.status(400).json({ success: false, message: "Returns and exchanges can only be requested for delivered orders" });
    }

    const item = (order.items as any[]).find(
      (i: any) => i._id?.toString() === orderItemId || i.id === orderItemId
    );
    if (!item) {
      return res.status(404).json({ success: false, message: "Order item not found in this order" });
    }

    const productId = item.product?._id || item.product;
    const product = await Product.findById(productId);
    if (!product || product.isReturnable === false) {
      return res.status(400).json({ success: false, message: `This product is marked non-${requestType === "EXCHANGE" ? "exchangeable" : "returnable"}` });
    }

    const deliveredAt = order.deliveredAt || order.updatedAt || order.createdAt;
    const windowDays = product.maxReturnDays ?? 7;
    const deadline = new Date(deliveredAt);
    deadline.setDate(deadline.getDate() + windowDays);

    if (Date.now() > deadline.getTime()) {
      return res.status(400).json({ success: false, message: `${typeLabel} window for this product has expired (${windowDays} days)` });
    }

    const existingReturn = await Return.findOne({
      orderItem: item._id,
      status: { $ne: "Rejected" },
    });

    if (existingReturn) {
      const existingType = existingReturn.requestType === "EXCHANGE" ? "exchange" : "return";
      return res.status(400).json({
        success: false,
        message: `An active ${existingType} request already exists for this item (Status: ${existingReturn.status})`,
      });
    }

    const returnQty = quantity && quantity > 0 ? Math.min(quantity, item.quantity) : item.quantity;

    const newReturn = await Return.create({
      order: order._id,
      orderItem: item._id,
      customer: userId,
      requestType,
      reason,
      description: description || "",
      quantity: returnQty,
      status: "Pending",
    });

    // Notify seller of new return/exchange request
    try {
      const { sendReturnRequestNotificationToSeller, sendReturnRequestNotificationToCustomer } = await import("../../../services/notificationService");
      const sellerId = item.seller?._id?.toString() || item.seller?.toString() || item.vendor?.toString();
      const io = req.app.get("io");

      if (sellerId) {
        await sendReturnRequestNotificationToSeller(
          sellerId,
          order.orderNumber || "N/A",
          product.productName || "Product",
          newReturn._id.toString(),
          io,
          requestType,
          order._id.toString()
        );
      }

      // Notify customer that request was submitted
      await sendReturnRequestNotificationToCustomer(
        userId,
        order.orderNumber || "N/A",
        product.productName || "Product",
        newReturn._id.toString(),
        io,
        requestType,
        order._id.toString()
      );
    } catch (notifErr) {
      console.error(`Error notifying seller/customer of ${typeLabel.toLowerCase()} request:`, notifErr);
    }

    return res.status(201).json({
      success: true,
      message: `${typeLabel} request submitted successfully`,
      data: newReturn,
    });

  } catch (error: any) {
    console.error("Error requesting item return/exchange:", error);
    return res.status(500).json({ success: false, message: "Failed to submit request", error: error.message });
  }
};

export const requestCustomerReturn = requestItemReturn;
