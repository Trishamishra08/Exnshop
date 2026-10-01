import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * AuthProvider lives above BrowserRouter, so it can't use useLocation() and
 * only computes which panel (customer/seller/delivery/admin) it's tracking
 * once, at initial mount. Without this, navigating client-side between panels
 * (e.g. Customer -> Delivery) with no full page reload leaves auth state
 * stuck referencing whichever panel happened to be active on first load —
 * ProtectedRoute then makes decisions off the wrong panel's token/user. This
 * component must be rendered inside BrowserRouter.
 */
export default function AuthPanelSync() {
  const location = useLocation();
  const { resyncPanel } = useAuth();

  useEffect(() => {
    resyncPanel(location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return null;
}
