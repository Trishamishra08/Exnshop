import api from "./config";

export interface TicketMessage {
  sender: "Seller" | "Admin";
  message: string;
  attachments: string[];
  createdAt: string;
}

export interface SupportTicket {
  _id: string;
  seller: string | { sellerName: string; storeName: string };
  category: "Payment" | "Product" | "Order" | "Technical" | "Account" | "Other";
  priority: "Low" | "Medium" | "High";
  subject: string;
  description: string;
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  messages: TicketMessage[];
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

export const createTicket = async (data: {
  category: string;
  priority: string;
  subject: string;
  description: string;
}): Promise<ApiResponse<SupportTicket>> => {
  const response = await api.post<ApiResponse<SupportTicket>>("/support-tickets", data);
  return response.data;
};

export const getMyTickets = async (status?: string): Promise<ApiResponse<SupportTicket[]>> => {
  const response = await api.get<ApiResponse<SupportTicket[]>>("/support-tickets/my", {
    params: status ? { status } : undefined,
  });
  return response.data;
};

export const getMyTicketById = async (id: string): Promise<ApiResponse<SupportTicket>> => {
  const response = await api.get<ApiResponse<SupportTicket>>(`/support-tickets/my/${id}`);
  return response.data;
};

export const replyToTicket = async (
  id: string,
  message: string
): Promise<ApiResponse<SupportTicket>> => {
  const response = await api.post<ApiResponse<SupportTicket>>(`/support-tickets/my/${id}/reply`, {
    message,
  });
  return response.data;
};
