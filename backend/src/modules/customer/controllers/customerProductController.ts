import { Request, Response } from "express";
import Product from "../../../models/Product";
import Category from "../../../models/Category";
import SubCategory from "../../../models/SubCategory";
import Seller from "../../../models/Seller";
import mongoose from "mongoose";
import { findSellersWithinRange } from "../../../utils/locationHelper";
import AppSettings from "../../../models/AppSettings";
import { parseChannelQueryParam, resolveSellerChannel, sellerIdsForLocation } from "../../../utils/commerceChannelHelper";
import { getActiveCampaignsForProducts, recordImpressions, recordClick } from "../../../services/campaignService";
import { configForProduct } from "../../../services/productListingService";
import { buildSpecGroups } from "../../../services/listingConfigService";

// Get products with filtering options (public)
export const getProducts = async (req: Request, res: Response) => {
  try {
    const {
      category,
      subcategory,
      search,
      page = 1,
      limit = 20,
      sort,
      minPrice,
      maxPrice,
      brand,
      minDiscount,
      latitude, // User location latitude
      longitude, // User location longitude
      mode, // 'quick' | 'ecommerce' — which catalog tab the customer is browsing
    } = req.query;

    const query: any = {
      status: "Active",
      publish: true,
      // Exclude shop-by-store-only products from category pages
      $or: [
        { isShopByStoreOnly: { $ne: true } },
        { isShopByStoreOnly: { $exists: false } },
      ],
    };

    // Quick and E-commerce are still separate catalogs to the customer — a
    // seller registered only for Quick must never appear while browsing
    // ECommerce ("Shop All"), and vice versa. Location narrows it further.
    const channel = parseChannelQueryParam(mode);
    const userLat = latitude ? parseFloat(latitude as string) : null;
    const userLng = longitude ? parseFloat(longitude as string) : null;

    // nearbySellerIds is the pure location-based set (used below for the
    // per-product `isAvailable` flag); query.seller is separately narrowed to
    // the requested channel so it doesn't leak into that distance check.
    let nearbySellerIds: mongoose.Types.ObjectId[] = [];
    if (userLat && userLng && !isNaN(userLat) && !isNaN(userLng)) {
      nearbySellerIds = await sellerIdsForLocation(userLat, userLng, channel);
      query.seller = { $in: nearbySellerIds };
    } else if (channel) {
      // No location, but still restrict to the requested channel.
      query.seller = { $in: await Seller.find({ channels: channel, status: "Approved" }).distinct("_id") };
    }
    // No location and no channel: don't filter by seller at all (matches
    // original no-location, no-channel-preference behavior).

    // Helper to resolve category/subcategory ID from slug or ID
    const resolveId = async (
      model: any,
      value: string,
      modelName: string = ""
    ) => {
      if (mongoose.Types.ObjectId.isValid(value)) return value;

      const baseQuery: any = {};
      if (modelName === "Category") {
        baseQuery.status = "Active";
      }

      let item = await model
        .findOne({ ...baseQuery, slug: value })
        .select("_id")
        .lean();
      if (item) return item._id;

      item = await model
        .findOne({
          ...baseQuery,
          slug: { $regex: new RegExp(`^${value}$`, "i") },
        })
        .select("_id")
        .lean();
      if (item) return item._id;

      let namePattern = value.replace(/[-_]/g, " ");
      item = await model
        .findOne({
          ...baseQuery,
          name: { $regex: new RegExp(`^${namePattern}$`, "i") },
        })
        .select("_id")
        .lean();
      if (item) return item._id;

      if (modelName === "Category" && value.includes("and")) {
        const withAmpersand = value.replace(/-and-/g, " & ").replace(/-/g, " ");
        item = await model
          .findOne({
            ...baseQuery,
            name: { $regex: new RegExp(`^${withAmpersand}$`, "i") },
          })
          .select("_id")
          .lean();
        if (item) return item._id;
      }

      return null;
    };

    if (category) {
      const categoryId = await resolveId(
        Category,
        category as string,
        "Category"
      );
      if (categoryId) {
        const categoryDoc = await Category.findById(categoryId).lean();
        if (categoryDoc && categoryDoc.parentId) {
          query.category = categoryDoc.parentId;
          query.subcategory = categoryDoc._id;
        } else {
          query.category = categoryId;
        }
      }
    }

    if (subcategory) {
      let subcategoryId = await resolveId(
        Category,
        subcategory as string,
        "Category"
      );
      if (!subcategoryId) {
        subcategoryId = await resolveId(
          SubCategory,
          subcategory as string,
          "SubCategory"
        );
      }
      if (subcategoryId) query.subcategory = subcategoryId;
    }

    if (brand) {
      query.brand = brand;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (minDiscount) {
      query.discount = { $gte: Number(minDiscount) };
    }

    if (search) {
      // Use regex search for partial matching (much better user experience than text search for small catalogs)
      const searchRegex = { $regex: search as string, $options: "i" };
      query.$or = [
        { productName: searchRegex },
        { tags: searchRegex },
        { smallDescription: searchRegex }
      ];
    }

    // Calculate skip for pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Build sort object
    let sortOptions: any = { createdAt: -1 }; // Default new to old
    if (sort === "price_asc") sortOptions = { price: 1 };
    if (sort === "price_desc") sortOptions = { price: -1 };
    if (sort === "discount") sortOptions = { discount: -1 };
    if (sort === "popular") sortOptions = { popular: -1, dealOfDay: -1 };

    const products = await Product.find(query)
      .populate("category", "name icon image")
      .populate("subcategory", "name")
      .populate("brand", "name")
      .populate("seller", "storeName sellerName viewCustomerDetails channels")
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit));

    const total = await Product.countDocuments(query);

    const formattedProducts = products.map((p: any) => {
      const prodObj = p.toObject ? p.toObject() : { ...p };
      const sellerIdStr = prodObj.seller ? (typeof prodObj.seller === "object" ? prodObj.seller._id?.toString() : prodObj.seller.toString()) : null;
      const isAvailable = nearbySellerIds && nearbySellerIds.length > 0 && sellerIdStr
        ? nearbySellerIds.some((id) => id && id.toString() === sellerIdStr)
        : false;
      prodObj.isAvailable = isAvailable;

      if (prodObj.seller && typeof prodObj.seller === "object" && prodObj.seller.viewCustomerDetails === false) {
        delete prodObj.seller.storeName;
        delete prodObj.seller.sellerName;
      }
      return prodObj;
    });

    // Mark sponsored products (active ad campaigns) and log impressions.
    // Fully additive/non-blocking — never allowed to break a listing response.
    try {
      const campaignMap = await getActiveCampaignsForProducts(
        formattedProducts.map((p: any) => p._id)
      );
      if (campaignMap.size > 0) {
        const impressionEntries: { campaignId: any; productId: string }[] = [];
        formattedProducts.forEach((p: any) => {
          const winner = campaignMap.get(p._id.toString());
          if (winner) {
            p.isSponsored = true;
            impressionEntries.push({ campaignId: winner.campaign._id, productId: p._id });
          }
        });
        recordImpressions(impressionEntries);
      }
    } catch (err) {
      console.error("Failed to mark sponsored products:", err);
    }

    return res.status(200).json({
      success: true,
      data: formattedProducts,
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
      message: "Error fetching products",
      error: error.message,
    });
  }
};

