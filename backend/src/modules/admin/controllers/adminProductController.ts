import { Request, Response } from "express";
import { normalizeVariants } from "../../../services/variantService";
import { resolveListingConfig } from "../../../services/listingConfigService";
import { asyncHandler } from "../../../utils/asyncHandler";
import Category from "../../../models/Category";
import SubCategory from "../../../models/SubCategory";
import Brand from "../../../models/Brand";
import Product from "../../../models/Product";
import Inventory from "../../../models/Inventory";
import Seller from "../../../models/Seller";
import HeaderCategory from "../../../models/HeaderCategory";
import Tax from "../../../models/Tax";
import { cache } from "../../../utils/cache";
import Admin from "../../../models/Admin";
import ProductAuditLog from "../../../models/ProductAuditLog";
import {
  auditProduct,
  configForProduct,
  generateSkuBase,
  listingProblems,
  findSkuProblem,
  newListingContext,
  describeProblems,
  notifySellerProductDecision,
} from "../../../services/productListingService";

// ==================== Category Controllers ====================

/**
 * Create a new category
 */
export const createCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      name,
      image,
      order,
      isBestseller,
      hasWarning,
      groupCategory,
      parentId,
      headerCategoryId,
      taxId,
      status = "Active",
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    if (taxId) {
      const tax = await Tax.findById(taxId);
      if (!tax) {
        return res.status(400).json({
          success: false,
          message: "Selected tax rate not found",
        });
      }
    }

    let finalHeaderCategoryId = headerCategoryId;

    // Validate parent if provided
    if (parentId) {
      // Cannot set parent to self
      if (parentId === req.body._id) {
        return res.status(400).json({
          success: false,
          message: "Cannot set category as its own parent",
        });
      }

      const parent = await Category.findById(parentId);
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: "Parent category not found",
        });
      }

      if (parent.status !== "Active") {
        return res.status(400).json({
          success: false,
          message: "Parent category must be active",
        });
      }

      // Inherit headerCategoryId from parent if not explicitly provided
      if (!finalHeaderCategoryId && parent.headerCategoryId) {
        finalHeaderCategoryId = parent.headerCategoryId.toString();
      }

      // If parent doesn't have headerCategoryId, subcategory cannot be created
      if (!finalHeaderCategoryId) {
        return res.status(400).json({
          success: false,
          message:
            "Parent category does not have a header category assigned. Please assign a header category to the parent category first.",
        });
      }
    }

    // Validate headerCategoryId (required for root categories)
    if (!finalHeaderCategoryId && !parentId) {
      return res.status(400).json({
        success: false,
        message: "Header category is required for root categories",
      });
    }

    // Validate headerCategory exists and is Published
    if (finalHeaderCategoryId) {
      const headerCategory = await HeaderCategory.findById(
        finalHeaderCategoryId
      );
      if (!headerCategory) {
        return res.status(400).json({
          success: false,
          message: "Header category not found",
        });
      }

      if (headerCategory.status !== "Published") {
        return res.status(400).json({
          success: false,
          message: "Header category must be Published",
        });
      }
    }

    // Auto-calculate order if not provided
    let finalOrder = order;
    if (finalOrder === undefined || finalOrder === null) {
      const lastCategory = await Category.findOne({
        parentId: parentId || null,
      })
        .sort({ order: -1 })
        .limit(1);
      finalOrder = lastCategory ? (lastCategory.order || 0) + 1 : 0;
    }

    const category = await Category.create({
      name,
      image,
      order: finalOrder,
      isBestseller: isBestseller || false,
      hasWarning: hasWarning || false,
      groupCategory,
      parentId: parentId || null,
      headerCategoryId: finalHeaderCategoryId || null,
      commissionRate: req.body.commissionRate || 0,
      taxId: taxId || null,
      status,
    });

    // Invalidate category caches
    cache.delete("customer-categories-list-v3");
    cache.delete("customer-categories-tree");
    cache.invalidatePattern(/^customer-category-/);

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category,
    });
  }
);

/**
 * Get all categories
 */
export const getCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      search,
      sortBy = "order",
      sortOrder = "asc",
      parentId,
      includeChildren = "false",
      status,
      headerCategoryId,
    } = req.query;

    const query: any = {};
    if (search) {
      query.name = { $regex: search as string, $options: "i" };
    }
    if (parentId !== undefined) {
      if (parentId === "null" || parentId === null || parentId === "") {
        query.parentId = null;
      } else {
        query.parentId = parentId;
      }
    }
    if (status) {
      query.status = status;
    }
    if (headerCategoryId) {
      query.headerCategoryId = headerCategoryId;
    }

    const sort: any = {};
    sort[sortBy as string] = sortOrder === "desc" ? -1 : 1;

    const categories = await Category.find(query)
      .populate("parentId", "name")
      .populate("headerCategoryId", "name status")
      .populate("taxId", "name percentage status")
      .sort(sort);

    // Count child categories for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const childrenCount = await Category.countDocuments({
          parentId: category._id,
        });
        // Also count old SubCategory model for backward compatibility
        const subcategoryCount = await SubCategory.countDocuments({
          category: category._id,
        });
        return {
          ...category.toObject(),
          childrenCount,
          totalSubcategories: childrenCount + subcategoryCount,
        };
      })
    );

    // If includeChildren is true, build hierarchical structure
    if (includeChildren === "true") {
      const buildTree = (parentId: any = null): any[] => {
        return categoriesWithCounts
          .filter((cat) => {
            const catParentId = cat.parentId
              ? cat.parentId._id || cat.parentId
              : null;
            const parentIdStr = parentId ? parentId.toString() : null;
            const catParentIdStr = catParentId ? catParentId.toString() : null;
            return catParentIdStr === parentIdStr;
          })
          .map((cat) => ({
            ...cat,
            children: buildTree(cat._id),
          }));
      };

      const tree = buildTree();
      return res.status(200).json({
        success: true,
        message: "Categories fetched successfully",
        data: tree,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Categories fetched successfully",
      data: categoriesWithCounts,
    });
  }
);

