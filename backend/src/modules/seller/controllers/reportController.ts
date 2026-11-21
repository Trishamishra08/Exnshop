import { Request, Response } from "express";
import OrderItem from "../../../models/OrderItem";
import { asyncHandler } from "../../../utils/asyncHandler";

/**
 * Get seller's sales report with filters, sorting, and pagination
 */
/** SKU and the product variation ID behind an order item (matched by SKU, then by option name). */
const skuAndVariation = (item: any) => {
    const product: any = item.product;
    const variations: any[] = (product && product.variations) || [];
    const label = String(item.variation || "").toLowerCase();
    const v =
        variations.find((x) => item.sku && x.sku === item.sku) ||
        variations.find((x) => label && [x.title, x.value].some((t) => String(t || "").toLowerCase() === label));
    return {
        sku: item.sku || (v && v.sku) || (product && product.sku) || "",
        variationId: v ? String(v._id) : product ? `${product._id}-default` : "",
    };
};

export const getSalesReport = asyncHandler(
    async (req: Request, res: Response) => {
        const sellerId = (req as any).user.userId;
        const {
            fromDate,
            toDate,
            search,
            page = "1",
            limit = "10",
            sortBy = "createdAt",
            sortOrder = "desc",
        } = req.query;

        // Build query - filter by authenticated seller
        const query: any = { seller: sellerId };

        // Date range filter
        if (fromDate || toDate) {
            query.createdAt = {};
            if (fromDate) {
                query.createdAt.$gte = new Date(fromDate as string);
            }
            if (toDate) {
                // Set to end of day
                const endDay = new Date(toDate as string);
                endDay.setHours(23, 59, 59, 999);
                query.createdAt.$lte = endDay;
            }
        }

        // Search filter (on product name or order ID)
        if (search) {
            query.$or = [
                { productName: { $regex: search, $options: "i" } },
                { sku: { $regex: search, $options: "i" } },
                // If orderId is available as a string or regex matchable field
                // Note: orderId in OrderItem is an ObjectId pointing to Order model
            ];
        }

        // Pagination
        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        // Sort
        const sort: any = {};
        sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

        // Get order items with populated order info
        const orderItems = await OrderItem.find(query)
            .populate({
                path: "order",
                select: "orderNumber createdAt"
            })
            .populate({ path: "product", select: "sku variations._id variations.sku variations.title variations.value" })
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

        // Get total count for pagination
        const total = await OrderItem.countDocuments(query);

        // Format response for frontend
        const reports = orderItems.map(item => ({
            orderId: (item.order as any)?.orderNumber || '',
            orderItemId: item._id.toString().slice(-4), // SR No / Item ID shortcut
            product: item.productName,
            variant: item.variantTitle,
            ...skuAndVariation(item),
            quantity: item.quantity,
            // subtotal is not filled on order items; the line total is unit price x quantity
            total: item.total || item.subtotal || (item.unitPrice || 0) * (item.quantity || 0),
            date: item.createdAt.toISOString().replace('T', ' ').split('.')[0], // YYYY-MM-DD HH:mm:ss
        }));

        return res.status(200).json({
            success: true,
            message: "Sales report fetched successfully",
            data: reports,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    }
);