/**
 * Quick sellers who are offline (shop switched off) right now. The customer app
 * keeps showing their products but greys them out as "Seller not available";
 * the cart and checkout refuse them on the server as well.
 */
export const getUnavailableSellers = async (_req: Request, res: Response) => {
  try {
    const ids = await Seller.find({ isShopOpen: false, channels: "Quick", status: "Approved" }).distinct("_id");
    return res.status(200).json({ success: true, data: ids.map(String) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: "Error fetching seller availability", error: error.message });
  }
};

// Log a click on a sponsored product card (public, fire-and-forget from the frontend)
export const logAdClick = async (req: Request, res: Response) => {
  try {
    await recordClick(req.params.id);
    return res.status(200).json({ success: true, message: "Click recorded" });
  } catch (error: any) {
    // Never let ad-tracking failures surface as a real error to the customer app.
    return res.status(200).json({ success: true, message: "Click recorded" });
  }
};

// Get single product by ID (public)
export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, mode } = req.query; // User location + browsing channel
    const channel = parseChannelQueryParam(mode);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await Product.findOne({
      _id: id,
      status: "Active",
      publish: true,
    })
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("brand", "name")
      .populate(
        "seller",
        "sellerName storeName city fssaiLicNo address location serviceRadiusKm viewCustomerDetails channels"
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unavailable",
      });
    }

    const seller = product.seller as any;

    // A seller registered only for Quick must never be reachable while the
    // customer is browsing in ECommerce ("Shop All") mode, and vice versa —
    // not even by navigating straight to the product's URL (shared link,
    // stale search result, etc). Only enforced when the caller actually
    // specified which channel they're browsing.
    if (channel && Array.isArray(seller?.channels) && !seller.channels.includes(channel)) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unavailable",
      });
    }

    // Parse location
    const userLat = latitude ? parseFloat(latitude as string) : null;
    const userLng = longitude ? parseFloat(longitude as string) : null;

    // Initialize availability flag
    let isAvailableAtLocation = false;

    // Safely get seller ID - handle both populated and unpopulated cases
    let sellerId: mongoose.Types.ObjectId | null = null;
    if (seller) {
      if (typeof seller === "object" && seller._id) {
        // Seller is populated
        sellerId = seller._id;
      } else if (seller instanceof mongoose.Types.ObjectId) {
        // Seller is an ObjectId (not populated)
        sellerId = seller;
      } else if (typeof seller === "string") {
        // Seller is a string ID
        sellerId = new mongoose.Types.ObjectId(seller);
      }
    }

    // E-commerce products ship anywhere by courier; only Quick products depend
    // on the customer being inside the seller's delivery radius.
    if (resolveSellerChannel(seller?.channels, channel) === "ECommerce") {
      isAvailableAtLocation = true;
    } else if (
      userLat &&
      userLng &&
      !isNaN(userLat) &&
      !isNaN(userLng) &&
      sellerId &&
      seller?.location
    ) {
      const nearbySellerIds = await findSellersWithinRange(userLat, userLng);
      isAvailableAtLocation = nearbySellerIds.some(
        (id) => id.toString() === sellerId!.toString()
      );
    }

    // Find similar products (by category)
    // Filter by location
    const similarProductsQuery: any = {
      _id: { $ne: product._id },
      status: "Active",
      publish: true,
      // Exclude shop-by-store-only products from similar products
      $or: [
        { isShopByStoreOnly: { $ne: true } },
        { isShopByStoreOnly: { $exists: false } },
      ],
    };

    // Safely get category ID - handle both populated and unpopulated cases
    let categoryId: mongoose.Types.ObjectId | null = null;
    if (product.category) {
      if (
        typeof product.category === "object" &&
        (product.category as any)._id
      ) {
        // Category is populated
        categoryId = (product.category as any)._id;
      } else if (product.category instanceof mongoose.Types.ObjectId) {
        // Category is an ObjectId (not populated)
        categoryId = product.category;
      } else if (typeof product.category === "string") {
        // Category is a string ID
        categoryId = new mongoose.Types.ObjectId(product.category);
      }
    }

    // Only add category filter if we have a valid category ID
    if (categoryId) {
      similarProductsQuery.category = categoryId;
    }

    // Filter similar products by location and by the same browsing channel as
    // the product being viewed (falls back to the product's own channel when
    // the caller didn't pass `mode`, so a Quick product's "similar products"
    // don't surface ECommerce-only sellers).
    const similarProductsChannel = channel ?? resolveSellerChannel((seller as any)?.channels);
    if (userLat && userLng && !isNaN(userLat) && !isNaN(userLng)) {
      similarProductsQuery.seller = { $in: await sellerIdsForLocation(userLat, userLng, similarProductsChannel) };
    } else {
      similarProductsQuery.seller = { $in: await Seller.find({ channels: similarProductsChannel, status: "Approved" }).distinct("_id") };
    }

    const similarProducts = await Product.find(similarProductsQuery)
      .limit(6)
      .select(
        "productName price discPrice compareAtPrice mrp variations mainImage pack discount _id rating reviewsCount"
      );

    const settings = await AppSettings.getSettings();
    let showSellerDetails = settings?.features?.showSellerDetails !== false;

    const prodObj: any = product.toObject();
    // Internal listing/review data never goes to customers; show labelled specs instead.
    for (const internal of ["complianceDocs", "qualityFlags", "reviewStartedAt", "reviewStartedBy", "reviewStartedByName", "pendingRevision", "approvedBy"]) {
      delete prodObj[internal];
    }
    const listingConfig = await configForProduct(product);
    prodObj.specGroups = buildSpecGroups(listingConfig.attributes, prodObj.attributes);
    prodObj.specifications = listingConfig.attributes
      // Variant options (colour, size…) belong to the selected variant, never to the product-wide specs.
      .filter((a) => !a.isVariantAttribute)
      .filter((a) => {
        const v = prodObj.attributes?.[a.key];
        return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
      })
      .map((a) => {
        const v = prodObj.attributes[a.key];
        const text = Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
        return { label: a.label, value: a.unit ? `${text} ${a.unit}` : text };
      });
    if (prodObj.seller && typeof prodObj.seller === "object" && (prodObj.seller as any).viewCustomerDetails === false) {
      showSellerDetails = false;
      delete (prodObj.seller as any).storeName;
      delete (prodObj.seller as any).sellerName;
      delete (prodObj.seller as any).city;
      delete (prodObj.seller as any).address;
    }

    return res.status(200).json({
      success: true,
      data: {
        ...prodObj,
        similarProducts,
        isAvailableAtLocation, // Add availability flag to response
        showSellerDetails, // Add seller visibility flag
      },
    });
  } catch (error: any) {
    console.error("Error in getProductById:", {
      productId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Error fetching product details",
      error: error.message,
    });
  }
};
