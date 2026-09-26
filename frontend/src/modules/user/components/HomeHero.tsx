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

interface HomeHeroProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
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

export default function HomeHero({ activeTab = 'all', onTabChange }: HomeHeroProps) {
  const { settings: appSettings } = useAppSettings();
  const { t, getTranslatedField } = useTranslation();
  const { cart } = useCart();
  const { mode, setMode } = useCommerceMode();
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
          setTabs([ALL_TAB, ...mapped]);
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
      default:
        return ['atta', 'rice', 'dal', 'milk', 'chips', 'fresh fruits', 'oil', 'tea', 'vegetables'];
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

  return (
    <div
      ref={heroRef}
      className="relative"
      style={{
        background: mode === 'ECommerce'
          ? 'linear-gradient(to bottom, #f3c2c7 0%, #f7dade 45%, #fdf3f4 100%)'
          : 'linear-gradient(to bottom, #b3d4ff 0%, #d6e8ff 45%, #f0f7ff 100%)',
        fontFamily: '"Poppins", sans-serif',
        paddingBottom: 0,
        marginBottom: 0,
        transition: 'background 0.3s ease',
      }}
    >
      {/* Quick / Shop All commerce mode switcher */}
      <div className="px-4 md:px-6 lg:px-8 pt-2 flex justify-center">
        <div className="inline-flex items-center bg-white/70 backdrop-blur-sm rounded-full p-1 gap-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMode('Quick')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1 ${
              mode === 'Quick' ? 'bg-primary text-white shadow-sm' : 'text-neutral-600'
            }`}
          >
            ⚡ {t('customer.modeQuick', 'Quick')}
          </button>
          <button
            type="button"
            onClick={() => setMode('ECommerce')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
              mode === 'ECommerce' ? 'bg-ecommerce text-white shadow-sm' : 'text-neutral-600'
            }`}
          >
            {t('customer.modeShopAll', 'Shop All')}
          </button>
        </div>
      </div>

      {/* Top bar: logo + location + bell + cart */}
      <div>
        <div ref={topSectionRef} className="px-4 md:px-6 lg:px-8 pt-2 md:pt-3 pb-1">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div
              className="bg-white rounded-2xl p-1 shadow-sm border border-white/90 flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{
                width: '56px',
                height: '56px',
                minWidth: '56px',
                maxWidth: '56px',
                minHeight: '56px',
                maxHeight: '56px',
              }}
            >
              <img
                src="/exnshop_logo.png"
                alt={appSettings?.appName || 'Exnshop'}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/logo512.png';
                }}
              />
            </div>

            {/* Location + delivery pill */}
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={openLocationModal}
                className="flex items-center gap-1 max-w-full cursor-pointer group"
                title={locationDisplayText || t('customer.deliverTo', 'Deliver to')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-primary">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
                </svg>
                <span className="font-bold text-neutral-900 text-sm md:text-base truncate group-hover:text-primary transition-colors">
                  {shortLocationLabel}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 text-neutral-700">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Delivery time pill */}
              <div className="mt-1 inline-flex items-center gap-1.5 bg-white/85 border border-white rounded-full px-2.5 py-1 shadow-sm max-w-[90%] md:max-w-full">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                  <path d="M13 2L4.09 12.69a1 1 0 0 0 .77 1.64H11l-1 7.31a1 1 0 0 0 1.79.63L20.91 11.3a1 1 0 0 0-.77-1.64H14l1-7.3a1 1 0 0 0-1.79-.63L13 2z" fill="#FF8C00" stroke="#FF8C00" strokeWidth="0.5" />
                </svg>
                <span className="text-[11px] md:text-xs font-semibold text-neutral-800 truncate">
                  {t('customer.deliveringInShort', 'Delivery in')} {cleanDeliveryTime}
                </span>
              </div>
            </div>

            {/* Bell + Cart */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => navigate('/notifications')}
                aria-label={t('common.notifications', 'Notifications')}
                className="relative w-10 h-10 md:w-11 md:h-11 rounded-full bg-white shadow-sm border border-white flex items-center justify-center hover:shadow-md active:scale-95 transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/cart')}
                aria-label={t('common.cart', 'Cart')}
                className="relative w-10 h-10 md:w-11 md:h-11 rounded-full bg-white shadow-sm border border-white flex items-center justify-center hover:shadow-md active:scale-95 transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky section: Search Bar and Category Circles */}
      <div
        ref={stickyRef}
        className="sticky top-0 z-50"
        style={{
          ...(scrollProgress >= 0.1 && {
            background: `linear-gradient(to bottom,
              rgba(232, 242, 255, ${1 - scrollProgress}),
              rgba(247, 251, 255, ${1 - scrollProgress})),
              rgba(255, 255, 255, ${scrollProgress})`,
            boxShadow: `0 4px 6px -1px rgba(0, 0, 0, ${scrollProgress * 0.1})`,
            transition: 'background 0.1s ease-out, box-shadow 0.1s ease-out',
          }),
        }}
      >
        {/* Search Bar */}
        <div className="px-4 md:px-6 lg:px-8 pt-1 md:pt-2 pb-1">
          <div
            onClick={() => navigate('/search')}
            className="w-full rounded-2xl shadow-sm px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:shadow-md transition-all duration-300 bg-white border border-neutral-100"
            style={{
              boxShadow: scrollProgress > 0.3
                ? '0 1px 3px rgba(0,0,0,0.08)'
                : '0 2px 8px rgba(0,86,255,0.08)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0 text-neutral-500">
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
              <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div className="flex-1 relative h-5 overflow-hidden">
              {searchSuggestions.map((suggestion, index) => {
                const isActive = index === currentSearchIndex;
                const prevIndex = (currentSearchIndex - 1 + searchSuggestions.length) % searchSuggestions.length;
                const isPrev = index === prevIndex;

                return (
                  <div
                    key={suggestion}
                    className={`absolute inset-0 flex items-center transition-all duration-500 ${isActive
                      ? 'translate-y-0 opacity-100'
                      : isPrev
                        ? '-translate-y-full opacity-0'
                        : 'translate-y-full opacity-0'
                      }`}
                  >
                    <span className="text-sm text-neutral-400 truncate">
                      {index === 0
                        ? t('customer.searchPlaceholder', 'Search for atta, rice, dal, milk…')
                        : `Search for ${suggestion}…`}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Scan icon (decorative, matches mockup) */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-neutral-500">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="7" y1="12" x2="17" y2="12" />
            </svg>
          </div>
        </div>

        {/* Category Circles */}
        <div className="w-full">
          <div
            ref={tabsContainerRef}
            className="relative flex gap-2 md:gap-4 overflow-x-auto scrollbar-hide -mx-4 md:mx-0 px-4 md:px-6 lg:px-8 md:justify-center scroll-smooth py-2"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const tabLabel =
                tab.id === 'all'
                  ? t('common.all', 'All')
                  : tab.id === 'more-categories'
                    ? t('common.more', 'More')
                    : tab.label;

              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    if (el) {
                      tabRefs.current.set(tab.id, el);
                    } else {
                      tabRefs.current.delete(tab.id);
                    }
                  }}
                  onClick={() => handleTabClick(tab.id)}
                  className="flex-shrink-0 flex flex-col items-center gap-1.5 min-w-[64px] md:min-w-[72px] group"
                  type="button"
                >
                  <div
                    className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-200 overflow-hidden ${
                      isActive && tab.id === 'all'
                        ? 'bg-blue-600 text-white border-4 border-blue-400 shadow-lg scale-105'
                        : tab.id === 'all'
                        ? 'bg-blue-500 text-white shadow-md border-4 border-blue-300/50'
                        : isActive
                        ? 'bg-white shadow-lg scale-105 ring-2 ring-primary ring-offset-1'
                        : 'bg-white shadow-sm border border-neutral-100 group-hover:shadow-md group-hover:-translate-y-0.5'
                    }`}
                  >
                    {tab.imageUrl ? (
                      <img src={tab.imageUrl} alt={tabLabel} className="w-[85%] h-[85%] object-contain" />
                    ) : (
                      <span className={tab.id === 'all' ? 'text-white' : isActive ? 'text-primary' : 'text-neutral-700'}>
                        {tab.icon}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[11px] md:text-xs text-center leading-tight max-w-[68px] line-clamp-2 ${isActive ? 'text-primary font-bold' : 'text-neutral-700 font-semibold'
                    }`}
                  >
                    {tabLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