/**
 * Update category
 */
export const updateCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Validate parent change if parentId is being updated
    if (updateData.parentId !== undefined) {
      const validation = await Category.validateParentChange(
        id,
        updateData.parentId
      );
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.error,
        });
      }

      // If parent is being set, inherit headerCategoryId from parent if not explicitly provided
      if (updateData.parentId && !updateData.headerCategoryId) {
        const parent = await Category.findById(updateData.parentId);
        if (parent && parent.headerCategoryId) {
          updateData.headerCategoryId = parent.headerCategoryId;
        }
      }
    }

    // Validate taxId if being updated
    if (updateData.taxId) {
      const tax = await Tax.findById(updateData.taxId);
      if (!tax) {
        return res.status(400).json({
          success: false,
          message: "Selected tax rate not found",
        });
      }
    }

    // Validate headerCategoryId if being updated
    if (updateData.headerCategoryId !== undefined) {
      // If category has children, they should inherit the same header category
      // But we allow the change - children will keep their current headerCategoryId
      // unless explicitly updated

      // Validate headerCategory exists and is Published
      if (updateData.headerCategoryId) {
        const headerCategory = await HeaderCategory.findById(
          updateData.headerCategoryId
        );
        if (!headerCategory) {
          return res.status(400).json({
            success: false,
            message: "Header category not found",
          });
        }

        if (headerCategory.status !== "Published") {
          return res.status(400).json({
            success: false,
            message: "Header category must be Published",
          });
        }
      } else {
        // If headerCategoryId is being set to null/empty, check if category has children
        const childrenCount = await Category.countDocuments({ parentId: id });
        if (childrenCount > 0) {
          return res.status(400).json({
            success: false,
            message:
              "Cannot remove header category from a category that has subcategories",
          });
        }
      }
    }

    // Update category
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("parentId", "name")
      .populate("headerCategoryId", "name status")
      .populate("taxId", "name percentage status");

    // Invalidate category caches
    cache.delete("customer-categories-list-v3");
    cache.delete("customer-categories-tree");
    cache.invalidatePattern(/^customer-category-/);

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: updatedCategory,
    });
  }
);

/**
 * Delete category
 */
export const deleteCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if category has child categories (using parentId)
    const childrenCount = await Category.countDocuments({ parentId: id });
    if (childrenCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete category with subcategories. Please delete or move subcategories first.",
      });
    }

    // Check if category has old-style subcategories (backward compatibility)
    const subcategoryCount = await SubCategory.countDocuments({ category: id });
    if (subcategoryCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete category with subcategories. Please delete or move subcategories first.",
      });
    }

    const category = await Category.findByIdAndDelete(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Products are never deleted with their category. They stay in the sellers'
    // product lists but are hidden from customers until the seller picks a new
    // category for them.
    const hidden = await Product.updateMany({ category: id }, { $set: { publish: false } });

    // Invalidate category caches
    cache.delete("customer-categories-list-v3");
    cache.delete("customer-categories-tree");
    cache.invalidatePattern(/^customer-category-/);

    return res.status(200).json({
      success: true,
      message:
        hidden.modifiedCount > 0
          ? `Category deleted. ${hidden.modifiedCount} product(s) were kept and hidden from customers until the seller assigns a new category.`
          : "Category deleted successfully",
    });
  }
);

/**
 * Update category order
 */
export const updateCategoryOrder = asyncHandler(
  async (req: Request, res: Response) => {
    const { categories } = req.body; // Array of { id, order }

    if (!Array.isArray(categories)) {
      return res.status(400).json({
        success: false,
        message: "Categories array is required",
      });
    }

    const updatePromises = categories.map(
      ({ id, order }: { id: string; order: number }) =>
        Category.findByIdAndUpdate(
          id,
          { order, updatedAt: new Date() },
          { new: true }
        )
    );

    await Promise.all(updatePromises);

    return res.status(200).json({
      success: true,
      message: "Category order updated successfully",
    });
  }
);

/**
 * Toggle category status
 */
export const toggleCategoryStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, cascadeToChildren } = req.body;

    if (!["Active", "Inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Active or Inactive",
      });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Update category status
    category.status = status;
    await category.save();

    // Optionally cascade to children
    if (cascadeToChildren === true) {
      await Category.updateMany(
        { parentId: id },
        { status, updatedAt: new Date() }
      );
    }

    return res.status(200).json({
      success: true,
      message: `Category status updated to ${status}`,
      data: category,
    });
  }
);

