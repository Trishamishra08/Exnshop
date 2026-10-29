import { Request, Response } from "express";
import mongoose from "mongoose";
import Seller from "../../../models/Seller";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";
import { asyncHandler } from "../../../utils/asyncHandler";
import { recomputeOrderFulfillment } from "../../../services/orderFulfillmentOrchestrator";
import { Server as SocketIOServer } from "socket.io";
import {
  calculateCODOrderBreakdown,
  getOrderEarningBreakdown,
} from "../../../services/commissionService";
import { getSellerPendingOrderAlerts } from "../../../services/orderAlertService";
import { buildShippingLabels, ensureSellerAwb } from "../../../services/shippingLabelService";
import { buildTaxInvoices } from "../../../services/taxInvoiceService";
import { getHandlingSettings, shipDatesFor } from "../../../services/shipByService";
import { acceptDeadlineFor, getEcommerceAcceptDays } from "../../../services/sellerOrderTimeoutService";
import {
  applySelfShipmentStatus,
  getSellerShippingMethod,
  saveSelfShipment,
} from "../../../services/sellerShippingService";

/**
 * Get pending order alerts that require seller action (survives page refresh).
 */
export const getPendingOrderAlerts = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const alerts = await getSellerPendingOrderAlerts(sellerId);

    return res.status(200).json({
      success: true,
      data: alerts,
    });
  },
);

/**
 * Get seller's orders with filters, sorting, and pagination
 */
