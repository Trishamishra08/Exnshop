import { Product } from './domain';

export interface CartItem {
  product: Product;
  quantity: number;
  variant?: any;
}

export interface Cart {
  items: CartItem[];
  totalItemCount?: number;
  itemCount?: number;
  total: number;
  estimatedDeliveryFee?: number;
  estimatedDistanceKm?: number | null;
  instantDeliveryAvailable?: boolean;
  platformFee?: number;
  freeDeliveryThreshold?: number;
  minimumOrderValue?: number;
  // Blended GST rate for this cart's current item mix (category-driven,
  // preview only — see backend taxService.computeItemGst for the actual
  // per-item charge computed at order creation).
  gstRate?: number;
  debug_config?: any;
  backendTotal?: number;
}
