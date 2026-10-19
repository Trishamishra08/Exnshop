import { Request, Response } from "express";
import HeaderCategory from "../../../models/HeaderCategory";
import Seller from "../../../models/Seller";

// "all" is the customer app's built-in default tab; a header category saved
// with this slug is filtered out of the customer UI and its products vanish.
const isReservedSlug = (slug: unknown) =>
  typeof slug === "string" && slug.trim().toLowerCase() === "all";
const RESERVED_SLUG_MESSAGE =
  'The "all" theme is reserved for the default tab. Please choose a different theme.';

// @desc    Get all header categories (Admin)
// @route   GET /api/v1/header-categories/admin
// @access  Private/Admin
export const getAdminHeaderCategories = async (
  _req: Request,
  res: Response
) => {
  try {
    const categories = await HeaderCategory.find().sort({
      order: 1,
      createdAt: -1,
    });
    return res.json(categories);
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error });
  }
};

// @desc    Get published header categories (Public)
// @route   GET /api/v1/header-categories
// @access  Public
export const getHeaderCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await HeaderCategory.find({ status: "Published" }).sort({
      order: 1,
      createdAt: -1,
    });
    return res.json(categories);
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error });
  }
};

// @desc    Create a header category
// @route   POST /api/v1/header-categories
// @access  Private/Admin
export const createHeaderCategory = async (req: Request, res: Response) => {
  try {
    const {
      name,
      iconLibrary,
      iconName,
      slug,
      relatedCategory,
      status,
      order,
    } = req.body;

    if (isReservedSlug(slug)) {
      return res.status(400).json({ message: RESERVED_SLUG_MESSAGE });
    }

    const categoryExists = await HeaderCategory.findOne({ slug });
    if (categoryExists) {
      return res
        .status(400)
        .json({ message: "Header category already exists" });
    }

    const category = await HeaderCategory.create({
      name,
      iconLibrary,
      iconName,
      slug,
      relatedCategory,
      status,
      order,
    });

    return res.status(201).json(category);
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error });
  }
};

// @desc    Update a header category
// @route   PUT /api/v1/header-categories/:id
// @access  Private/Admin
// @desc    Update a header category
// @route   PUT /api/v1/header-categories/:id
// @access  Private/Admin
export const updateHeaderCategory = async (req: Request, res: Response) => {
  try {
    const {
      name,
      iconLibrary,
      iconName,
      slug,
      relatedCategory,
      status,
      order,
    } = req.body;
    const category = await HeaderCategory.findById(req.params.id);

    if (category) {
      if (isReservedSlug(slug)) {
        return res.status(400).json({ message: RESERVED_SLUG_MESSAGE });
      }

      // Check if slug is being updated and if it's already taken
      if (slug && slug !== category.slug) {
        const slugExists = await HeaderCategory.findOne({ slug });
        if (slugExists) {
          return res
            .status(400)
            .json({ message: "Theme/Slug already used by another category" });
        }
      }

      const previousName = category.name;
      category.name = name || category.name;
      category.iconLibrary = iconLibrary || category.iconLibrary;
      category.iconName = iconName || category.iconName;
      category.slug = slug || category.slug;
      category.relatedCategory = relatedCategory; // Allow clearing it (undefined or null or empty string)
      category.status = status || category.status;
      category.order = order !== undefined ? order : category.order;

      const updatedCategory = await category.save();

      // Sellers keep their departments by name; carry a rename over so they don't
      // lose access to the department they registered for.
      if (previousName && category.name !== previousName) {
        await Seller.updateMany(
          { categories: previousName },
          { $set: { "categories.$[old]": category.name } },
          { arrayFilters: [{ old: previousName }] }
        );
      }
      return res.json(updatedCategory);
    } else {
      return res.status(404).json({ message: "Header category not found" });
    }
  } catch (error: any) {
    console.error("Update Header Category Error:", error);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ message: "Category with this slug/theme already exists" });
    }
    return res
      .status(500)
      .json({ message: "Server Error", error: error.message });
  }
};

// @desc    Delete a header category
// @route   DELETE /api/v1/header-categories/:id
// @access  Private/Admin
export const deleteHeaderCategory = async (req: Request, res: Response) => {
  try {
    const category = await HeaderCategory.findById(req.params.id);

    if (category) {
      await category.deleteOne();
      return res.json({ message: "Header category removed" });
    } else {
      return res.status(404).json({ message: "Header category not found" });
    }
  } catch (error) {
    return res.status(500).json({ message: "Server Error", error });
  }
};