export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const {
    dateFrom,
    dateTo,
    status,
    search,
    page = "1",
    limit = "10",
    sortBy = "orderDate",
    sortOrder = "desc",
    channel,
  } = req.query;

  // Find all order IDs that contain items from this seller
  const orderItems = await OrderItem.find({ seller: sellerId }).distinct(
    "order",
  );

  // Build query - filter by orders containing this seller's items
  const query: any = { _id: { $in: orderItems }, status: { $ne: "Pending" } };

  // Channel tab: orders saved before channels existed count as Quick.
  if (channel === "ECommerce") query.channel = "ECommerce";
  else if (channel === "Quick") query.channel = { $ne: "ECommerce" };

  // Date range filter
  if (dateFrom || dateTo) {
    query.orderDate = {};
    if (dateFrom) {
      query.orderDate.$gte = new Date(dateFrom as string);
    }
    if (dateTo) {
      query.orderDate.$lte = new Date(dateTo as string);
    }
  }

  // Status filter
  if (status && status !== "All Status") {
    if (status === "Tracking") {
      // Include orders where a delivery boy is assigned and the order is still active
      query.deliveryBoy = { $exists: true, $ne: null };
      query.status = {
        $nin: ["Delivered", "Cancelled", "Rejected", "Returned"],
      };
    } else {
      // Map frontend status to backend status
      const statusMapping: Record<string, string> = {
        Pending: "Pending",
        Accepted: "Accepted",
        "On the way": "On the way",
        Delivered: "Delivered",
        Cancelled: "Cancelled",
        Rejected: "Rejected",
      };
      query.status = statusMapping[status as string] || status;
    }
  }

  // Search filter
  if (search) {
    query.$or = [
      { orderNumber: { $regex: search, $options: "i" } },
      { invoiceNumber: { $regex: search, $options: "i" } },
      { "deliveryAddress.name": { $regex: search, $options: "i" } },
      { "deliveryAddress.phone": { $regex: search, $options: "i" } },
    ];
  }

  // Pagination
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  // Sort
  const sort: any = {};
  sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

  const handling = await getHandlingSettings(sellerId.toString());
  const shipFilter = String(req.query.shipFilter || "");

  let orders: any[];
  let total: number;
  if (["today", "tomorrow", "late"].includes(shipFilter)) {
    // Ship-by is worked out per order from the seller's handling settings, so it can't be a database
    // query: take every parcel still waiting to ship, keep the ones in this state, then page them.
    query.channel = "ECommerce";
    query.status = { $in: ["Received", "Accepted", "Processed"] };
    const waiting = await Order.find(query)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile")
      .sort(sort);
    const matching = waiting.filter((o) => shipDatesFor(o as any, handling).shipState === shipFilter);
    total = matching.length;
    orders = matching.slice(skip, skip + limitNum);
  } else {
    // Get orders with populated customer and delivery info
    orders = await Order.find(query)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    total = await Order.countDocuments(query);
  }

  // Format response for frontend
  const formattedOrders = orders.map((order) => ({
    id: order._id,
    orderId: order.orderNumber,
    deliveryDate: order.estimatedDeliveryDate
      ? order.estimatedDeliveryDate.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      })
      : order.orderDate.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      }),
    orderDate: order.orderDate.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    status: order.status === "On the way" ? "On the way" : order.status,
    amount: order.total,
    channel: order.channel || "Quick",
    customerName: (order.customer as any)?.name || order.customerName || "",
    customerPhone: (order.customer as any)?.phone || order.customerPhone || "",
    deliveryBoyName: (order.deliveryBoy as any)?.name || (order.deliveryPreference === 'Self' ? 'Self Assign' : ""),
    deliveryBoyPhone: (order.deliveryBoy as any)?.mobile || "",
    deliveryPreference: order.deliveryPreference,
    paymentMethod: order.paymentMethod,
    ...(order.channel === "ECommerce" ? shipDatesFor(order as any, handling) : {}),
  }));

  return res.status(200).json({
    success: true,
    message: "Orders fetched successfully",
    data: formattedOrders,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * Settlement page: list seller's delivered orders with COD breakdown.
 * settlementStatus=pending (default): only orders where COD not yet paid to admin (so list "hat jata hai" after pay).
 * settlementStatus=settled: only COD orders already paid to admin. all: no filter.
 */
export const getSettlementOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { page = 1, limit = 20, settlementStatus = "pending" } = req.query;
    const orderIds = await OrderItem.find({ seller: sellerId }).distinct("order");
    const query: any = { _id: { $in: orderIds }, status: "Delivered", paymentMethod: "COD" };
    if (settlementStatus === "pending") {
      query.codPaidToAdminAt = null;
    } else if (settlementStatus === "settled") {
      query.codPaidToAdminAt = { $ne: null };
    }
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const orders = await Order.find(query)
      .select("orderNumber orderDate paymentMethod total shipping deliveryPreference status codPaidToAdminAt")
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(parseInt(limit as string))
      .lean();
    const total = await Order.countDocuments(query);

    const ordersWithBreakdown = await Promise.all(
      orders.map(async (order: any) => {
        let codBreakdown = null;
        if (order.paymentMethod === "COD") {
          try {
            const full = await calculateCODOrderBreakdown(order._id.toString());
            const myEarning = full.sellerEarnings.get(sellerId) ?? 0;
            codBreakdown = {
              orderId: full.orderId,
              orderNumber: full.orderNumber,
              adminProductCommission: full.adminProductCommission,
              platformFee: full.platformFee,
              totalDeliveryCharge: full.totalDeliveryCharge,
              deliveryBoyCommission: full.deliveryBoyCommission,
              isSelfAssign: full.isSelfAssign,
              totalAdminEarning: full.totalAdminEarning,
              yourEarning: myEarning,
              note: full.isSelfAssign
                ? "Self Assign: Delivery charge added to your earning. Delivery boy has no share."
                : "Amount to pay admin & your earning.",
            };
          } catch {
            // ignore
          }
        }
        return { order, codBreakdown };
      }),
    );

    return res.status(200).json({
      success: true,
      data: {
        orders: ordersWithBreakdown,
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  },
);

/**
 * Get COD order breakdown for seller (admin commission visible; Self Assign = delivery boy gets nothing)
 */
export const getOrderCODBreakdown = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { id } = req.params;
    const hasItems = await OrderItem.findOne({ order: id, seller: sellerId });
    if (!hasItems) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    const order = await Order.findById(id).select("paymentMethod deliveryPreference");
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (order.paymentMethod !== "COD") {
      return res.status(400).json({
        success: false,
        message: "COD breakdown is only available for COD orders",
      });
    }
    const breakdown = await calculateCODOrderBreakdown(id);
    const myEarning = breakdown.sellerEarnings.get(sellerId) ?? 0;
    return res.status(200).json({
      success: true,
      data: {
        orderId: breakdown.orderId,
        orderNumber: breakdown.orderNumber,
        adminProductCommission: breakdown.adminProductCommission,
        platformFee: breakdown.platformFee,
        totalDeliveryCharge: breakdown.totalDeliveryCharge,
        deliveryBoyCommission: breakdown.deliveryBoyCommission,
        isSelfAssign: breakdown.isSelfAssign,
        totalAdminEarning: breakdown.totalAdminEarning,
        yourEarning: myEarning,
        note: breakdown.isSelfAssign
          ? "Self Assign: Delivery charge added to seller earning. Delivery boy has no share."
          : "Admin commission and your earning for this COD order.",
      },
    });
  },
);

/**
 * Get earning breakdown for this order (COD or Online): your earning, admin commission, delivery (Self = you get delivery charge)
 */
export const getOrderEarningBreakdownSeller = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { id } = req.params;
    const hasItems = await OrderItem.findOne({ order: id, seller: sellerId });
    if (!hasItems) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    const breakdown = await getOrderEarningBreakdown(id);
    const yourEarning = breakdown.sellerEarnings.get(sellerId) ?? 0;
    const payload = {
      orderId: breakdown.orderId,
      orderNumber: breakdown.orderNumber,
      adminProductCommission: breakdown.adminProductCommission,
      platformFee: breakdown.platformFee,
      totalDeliveryCharge: breakdown.totalDeliveryCharge,
      deliveryBoyCommission: breakdown.deliveryBoyCommission,
      isSelfAssign: breakdown.isSelfAssign,
      totalAdminEarning: breakdown.totalAdminEarning,
      yourEarning,
      note: breakdown.isSelfAssign
        ? "Self Assign: Delivery charge is included in your earning. Delivery partner has no share."
        : "Delivery partner gets delivery share. Your earning is from product sale (after commission).",
    };
    return res.status(200).json({ success: true, data: payload });
  },
);

