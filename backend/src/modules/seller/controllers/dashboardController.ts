import { Request, Response } from "express";
import Order from "../../../models/Order";
import Product from "../../../models/Product";
import Seller from "../../../models/Seller";
import OrderItem from "../../../models/OrderItem";
import { asyncHandler } from "../../../utils/asyncHandler";
import { getCommissionSummary } from "../../../services/commissionService";
import Campaign from "../../../models/Campaign";
import mongoose from "mongoose";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Get seller's dashboard statistics
 */
export const getDashboardStats = asyncHandler(
    async (req: Request, res: Response) => {
        const sellerId = new mongoose.Types.ObjectId((req as any).user.userId);

        // Find orders associated with this seller
        // Since Order model doesn't have sellerId, we find orders via OrderItem
        const sellerOrderItems = await OrderItem.find({ seller: sellerId }).select('order');
        const sellerOrderIds = [...new Set(sellerOrderItems.map(item => item.order.toString()))];

        const sellerDoc = await Seller.findById(sellerId).select("categories balance onHoldBalance");
        const sellingCategoriesCount = sellerDoc?.categories?.length || 0;

        // 1. KPI Metrics (order status buckets)
        const [
            totalOrders,
            completedOrders,
            pendingOrders,
            processingOrders,
            shippedOrders,
            cancelledOrders,
            returnOrders,
            totalProduct,
            totalCategoryCount,
            totalSubcategoryCount,
            totalCustomerCount,
            commissionSummary,
            campaignSpendResult,
        ] = await Promise.all([
            Order.countDocuments({ _id: { $in: sellerOrderIds }, status: { $ne: "Pending" } }),
            Order.countDocuments({ _id: { $in: sellerOrderIds }, status: "Delivered" }),
            Order.countDocuments({ _id: { $in: sellerOrderIds }, status: { $in: ["Received", "Accepted"] } }),
            Order.countDocuments({ _id: { $in: sellerOrderIds }, status: "Processed" }),
            Order.countDocuments({ _id: { $in: sellerOrderIds }, status: { $in: ["Shipped", "Picked up", "On the way", "Out for Delivery"] } }),
            Order.countDocuments({ _id: { $in: sellerOrderIds }, status: { $in: ["Cancelled", "Rejected"] } }),
            Order.countDocuments({ _id: { $in: sellerOrderIds }, status: "Returned" }),
            Product.countDocuments({ seller: sellerId }),
            Promise.resolve(sellingCategoriesCount),
            Product.distinct("subcategory", { seller: sellerId }).then(ids => ids.length),
            Order.distinct("customer", { _id: { $in: sellerOrderIds }, status: { $ne: "Pending" } }).then(ids => ids.length),
            getCommissionSummary(sellerId.toString(), "SELLER"),
            Campaign.aggregate([
                { $match: { seller: sellerId } },
                { $group: { _id: null, totalSpend: { $sum: "$spend" } } },
            ]),
        ]);

        const advertisementSpend = campaignSpendResult[0]?.totalSpend || 0;

        const commissionData = commissionSummary?.data || { pending: 0, paid: 0, nextSettlementDate: null };

        // 2. Alert Metrics (Low Stock < 5)
        const products = await Product.find({ seller: sellerId });
        let soldOutProducts = 0;
        let lowStockProducts = 0;

        products.forEach(product => {
            let isSoldOut = true;
            let isLowStock = false;

            if (product.variations && product.variations.length > 0) {
                product.variations.forEach((v: any) => {
                    if ((v.stock || 0) > 0) isSoldOut = false;
                    if ((v.stock || 0) > 0 && (v.stock || 0) < 5) isLowStock = true;
                    if (v.stock && v.stock > 0) isSoldOut = false;
                    if (v.stock && v.stock > 0 && v.stock < 5) isLowStock = true;
                });
            } else {
                // Handle products without variations (fallback)
                if (product.stock > 0) isSoldOut = false;
                if (product.stock > 0 && product.stock < 5) isLowStock = true;
            }

            if (isSoldOut) soldOutProducts++;
            else if (isLowStock) lowStockProducts++;
        });

        // 3. New Orders Table (Latest 10)
        const newOrders = await Order.find({ _id: { $in: sellerOrderIds }, status: { $ne: "Pending" } })
            .sort({ createdAt: -1 })
            .limit(10);

        const formattedNewOrders = newOrders.map(order => ({
            id: order.orderNumber || order._id.toString(), // Use orderNumber if available
            orderDate: new Date(order.orderDate).toLocaleDateString('en-GB'),
            status: order.status === 'Out for Delivery' ? 'Out For Delivery' : order.status,
            amount: order.total, // Use total instead of grandTotal (check Schema)
        }));

        // 4. Order Count Chart Data (current year / current month)
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const sellerOrderObjectIds = sellerOrderIds.map(id => new mongoose.Types.ObjectId(id));

        const monthlyStats = await Order.aggregate([
            {
                $match: {
                    _id: { $in: sellerOrderObjectIds },
                    status: { $ne: "Pending" },
                    orderDate: {
                        $gte: new Date(`${currentYear}-01-01`),
                        $lte: new Date(`${currentYear}-12-31`)
                    }
                }
            },
            {
                $group: {
                    _id: { $month: "$orderDate" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        const yearlyOrderData = MONTHS.map((month, index) => {
            const monthStat = monthlyStats.find(s => s._id === index + 1);
            return { date: month, value: monthStat ? monthStat.count : 0 };
        });

        const dailyStats = await Order.aggregate([
            {
                $match: {
                    _id: { $in: sellerOrderObjectIds },
                    status: { $ne: "Pending" },
                    orderDate: {
                        $gte: new Date(currentYear, currentMonth, 1),
                        $lte: new Date(currentYear, currentMonth + 1, 0)
                    }
                }
            },
            {
                $group: {
                    _id: { $dayOfMonth: "$orderDate" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        const dailyOrderData = Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dayStat = dailyStats.find(s => s._id === day);
            return { date: day.toString(), value: dayStat ? dayStat.count : 0 };
        });

        // 5. Revenue metrics — computed from this seller's own OrderItem line totals
        // (not the whole Order.total, since one Order can span multiple sellers),
        // counted only once an item has actually been Delivered.
        const startOfToday = new Date(currentYear, now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfWeek.getDate() - 6);
        const startOfMonth = new Date(currentYear, currentMonth, 1);

        const revenueRows = await OrderItem.aggregate([
            { $match: { seller: sellerId, status: "Delivered" } },
            {
                $lookup: {
                    from: "orders",
                    localField: "order",
                    foreignField: "_id",
                    as: "orderDoc",
                },
            },
            { $unwind: "$orderDoc" },
            {
                $project: {
                    total: 1,
                    saleDate: { $ifNull: ["$orderDoc.deliveredAt", "$orderDoc.orderDate"] },
                },
            },
        ]);

        let totalSales = 0;
        let todaySales = 0;
        let weekSales = 0;
        let monthSales = 0;
        const monthlyRevenueMap = new Map<number, number>();
        const dailyRevenueMap = new Map<number, number>();

        revenueRows.forEach((row: any) => {
            const amount = row.total || 0;
            const saleDate = new Date(row.saleDate);
            totalSales += amount;
            if (saleDate >= startOfToday) todaySales += amount;
            if (saleDate >= startOfWeek) weekSales += amount;
            if (saleDate >= startOfMonth) monthSales += amount;
            if (saleDate.getFullYear() === currentYear) {
                const m = saleDate.getMonth() + 1;
                monthlyRevenueMap.set(m, (monthlyRevenueMap.get(m) || 0) + amount);
                if (saleDate.getMonth() === currentMonth) {
                    const d = saleDate.getDate();
                    dailyRevenueMap.set(d, (dailyRevenueMap.get(d) || 0) + amount);
                }
            }
        });

        const yearlySalesData = MONTHS.map((month, index) => ({
            date: month,
            value: Math.round(monthlyRevenueMap.get(index + 1) || 0),
        }));
        const dailySalesData = Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            return { date: day.toString(), value: Math.round(dailyRevenueMap.get(day) || 0) };
        });

        return res.status(200).json({
            success: true,
            message: "Dashboard stats fetched successfully",
            data: {
                stats: {
                    totalUser: totalCustomerCount,
                    totalCategory: totalCategoryCount,
                    totalSubcategory: totalSubcategoryCount,
                    totalProduct,
                    totalOrders,
                    completedOrders,
                    pendingOrders,
                    processingOrders,
                    shippedOrders,
                    cancelledOrders,
                    returnOrders,
                    soldOutProducts,
                    lowStockProducts,
                    // Revenue
                    totalSales: Math.round(totalSales),
                    todaySales: Math.round(todaySales),
                    weekSales: Math.round(weekSales),
                    monthSales: Math.round(monthSales),
                    // Settlement / Wallet (source of truth: commissionService + Seller balance)
                    pendingSettlement: Math.round(commissionData.pending || 0),
                    totalSettlementPaid: Math.round(commissionData.paid || 0),
                    availableBalance: Math.round(sellerDoc?.balance || 0),
                    onHoldBalance: Math.round(sellerDoc?.onHoldBalance || 0),
                    nextSettlementDate: commissionData.nextSettlementDate,
                    advertisementSpend: Math.round(advertisementSpend),
                    // Charts
                    yearlyOrderData,
                    dailyOrderData,
                    yearlySalesData,
                    dailySalesData,
                },
                newOrders: formattedNewOrders
            }
        });
    }
);
