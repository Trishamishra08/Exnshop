import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type AdminMode = 'Quick' | 'ECommerce';

const STORAGE_KEY = 'admin_commerce_mode';

interface AdminModeContextValue {
  mode: AdminMode;
  setMode: (mode: AdminMode) => void;
}

const AdminModeContext = createContext<AdminModeContextValue | undefined>(undefined);

export function AdminModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AdminMode>(() => {
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

  const setMode = (next: AdminMode) => setModeState(next);

  return (
    <AdminModeContext.Provider value={{ mode, setMode }}>
      {children}
    </AdminModeContext.Provider>
  );
}

export function useAdminMode(): AdminModeContextValue {
  const ctx = useContext(AdminModeContext);
  if (!ctx) {
    throw new Error('useAdminMode must be used within an AdminModeProvider');
  }
  return ctx;
}