/**
 * Get order by ID with populated order items, customer, and delivery info
 */
export const getOrderById = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { id } = req.params;

    // First check if this seller has items in this order
    const sellerItems = await OrderItem.find({ order: id, seller: sellerId })
      .populate("seller", "storeName")
      .populate("product");

    if (!sellerItems || sellerItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Get order with populated data
    const order = await Order.findById(id)
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile email");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Get only this seller's order items
    const orderItems = sellerItems;

    // Format order items for frontend
    // Format order items for frontend
    const formattedItems = orderItems.map((item) => {
      let unit = item.variation || "N/A";
      let variationMatched = false;

      // Try to resolve variation value from product if it exists
      // item.product is populated now
      const product = item.product as any;
      if (product && product.variations && Array.isArray(product.variations)) {
        // 1. Try to match by ID or Value if validation is present
        if (item.variation) {
          const variationById = product.variations.find(
            (v: any) => v._id.toString() === item.variation,
          );
          if (variationById) {
            unit = variationById.value;
            variationMatched = true;
          } else {
            const variationByValue = product.variations.find(
              (v: any) => v.value === item.variation,
            );
            if (variationByValue) {
              unit = variationByValue.value;
              variationMatched = true;
            }
          }
        }

        // 2. Fallback: If not matched yet (even if we have a value like '250'), try to recover
        if (!variationMatched) {
          const variationByPrice = product.variations.find(
            (v: any) =>
              v.price === item.unitPrice || v.discPrice === item.unitPrice,
          );
          if (variationByPrice) {
            unit = variationByPrice.value;
            variationMatched = true;
          } else if (product.variations.length === 1) {
            // 3. Last Resort: If there is only one variation, assume it's that one
            unit = product.variations[0].value;
          }
        }
      }

      return {
        srNo: item._id.toString().slice(-4), // Use last 4 chars of ID as srNo
        product: item.productName || "Unknown Product",
        image: item.productImage || product?.mainImage || "",
        sku: item.sku || "",
        soldBy: (item.seller as any)?.storeName || "N/A",
        unit: unit,
        price: item.unitPrice || 0,
        tax: 0,
        taxPercent: 0,
        // GST snapshot for the E-commerce order screen
        gst: item.gstAmount || 0,
        gstPercent: item.gstRate || 0,
        qty: item.quantity || 0,
        subtotal: item.total || 0,
      };
    });

    const sellerIdStr = sellerId.toString();
    const shipments: any[] = order.shiprocketShipments || [];
    // A single shipment with no seller on it (test-mode shipments carry none) is this order's only parcel.
    const myShipment =
      shipments.find((s) => s.seller?.toString() === sellerIdStr) ||
      (shipments.length === 1 && !shipments[0].seller ? shipments[0] : undefined) ||
      (shipments.length ? undefined : order.shiprocket);

    const shippingMethod = await getSellerShippingMethod(sellerIdStr);
    const shipDates = order.channel === "ECommerce" ? shipDatesFor(order as any, await getHandlingSettings(sellerIdStr)) : null;

    // Format order data for frontend
    const orderDetail = {
      id: order._id,
      orderNumber: order.orderNumber,
      channel: order.channel || "Quick",
      shippingMethod,
      shipDates,
      // E-commerce: the seller must accept by this time or the order is auto-cancelled.
      acceptBy: order.channel === "ECommerce" ? acceptDeadlineFor(order as any, await getEcommerceAcceptDays()).toISOString() : null,
      exchangeInfo: (order as any).exchangeInfo || null,
      shipment: myShipment
        ? {
            awbCode: myShipment.awbCode || "",
            courierName: myShipment.courierName || "",
            trackingUrl: myShipment.trackingUrl || "",
            status: myShipment.status || "",
            provider: myShipment.provider || "Shiprocket",
          }
        : null,
      invoiceNumber: order.invoiceNumber || order.orderNumber || "N/A",
      orderDate: order.orderDate
        ? order.orderDate.toISOString()
        : new Date().toISOString(),
      deliveryDate: order.estimatedDeliveryDate
        ? order.estimatedDeliveryDate.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      timeSlot: order.timeSlot || "N/A",
      status: order.status === "On the way" ? "Out For Delivery" : order.status,
      customerName: (order.customer as any)?.name || order.customerName || "",
      customerEmail:
        (order.customer as any)?.email || order.customerEmail || "",
      customerPhone:
        (order.customer as any)?.phone || order.customerPhone || "",
      deliveryBoyName: (order.deliveryBoy as any)?.name || "",
      deliveryBoyPhone: (order.deliveryBoy as any)?.mobile || "",
      deliveryPreference: order.deliveryPreference,
      deliveryOption: order.deliveryOption,
      items: formattedItems,
      subtotal: order.subtotal || 0,
      tax: order.tax || 0,
      grandTotal: order.total || 0,
      paymentMethod: order.paymentMethod || "N/A",
      paymentStatus: order.paymentStatus || "Pending",
      deliveryAddress: order.deliveryAddress || {},
    };

    return res.status(200).json({
      success: true,
      message: "Order details fetched successfully",
      data: orderDetail,
    });
  },
);

