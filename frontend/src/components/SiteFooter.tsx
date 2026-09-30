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

  const linkClass = 'text-xs text-neutral-300 hover:text-white transition-colors';

  return (
    <footer className="w-full bg-neutral-900 text-white mt-auto border-t border-neutral-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-9">
        {/* Brand - compact single row; the long "what we do" blurb only shows where there's room */}
        <Link to="/" className="inline-flex items-center gap-2 mb-2">
          <img
            src="/exnshop_logo.png"
            alt={appName}
            className="w-8 h-8 object-contain rounded-lg bg-white p-1"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/exnshop_logo.png';
            }}
          />
          <span className="font-bold text-base tracking-tight">{appName}</span>
        </Link>
        <p className="text-xs text-neutral-400 mb-4 sm:mb-6">
          {EXNSHOP_ABOUT.tagline}. Fast delivery for groceries & daily essentials.
        </p>
        <p className="hidden sm:block text-xs text-neutral-500 leading-relaxed mb-6 max-w-2xl">
          {EXNSHOP_ABOUT.whatWeDoText}
        </p>

        {/* Links + Contact - side by side, 2 columns even on mobile, to keep total height low */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-5">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white mb-2">
              Quick Links
            </h3>
            <nav className="flex flex-col gap-1.5" aria-label="Quick links">
              <Link to="/" className={linkClass}>Home</Link>
              <Link to="/categories" className={linkClass}>Categories</Link>
              <Link to="/orders" className={linkClass}>My Orders</Link>
              <Link to="/account" className={linkClass}>My Account</Link>
              <Link to="/faq" className={linkClass}>FAQ</Link>
              <Link to="/about-us" className={linkClass}>About Us</Link>
            </nav>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white mb-2">
              Policies
            </h3>
            <nav className="flex flex-col gap-1.5" aria-label="Policies">
              <Link to="/terms-and-conditions" className={linkClass}>Terms & Conditions</Link>
              <Link to="/privacy-policy" className={linkClass}>Privacy Policy</Link>
              <Link to="/refund-policy" className={linkClass}>Refund Policy</Link>
              <Link to="/customer-policy" className={linkClass}>Customer Policy</Link>
            </nav>
          </div>

          <div className="col-span-2 lg:col-span-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white mb-2">
              Contact Us
            </h3>
            <div className="text-xs text-neutral-300 space-y-1">
              <p className="font-medium text-white">{EXNSHOP_ABOUT.office.legalName}</p>
              <p className="text-neutral-400 leading-relaxed">{address}</p>
              <p>
                <a href={`tel:${phone}`} className="hover:text-white transition-colors">+91 {phone}</a>
                <span className="text-neutral-600 mx-1.5">·</span>
                <a href={`mailto:${email}`} className="hover:text-white transition-colors">{email}</a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar - just copyright, links already covered above */}
      <div className="border-t border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <p className="text-[11px] text-neutral-500 text-center">
            © {year} {EXNSHOP_ABOUT.office.legalName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
