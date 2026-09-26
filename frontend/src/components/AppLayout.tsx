import { ReactNode, useEffect, useRef, useState, useMemo } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import FloatingCartPill from './FloatingCartPill';
import SiteFooter from './SiteFooter';
import { useLocation as useLocationContext } from '../hooks/useLocation';
import LocationPermissionRequest from './LocationPermissionRequest';
import { useThemeContext } from '../context/ThemeContext';
import ServiceNotAvailable from './ServiceNotAvailable';
import { checkServiceability } from '../services/api/customerHomeService';
import { useAppSettings } from '../context/AppSettingsContext';
import LanguageSelector from './LanguageSelector';
import { useTranslation } from '../hooks/useTranslation';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mainRef = useRef<HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [categoriesRotation, setCategoriesRotation] = useState(0);
  const [prevCategoriesActive, setPrevCategoriesActive] = useState(false);
  const { isLocationEnabled, isLocationLoading, location: userLocation } = useLocationContext();
  const [showLocationRequest, setShowLocationRequest] = useState(false);
  const [showLocationChangeModal, setShowLocationChangeModal] = useState(false);
  const { currentTheme } = useThemeContext();
  const { settings: appSettings } = useAppSettings();

  // State to track if service is available at user's location
  const [isServiceAvailable, setIsServiceAvailable] = useState<boolean>(true);

  // Check serviceability when user location changes
  useEffect(() => {
    const performCheck = async () => {
      if (userLocation && userLocation.latitude && userLocation.longitude) {
        try {
          const result = await checkServiceability(userLocation.latitude, userLocation.longitude);
          setIsServiceAvailable(result.isServiceAvailable);
        } catch (error) {
          console.error("Failed to check serviceability:", error);
          // Default to true on error to avoid blocking user due to network issues
          setIsServiceAvailable(true);
        }
      } else {
        // If no location, we can't determine, so we assume available or waiting for location
        setIsServiceAvailable(true);
      }
    };

    performCheck();
  }, [userLocation]);

  const isActive = (path: string) => location.pathname === path;

  // ... (rest of the component logic)

  // Check if location is required for current route
  const requiresLocation = () => {
    const publicRoutes = [
      '/login',
      '/signup',
      '/seller/login',
      '/seller/signup',
      '/delivery/login',
      '/delivery/signup',
      '/admin/login',
      '/language-selection',
      '/about-us',
      '/privacy-policy',
      '/terms-and-conditions',
      '/refund-policy',
      '/customer-policy',
      '/faq',
    ];
    if (publicRoutes.includes(location.pathname)) {
      return false;
    }
    return true;
  };

  // ... (rest of the component logic)

  // ...

  // ALWAYS show location request modal on app load if location is not enabled
  // This ensures modal appears on every app open, regardless of browser permission state
  useEffect(() => {
    // Wait for initial loading to complete
    if (isLocationLoading) {
      return;
    }

    // If location is enabled, hide modal
    if (isLocationEnabled) {
      setShowLocationRequest(false);
      return;
    }

    // If location is NOT enabled and route requires location, ALWAYS show modal
    // This will trigger on every app open until user explicitly confirms location
    if (!isLocationEnabled && requiresLocation()) {
      setShowLocationRequest(true);
    } else {
      setShowLocationRequest(false);
    }
  }, [isLocationLoading, isLocationEnabled, location.pathname]);

  // ...



  // Update search query when URL params change
  useEffect(() => {
    const query = searchParams.get('q') || '';
    setSearchQuery(query);
  }, [searchParams]);

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (location.pathname === '/search') {
      // Update URL params when on search page
      if (value.trim()) {
        setSearchParams({ q: value });
      } else {
        setSearchParams({});
      }
    } else {
      // Navigate to search page with query
      if (value.trim()) {
        navigate(`/search?q=${encodeURIComponent(value)}`);
      }
    }
  };


  const SCROLL_POSITION_KEY = 'home-scroll-position';

  // Reset scroll position when navigating to any page (smooth, no flash)
  // BUT skip for Home page if there's a saved scroll position to restore
  useEffect(() => {
    const isHomePage = location.pathname === '/' || location.pathname === '/user/home';

    // Home page handles its own scroll restoration and reset logic
    if (isHomePage) {
      return;
    }

    // Use requestAnimationFrame to prevent visual flash
    requestAnimationFrame(() => {
      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
      }
      // Also reset window scroll smoothly
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
  }, [location.pathname]);

  // Track categories active state for rotation
  const isCategoriesActive = isActive('/categories') || location.pathname.startsWith('/category/');

  useEffect(() => {
    if (isCategoriesActive && !prevCategoriesActive) {
      // Rotate clockwise when clicked (becoming active)
      setCategoriesRotation(prev => prev + 360);
      setPrevCategoriesActive(true);
    } else if (!isCategoriesActive && prevCategoriesActive) {
      // Rotate counter-clockwise when unclicked (becoming inactive)
      setCategoriesRotation(prev => prev - 360);
      setPrevCategoriesActive(false);
    }
  }, [isCategoriesActive, prevCategoriesActive]);

  const [activeNotification, setActiveNotification] = useState<{
    title: string;
    body: string;
    link?: string;
  } | null>(null);

  // Listen for in_app_notification event for foreground push notifications in web/mobile app
  useEffect(() => {
    const handleNotification = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.notification) {
        setActiveNotification({
          title: detail.notification.title || 'New Notification',
          body: detail.notification.body || '',
          link: detail.data?.link || '/',
        });

        setTimeout(() => {
          setActiveNotification(null);
        }, 6000);
      }
    };

    window.addEventListener('in_app_notification', handleNotification);
    return () => window.removeEventListener('in_app_notification', handleNotification);
  }, []);

  // Listen for openLocationChangeModal event from anywhere in the app
  useEffect(() => {
    const handleOpen = () => setShowLocationChangeModal(true);
    window.addEventListener('openLocationChangeModal', handleOpen);
    return () => window.removeEventListener('openLocationChangeModal', handleOpen);
  }, []);

  const isProductDetailPage = location.pathname.startsWith('/product/');
  const isSearchPage = location.pathname === '/search';
  const isCheckoutPage = location.pathname === '/checkout' || location.pathname.startsWith('/checkout/');
  const isCartPage = location.pathname === '/cart';
  const isAuthPage = ['/login', '/signup', '/seller/login', '/seller/signup', '/delivery/login', '/delivery/signup', '/admin/login'].includes(location.pathname);
  const isHomePage = location.pathname === '/' || location.pathname === '/user/home';
  const isOrderAgainPage = location.pathname === '/order-again';

  // Show header on search, category, etc. (excluding Home & OrderAgain pages which render HomeHero)
  const showHeader = !isCheckoutPage && !isCartPage && !isAuthPage && !isHomePage && !isOrderAgainPage;
  // Hide search bar everywhere as requested by user
  const showSearchBar = false;
  const showFooter = !isCheckoutPage && !isProductDetailPage && !isAuthPage;
  const isPolicyOrInfoPage = [
    '/about-us',
    '/privacy-policy',
    '/terms-and-conditions',
    '/refund-policy',
    '/customer-policy',
    '/faq',
  ].includes(location.pathname);
  const showSiteFooter = !isCheckoutPage && !isAuthPage && !isCartPage;

  // Standalone onboarding routes bypass AppLayout chrome completely
  if (location.pathname === "/language-selection") {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col min-h-screen w-full overflow-x-hidden">
      {/* Foreground In-App Push Notification Banner Alert */}
      <AnimatePresence>
        {activeNotification && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={() => {
              if (activeNotification.link) {
                navigate(activeNotification.link);
              }
              setActiveNotification(null);
            }}
            className="fixed top-3 left-3 right-3 md:left-auto md:right-4 md:w-96 z-[9999] bg-emerald-900/95 text-white p-3.5 rounded-2xl shadow-2xl backdrop-blur-md border border-emerald-500/30 cursor-pointer flex items-center gap-3 active:scale-98 transition-transform"
          >
            <img
              src="/logo192.png"
              alt="Exnshop"
              className="w-10 h-10 rounded-xl object-contain bg-white p-0.5 shadow-md flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-white tracking-tight truncate">
                {activeNotification.title}
              </h4>
              <p className="text-xs text-emerald-100/90 line-clamp-2 mt-0.5 leading-snug">
                {activeNotification.body}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveNotification(null);
              }}
              className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-emerald-100 flex items-center justify-center text-xs flex-shrink-0"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Container Wrapper */}
      <div className="md:w-full md:bg-white md:min-h-screen overflow-x-hidden">
        <div className="md:w-full md:min-h-screen md:flex md:flex-col overflow-x-hidden">
          {/* Top Navigation Bar - Desktop Only */}
          {showFooter && (
            <nav
              className="hidden md:flex items-center justify-between px-6 lg:px-8 py-2.5 shadow-sm transition-colors duration-300"
              style={{
                background: `linear-gradient(to right, ${currentTheme.primary[0]}, ${currentTheme.primary[1]})`,
                borderBottom: `1px solid ${currentTheme.primary[0]}`
              }}
            >
              {/* Brand Logo & Name */}
              <Link to="/" className="flex items-center gap-2.5 hover:opacity-95 transition-opacity">
                <img
                  src="/exnshop_logo.png"
                  alt={appSettings?.appName || 'Exnshop'}
                  className="w-10 h-10 object-contain rounded-xl bg-white p-1 shadow-sm border border-white/80"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/exnshop_logo.png';
                  }}
                />
                <span
                  className="font-bold text-base tracking-tight"
                  style={{ color: currentTheme.headerTextColor || '#ffffff' }}
                >
                  {appSettings?.appName && !/olovely/i.test(appSettings.appName)
                    ? appSettings.appName
                    : 'Exnshop'}
                </span>
              </Link>

              {/* Navigation Links */}
              <div className="flex items-center gap-4 lg:gap-6">
                {/* Home */}
                <Link
                  to="/"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/')
                    ? 'bg-white shadow-md font-semibold'
                    : 'hover:bg-white/20'
                    }`}
                  style={{
                    color: isActive('/') ? currentTheme.accentColor : currentTheme.headerTextColor
                  }}
                >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {isActive('/') ? (
                    <>
                      <path d="M2 12L12 4L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="currentColor" />
                      <rect x="4" y="12" width="16" height="8" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    </>
                  ) : (
                    <>
                      <path d="M2 12L12 4L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      <rect x="4" y="12" width="16" height="8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />
                    </>
                  )}
                </svg>
                <span className="font-medium text-sm">{t("common.home", "Home")}</span>
              </Link>

              {/* Order Again */}
              <Link
                to="/order-again"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/order-again')
                  ? 'bg-white shadow-md font-semibold'
                  : 'hover:bg-white/20'
                  }`}
                style={{
                  color: isActive('/order-again') ? currentTheme.accentColor : currentTheme.headerTextColor
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {isActive('/order-again') ? (
                    <path d="M5 8V6C5 4.34315 6.34315 3 8 3H16C17.6569 3 19 4.34315 19 6V8H21C21.5523 8 22 8.44772 22 9V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V9C2 8.44772 2.44772 8 3 8H5Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  ) : (
                    <path d="M5 8V6C5 4.34315 6.34315 3 8 3H16C17.6569 3 19 4.34315 19 6V8H21C21.5523 8 22 8.44772 22 9V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V9C2 8.44772 2.44772 8 3 8H5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />
                  )}
                </svg>
                <span className="font-medium text-sm">{t("common.orderAgain", "Order Again")}</span>
              </Link>

              {/* Categories */}
              <Link
                to="/categories"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${(isActive('/categories') || location.pathname.startsWith('/category/'))
                  ? 'bg-white shadow-md font-semibold'
                  : 'hover:bg-white/20'
                  }`}
                style={{
                  color: (isActive('/categories') || location.pathname.startsWith('/category/')) ? currentTheme.accentColor : currentTheme.headerTextColor
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {(isActive('/categories') || location.pathname.startsWith('/category/')) ? (
                    <>
                      <circle cx="7" cy="7" r="2.5" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                      <circle cx="17" cy="7" r="2.5" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                      <circle cx="7" cy="17" r="2.5" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                      <circle cx="17" cy="17" r="2.5" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                    </>
                  ) : (
                    <>
                      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="2" fill="none" />
                      <circle cx="17" cy="7" r="2.5" stroke="currentColor" strokeWidth="2" fill="none" />
                      <circle cx="7" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" fill="none" />
                      <circle cx="17" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" fill="none" />
                    </>
                  )}
                </svg>
                <span className="font-medium text-sm">{t("common.categories", "Categories")}</span>
              </Link>

                {/* Language Selector */}
                <div className="flex items-center">
                  <LanguageSelector variant="dropdown" />
                </div>

                {/* Profile */}
                <Link
                  to="/account"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive('/account')
                    ? 'bg-white shadow-md font-semibold'
                    : 'hover:bg-white/20'
                    }`}
                  style={{
                    color: isActive('/account') ? currentTheme.accentColor : currentTheme.headerTextColor
                  }}
                >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {isActive('/account') ? (
                    <>
                      <circle cx="12" cy="8" r="4" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                      <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="currentColor" />
                    </>
                  ) : (
                    <>
                      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" fill="none" />
                      <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                    </>
                  )}
                </svg>
                <span className="font-medium text-sm">{t("common.profile", "Profile")}</span>
              </Link>
            </div>
          </nav>
          )}

          {/* Sticky Header - Show on search page and other non-hero pages */}
          {showHeader && (
            <header
              className="sticky top-0 z-50 shadow-sm md:shadow-md md:top-[60px] transition-colors duration-300"
              style={{
                background: `linear-gradient(to right, ${currentTheme.primary[0]}, ${currentTheme.primary[1]})`,
                borderBottom: `1px solid ${currentTheme.primary[0]}`
              }}
            >
              {/* Delivery info line */}
              <div
                className="px-4 md:px-6 lg:px-8 py-1 text-xs text-center font-semibold transition-colors"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.08)',
                  color: currentTheme.headerTextColor || '#ffffff'
                }}
              >
                {t("customer.deliveringIn", "Delivering in 10–15 mins")}
              </div>

              {/* Location line - only show if user has provided location */}
              {userLocation && (userLocation.address || userLocation.city) && (
                <div
                  className="px-4 md:px-6 lg:px-8 py-2 flex items-center justify-between text-sm transition-colors"
                  style={{
                    color: currentTheme.headerTextColor || '#ffffff'
                  }}
                >
                  <span className="font-medium line-clamp-1 flex items-center gap-1.5" title={userLocation?.address || ''}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0" style={{ color: currentTheme.headerTextColor || '#ffffff' }}>
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    {userLocation?.address
                      ? userLocation.address.length > 50
                        ? `${userLocation.address.substring(0, 50)}...`
                        : userLocation.address
                      : userLocation?.city && userLocation?.state
                        ? `${userLocation.city}, ${userLocation.state}`
                        : userLocation?.city || ''}
                  </span>
                  <button
                    onClick={() => setShowLocationChangeModal(true)}
                    className="font-bold transition-all flex-shrink-0 ml-2 text-xs px-3 py-1 rounded-full shadow-sm hover:scale-105 active:scale-95 cursor-pointer"
                    style={{
                      color: currentTheme.primary[0] || '#48c479',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Search bar - Hidden on Order Again page */}
              {showSearchBar && (
                <div className="px-4 md:px-6 lg:px-8 pb-3">
                  <div className="relative max-w-2xl md:mx-auto">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Search for products..."
                      className="w-full px-4 py-2.5 pl-10 bg-white/90 border border-white/20 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent md:py-3"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">🔍</span>
                  </div>
                </div>
              )}
            </header>
          )}

          {/* Scrollable Main Content */}
          <main
            ref={mainRef}
            className={`flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide ${
              showFooter ? 'pb-24 md:pb-0' : 'pb-4'
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={isLocationEnabled && userLocation ? 'content' : 'location-check'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-full"
                style={{ minHeight: isPolicyOrInfoPage ? undefined : '100%' }}
              >
                {children}
              </motion.div>
            </AnimatePresence>

            {showSiteFooter && <SiteFooter />}
          </main>

          {/* Floating Cart Pill */}
          <FloatingCartPill />

          {/* Location Permission Request Modal - Mandatory for all users */}
          {showLocationRequest && (
            <LocationPermissionRequest
              onLocationGranted={() => setShowLocationRequest(false)}
              skipable={false}
              title="Location Access Required"
              description="We need your location to show you products available near you and enable delivery services. Location access is required to continue."
            />
          )}

          {/* Location Change Modal */}
          {showLocationChangeModal && (
            <LocationPermissionRequest
              onLocationGranted={() => setShowLocationChangeModal(false)}
              skipable={true}
              title="Change Location"
              description="Update your location to see products available near you."
              forceOpen={true}
            />
          )}

          {/* Fixed Bottom Navigation - Mobile Only, Hidden on checkout pages */}
          {showFooter && (
            <nav
              className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200/50 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] z-50 md:hidden"
            >
              <div className="flex justify-around items-center h-16 px-1">
                {/* 1. Home */}
                <Link
                  to="/"
                  className="flex-1 flex flex-col items-center justify-center h-full relative cursor-pointer"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill={isActive('/') ? '#1877f2' : 'none'}
                    stroke={isActive('/') ? '#1877f2' : '#6b7280'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" fill={isActive('/') ? 'white' : 'none'} />
                  </svg>
                  <span className={`text-[11px] mt-1 ${isActive('/') ? 'font-bold text-[#1877f2]' : 'font-medium text-neutral-500'}`}>
                    {t("common.home", "Home")}
                  </span>
                </Link>

                {/* 2. Offers */}
                <Link
                  to="/categories"
                  className="flex-1 flex flex-col items-center justify-center h-full relative cursor-pointer"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isActive('/offers') ? '#1877f2' : '#6b7280'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="19" y1="5" x2="5" y2="19" />
                    <circle cx="6.5" cy="6.5" r="2.5" fill={isActive('/offers') ? '#1877f2' : 'none'} />
                    <circle cx="17.5" cy="17.5" r="2.5" fill={isActive('/offers') ? '#1877f2' : 'none'} />
                  </svg>
                  <span className={`text-[11px] mt-1 ${isActive('/offers') ? 'font-bold text-[#1877f2]' : 'font-medium text-neutral-500'}`}>
                    Offers
                  </span>
                </Link>

                {/* 3. Categories */}
                <Link
                  to="/categories"
                  className="flex-1 flex flex-col items-center justify-center h-full relative cursor-pointer"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={(isActive('/categories') || location.pathname.startsWith('/category/')) ? '#1877f2' : '#6b7280'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1.5" fill={(isActive('/categories') || location.pathname.startsWith('/category/')) ? '#1877f2' : 'none'} />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" fill={(isActive('/categories') || location.pathname.startsWith('/category/')) ? '#1877f2' : 'none'} />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" fill={(isActive('/categories') || location.pathname.startsWith('/category/')) ? '#1877f2' : 'none'} />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" fill={(isActive('/categories') || location.pathname.startsWith('/category/')) ? '#1877f2' : 'none'} />
                  </svg>
                  <span className={`text-[11px] mt-1 ${(isActive('/categories') || location.pathname.startsWith('/category/')) ? 'font-bold text-[#1877f2]' : 'font-medium text-neutral-500'}`}>
                    {t("common.categories", "Categories")}
                  </span>
                </Link>

                {/* 4. Orders */}
                <Link
                  to="/orders"
                  className="flex-1 flex flex-col items-center justify-center h-full relative cursor-pointer"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill={isActive('/orders') ? '#1877f2' : 'none'}
                    stroke={isActive('/orders') ? '#1877f2' : '#6b7280'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                  <span className={`text-[11px] mt-1 ${isActive('/orders') ? 'font-bold text-[#1877f2]' : 'font-medium text-neutral-500'}`}>
                    {t("common.orders", "Orders")}
                  </span>
                </Link>

                {/* 5. Account */}
                <Link
                  to="/account"
                  className="flex-1 flex flex-col items-center justify-center h-full relative cursor-pointer"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill={isActive('/account') ? '#1877f2' : 'none'}
                    stroke={isActive('/account') ? '#1877f2' : '#6b7280'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className={`text-[11px] mt-1 ${isActive('/account') ? 'font-bold text-[#1877f2]' : 'font-medium text-neutral-500'}`}>
                    {t("common.account", "Account")}
                  </span>
                </Link>
              </div>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

