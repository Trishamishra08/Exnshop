import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type CommerceMode = 'Quick' | 'ECommerce';

const STORAGE_KEY = 'commerce_mode';

interface CommerceModeContextValue {
  mode: CommerceMode;
  setMode: (mode: CommerceMode) => void;
}

const CommerceModeContext = createContext<CommerceModeContextValue | undefined>(undefined);

export function CommerceModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<CommerceMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'ECommerce' ? 'ECommerce' : 'Quick';
    } catch {
      return 'Quick';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  }, [mode]);

  const setMode = (next: CommerceMode) => setModeState(next);

  return (
    <CommerceModeContext.Provider value={{ mode, setMode }}>
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
