import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { cache } from "../../../utils/cache";
import HomePageContent, { HOME_PAGE_CONTENT_CACHE_KEY } from "../../../models/HomePageContent";

const EDITABLE = [
  "banners",
  "fallbackHeadline",
  "searchPlaceholder",
  "trustItems",
  "offerCards",
  "productSections",
  "shopByCategory",
  "translations",
] as const;

/** GET /admin/home-page-content — the single home page content document (null if never saved). */
export const getHomePageContent = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await HomePageContent.findOne({ key: "default" }).lean();
  return res.status(200).json({ success: true, data: doc || null });
});

/** PUT /admin/home-page-content — save (creates it the first time); the customer home cache is cleared. */
export const updateHomePageContent = asyncHandler(async (req: Request, res: Response) => {
  const update: Record<string, any> = {};
  for (const key of EDITABLE) {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  }
  // Re-number list items so their order is always 0..n in the order sent
  for (const list of ["banners", "trustItems", "offerCards", "productSections"]) {
    if (Array.isArray(update[list])) {
      update[list] = update[list].map((item: any, i: number) => {
        const { _id, ...rest } = item || {};
        return { ...(_id && /^[a-f0-9]{24}$/i.test(String(_id)) ? { _id } : {}), ...rest, order: i };
      });
    }
  }
  if (Array.isArray(update.banners) && update.banners.some((b: any) => !b?.image)) {
    return res.status(400).json({ success: false, message: "Every banner needs an image" });
  }

  try {
    const doc = await HomePageContent.findOneAndUpdate(
      { key: "default" },
      { $set: update, $setOnInsert: { key: "default" } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    cache.delete(HOME_PAGE_CONTENT_CACHE_KEY);
    return res.status(200).json({ success: true, message: "Home page content saved", data: doc });
  } catch (err: any) {
    if (err?.name === "ValidationError") {
      const first = Object.values(err.errors || {})[0] as any;
      return res.status(400).json({ success: false, message: first?.message || "Invalid home page content" });
    }
    throw err;
  }
});
