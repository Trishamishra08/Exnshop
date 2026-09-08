import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api/config';

export interface AppSettingsData {
  appName: string;
  appLogo?: string;
  appFavicon?: string;
  estimatedDeliveryTime?: string;
  contactEmail?: string;
  contactPhone?: string;
  supportEmail?: string;
  supportPhone?: string;
  companyAddress?: string;
  companyCity?: string;
  companyState?: string;
  companyCountry?: string;
  companyPincode?: string;
  platformFee?: number;
  deliveryCharges?: number;
  freeDeliveryThreshold?: number;
  minimumOrderValue?: number;
  deliveryConfig?: {
    isDistanceBased?: boolean;
    baseCharge?: number;
    baseDistance?: number;
    kmRate?: number;
    deliveryBoyKmRate?: number;
    googleMapsKey?: string;
  };
  features?: {
    showSellerDetails?: boolean;
    sellerRegistration?: boolean;
    productApproval?: boolean;
    orderTracking?: boolean;
    wallet?: boolean;
    coupons?: boolean;
  };
  aboutUs?: {
    missionText?: string;
    whatWeDoText?: string;
    stats?: Array<{
      label: string;
      value: string;
    }>;
    whyChooseUs?: Array<{
      title: string;
      description: string;
    }>;
  };
}

interface AppSettingsContextType {
  settings: AppSettingsData;
  isLoading: boolean;
  refreshSettings: () => Promise<void>;
}

const defaultSettings: AppSettingsData = {
  appName: 'Exnshop',
  appLogo: '/exnshop_logo.png',
  appFavicon: '/exnshop_logo.png',
  estimatedDeliveryTime: '12-15 mins',
  contactEmail: 'support@exnshop.in',
  contactPhone: '6399376602',
  supportEmail: 'support@exnshop.in',
  supportPhone: '6399376602',
  companyAddress: 'C 119 Sector 2, Noida, Gautam Buddha Nagar, Uttar Pradesh, India, 201301',
  companyCity: 'Noida',
  companyState: 'Uttar Pradesh',
  companyCountry: 'India',
  companyPincode: '201301',
  platformFee: 2,
  deliveryCharges: 0,
  freeDeliveryThreshold: 500,
  aboutUs: {
    missionText: `ExnShop was founded to solve a problem every Indian trader knows: sourcing at the right price, in the right quantity, with paperwork that actually holds up. Informal WhatsApp orders and scattered price lists make wholesale slow, opaque and hard to reconcile at tax time.

We built ExnShop to bring structure to that chaos. Sellers list goods with transparent MOQ and tier pricing; buyers source with confidence knowing every order is backed by KYC verification, GST-compliant invoicing and secure payments through Razorpay. From a single cart to bulk repeat orders, the experience is designed for the rhythm of B2B.

Today ExnShop serves businesses across 28 states, with fintech services layered on top so our partners can move money, recharge and pay bills without leaving the platform they already trust.`,
    whatWeDoText:
      'ExnShop is a B2B marketplace where verified sellers list goods with transparent MOQ and tier pricing, and buyers source with GST-compliant invoicing and secure Razorpay payments — plus fintech services like DMT, AEPS, RECHARGE and BBPS on one platform.',
    stats: [
      { value: '28', label: 'States Served' },
      { value: 'B2B', label: 'Marketplace' },
      { value: 'GST', label: 'Compliant Invoicing' },
      { value: 'KYC', label: 'Verified Sellers' },
    ],
    whyChooseUs: [
      {
        title: 'GST-compliant by design',
        description:
          'Every order generates a valid tax invoice with HSN-coded GST calculation, so your books stay clean and audit-ready.',
      },
      {
        title: 'Built for wholesale',
        description:
          'MOQ enforcement and tier pricing let manufacturers, distributors and retailers trade at the right volume and the right price.',
      },
      {
        title: 'Verified sellers only',
        description:
          'KYC-verified sellers, admin-controlled approvals and seller controls keep the marketplace trustworthy for every buyer.',
      },
      {
        title: 'One platform, many services',
        description:
          'From sourcing to fintech services like DMT, AEPS, RECHARGE and BBPS — ExnShop supports the full B2B journey.',
      },
    ],
  },
};

const AppSettingsContext = createContext<AppSettingsContextType>({
  settings: defaultSettings,
  isLoading: false,
  refreshSettings: async () => {},
});

export const AppSettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettingsData>(defaultSettings);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/customer/app-settings');
      if (response.data && response.data.success && response.data.data) {
        const data = response.data.data;
        const rawName = data.appName || '';
        const rawLogo = data.appLogo || '';
        const isLegacyBrand =
          /olovely/i.test(rawName) ||
          /olovely/i.test(rawLogo) ||
          !rawLogo;

        setSettings((prev) => ({
          ...prev,
          ...data,
          appName: isLegacyBrand ? 'Exnshop' : (data.appName || prev.appName),
          appLogo: isLegacyBrand ? '/exnshop_logo.png' : (data.appLogo || prev.appLogo),
          appFavicon: isLegacyBrand
            ? '/exnshop_logo.png'
            : (data.appFavicon || data.appLogo || prev.appFavicon || '/exnshop_logo.png'),
          estimatedDeliveryTime: data.estimatedDeliveryTime || prev.estimatedDeliveryTime,
        }));
      }
    } catch (error) {
      console.warn('Failed to fetch public app settings, using defaults:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Sync browser tab title with app name
  useEffect(() => {
    const name = settings.appName || 'Exnshop';
    document.title = `${name} - Shop Smart, Live Better`;
  }, [settings.appName]);

  // Sync favicon with website logo / custom favicon
  useEffect(() => {
    const faviconUrl = settings.appFavicon || settings.appLogo || '/exnshop_logo.png';
    const iconLinks: NodeListOf<HTMLLinkElement> = document.querySelectorAll("link[rel*='icon']");
    if (iconLinks.length > 0) {
      iconLinks.forEach((link) => {
        link.href = faviconUrl;
      });
    } else {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = faviconUrl;
      document.head.appendChild(link);
    }
  }, [settings.appFavicon, settings.appLogo]);

  return (
    <AppSettingsContext.Provider
      value={{
        settings,
        isLoading,
        refreshSettings: fetchSettings,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = () => useContext(AppSettingsContext);
export default AppSettingsContext;