/**
 * Update order status (seller can update: Accepted, On the way, Delivered, Cancelled)
 * Supports multi-seller orders: delivery boys notified only after ALL sellers respond.
 */
export const updateOrderStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user.userId;
    const { id } = req.params;
    const { status } = req.body;
    let { deliveryPreference } = req.body;

    // Check if this seller has items in this order
    const sellerItems = await OrderItem.findOne({
      order: id,
      seller: sellerId,
    });

    if (!sellerItems) {
      return res.status(404).json({
        success: false,
        message: "Order not found or you are not authorized to manage this order",
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Quick orders are delivered by a rider (or the seller), so the seller moves
    // them along to delivery. E-commerce orders go by courier: the seller only
    // accepts and packs them, and the courier's tracking updates mark them
    // shipped and delivered.
    const isECommerce = order.channel === "ECommerce";
    // A seller who ships E-commerce orders themselves also marks them shipped and
    // delivered; for everyone else the courier's tracking updates do that.
    const isSelfShipper = isECommerce && (await getSellerShippingMethod(sellerId.toString())) === "Self";
    const allowedStatuses = isECommerce
      ? ["Accepted", "Processed", "Cancelled", "Rejected", ...(isSelfShipper ? ["Shipped", "Delivered"] : [])]
      : ["Accepted", "On the way", "Delivered", "Cancelled", "Rejected"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: isECommerce
          ? "E-commerce orders are shipped by courier. You can accept, reject, mark as packed or cancel them; the courier updates shipping and delivery."
          : `Invalid status. Seller can only update to: ${allowedStatuses.join(", ")}`,
      });
    }
    // No rider is assigned to a courier shipment.
    if (isECommerce) deliveryPreference = undefined;

    // A delivered order can no longer be cancelled or rejected.
    if (order.status === "Delivered" && (status === "Cancelled" || status === "Rejected")) {
      return res.status(400).json({
        success: false,
        message: `A delivered order cannot be ${status.toLowerCase()}`,
      });
    }

    const previousStatus = order.status;

    // Allow same status only when updating deliveryPreference or in multi-seller acceptance phase
    if (order.status === status && !deliveryPreference && status !== "Accepted" && status !== "Rejected" && !isSelfShipper) {
      return res.status(400).json({
        success: false,
        message: `Order is already ${status}`,
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MULTI-SELLER ACCEPTANCE / REJECTION LOGIC
    // ─────────────────────────────────────────────────────────────────────────
    if (status === "Accepted" || status === "Rejected") {
      const sellerIdStr = sellerId.toString();

      // Step 1: Mark all items of this seller with the new sellerStatus
      await OrderItem.updateMany(
        { order: id, seller: sellerId },
        { $set: { sellerStatus: status } }
      );
      // If rejecting: also mark items as Cancelled
      if (status === "Rejected") {
        await OrderItem.updateMany(
          { order: id, seller: sellerId },
          { $set: { status: "Cancelled" } }
        );
        console.log(`\n[SELLER REJECT]\nOrder ID: ${order._id}\nSeller ID: ${sellerIdStr}\nPayment Method: ${order.paymentMethod}\nPayment Status: ${order.paymentStatus}\nRazorpay Payment ID: ${order.paymentId || 'N/A'}`);
        console.log(`🚫 [MULTI-SELLER] Seller ${sellerIdStr} rejected order ${order.orderNumber}. Their items cancelled.`);
      }

      // Step 3: Record this seller's response on the Order document
      if (!order.sellerResponses) order.sellerResponses = [];
      const mongoose = await import("mongoose");
      const sellerObjId = new mongoose.Types.ObjectId(sellerIdStr);
      const existingIdx = (order.sellerResponses as any[]).findIndex(
        (r: any) => r.seller.toString() === sellerIdStr
      );
      if (existingIdx >= 0) {
        (order.sellerResponses as any[])[existingIdx].status = status;
        (order.sellerResponses as any[])[existingIdx].respondedAt = new Date();
      } else {
        (order.sellerResponses as any[]).push({ seller: sellerObjId, status, respondedAt: new Date() });
      }

      // Apply delivery preference from the accepting seller before recomputing fulfillment.
      if (deliveryPreference && status === "Accepted") {
        if (order.deliveryOption === "Instant" && deliveryPreference === "Admin") {
          order.deliveryPreference = undefined;
        } else {
          order.deliveryPreference = deliveryPreference as "Self" | "Admin";
        }
        if (deliveryPreference === "Self") {
          order.deliveryBoy = undefined;
        }
      }
      await order.save();

      const io: SocketIOServer = req.app.get("io") as SocketIOServer;
      const fulfillment = await recomputeOrderFulfillment(id, io);

      if (fulfillment.outcome === "all_rejected") {
        console.log(`❌ [MULTI-SELLER] All sellers rejected order ${order.orderNumber}. Fully cancelled.`);
      } else if (fulfillment.outcome === "ready_for_delivery") {
        console.log(`✅ [MULTI-SELLER] Seller resolution complete for ${order.orderNumber}. Delivery assignment flow started.`);
      } else if (fulfillment.outcome === "self_delivery") {
        console.log(`🚚 [MULTI-SELLER] Seller resolution complete for ${order.orderNumber}. Order remains self-delivery.`);
      } else {
        console.log(`⏳ [MULTI-SELLER] Waiting for remaining seller responses on ${order.orderNumber}.`);
      }

    } else {
      // ──────────────────────────────────────────────────────────────────────
      // NON-ACCEPT/REJECT STATUS UPDATES (On the way, Delivered, Cancelled)
      // These are unchanged from the original logic for full compatibility
      // ──────────────────────────────────────────────────────────────────────
      // Self-shipped parcels: record this seller's parcel status, and move the
      // whole order only as far as every parcel has got.
      let nextStatus: string = status;
      if (isSelfShipper && (status === "Processed" || status === "Shipped" || status === "Delivered")) {
        const selfResult = await applySelfShipmentStatus(order, sellerId.toString(), status as "Processed" | "Shipped" | "Delivered");
        if (!selfResult.ok) {
          return res.status(400).json({ success: false, message: selfResult.message });
        }
        nextStatus = selfResult.orderStatus;
      }

      if (order.status !== nextStatus) {
        order.status = nextStatus as any;
      }

      if (deliveryPreference && (status === "Accepted" || order.status === "Accepted")) {
        if (order.deliveryOption === "Instant" && deliveryPreference === "Admin") {
          order.deliveryPreference = undefined;
        } else {
          order.deliveryPreference = deliveryPreference as "Self" | "Admin";
        }
        if (deliveryPreference === "Self") {
          order.deliveryBoy = undefined;
        }
      }

      await order.save();

      // ─── PRE-FULFILLMENT CANCELLATION REFUND ────────────────────────────
      // Trigger refund for ALL payment combinations where customer actually paid.
      // BUG FIX: Old code only triggered for paymentMethod === "Online",
      // causing wallet-only orders to lose money on seller cancellation.
      if (status === "Cancelled") {
        const customerActuallyPaid =
          (order.walletAmountUsed && order.walletAmountUsed > 0) ||
          (order.onlineAmountPaid && order.onlineAmountPaid > 0);

        if (customerActuallyPaid && order.paymentStatus !== "Refunded") {
          try {
            const { handleOnlineOrderCancellation } = await import(
              "../../../services/refundSettlementService"
            );
            // handleOnlineOrderCancellation handles all cases:
            //   walletAmountUsed > 0 → Customer Wallet credit
            //   onlineAmountPaid > 0 → Razorpay refund
            //   COD (both = 0)       → No refund needed
            await handleOnlineOrderCancellation(
              order._id.toString(),
              "Order cancelled by seller"
            );
            console.log(`[Seller Cancel] Refund issued for order ${order.orderNumber} (wallet: ₹${order.walletAmountUsed || 0}, online: ₹${order.onlineAmountPaid || 0})`);
          } catch (refundErr) {
            console.error("Error issuing refund on seller cancellation:", refundErr);
          }
        }

        // Always cancel stale commission records on any cancellation
        // (covers COD orders where handleOnlineOrderCancellation is not called)
        try {
          const Commission = (await import("../../../models/Commission")).default;
          await Commission.updateMany(
            { order: order._id, status: { $in: ["Pending", "OnHold"] } },
            { $set: { status: "Cancelled" } }
          );
        } catch (commErr) {
          console.error("Error cancelling commissions on seller cancellation:", commErr);
        }
      }
    }

    // Distribute commissions on delivery (unchanged)
    if (order.status === "Delivered" && previousStatus !== "Delivered") {
      try {
        const { distributeCommissions } = await import(
          "../../../services/commissionService"
        );
        await distributeCommissions(order._id.toString());
      } catch (commissionError) {
        console.error("Error distributing commissions on seller delivery:", commissionError);
      }
    }

    // Send status update notification to customer
    if (order.customer && previousStatus !== order.status) {
      try {
        const { sendOrderStatusNotification } = await import(
          "../../../services/notificationService"
        );
        const io: SocketIOServer = req.app.get("io") as SocketIOServer;
        const customerId = (order.customer as any)._id?.toString() || order.customer.toString();
        sendOrderStatusNotification(order._id.toString(), customerId, order.status, io).catch((e) =>
          console.error("Error sending customer order status notification:", e)
        );
      } catch (notifErr) {
        console.error("Error importing notificationService:", notifErr);
      }
    }

    // Packed E-commerce order: get the courier AWB (and pickup) from Shiprocket
    // so the shipping label can be printed.
    let message = "Order status updated successfully";
    let awbCode: string | undefined;
    if (isSelfShipper && status === "Processed") {
      message = "Marked as packed. Hand the parcel to your courier, then mark it as shipped.";
    } else if (isSelfShipper && status === "Shipped") {
      message = "Marked as shipped. The customer can now track it with your tracking number.";
    } else if (isECommerce && status === "Processed") {
      const awb = await ensureSellerAwb(id, sellerId.toString());
      awbCode = awb.awbCode;
      message = awb.success
        ? awb.message || "Marked as packed. Courier assigned — you can download the shipping label."
        : `Marked as packed, but the courier AWB could not be generated: ${awb.message}`;
    }

    return res.status(200).json({
      success: true,
      message,
      data: {
        id: order._id,
        status: order.status,
        awbCode,
      },
    });
  },
);

/**
 * Courier shipping label + tax invoice data for this seller's shipment
 * (E-commerce orders, once the AWB is assigned).
 */
export const getShippingLabel = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;
  if (!(await OrderItem.exists({ order: id, seller: sellerId }))) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }
  const labels = await buildShippingLabels(id, sellerId.toString());
  if (labels.length === 0) {
    return res.status(400).json({ success: false, message: "The shipping label is available once the order is packed and the courier AWB is assigned." });
  }
  return res.status(200).json({ success: true, data: labels });
});

