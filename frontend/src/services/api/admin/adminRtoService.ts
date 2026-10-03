import api from "../config";
import { ApiResponse } from "./types";

export interface RTOEvent {
    _id: string;
    order: string | { _id: string; orderNumber: string; total: number };
    seller: string | { _id: string; sellerName: string; storeName: string };
    courierName?: string;
    reasonCode: string;
    reason?: string;
    markedByRole: "Delivery" | "Admin";
    reverseShippingCost: number;
    status: "Initiated" | "InTransit" | "ReceivedBySeller" | "Disposed" | "Lost";
    financialSettlementStatus: "Pending" | "Completed" | "Failed";
    createdAt: string;
}

export const getRtoEventsAdmin = async (params?: {
    status?: string;
    sellerId?: string;
}): Promise<ApiResponse<RTOEvent[]>> => {
    const response = await api.get<ApiResponse<RTOEvent[]>>("/admin/rto-events", { params });
    return response.data;
};

export const updateRtoResolutionAdmin = async (
    rtoEventId: string,
    resolutionStatus: "InTransit" | "ReceivedBySeller" | "Disposed" | "Lost",
): Promise<ApiResponse<RTOEvent>> => {
    const response = await api.patch<ApiResponse<RTOEvent>>(
        `/admin/rto-events/${rtoEventId}/resolution`,
        { resolutionStatus },
    );
    return response.data;
};
