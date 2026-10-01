import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Courier from "../../../models/Courier";

export const getCouriers = asyncHandler(async (_req: Request, res: Response) => {
  const couriers = await Courier.find({}).sort({ name: 1 });
  return res.status(200).json({
    success: true,
    message: "Couriers fetched successfully",
    data: couriers,
  });
});

export const getCourierById = asyncHandler(async (req: Request, res: Response) => {
  const courier = await Courier.findById(req.params.id);
  if (!courier) {
    return res.status(404).json({ success: false, message: "Courier not found" });
  }
  return res.status(200).json({ success: true, message: "Courier fetched successfully", data: courier });
});

export const createCourier = asyncHandler(async (req: Request, res: Response) => {
  const courier = await Courier.create(req.body);
  return res.status(201).json({
    success: true,
    message: "Courier created successfully",
    data: courier,
  });
});

export const updateCourier = asyncHandler(async (req: Request, res: Response) => {
  const courier = await Courier.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!courier) {
    return res.status(404).json({ success: false, message: "Courier not found" });
  }
  return res.status(200).json({
    success: true,
    message: "Courier updated successfully",
    data: courier,
  });
});

export const deleteCourier = asyncHandler(async (req: Request, res: Response) => {
  const courier = await Courier.findByIdAndDelete(req.params.id);
  if (!courier) {
    return res.status(404).json({ success: false, message: "Courier not found" });
  }
  return res.status(200).json({ success: true, message: "Courier deleted successfully" });
});