/** GST tax invoice for this seller's items of an order (Quick or E-commerce). */
export const getTaxInvoice = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;
  if (!(await OrderItem.exists({ order: id, seller: sellerId }))) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }
  const invoices = await buildTaxInvoices(id, sellerId.toString());
  if (invoices.length === 0) {
    return res.status(400).json({ success: false, message: "No invoice: every item of yours on this order was cancelled or rejected." });
  }
  return res.status(200).json({ success: true, data: invoices });
});

/**
 * Packing slip data for this seller's part of one or more orders (comma-separated ids):
 * what to pick and pack, who it is going to, and ship-by. Not a tax invoice.
 */
export const getPackingSlips = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId.toString();
  const ids = String(req.query.ids || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 50);
  if (ids.length === 0 || ids.some((i) => !mongoose.isValidObjectId(i))) {
    return res.status(400).json({ success: false, message: "Provide the order ids to print" });
  }
  const handling = await getHandlingSettings(sellerId);
  const seller: any = await Seller.findById(sellerId).select("storeName sellerName mobile address city").lean();

  const slips = [];
  for (const id of ids) {
    const items: any[] = await OrderItem.find({ order: id, seller: sellerId, status: { $ne: "Cancelled" }, sellerStatus: { $ne: "Rejected" } }).lean();
    if (items.length === 0) continue;
    const order: any = await Order.findById(id).lean();
    if (!order) continue;
    const shipment = (order.shiprocketShipments || []).find((s: any) => String(s.seller) === sellerId) || (order.shiprocketShipments?.length ? undefined : order.shiprocket);
    const dates = order.channel === "ECommerce" ? shipDatesFor(order, handling) : null;
    const a = order.deliveryAddress || {};
    slips.push({
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      orderDate: order.orderDate || order.createdAt,
      channel: order.channel || "Quick",
      paymentMethod: order.paymentMethod,
      shipByDate: dates?.shipByDate,
      deliverByDate: dates?.deliverByDate,
      customer: {
        name: order.customerName,
        phone: order.customerPhone,
        address: [a.address, a.city, a.state, a.pincode].filter(Boolean).join(", "),
      },
      seller: { name: seller?.storeName || seller?.sellerName, phone: seller?.mobile, address: [seller?.address, seller?.city].filter(Boolean).join(", ") },
      courier: shipment?.courierName || "",
      trackingNumber: shipment?.awbCode || "",
      items: items.map((i) => ({ name: i.productName, sku: i.sku || "", variation: i.variation || "", quantity: i.quantity })),
    });
  }
  if (slips.length === 0) return res.status(404).json({ success: false, message: "Nothing to print for these orders" });
  return res.status(200).json({ success: true, data: slips });
});

