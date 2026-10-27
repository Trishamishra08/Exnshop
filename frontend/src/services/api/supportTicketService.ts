import api from "./config";

export interface TicketMessage {
  sender: "Seller" | "Admin";
  message: string;
  attachments: string[];
  createdAt: string;
}

export type TicketStatus = "Open" | "Assigned" | "In Progress" | "Resolved" | "Closed";

/** The client-facing flow: Ticket Created → Support Team → Investigation → Resolution → Closed */
export const TICKET_FLOW: { status: TicketStatus; label: string }[] = [
  { status: "Open", label: "Ticket Created" },
  { status: "Assigned", label: "With Support Team" },
  { status: "In Progress", label: "Under Investigation" },
  { status: "Resolved", label: "Resolved" },
  { status: "Closed", label: "Closed" },
];

export const ticketStatusLabel = (status: TicketStatus) =>
  TICKET_FLOW.find((s) => s.status === status)?.label || status;

export const TICKET_STATUS_STYLES: Record<TicketStatus, string> = {
  Open: "bg-blue-100 text-blue-800",
  Assigned: "bg-indigo-100 text-indigo-800",
  "In Progress": "bg-amber-100 text-amber-800",
  Resolved: "bg-green-100 text-green-800",
  Closed: "bg-neutral-100 text-neutral-600",
};

export interface TicketStatusChange {
  status: TicketStatus;
  by: "Seller" | "Admin" | "System";
  note?: string;
  at: string;
}

export interface SupportTicket {
  _id: string;
  seller: string | { sellerName: string; storeName: string };
  category: "Payment" | "Product" | "Order" | "Technical" | "Account" | "Other";
  priority: "Low" | "Medium" | "High";
  subject: string;
  description: string;
  attachments?: string[];
  status: TicketStatus;
  statusHistory?: TicketStatusChange[];
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
  attachments?: string[];
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
  message: string,
  attachments?: string[]
): Promise<ApiResponse<SupportTicket>> => {
  const response = await api.post<ApiResponse<SupportTicket>>(`/support-tickets/my/${id}/reply`, {
    message,
    attachments,
  });
  return response.data;
};

export const closeTicket = async (id: string): Promise<ApiResponse<SupportTicket>> => {
  const response = await api.post<ApiResponse<SupportTicket>>(`/support-tickets/my/${id}/close`);
  return response.data;
};