/**
 * Bulk delete categories
 */
export const bulkDeleteCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const { categoryIds } = req.body;

    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Category IDs array is required",
      });
    }

    const results = {
      deleted: [] as string[],
      failed: [] as Array<{ id: string; reason: string }>,
    };

    for (const categoryId of categoryIds) {
      try {
        // Check for child categories
        const childrenCount = await Category.countDocuments({
          parentId: categoryId,
        });
        if (childrenCount > 0) {
          results.failed.push({
            id: categoryId,
            reason: "Category has child categories",
          });
          continue;
        }

        // Check for old-style subcategories
        const subcategoryCount = await SubCategory.countDocuments({
          category: categoryId,
        });
        if (subcategoryCount > 0) {
          results.failed.push({
            id: categoryId,
            reason: "Category has subcategories",
          });
          continue;
        }

        // Check for products
        const productCount = await Product.countDocuments({
          category: categoryId,
        });
        if (productCount > 0) {
          results.failed.push({
            id: categoryId,
            reason: "Category has associated products",
          });
          continue;
        }

        // Delete category
        const category = await Category.findByIdAndDelete(categoryId);
        if (category) {
          results.deleted.push(categoryId);
        } else {
          results.failed.push({
            id: categoryId,
            reason: "Category not found",
          });
        }
      } catch (error: any) {
        results.failed.push({
          id: categoryId,
          reason: error.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Bulk delete completed: ${results.deleted.length} deleted, ${results.failed.length} failed`,
      data: results,
    });
  }
);

// ==================== SubCategory Controllers ====================

/**
 * Create a new subcategory
 */
export const createSubCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, category, image, order } = req.body;

    if (!name || !category) {
      return res.status(400).json({
        success: false,
        message: "Subcategory name and category are required",
      });
    }

    const subcategory = await SubCategory.create({
      name,
      category,
      image,
      order: order || 0,
      commissionRate: req.body.commissionRate || 0,
    });

    // Update category subcategory count
    await Category.findByIdAndUpdate(category, {
      $inc: { totalSubcategories: 1 },
    });

    return res.status(201).json({
      success: true,
      message: "Subcategory created successfully",
      data: subcategory,
    });
  }
);

/**
 * Get all subcategories
 */
export const getSubCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const { category, search, sortBy = "order", sortOrder = "asc" } = req.query;

    const query: any = {};
    if (category) {
      query.category = category;
    }
    if (search) {
      query.name = { $regex: search as string, $options: "i" };
    }

    const sort: any = {};
    sort[sortBy as string] = sortOrder === "desc" ? -1 : 1;

    const subcategories = await SubCategory.find(query)
      .populate("category", "name")
      .sort(sort);

    // Get product counts for each subcategory
    const subcategoriesWithCounts = await Promise.all(
      subcategories.map(async (subcategory) => {
        const productCount = await Product.countDocuments({
          subcategory: subcategory._id,
        });

        return {
          ...subcategory.toObject(),
          totalProduct: productCount,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Subcategories fetched successfully",
      data: subcategoriesWithCounts,
    });
  }
);

/**
 * Update subcategory
 */
export const updateSubCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    const subcategory = await SubCategory.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate("category", "name");

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Subcategory updated successfully",
      data: subcategory,
    });
  }
);

/**
 * Delete subcategory
 */
export const deleteSubCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Check if subcategory has products
    const productCount = await Product.countDocuments({ subcategory: id });
    if (productCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete subcategory with products",
      });
    }

    const subcategory = await SubCategory.findByIdAndDelete(id);

    if (!subcategory) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found",
      });
    }

    // Update category subcategory count
    await Category.findByIdAndUpdate(subcategory.category, {
      $inc: { totalSubcategories: -1 },
    });

    return res.status(200).json({
      success: true,
      message: "Subcategory deleted successfully",
    });
  }
);

// ==================== Brand Controllers ====================

/**
 * Create a new brand
 */
export const createBrand = asyncHandler(async (req: Request, res: Response) => {
  const { name, image } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Brand name is required",
    });
  }

  const brand = await Brand.create({ name, image });

  return res.status(201).json({
    success: true,
    message: "Brand created successfully",
    data: brand,
  });
});

/**
 * Get all brands
 */
export const getBrands = asyncHandler(async (req: Request, res: Response) => {
  const { search } = req.query;

  const query: any = {};
  if (search) {
    query.name = { $regex: search as string, $options: "i" };
  }

  const brands = await Brand.find(query).sort({ name: 1 });

  return res.status(200).json({
    success: true,
    message: "Brands fetched successfully",
    data: brands,
  });
});

/**
 * Update brand
 */
export const updateBrand = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData = req.body;

  const brand = await Brand.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!brand) {
    return res.status(404).json({
      success: false,
      message: "Brand not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Brand updated successfully",
    data: brand,
  });
});

/**
 * Delete brand
 */
export const deleteBrand = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Check if brand has products
  const productCount = await Product.countDocuments({ brand: id });
  if (productCount > 0) {
    return res.status(400).json({
      success: false,
      message: "Cannot delete brand with products",
    });
  }

  const brand = await Brand.findByIdAndDelete(id);

  if (!brand) {
    return res.status(404).json({
      success: false,
      message: "Brand not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Brand deleted successfully",
  });
});

// ==================== Product Controllers ====================

/**
 * Create a new product
 */
export const createProduct = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      const productData = req.body;

      // If seller is not provided, use/create default Admin Store
      if (!productData.seller) {
        try {
          // Check for existing admin seller by email OR mobile to avoid duplicate key errors
          let adminSeller = await Seller.findOne({
            $or: [
              { email: "admin-store@exnshop.com" },
              { mobile: "9999999999" },
            ],
          });

          if (!adminSeller) {
            // Create default admin seller
            adminSeller = await Seller.create({
              sellerName: "Exnshop Admin",
              storeName: "Exnshop Admin Store",
              email: "admin-store@exnshop.com",
              mobile: "9999999999",
              password: "AdminStore@123", // Should be hashed by pre-save hook
              address: "",
              city: "",
              category: "Admin",
              commission: 0,
              status: "Approved",
              requireProductApproval: false,
            });
          }
          productData.seller = adminSeller._id;
        } catch (sellerError: any) {
          console.error("Error handling default admin seller:", sellerError);
          throw new Error(
            "Failed to assign default seller: " + sellerError.message
          );
        }
      }

      if (
        !productData.productName ||
        !productData.category ||
        !productData.price
      ) {
        return res.status(400).json({
          success: false,
          message: "Product name, category, and price are required",
        });
      }

      // Verify seller exists (if passed explicitly or set above)
      const seller = await Seller.findById(productData.seller);
      if (!seller) {
        return res.status(404).json({
          success: false,
          message: "Seller not found",
        });
      }

      // All products are published automatically without approval
      productData.status = "Active";
      productData.publish = true;
      productData.requiresApproval = false;

      // Every product-create form in this app (seller add/edit, bulk upload)
      // sends the uploaded Cloudinary URL as `mainImageUrl` — map it to the
      // actual schema field so it isn't silently dropped.
      if (productData.mainImageUrl) {
        productData.mainImage = productData.mainImageUrl;
        delete productData.mainImageUrl;
      }

      const product = await Product.create(productData);

      // Create inventory record
      try {
        await Inventory.create({
          product: product._id,
          seller: productData.seller,
          currentStock: Number(productData.stock) || 0,
          availableStock: Number(productData.stock) || 0,
        });
      } catch (invError) {
        // If inventory creation fails, delete the product to maintain consistency
        await Product.findByIdAndDelete(product._id);
        throw new Error(
          "Failed to create inventory: " + (invError as Error).message
        );
      }

      return res.status(201).json({
        success: true,
        message: "Product created successfully",
        data: product,
      });
    } catch (error: any) {
      // Handle Mongoose validation errors
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map(
          (val: any) => val.message
        );
        return res.status(400).json({
          success: false,
          message: messages.join(", "),
        });
      }
      // Handle CastError (invalid ObjectId, etc)
      if (error.name === "CastError") {
        return res.status(400).json({
          success: false,
          message: `Invalid value for ${error.path}: ${error.value}`,
        });
      }

      // Re-throw other errors to be handled by global error handler (will result in 500)
      // But we can return 400 if we suspect bad data
      return res.status(500).json({
        success: false,
        message: "Error creating product: " + error.message,
      });
    }
  }
);

/**
 * Get all products
 * Returns all products regardless of status (no approval workflow)
 * Use status query param to filter by specific status if needed
 */
export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const {
    page = 1,
    limit = 10,
    search,
    category,
    subcategory,
    brand,
    seller,
    status,
    publish,
    channel,
  } = req.query;

  const query: any = {};

  if (search) {
    query.$or = [
      { productName: { $regex: search as string, $options: "i" } },
      { sku: { $regex: search as string, $options: "i" } },
    ];
  }
  if (category) query.category = category;
  if (subcategory) query.subcategory = subcategory;
  if (brand) query.brand = brand;
  if (seller) query.seller = seller;

  if (channel === "Quick" || channel === "ECommerce") {
    const channelSellerIds = await Seller.find({ channels: channel }).distinct("_id");
    const existingSellerIds = await Seller.find({}).distinct("_id");
    // A product whose seller record no longer exists ("orphaned" — the seller
    // was deleted but their products weren't) can't be attributed to either
    // channel. Always include it rather than letting it silently disappear
    // from every tab, which otherwise makes it impossible to find and clean up.
    const visibleSellerFilter = {
      $or: [{ seller: { $in: channelSellerIds } }, { seller: { $nin: existingSellerIds } }],
    };
    if (query.seller) {
      query.$and = [...(query.$and || []), { seller: query.seller }, visibleSellerFilter];
      delete query.seller;
    } else {
      Object.assign(query, visibleSellerFilter);
    }
  }

  // Only filter by status if explicitly provided
  // All products show by default (no approval workflow)
  if (status) {
    query.status = status;
  }

  if (publish !== undefined) query.publish = publish === "true";

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [products, total] = await Promise.all([
    Product.find(query)
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("brand", "name")
      .populate("seller", "sellerName storeName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit as string)),
    Product.countDocuments(query),
  ]);

  // Reviewer-only fields are stripped from the default JSON; the admin list wants them.
  const draftCtx = newListingContext();
  const rows: any[] = [];
  for (const p of products) {
    const json: any = p.toJSON();
    json.qualityFlags = p.qualityFlags || [];
    json.reviewStartedByName = p.reviewStartedByName;
    // A draft shows what is still missing, so the admin knows why it can't go to review yet.
    if (p.status === "Draft") json.missingFields = await listingProblems(p.toObject(), draftCtx);
    rows.push(json);
  }

  return res.status(200).json({
    success: true,
    message: "Products fetched successfully",
    data: rows,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      pages: Math.ceil(total / parseInt(limit as string)),
    },
  });
});

/**
 * GET /admin/products/:id/variant-attributes
 * The variant attributes (Color, Size, …) and options set up in Listing Setup for this
 * product's header category / category / sub-category — the same list a seller sees.
 */
export const getProductVariantAttributes = asyncHandler(async (req: Request, res: Response) => {
  const product: any = await Product.findById(req.params.id).select("headerCategoryId category subcategory subSubCategory").lean();
  if (!product) return res.status(404).json({ success: false, message: "Product not found" });
  const config = await resolveListingConfig({
    headerCategoryId: product.headerCategoryId ? String(product.headerCategoryId) : undefined,
    category: product.category ? String(product.category) : undefined,
    subcategory: product.subcategory ? String(product.subcategory) : undefined,
    subSubCategory: product.subSubCategory ? String(product.subSubCategory) : undefined,
  });
  const attributes = config.attributes
    .filter((a) => a.isVariantAttribute)
    .map((a) => ({ label: a.label, values: a.allowedValues || [] }));
  return res.status(200).json({ success: true, data: attributes });
});

/**
 * PUT /admin/products/:id/variants
 * Admin variant manager: replaces the product's attributes and variant combinations
 * (SKU, MRP, selling price, stock, weight, photos, on/off) in one go.
 */
export const updateProductVariants = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: "Product not found" });

  const result = normalizeVariants(req.body || {});
  if ("error" in result) return res.status(400).json({ success: false, message: result.error });
  const v = result.data;

  // SKUs must not clash with this seller's other products.
  const skuProblem = await findSkuProblem(String(product.seller), { variations: v.variations }, String(product._id));
  if (skuProblem) return res.status(400).json({ success: false, message: skuProblem });

  const before = (product.variations || []).length;
  product.set({
    variantAxes: v.variantAxes,
    combinedAxes: v.combinedAxes,
    variationType: v.variationType,
    variations: v.variations,
    price: v.price,
    discPrice: v.discPrice,
    stock: v.stock,
  });
  product.markModified("variations");
  await product.save();

  await Inventory.findOneAndUpdate({ product: product._id }, { currentStock: product.stock, lastUpdated: new Date() }).catch(() => undefined);
  await auditProduct({
    product,
    ...(await adminActor(req)),
    action: "VARIANTS_UPDATED",
    changes: [{ field: "variations", from: before, to: v.variations.length }],
  });
  cache.invalidatePattern(/^customer-/);

  return res.status(200).json({ success: true, message: "Variants saved", data: product });
});

/**
 * GET /admin/products/review-counts?draftSince=ISO&pendingSince=ISO
 * Sidebar badges: how many drafts / products awaiting review there are, and how
 * many of them changed since the admin last opened that page.
 */
export const getReviewCounts = asyncHandler(async (req: Request, res: Response) => {
  const since = (v: unknown) => {
    const d = v ? new Date(String(v)) : null;
    return d && !isNaN(d.getTime()) ? d : new Date(0);
  };
  const draftSince = since(req.query.draftSince);
  const pendingSince = since(req.query.pendingSince);
  const sellerDraftSince = since(req.query.sellerDraftSince);

  const pendingFilter = { $or: [{ status: "Pending" }, { "pendingRevision.submittedAt": { $exists: true } }] };
  const sellerDraftFilter = { onboardingStatus: { $in: ["Draft", "KYCPending"] } };
  const [draftTotal, draftNew, pendingTotal, pendingNew, sellerDraftTotal, sellerDraftNew] = await Promise.all([
    Product.countDocuments({ status: "Draft" }),
    Product.countDocuments({ status: "Draft", updatedAt: { $gt: draftSince } }),
    Product.countDocuments(pendingFilter),
    Product.countDocuments({ $and: [pendingFilter, { updatedAt: { $gt: pendingSince } }] }),
    Seller.countDocuments(sellerDraftFilter),
    Seller.countDocuments({ ...sellerDraftFilter, updatedAt: { $gt: sellerDraftSince } }),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      serverTime: new Date().toISOString(),
      draft: { total: draftTotal, new: draftNew },
      pending: { total: pendingTotal, new: pendingNew },
      sellerDraft: { total: sellerDraftTotal, new: sellerDraftNew },
    },
  });
});

/**
 * POST /admin/products/:id/submit-draft
 * Admin finishes a seller's abandoned draft: it must be complete, then it moves
 * to Product Approvals like any submitted product.
 */
export const submitDraftForReview = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: "Product not found" });
  if (product.status !== "Draft") {
    return res.status(409).json({ success: false, message: `This product is ${product.status}, not a draft.` });
  }
  const problems = await listingProblems(product.toObject());
  if (problems.length) {
    return res.status(400).json({ success: false, message: describeProblems(problems), data: { missing: problems } });
  }
  product.status = "Pending";
  await product.save();
  await auditProduct({ product, ...(await adminActor(req)), action: "DRAFT_SUBMITTED_BY_ADMIN" });
  return res.status(200).json({ success: true, message: "Sent to Product Approvals for review." });
});

/**
 * Get product by ID
 */
export const getProductById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const product = await Product.findById(id)
      .populate("category", "name headerCategoryId")
      .populate("subcategory", "name subcategoryName")
      .populate("subSubCategory", "name")
      .populate("headerCategoryId", "name slug")
      .populate("brand", "name")
      .populate("tax", "name percentage")
      .populate("seller", "sellerName storeName")
      .populate("shopId", "name storeId image")
      .populate("approvedBy", "firstName lastName");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product fetched successfully",
      data: product,
    });
  }
);

/**
 * Update product
 */
export const updateProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    // Map frontend field names to model field names and sanitize empty strings to null
    if (updateData.headerCategoryId !== undefined) {
      updateData.headerCategoryId = updateData.headerCategoryId || null;
    }
    if (updateData.categoryId !== undefined) {
      updateData.category = updateData.categoryId || null;
      delete updateData.categoryId;
    }
    if (updateData.category !== undefined) {
      updateData.category = updateData.category || null;
    }
    if (updateData.subcategoryId !== undefined) {
      updateData.subcategory = updateData.subcategoryId || null;
      delete updateData.subcategoryId;
    }
    if (updateData.subcategory !== undefined) {
      updateData.subcategory = updateData.subcategory || null;
    }
    if (updateData.subSubCategoryId !== undefined) {
      updateData.subSubCategory = updateData.subSubCategoryId || null;
      delete updateData.subSubCategoryId;
    }
    if (updateData.subSubCategory !== undefined) {
      updateData.subSubCategory = updateData.subSubCategory || null;
    }
    if (updateData.brandId !== undefined) {
      updateData.brand = updateData.brandId || null;
      delete updateData.brandId;
    }
    if (updateData.brand !== undefined) {
      updateData.brand = updateData.brand || null;
    }
    if (updateData.taxId !== undefined) {
      updateData.tax = updateData.taxId || null;
      delete updateData.taxId;
    }
    if (updateData.tax !== undefined) {
      updateData.tax = updateData.tax || null;
    }
    if (updateData.mainImageUrl !== undefined) {
      updateData.mainImage = updateData.mainImageUrl;
      delete updateData.mainImageUrl;
    }
    if (updateData.galleryImageUrls !== undefined) {
      updateData.galleryImages = updateData.galleryImageUrls;
      delete updateData.galleryImageUrls;
    }

    // Process variations
    if (updateData.variations) {
      if (updateData.variations.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Product must have at least one variation",
        });
      }

      updateData.variations = updateData.variations.map((v: any) => ({
        ...v,
        value: v.value || v.title,
        name: v.name || "Variation",
        discPrice: v.discPrice || 0,
        status: v.status || "Available",
      }));

      for (const variation of updateData.variations) {
        if (Number(variation.discPrice) > Number(variation.price)) {
          return res.status(400).json({
            success: false,
            message: `Discounted price (${variation.discPrice}) cannot be greater than price (${variation.price}) for variation ${
              variation.title || variation.value
            }`,
          });
        }
      }

      updateData.price = updateData.variations[0].price;
      updateData.discPrice = updateData.variations[0].discPrice || 0;
      updateData.stock = updateData.variations.reduce(
        (acc: number, curr: any) => acc + (parseInt(curr.stock) || 0),
        0
      );
    }

    // Handle Shop by Store fields
    if (updateData.isShopByStoreOnly !== undefined) {
      updateData.isShopByStoreOnly =
        updateData.isShopByStoreOnly === true ||
        updateData.isShopByStoreOnly === "true";
    }
    if (updateData.shopId !== undefined) {
      updateData.shopId = updateData.shopId || null;
    } else if (updateData.isShopByStoreOnly === false) {
      updateData.shopId = null;
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    Object.assign(product, updateData);

    if (updateData.variations) {
      product.markModified("variations");
    }

    // A product whose category was deleted is kept but hidden. It can only go
    // live again once it has a category that still exists.
    if (product.publish && !product.isShopByStoreOnly) {
      const categoryExists = product.category ? await Category.exists({ _id: product.category }) : null;
      if (!categoryExists) {
        return res.status(400).json({
          success: false,
          message: "This product's category was deleted. Choose a new category for it, then publish.",
        });
      }
    }

    // Customers only see products that are status "Active" AND published.
    // - Inactive (seller paused it): publishing brings it back live.
    // - Draft: nothing goes live until every required detail is filled in. The
    //   admin can help the seller finish it; once complete, publishing makes it live.
    let wentLive = false;
    if (updateData.publish === true) {
      if (product.status === "Draft") {
        const problems = await listingProblems(product.toObject());
        if (problems.length) {
          return res.status(400).json({
            success: false,
            message: `Can't publish yet — the seller's details are incomplete. ${describeProblems(problems)}`,
            data: { missing: problems },
          });
        }
      }
      if (product.status === "Draft" || product.status === "Inactive") {
        product.status = "Active";
        (product as any).approvedBy = (req as any).user?.userId;
        (product as any).approvedAt = new Date();
        wentLive = true;
      }
    }

    await product.save();

    // A product that just went live (or was hidden) must show up for customers
    // right away, not after their cached lists expire.
    if (wentLive || updateData.publish !== undefined) {
      cache.invalidatePattern(/^customer-/);
    }

    // Update inventory if stock changed
    if (product.stock !== undefined) {
      await Inventory.findOneAndUpdate(
        { product: id },
        {
          currentStock: product.stock,
          availableStock: product.stock,
        },
        { upsert: true }
      );
    }

    const populatedProduct = await Product.findById(product._id)
      .populate("category", "name headerCategoryId")
      .populate("subcategory", "name subcategoryName")
      .populate("subSubCategory", "name")
      .populate("headerCategoryId", "name slug")
      .populate("brand", "name")
      .populate("tax", "name percentage")
      .populate("seller", "sellerName storeName")
      .populate("shopId", "name storeId image");

    return res.status(200).json({
      success: true,
      message: wentLive ? "Product is published and now live for customers." : "Product updated successfully",
      data: populatedProduct,
    });
  }
);

/**
 * Delete product
 */
export const deleteProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Delete inventory record
    await Inventory.findOneAndDelete({ product: id });

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  }
);

/**
 * Approve/reject product request
 */
export const approveProductRequest = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    const rejectionReason = String(req.body.rejectionReason || "").trim();

    if (!["Active", "Rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Active or Rejected",
      });
    }
    if (status === "Rejected" && !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: "Please give a reason so the seller knows what to fix",
      });
    }

    // Only a product the seller has submitted can be decided on. Drafts are
    // still the seller's to finish, and decided products need a fresh submission.
    const current = await Product.findById(id);
    if (!current) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    if (current.status !== "Pending") {
      return res.status(409).json({
        success: false,
        message:
          current.status === "Draft"
            ? "The seller hasn't submitted this product for review yet."
            : `This product is already ${current.status.toLowerCase()}; there is nothing to approve or reject.`,
      });
    }
    // Products created before SKUs existed get one now instead of being blocked.
    const generatedSku = !current.sku ? generateSkuBase(String(current.seller)) : undefined;
    if (status === "Active") {
      const problems = await listingProblems({ ...current.toObject(), sku: current.sku || generatedSku });
      if (current.listingVersion && current.listingVersion >= 2) {
        // Regulated categories: every required document must be approved, not just uploaded.
        const config = await configForProduct(current);
        const unapproved = config.rule.requiredDocs.filter(
          (r) => (current.complianceDocs || []).find((d) => d.docType === r.key)?.status !== "Approved"
        );
        if (unapproved.length) {
          return res.status(400).json({
            success: false,
            message: `Approve the compliance documents first: ${unapproved.map((d) => d.label).join(", ")}.`,
          });
        }
      }
      if (problems.length) {
        return res.status(400).json({
          success: false,
          message: `This product is incomplete, so it can't go live. Missing or invalid: ${problems.join(", ")}. Reject it with a note so the seller can fix it.`,
        });
      }
    }

    const updateData: any = {
      status,
      approvedBy: (req as any).user?.userId,
      approvedAt: new Date(),
    };
    if (generatedSku) updateData.sku = generatedSku;
    // The decision ends the "under review" claim.
    updateData.$unset = { reviewStartedAt: 1, reviewStartedBy: 1, reviewStartedByName: 1 };

    // Approving means "this is now live" — the seller's Add Product form
    // defaults Publish to No, so without this an approved product still
    // never appears to customers (customer queries require both
    // status: "Active" AND publish: true) until the seller separately
    // remembers to flip Publish themselves.
    if (status === "Active") {
      updateData.publish = true;
    }

    if (status === "Rejected" && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    const product = await Product.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("brand", "name")
      .populate("seller", "sellerName storeName");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    await auditProduct({
      product,
      ...(await adminActor(req)),
      action: status === "Active" ? "APPROVED" : "REJECTED",
      changes: [{ field: "status", from: "Pending", to: status }],
      remarks: rejectionReason || undefined,
    });
    notifySellerProductDecision(product, status === "Active" ? "Approved" : "Rejected", rejectionReason).catch((err) =>
      console.error("Failed to send product decision notification:", err)
    );

    return res.status(200).json({
      success: true,
      message: `Product ${status === "Active" ? "approved" : "rejected"
        } successfully`,
      data: product,
    });
  }
);