/** Self-shipping seller: save the courier company and tracking number for this order. */
export const saveSelfShippingDetails = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  try {
    const data = await saveSelfShipment(req.params.id, sellerId.toString(), req.body || {});
    return res.status(200).json({ success: true, message: "Courier and tracking number saved", data });
  } catch (err: any) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Could not save shipping details" });
  }
});

/** Retries the courier/AWB assignment for a packed E-commerce order. */
export const generateShippingAwb = asyncHandler(async (req: Request, res: Response) => {
  const sellerId = (req as any).user.userId;
  const { id } = req.params;
  if (!(await OrderItem.exists({ order: id, seller: sellerId }))) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }
  const order = await Order.findById(id).select("status channel");
  if (!order || order.channel !== "ECommerce") {
    return res.status(400).json({ success: false, message: "Only E-commerce orders are shipped by courier" });
  }
  if (["Received", "Pending", "Accepted", "Cancelled", "Rejected", "Returned"].includes(order.status)) {
    return res.status(400).json({ success: false, message: "Mark the order as packed before generating the courier AWB." });
  }
  const result = await ensureSellerAwb(id, sellerId.toString());
  return res.status(result.success ? 200 : 400).json({
    success: result.success,
    message: result.success ? result.message || "Courier assigned" : result.message,
    data: { awbCode: result.awbCode },
  });
});

