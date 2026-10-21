import { useEffect, useState } from 'react';
import api from '../services/api/config';
import { useCommerceMode } from '../context/CommerceModeContext';

// Quick sellers who are offline right now. Shared by every product card on the
// page, so it is fetched once and refreshed at most once a minute.
const REFRESH_MS = 60_000;
let unavailable = new Set<string>();
let lastFetch = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const refresh = () => {
  if (inflight || Date.now() - lastFetch < REFRESH_MS) return;
  inflight = api
    .get<{ success: boolean; data: string[] }>('/customer/products/unavailable-sellers')
    .then((res) => {
      unavailable = new Set(res.data?.data || []);
      listeners.forEach((notify) => notify());
    })
    .catch(() => {})
    .finally(() => {
      lastFetch = Date.now();
      inflight = null;
    });
};

/** The id of a product's seller, whether the seller is populated or just an id. */
export const sellerIdOf = (product: any): string => {
  const seller = product?.sellerId || product?.seller;
  return String((seller && typeof seller === 'object' ? seller._id || seller.id : seller) || '');
};

/**
 * Returns a check for whether a product's seller is offline ("Seller not available").
 * Only Quick needs the seller live; E-commerce orders ship later by courier, so
 * an offline seller's products stay orderable while browsing E-commerce.
 */
export function useUnavailableSellers() {
  const { mode } = useCommerceMode();
  const [, rerender] = useState(0);
  useEffect(() => {
    const notify = () => rerender((n) => n + 1);
    listeners.add(notify);
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      listeners.delete(notify);
      clearInterval(timer);
    };
  }, []);
  return (product: any) => {
    if (mode === 'ECommerce') return false;
    const id = sellerIdOf(product);
    return Boolean(id) && unavailable.has(id);
  };
}
