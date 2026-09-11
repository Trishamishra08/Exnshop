import { Link } from 'react-router-dom';
import { useAppSettings } from '../context/AppSettingsContext';
import { EXNSHOP_ABOUT } from '../constants/exnshopAbout';

export default function SiteFooter() {
  const { settings } = useAppSettings();
  const year = new Date().getFullYear();
  const appName =
    settings?.appName && !/olovely/i.test(settings.appName) ? settings.appName : 'ExnShop';
  const email =
    settings?.supportEmail || settings?.contactEmail || EXNSHOP_ABOUT.office.email;
  const phone =
    settings?.supportPhone || settings?.contactPhone || EXNSHOP_ABOUT.office.phone;
  const address =
    settings?.companyAddress ||
    [settings?.companyCity, settings?.companyState, settings?.companyCountry]
      .filter(Boolean)
      .join(', ') ||
    EXNSHOP_ABOUT.office.address;

  const linkClass =
    'text-sm text-neutral-300 hover:text-white transition-colors block py-1';

  return (
    <footer className="w-full bg-neutral-900 text-white mt-auto border-t border-neutral-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10">
          {/* Brand / About */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex items-center gap-2.5 mb-4">
              <img
                src="/exnshop_logo.png"
                alt={appName}
                className="w-10 h-10 object-contain rounded-xl bg-white p-1"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/exnshop_logo.png';
                }}
              />
              <span className="font-bold text-lg tracking-tight">{appName}</span>
            </Link>
            <p className="text-sm text-neutral-400 leading-relaxed mb-3">
              {EXNSHOP_ABOUT.tagline}. Fast delivery for groceries & daily essentials.
            </p>
            <p className="text-xs text-neutral-500 leading-relaxed line-clamp-4">
              {EXNSHOP_ABOUT.whatWeDoText}
            </p>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-3">
              Quick Links
            </h3>
            <nav className="flex flex-col" aria-label="Quick links">
              <Link to="/" className={linkClass}>
                Home
              </Link>
              <Link to="/categories" className={linkClass}>
                Categories
              </Link>
              <Link to="/orders" className={linkClass}>
                My Orders
              </Link>
              <Link to="/account" className={linkClass}>
                My Account
              </Link>
              <Link to="/faq" className={linkClass}>
                FAQ
              </Link>
              <Link to="/about-us" className={linkClass}>
                About Us
              </Link>
            </nav>
          </div>

          {/* Policies */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-3">
              Policies
            </h3>
            <nav className="flex flex-col" aria-label="Policies">
              <Link to="/terms-and-conditions" className={linkClass}>
                Terms & Conditions
              </Link>
              <Link to="/privacy-policy" className={linkClass}>
                Privacy Policy
              </Link>
              <Link to="/refund-policy" className={linkClass}>
                Refund Policy
              </Link>
              <Link to="/customer-policy" className={linkClass}>
                Customer Policy
              </Link>
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-3">
              Contact Us
            </h3>
            <div className="space-y-3 text-sm text-neutral-300">
              <div>
                <p className="text-xs text-neutral-500 mb-1">{EXNSHOP_ABOUT.office.label}</p>
                <p className="font-medium text-white mb-1">{EXNSHOP_ABOUT.office.legalName}</p>
                <p className="leading-relaxed">{address}</p>
              </div>
              <p>
                <span className="text-neutral-500">CIN: </span>
                {EXNSHOP_ABOUT.office.cin}
              </p>
              <p>
                <span className="text-neutral-500">Phone: </span>
                <a href={`tel:${phone}`} className="hover:text-white transition-colors">
                  +91 {phone}
                </a>
              </p>
              <p>
                <span className="text-neutral-500">Email: </span>
                <a href={`mailto:${email}`} className="hover:text-white transition-colors">
                  {email}
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-neutral-500 text-center sm:text-left">
            © {year} {EXNSHOP_ABOUT.office.legalName}. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-neutral-500">
            <Link to="/privacy-policy" className="hover:text-white transition-colors">
              Privacy
            </Link>
            <Link to="/terms-and-conditions" className="hover:text-white transition-colors">
              Terms
            </Link>
            <Link to="/refund-policy" className="hover:text-white transition-colors">
              Refunds
            </Link>
            <Link to="/about-us" className="hover:text-white transition-colors">
              About
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
