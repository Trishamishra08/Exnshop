import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Delivery from "../../../models/Delivery";

/**
 * Update Delivery Profile
 * Updates personal and vehicle information
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;
    if (!deliveryId) return res.status(401).json({ success: false, message: "Unauthorized" });
    // An approved partner's profile, vehicle and bank changes wait for admin approval (history kept).
    const { submitDeliveryChanges } = await import("../../../services/deliveryProfileChangeService");
    try {
        const { delivery, queued } = await submitDeliveryChanges(deliveryId, req.body || {});
        return res.status(200).json({
            success: true,
            message: queued
                ? "Your changes were sent to the admin for approval. Your current details stay in use until then."
                : "Profile updated successfully",
            data: delivery,
            approvalPending: Boolean((delivery as any).pendingProfileChange?.data),
        });
    } catch (err: any) {
        return res.status(err.statusCode || 500).json({ success: false, message: err.message || "Could not update profile" });
    }
});

/**
 * Update Availability Status
 * Toggles isOnline status
 */
export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;
    const { isOnline } = req.body;

    if (typeof isOnline !== 'boolean') {
        return res.status(400).json({
            success: false,
            message: "isOnline status must be a boolean"
        });
    }

    const delivery = await Delivery.findByIdAndUpdate(
        deliveryId,
        {
            isOnline,
            available: isOnline ? "Available" : "Not Available"
        },
        { new: true }
    );

    if (!delivery) {
        return res.status(404).json({
            success: false,
            message: "Delivery partner not found"
        });
    }

    return res.status(200).json({
        success: true,
        message: `Status updated to ${isOnline ? 'Online' : 'Offline'}`,
        data: {
            isOnline: delivery.isOnline
        }
    });
});

/**
 * Update Delivery Settings
 * Updates notification, location, sound preferences
 */
export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
    const deliveryId = req.user?.userId;
    const { notifications, location, sound } = req.body;

    const delivery = await Delivery.findById(deliveryId);

    if (!delivery) {
        return res.status(404).json({
            success: false,
            message: "Delivery partner not found"
        });
    }

    // Initialize settings if not present
    if (!delivery.settings) {
        delivery.settings = {
            notifications: true,
            location: true,
            sound: true
        };
    }

    if (typeof notifications === 'boolean') delivery.settings.notifications = notifications;
    if (typeof location === 'boolean') delivery.settings.location = location;
    if (typeof sound === 'boolean') delivery.settings.sound = sound;

    await delivery.save();

    return res.status(200).json({
        success: true,
        message: "Settings updated successfully",
        data: delivery.settings
    });
});
