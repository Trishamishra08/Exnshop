import { createContext } from 'react';
import { Order } from '../types/order';

export interface OrdersContextType {
  orders: Order[];
  /** `id` is the first order; `orderIds` has every order the checkout created (one per shop). */
  addOrder: (order: Order) => Promise<{ id: string; orderIds: string[] } | undefined>;
  getOrderById: (id: string) => Order | undefined;
  fetchOrderById: (id: string) => Promise<Order | undefined>;
  updateOrderStatus: (id: string, status: Order["status"]) => void;
  loading: boolean;
}

export const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