/**
 * Get available delivery partners for seller manual assignment
 */
export const getAvailableDeliveryPartners = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user?.userId;
    const { id } = req.params;

    // Verify order exists and seller has items in it
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const sellerItems = await OrderItem.findOne({ order: id, seller: sellerId });
    if (!sellerItems) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view delivery partners for this order",
      });
    }

    if (order.channel === "ECommerce") {
      return res.status(400).json({
        success: false,
        message: "E-commerce orders are shipped by courier; no delivery partner is assigned.",
      });
    }

    // Get seller location for proximity calculation
    const Seller = (await import("../../../models/Seller")).default;
    const seller = await Seller.findById(sellerId).select("latitude longitude serviceRadiusKm");
    const sellerLat = seller?.latitude ? parseFloat(seller.latitude) : null;
    const sellerLng = seller?.longitude ? parseFloat(seller.longitude) : null;

    // Fetch active & online delivery partners
    const Delivery = (await import("../../../models/Delivery")).default;
    const deliveryBoys = await Delivery.find({
      status: "Active",
      isOnline: true,
      available: "Available",
    }).select("name mobile email vehicleNumber vehicleType isOnline available status location profileImage");

    // Count active in-progress orders for each delivery boy
    const busyOrders = await Order.find({
      deliveryBoy: { $in: deliveryBoys.map((d) => d._id) },
      deliveryBoyStatus: { $in: ["Assigned", "Picked Up", "In Transit"] },
      status: { $nin: ["Delivered", "Cancelled", "Rejected", "Returned"] },
    }).select("deliveryBoy");

    const riderOrderCounts: Record<string, number> = {};
    busyOrders.forEach((o) => {
      const id = o.deliveryBoy?.toString();
      if (id) {
        riderOrderCounts[id] = (riderOrderCounts[id] || 0) + 1;
      }
    });

    const { calculateDistance } = await import("../../../utils/locationHelper");

    const formattedRiders = deliveryBoys.map((rider) => {
      let distanceKm: number | null = null;
      if (
        sellerLat !== null &&
        sellerLng !== null &&
        rider.location?.coordinates &&
        rider.location.coordinates.length === 2
      ) {
        const [riderLng, riderLat] = rider.location.coordinates;
        distanceKm = Math.round(calculateDistance(sellerLat, sellerLng, riderLat, riderLng) * 10) / 10;
      }

      const activeOrdersCount = riderOrderCounts[rider._id.toString()] || 0;
      const isBusy = activeOrdersCount > 0;

      return {
        _id: rider._id,
        name: rider.name,
        mobile: rider.mobile,
        email: rider.email,
        vehicleNumber: rider.vehicleNumber || "",
        vehicleType: rider.vehicleType || "Bike",
        profileImage: rider.profileImage || "",
        isOnline: rider.isOnline,
        available: rider.available,
        status: rider.status,
        distanceKm,
        isBusy,
        activeOrdersCount,
      };
    });

    // Sort: Available non-busy riders first, then by distance ascending
    formattedRiders.sort((a, b) => {
      if (a.isBusy !== b.isBusy) return a.isBusy ? 1 : -1;
      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;
      return a.name.localeCompare(b.name);
    });

    return res.status(200).json({
      success: true,
      message: "Available delivery partners fetched successfully",
      data: formattedRiders,
    });
  },
);

