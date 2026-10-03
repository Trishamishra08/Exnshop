import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import RtoPromoBanner from "../../../models/RtoPromoBanner";

export const getAllRtoPromoBanners = asyncHandler(async (_req: Request, res: Response) => {
  const banners = await RtoPromoBanner.find().sort({ order: 1, createdAt: -1 });
  return res.status(200).json({ success: true, data: banners });
});

export const createRtoPromoBanner = asyncHandler(async (req: Request, res: Response) => {
  const { heading, bodyText, ctaText, ctaLink, image, startDate, endDate, isActive, order } = req.body;

  if (!heading) {
    return res.status(400).json({ success: false, message: "Heading is required" });
  }

  const banner = await RtoPromoBanner.create({
    heading,
    bodyText,
    ctaText,
    ctaLink,
    image,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    isActive: isActive !== undefined ? isActive : true,
    order: order || 0,
  });

  return res.status(201).json({ success: true, data: banner });
});

export const updateRtoPromoBanner = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updateData = { ...req.body };
  if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
  if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);

  const banner = await RtoPromoBanner.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!banner) {
    return res.status(404).json({ success: false, message: "Banner not found" });
  }

  return res.status(200).json({ success: true, data: banner });
});

export const deleteRtoPromoBanner = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const banner = await RtoPromoBanner.findByIdAndDelete(id);
  if (!banner) {
    return res.status(404).json({ success: false, message: "Banner not found" });
  }
  return res.status(200).json({ success: true, message: "Banner deleted" });
});
