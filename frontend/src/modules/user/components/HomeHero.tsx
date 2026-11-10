import { useNavigate } from 'react-router-dom';
import { useLayoutEffect, useRef, useState, useEffect, useMemo } from 'react';
import { gsap } from 'gsap';
import { useLocation } from '../../../hooks/useLocation';
import { appConfig } from '../../../services/configService';
import { getCategories } from '../../../services/api/customerProductService';
import { Category } from '../../../types/domain';
import { getHeaderCategoriesPublic } from '../../../services/api/headerCategoryService';
import { getIconByName } from '../../../utils/iconLibrary';
import { useAppSettings } from '../../../context/AppSettingsContext';
import { useTranslation } from '../../../hooks/useTranslation';
import { useCart } from '../../../context/CartContext';
import { useCommerceMode } from '../../../context/CommerceModeContext';
import { useAuth } from '../../../context/AuthContext';
import { useHomeTheme } from './home/homeTheme';

interface HomeHeroProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  /** From Admin › Home Page Content */
  searchPlaceholder?: string;
}

interface Tab {
  id: string;
  label: string;
  icon: React.ReactNode;
  imageUrl?: string;
}

const ALL_TAB: Tab = {
  id: 'all',
  label: 'All',
  icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" />
    </svg>
  ),
};

const MORE_TAB: Tab = {
  id: 'more-categories',
  label: 'More',
  icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
};