const adminActor = async (req: Request) => {
  const adminId = (req as any).user?.userId;
  const admin = adminId ? await Admin.findById(adminId).select("firstName lastName email") : null;
  return {
    actorType: "Admin" as const,
    actorId: adminId,
    actorName: admin ? `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || admin.email : "Admin",
  };
};

/**
 * Live listings whose seller edited customer-facing details (name, images,
 * category…). The approved version stays live until an admin decides.
 */
export const getProductRevisions = asyncHandler(async (_req: Request, res: Response) => {
  const products = await Product.find({ "pendingRevision.submittedAt": { $exists: true } })
    .populate("category", "name")
    .populate("seller", "sellerName storeName")
    .sort({ "pendingRevision.submittedAt": 1 })
    .limit(200)
    .lean();

  const rows = products.map((p: any) => {
    const data = p.pendingRevision?.data || {};
    return {
      _id: p._id,
      productName: p.productName,
      mainImage: p.mainImage,
      seller: p.seller,
      submittedAt: p.pendingRevision?.submittedAt,
      changes: Object.keys(data).map((field) => ({ field, from: p[field] ?? null, to: data[field] })),
    };
  });
  return res.status(200).json({ success: true, data: rows });
});

/** Approve (apply) or reject (discard) a seller's pending edits to a live listing. */
export const decideProductRevision = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const decision = req.body.decision as "Approved" | "Rejected";
  const remarks = String(req.body.remarks || "").trim();

  if (!["Approved", "Rejected"].includes(decision)) {
    return res.status(400).json({ success: false, message: "Decision must be Approved or Rejected" });
  }
  if (decision === "Rejected" && !remarks) {
    return res.status(400).json({ success: false, message: "Please give a reason so the seller knows what to fix" });
  }

  const product = await Product.findById(id);
  const revision = (product?.pendingRevision as any)?.data;
  if (!product || !revision) {
    return res.status(404).json({ success: false, message: "There are no pending edits for this product" });
  }

  const applied = Object.entries(revision).map(([field, to]) => ({ field, from: (product as any)[field], to }));
  if (decision === "Approved") {
    Object.assign(product, revision);
    const problems = await listingProblems(product.toObject());
    if (problems.length) {
      return res.status(400).json({
        success: false,
        message: `These edits would leave the product incomplete (${problems.join(", ")}). Reject them with a note instead.`,
      });
    }
    product.approvedBy = (req as any).user?.userId;
    product.approvedAt = new Date();
  }
  (product as any).pendingRevision = undefined;
  await product.save();

  await auditProduct({
    product,
    ...(await adminActor(req)),
    action: decision === "Approved" ? "REVISION_APPROVED" : "REVISION_REJECTED",
    changes: applied,
    remarks: remarks || undefined,
  });
  notifySellerProductDecision(product, decision, remarks, "edit").catch((err) =>
    console.error("Failed to send revision decision notification:", err)
  );

  return res.status(200).json({ success: true, message: `Edits ${decision === "Approved" ? "approved and applied" : "rejected"}` });
});

export const getProductAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const log = await ProductAuditLog.find({ product: req.params.id }).sort({ createdAt: -1 }).limit(200).lean();
  return res.status(200).json({ success: true, data: log });
});

/**
 * Bulk import products
 */
export const bulkImportProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const { products } = req.body; // Array of product objects

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Products array is required",
      });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[],
    };

    for (let i = 0; i < products.length; i++) {
      try {
        const productData = products[i];

        // Validate required fields
        if (
          !productData.productName ||
          !productData.category ||
          !productData.seller ||
          !productData.price
        ) {
          results.failed++;
          results.errors.push({
            index: i,
            error: "Missing required fields",
          });
          continue;
        }

        // Verify seller exists
        const seller = await Seller.findById(productData.seller);
        if (!seller) {
          results.failed++;
          results.errors.push({
            index: i,
            error: "Seller not found",
          });
          continue;
        }

        // All products are published automatically without approval
        productData.status = "Active";
        productData.publish = true;
        productData.requiresApproval = false;

        const product = await Product.create(productData);

        // Create inventory record
        await Inventory.create({
          product: product._id,
          seller: productData.seller,
          currentStock: productData.stock || 0,
          availableStock: productData.stock || 0,
        });

        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          index: i,
          error: error.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Bulk import completed: ${results.success} succeeded, ${results.failed} failed`,
      data: results,
    });
  }
);

/**
 * Bulk update products
 */
export const bulkUpdateProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const { productIds, updateData } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Product IDs array is required",
      });
    }

    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Update data is required",
      });
    }

    const result = await Product.updateMany(
      { _id: { $in: productIds } },
      { $set: updateData }
    );

    // Update inventory if stock is being updated
    if (updateData.stock !== undefined) {
      await Inventory.updateMany(
        { product: { $in: productIds } },
        {
          currentStock: updateData.stock,
          availableStock: updateData.stock,
        }
      );
    }

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} products updated successfully`,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount,
      },
    });
  }
);

/**
 * Update product display order (for featured lists etc)
 */
export const updateProductOrder = asyncHandler(
  async (req: Request, res: Response) => {
    const { products } = req.body; // Array of { id, order }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Products array is required",
      });
    }

    const updates = products.map(({ id, order }) =>
      Product.findByIdAndUpdate(id, { order })
    );

    await Promise.all(updates);

    return res.status(200).json({
      success: true,
      message: "Product order updated successfully",
    });
  }
);