/**
 * Assign delivery boy by seller (Manual Seller Assignment)
 */
export const assignDeliveryBoySeller = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = (req as any).user?.userId;
    const { id } = req.params;
    const { deliveryBoyId } = req.body;

    if (!deliveryBoyId) {
      return res.status(400).json({
        success: false,
        message: "Delivery partner ID is required",
      });
    }

    // Verify order exists and seller has items in it
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const sellerItems = await OrderItem.findOne({ order: id, seller: sellerId });
    if (!sellerItems) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to assign delivery for this order",
      });
    }

    if (order.channel === "ECommerce") {
      return res.status(400).json({
        success: false,
        message: "E-commerce orders are shipped by courier; no delivery partner is assigned.",
      });
    }

    if (["Received", "Pending"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "Accept the order first, then assign a delivery partner.",
      });
    }

    if (["Delivered", "Cancelled", "Rejected", "Returned"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot assign delivery partner to order with status ${order.status}`,
      });
    }

    // Verify delivery boy exists and is active
    const Delivery = (await import("../../../models/Delivery")).default;
    const deliveryBoy = await Delivery.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery partner not found",
      });
    }

    if (deliveryBoy.status !== "Active") {
      return res.status(400).json({
        success: false,
        message: "Delivery partner is not active",
      });
    }

    // Check if order is already assigned to a different rider
    if (order.deliveryBoy && order.deliveryBoy.toString() !== deliveryBoyId.toString()) {
      return res.status(409).json({
        success: false,
        message: "Order is already assigned to another delivery partner",
      });
    }

    // Atomic update on order
    const nextStatus = (order.status === "Pending" || order.status === "Received" || order.status === "Accepted")
      ? "Processed"
      : order.status;

    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { deliveryBoy: null },
          { deliveryBoy: { $exists: false } },
          { deliveryBoy: deliveryBoyId },
        ],
        status: { $nin: ["Delivered", "Cancelled", "Rejected", "Returned"] },
      },
      {
        $set: {
          deliveryBoy: deliveryBoyId,
          deliveryBoyStatus: "Assigned",
          assignedAt: new Date(),
          deliveryPreference: "Self",
          deliveryAssignmentStatus: "Assigned",
          deliveryAssignmentResolvedAt: new Date(),
          status: nextStatus,
        },
      },
      { new: true },
    )
      .populate("customer", "name email phone")
      .populate("deliveryBoy", "name mobile email vehicleNumber vehicleType")
      .populate("items");

    if (!updatedOrder) {
      const currentOrder = await Order.findById(id);
      if (currentOrder?.deliveryBoy && currentOrder.deliveryBoy.toString() !== deliveryBoyId.toString()) {
        return res.status(409).json({
          success: false,
          message: "Order was already assigned to another delivery partner",
        });
      }
      return res.status(400).json({
        success: false,
        message: "Failed to assign delivery partner",
      });
    }

    // Create or update delivery assignment record
    const DeliveryAssignment = (await import("../../../models/DeliveryAssignment")).default;
    await DeliveryAssignment.findOneAndUpdate(
      { order: id },
      {
        order: id,
        deliveryBoy: deliveryBoyId,
        assignedAt: new Date(),
        assignedBy: sellerId,
        status: "Assigned",
      },
      { upsert: true, new: true },
    );

    // Trigger notification to delivery boy & broadcast order update
    const io: SocketIOServer = req.app.get("io");
    if (io) {
      const { notifyDeliveryBoyOfAssignment } = await import(
        "../../../services/orderNotificationService"
      );
      notifyDeliveryBoyOfAssignment(io, updatedOrder, deliveryBoyId);

      io.to(`order-${id}`).emit("order-updated", {
        orderId: id,
        deliveryBoy: deliveryBoyId,
        deliveryBoyName: deliveryBoy.name,
        deliveryBoyPhone: deliveryBoy.mobile,
        status: updatedOrder.status,
        deliveryBoyStatus: "Assigned",
        deliveryAssignmentStatus: "Assigned",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Delivery partner assigned successfully",
      data: updatedOrder,
    });
  },
);


