import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../services/api/config';

export type CommerceMode = 'Quick' | 'ECommerce';

const STORAGE_KEY = 'commerce_mode';
// Last known admin switches, so the app opens straight on the right channel (no flash of the OFF one).
const SWITCHES_KEY = 'commerce_switches';
const readSwitches = (): { quick: boolean; ecommerce: boolean } => {
  try {
    const v = JSON.parse(localStorage.getItem(SWITCHES_KEY) || '{}');
    return { quick: v.quick !== false, ecommerce: v.ecommerce !== false };
  } catch {
    return { quick: true, ecommerce: true };
  }
};

interface CommerceModeContextValue {
  mode: CommerceMode;
  setMode: (mode: CommerceMode) => void;
  /** Which channels the admin has switched ON (Admin > Service Controls). */
  quickEnabled: boolean;
  ecommerceEnabled: boolean;
}

const CommerceModeContext = createContext<CommerceModeContextValue | undefined>(undefined);

export function CommerceModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<CommerceMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const sw = readSwitches();
      if (!sw.quick) return 'ECommerce';
      if (!sw.ecommerce) return 'Quick';
      return saved === 'ECommerce' ? 'ECommerce' : 'Quick';
    } catch {
      return 'Quick';
    }
  });
  const [quickEnabled, setQuickEnabled] = useState(() => readSwitches().quick);
  const [ecommerceEnabled, setEcommerceEnabled] = useState(() => readSwitches().ecommerce);

  // Read the admin's ON/OFF switches when the app opens, when it comes back to the
  // foreground, and every minute. A switched-off channel is never shown.
  const loadSwitches = useCallback(async () => {
    try {
      const res = await api.get('/customer/services');
      const data = res.data?.data || {};
      setQuickEnabled(data.quick_commerce !== false);
      setEcommerceEnabled(data.ecommerce !== false);
      try {
        localStorage.setItem(SWITCHES_KEY, JSON.stringify({ quick: data.quick_commerce !== false, ecommerce: data.ecommerce !== false }));
      } catch {
        /* private mode */
      }
    } catch {
      /* keep the last known state; never block the app */
    }
  }, []);

  useEffect(() => {
    loadSwitches();
    const onVisible = () => { if (document.visibilityState === 'visible') loadSwitches(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(loadSwitches, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [loadSwitches]);

  // If the current channel is OFF, move to the one that is ON.
  useEffect(() => {
    if (mode === 'Quick' && !quickEnabled && ecommerceEnabled) setModeState('ECommerce');
    else if (mode === 'ECommerce' && !ecommerceEnabled && quickEnabled) setModeState('Quick');
  }, [mode, quickEnabled, ecommerceEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [mode]);

  const setMode = (next: CommerceMode) => {
    if (next === 'Quick' && !quickEnabled) return;
    if (next === 'ECommerce' && !ecommerceEnabled) return;
    setModeState(next);
  };

  return (
    <CommerceModeContext.Provider value={{ mode, setMode, quickEnabled, ecommerceEnabled }}>
      {children}
    </CommerceModeContext.Provider>
  );
}

export function useCommerceMode(): CommerceModeContextValue {
  const ctx = useContext(CommerceModeContext);
  if (!ctx) {
    throw new Error('useCommerceMode must be used within a CommerceModeProvider');
  }
  return ctx;
}