export default function HomeHero({ activeTab = 'all', onTabChange, searchPlaceholder }: HomeHeroProps) {
  const { settings: appSettings } = useAppSettings();
  const { t, getTranslatedField } = useTranslation();
  const { cart } = useCart();
  const { mode, setMode } = useCommerceMode();
  const { user } = useAuth();
  const theme = useHomeTheme();
  const [tabs, setTabs] = useState<Tab[]>([ALL_TAB, MORE_TAB]);
  const cartCount = cart?.itemCount || 0;

  useEffect(() => {
    const fetchHeaderCategories = async () => {
      try {
        const cats = await getHeaderCategoriesPublic();
        if (cats && cats.length > 0) {
          const mapSlugToImage = (slug: string) => {
            switch(slug) {
              case 'grocery': return '/grocery_icon.jpg';
              case 'fruits-vegetables': return '/fruits_veg_icon.jpg';
              case 'dairy-milk': return '/dairy_icon.jpg';
              case 'snacks-drinks': return '/snacks_icon.jpg';
              case 'home-furniture': return '/home_essentials_icon.jpg';
              case 'beauty': return '/personal_care_icon.jpg';
              default: return undefined;
            }
          };

          const mapped = cats
            .filter(c => c.slug !== 'all' && c.status === 'Published')
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(c => ({
              id: c.slug,
              label: getTranslatedField(c, "name") || c.name,
              icon: getIconByName(c.iconName),
              imageUrl: mapSlugToImage(c.slug)
            }));
          setTabs([ALL_TAB, ...mapped, MORE_TAB]);
        } else {
          setTabs([ALL_TAB, MORE_TAB]);
        }
      } catch (error) {
        console.error('Failed to fetch header categories', error);
        setTabs([ALL_TAB, MORE_TAB]);
      }
    };
    fetchHeaderCategories();
  }, [getTranslatedField]);
  const navigate = useNavigate();
  const { location: userLocation } = useLocation();
  const heroRef = useRef<HTMLDivElement>(null);
  const topSectionRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [, setIsSticky] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Format location display text - only show if user has provided location
  const locationDisplayText = useMemo(() => {
    if (userLocation?.address) {
      return userLocation.address;
    }
    if (userLocation?.city && userLocation?.state) {
      return `${userLocation.city}, ${userLocation.state}`;
    }
    if (userLocation?.city) {
      return userLocation.city;
    }
    return '';
  }, [userLocation]);

  // Short label for the top bar (city only, like mockup "Indore")
  const shortLocationLabel = useMemo(() => {
    if (userLocation?.city) return userLocation.city;
    if (locationDisplayText) {
      return locationDisplayText.length > 18 ? `${locationDisplayText.slice(0, 18)}…` : locationDisplayText;
    }
    return t('customer.deliverTo', 'Deliver to');
  }, [userLocation, locationDisplayText, t]);

  const [categories, setCategories] = useState<Category[]>([]);

  // Fetch categories for search suggestions
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await getCategories();
        if (response.success && response.data) {
          setCategories(response.data.map((c: any) => ({
            ...c,
            id: c._id || c.id
          })));
        }
      } catch (error) {
        console.error("Error fetching categories for suggestions:", error);
      }
    };
    fetchCategories();
  }, []);

  // Search suggestions based on active tab or fetched categories
  const searchSuggestions = useMemo(() => {
    if (activeTab === 'all' && categories.length > 0) {
      return categories.slice(0, 8).map(c => c.name.toLowerCase());
    }

    switch (activeTab) {
      case 'grocery':
        return ['atta', 'dal', 'rice', 'spices', 'sugar', 'ghee', 'oil', 'tea'];
      case 'fruits-vegetables':
        return ['fresh vegetables', 'potatoes', 'onions', 'apples', 'bananas', 'fresh juice'];
      case 'dairy-milk':
        return ['milk', 'paneer', 'curd', 'butter', 'cheese', 'ghee'];
      case 'bakery-biscuits':
        return ['bread', 'cookies', 'rusk', 'biscuits', 'cakes', 'toast'];
      case 'snacks-drinks':
        return ['chips', 'namkeen', 'cold drinks', 'chocolates', 'ice cream', 'farsan'];
      case 'beauty':
        return ['face wash', 'body lotion', 'shampoo', 'hair oil', 'baby care', 'cosmetics'];
      case 'fashion':
        return ['t-shirt', 'saree', 'jeans', 'footwear', 'bags', 'kurta', 'kids wear'];
      case 'electronics':
        return ['chargers', 'cables', 'power banks', 'earphones', 'mobile accessories', 'appliances'];
      case 'home-furniture':
        return ['home decor', 'cleaners', 'kitchen items', 'stationery', 'furniture', 'pooja items'];
      case 'toys-sports':
        return ['toys', 'cricket bat', 'football', 'board games', 'gym equipment', 'yoga mat'];
      case 'womens-fashion':
        return ['kurtis', 'sarees', 'dresses', 'tops', 'leggings', 'earrings', 'handbags', 'sandals'];
      case 'mens-fashion':
        return ['t-shirts', 'shirts', 'jeans', 'trackpants', 'kurtas', 'sports shoes', 'watches', 'wallets'];
      case 'home-and-kitchen':
        return ['pressure cooker', 'frying pan', 'wall clock', 'cushions'];
      case 'kids-fashion':
        return ['frocks', 'boys t-shirts', 'school bags', 'educational toys', 'plush toys', 'kids shoes'];
      default:
        return ['kurtis', 't-shirts', 'earbuds', 'bedsheets', 'storage containers', 'frocks', 'phone cover'];
    }
  }, [activeTab, categories]);

  useLayoutEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        hero,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: 'power2.out',
        }
      );
    }, hero);

    return () => ctx.revert();
  }, []);

  // Animate search suggestions
  useEffect(() => {
    setCurrentSearchIndex(0);
    const interval = setInterval(() => {
      setCurrentSearchIndex((prev) => (prev + 1) % searchSuggestions.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [searchSuggestions.length, activeTab]);

  // Handle sticky header transition based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      if (topSectionRef.current && stickyRef.current) {
        const topSectionBottom = topSectionRef.current.getBoundingClientRect().bottom;
        const topSectionHeight = topSectionRef.current.offsetHeight;
        const progress = Math.min(Math.max(1 - (topSectionBottom / topSectionHeight), 0), 1);
        setScrollProgress(progress);
        setIsSticky(topSectionBottom <= 0);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Keep active tab visible in the horizontal scroller
  useEffect(() => {
    const updateIndicator = (shouldScroll = true) => {
      const activeTabButton = tabRefs.current.get(activeTab);
      const container = tabsContainerRef.current;

      if (activeTabButton && container) {
        try {
          if (shouldScroll) {
            const containerScrollLeft = container.scrollLeft;
            const containerWidth = container.offsetWidth;
            const buttonLeft = activeTabButton.offsetLeft;
            const buttonRight = buttonLeft + activeTabButton.offsetWidth;
            const scrollPadding = 20;
            let targetScrollLeft = containerScrollLeft;

            if (buttonLeft < containerScrollLeft + scrollPadding) {
              targetScrollLeft = buttonLeft - scrollPadding;
            } else if (buttonRight > containerScrollLeft + containerWidth - scrollPadding) {
              targetScrollLeft = buttonRight - containerWidth + scrollPadding;
            }

            if (targetScrollLeft !== containerScrollLeft) {
              container.scrollTo({
                left: Math.max(0, targetScrollLeft),
                behavior: 'smooth'
              });
            }
          }
        } catch (error) {
          console.warn('Error scrolling active tab into view:', error);
        }
      }
    };

    updateIndicator(true);
    const timeout1 = setTimeout(() => updateIndicator(true), 50);
    const timeout2 = setTimeout(() => updateIndicator(true), 150);
    const timeout3 = setTimeout(() => updateIndicator(false), 300);

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
    };
  }, [activeTab]);

  const handleTabClick = (tabId: string) => {
    if (tabId === 'more-categories') {
      navigate('/categories');
      return;
    }
    onTabChange?.(tabId);
  };

  const openLocationModal = () => {
    window.dispatchEvent(new CustomEvent('openLocationChangeModal'));
  };

  const deliveryTime =
    appSettings?.estimatedDeliveryTime || appConfig.estimatedDeliveryTime || '12–15 mins';
  const cleanDeliveryTime = deliveryTime.toLowerCase().replace('delivery', '').trim();

  // "Deliver to Trisha — Noida, Uttar Pradesh 201301" (name only once the customer has set one)
  const customerName = (user?.name && user.name !== 'User' ? String(user.name).split(' ')[0] : '') as string;

  return (
    <div
      ref={heroRef}
      className="relative"
      style={{
        background: theme.heroBg,
        fontFamily: '"Poppins", sans-serif',
        transition: 'background 0.3s ease',
      }}
    >
      {/* ── Row 1: menu · logo · Quick/Shop All · bell · cart ── */}
      <div className="flex items-center gap-1.5 sm:gap-3 px-3 sm:px-4 md:px-6 lg:px-8 pt-3">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('openSidebarMenu'))}
          aria-label={t('common.menu', 'Menu')}
          className="md:hidden w-8 h-8 -ml-1 flex items-center justify-center flex-shrink-0 rounded-lg active:bg-white/50"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="2.2" strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>

        <img
          src={appSettings?.appLogo || '/exnshop_logo.png'}
          alt={appSettings?.appName || 'Exnshop'}
          className="md:hidden h-11 sm:h-12 w-auto object-contain flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/logo512.png';
          }}
        />

        {/* Quick / Shop All */}
        <div className="flex-1 flex justify-center min-w-0">
          <div className="inline-flex items-center bg-white/80 backdrop-blur-sm rounded-full p-1 gap-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setMode('Quick')}
              className="flex items-center gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-colors whitespace-nowrap"
              style={mode === 'Quick' ? { background: theme.brand, color: '#fff' } : { color: '#1f2937' }}
            >
              <svg className="hidden min-[390px]:block w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L4.09 12.69a1 1 0 0 0 .77 1.64H11l-1 7.31a1 1 0 0 0 1.79.63L20.91 11.3a1 1 0 0 0-.77-1.64H14l1-7.3a1 1 0 0 0-1.79-.63L13 2z" />
              </svg>
              {t('customer.modeQuick', 'Quick')}
            </button>
            <button
              type="button"
              onClick={() => setMode('ECommerce')}
              className="flex items-center gap-1 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-colors whitespace-nowrap"
              style={mode === 'ECommerce' ? { background: theme.brand, color: '#fff' } : { color: '#1f2937' }}
            >
              <svg className="hidden min-[390px]:block w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 7h12l1 14H5L6 7z" />
                <path d="M9 10V6a3 3 0 0 1 6 0v4" />
              </svg>
              {t('customer.modeShopAll', 'Shop All')}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/notifications')}
          aria-label={t('common.notifications', 'Notifications')}
          className="relative w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="absolute top-1 right-1.5 w-2.5 h-2.5 rounded-full border-2 border-white" style={{ background: theme.brand }} />
        </button>

        <button
          type="button"
          onClick={() => navigate('/cart')}
          aria-label={t('common.cart', 'Cart')}
          className="relative w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {cartCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Row 2: deliver to · delivery time ── */}
      <div ref={topSectionRef} className="flex items-center gap-2 px-4 md:px-6 lg:px-8 pt-3 pb-1">
        <button
          type="button"
          onClick={openLocationModal}
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left group"
          title={locationDisplayText || t('customer.deliverTo', 'Deliver to')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-neutral-800">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span className="text-[13px] sm:text-sm text-neutral-800 truncate">
            {t('customer.deliverTo', 'Deliver to')}{' '}
            <span className="font-bold text-neutral-900">
              {customerName ? `${customerName} — ` : ''}
              {locationDisplayText || shortLocationLabel}
            </span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-neutral-800">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex-shrink-0 inline-flex items-center gap-1 bg-white/90 rounded-full pl-2 pr-2.5 py-1 shadow-sm">
          <svg width="13" height="13" viewBox="0 0 24 24" className="flex-shrink-0">
            <path d="M13 2L4.09 12.69a1 1 0 0 0 .77 1.64H11l-1 7.31a1 1 0 0 0 1.79.63L20.91 11.3a1 1 0 0 0-.77-1.64H14l1-7.3a1 1 0 0 0-1.79-.63L13 2z" fill="#FF8C00" />
          </svg>
          <span className="text-[11px] sm:text-xs font-semibold text-neutral-800 whitespace-nowrap">
            {t('customer.deliveringInShort', 'Delivery in')} {cleanDeliveryTime}
          </span>
        </div>
      </div>

      {/* ── Sticky: search + department circles ── */}
      <div
        ref={stickyRef}
        className="sticky top-0 z-50"
        style={
          scrollProgress >= 0.1
            ? {
                background: `rgba(255,255,255,${Math.min(1, scrollProgress + 0.2)})`,
                boxShadow: `0 4px 6px -1px rgba(0,0,0,${scrollProgress * 0.08})`,
                transition: 'background 0.1s ease-out, box-shadow 0.1s ease-out',
              }
            : undefined
        }
      >
        <div className="px-4 md:px-6 lg:px-8 pt-2 pb-1">
          <div
            onClick={() => navigate('/search')}
            className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 cursor-pointer bg-white border border-white shadow-[0_2px_10px_rgba(0,0,0,0.06)] hover:shadow-md transition-shadow"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-neutral-700">
              <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="2" />
              <path d="m20.5 20.5-4.2-4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div className="flex-1 relative h-5 overflow-hidden">
              {searchSuggestions.map((suggestion, index) => {
                const isActive = index === currentSearchIndex;
                const prevIndex = (currentSearchIndex - 1 + searchSuggestions.length) % searchSuggestions.length;
                const isPrev = index === prevIndex;
                return (
                  <div
                    key={suggestion}
                    className={`absolute inset-0 flex items-center transition-all duration-500 ${
                      isActive ? 'translate-y-0 opacity-100' : isPrev ? '-translate-y-full opacity-0' : 'translate-y-full opacity-0'
                    }`}
                  >
                    <span className="text-sm sm:text-[15px] text-neutral-400 truncate">
                      {index === 0
                        ? searchPlaceholder || t('customer.searchProductsBrands', 'Search for products, brands and more…')
                        : `Search for ${suggestion}…`}
                    </span>
                  </div>
                );
              })}
            </div>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-neutral-700">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="7" y1="10" x2="17" y2="10" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </div>
        </div>

        {/* Department circles */}
        <div
          ref={tabsContainerRef}
          className="relative flex gap-1 min-[400px]:gap-1.5 md:gap-5 overflow-x-auto scrollbar-hide px-3 md:px-6 lg:px-8 md:justify-center scroll-smooth pt-3 pb-3"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const isAll = tab.id === 'all';
            const tabLabel =
              isAll ? t('common.all', 'All') : tab.id === 'more-categories' ? t('common.more', 'More') : tab.label;

            return (
              <button
                key={tab.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(tab.id, el);
                  else tabRefs.current.delete(tab.id);
                }}
                onClick={() => handleTabClick(tab.id)}
                className="flex-shrink-0 flex flex-col items-center gap-1.5 w-[60px] min-[400px]:w-[62px] md:w-[76px] group"
                type="button"
              >
                <div
                  className={`w-[54px] h-[54px] min-[400px]:w-14 min-[400px]:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-200 overflow-hidden [&_svg]:w-[26px] [&_svg]:h-[26px] ${
                    isActive ? 'scale-105' : 'group-hover:-translate-y-0.5'
                  }`}
                  style={
                    isAll
                      ? {
                          background: isActive ? '#1D5BFF' : '#3B7BFF',
                          color: '#fff',
                          boxShadow: isActive ? '0 0 0 4px rgba(29,91,255,0.25), 0 6px 14px rgba(29,91,255,0.35)' : '0 3px 8px rgba(29,91,255,0.25)',
                        }
                      : {
                          background: `radial-gradient(circle at 50% 35%, #ffffff 0%, ${theme.tint} 75%)`,
                          color: theme.brand,
                          boxShadow: isActive
                            ? `0 0 0 2px ${theme.brand}, 0 6px 14px rgba(0,0,0,0.10)`
                            : `0 0 0 1.5px ${theme.tintBorder}, 0 3px 8px rgba(0,0,0,0.06)`,
                        }
                  }
                >
                  {tab.imageUrl ? (
                    <img src={tab.imageUrl} alt={tabLabel} className="w-[85%] h-[85%] object-contain" />
                  ) : (
                    tab.icon
                  )}
                </div>
                <span
                  className={`text-[11px] md:text-xs text-center leading-tight w-full line-clamp-2 ${
                    isActive ? 'font-bold' : 'font-medium text-neutral-800'
                  }`}
                  style={isActive ? { color: isAll ? '#1D5BFF' : theme.brand } : undefined}
                >
                  {tabLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
