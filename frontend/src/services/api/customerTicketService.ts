import api from './config';
import type { SupportTicket } from './supportTicketService';

/** Customer side of support tickets: list, track, reply, rate and appeal (escalate). */
interface Res<T> { success: boolean; message?: string; data?: T }

export const listMyTickets = async (): Promise<Res<SupportTicket[]>> => (await api.get('/customer/support/tickets')).data;

export const getMyTicket = async (id: string): Promise<Res<SupportTicket>> => (await api.get(`/customer/support/tickets/${id}`)).data;

export const replyToMyTicket = async (id: string, message: string): Promise<Res<SupportTicket>> =>
  (await api.post(`/customer/support/tickets/${id}/reply`, { message })).data;

export const rateMyTicket = async (id: string, stars: number, feedback?: string): Promise<Res<SupportTicket>> =>
  (await api.post(`/customer/support/tickets/${id}/rate`, { stars, feedback })).data;

export const appealMyTicket = async (id: string, reason: string): Promise<Res<SupportTicket>> =>
  (await api.post(`/customer/support/tickets/${id}/escalate`, { reason })).data;
