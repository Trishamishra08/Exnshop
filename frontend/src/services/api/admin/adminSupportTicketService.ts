import api from "../config";
import { ApiResponse } from "./types";
import { SupportTicket } from "../supportTicketService";

export const getAllTickets = async (
  status?: string,
  priority?: string
): Promise<ApiResponse<SupportTicket[]>> => {
  const response = await api.get<ApiResponse<SupportTicket[]>>("/admin/support-tickets", {
    params: { status, priority },
  });
  return response.data;
};

export const getTicketByIdAdmin = async (id: string): Promise<ApiResponse<SupportTicket>> => {
  const response = await api.get<ApiResponse<SupportTicket>>(`/admin/support-tickets/${id}`);
  return response.data;
};

export const replyToTicketAsAdmin = async (
  id: string,
  message: string,
  status?: string
): Promise<ApiResponse<SupportTicket>> => {
  const response = await api.post<ApiResponse<SupportTicket>>(`/admin/support-tickets/${id}/reply`, {
    message,
    status,
  });
  return response.data;
};
