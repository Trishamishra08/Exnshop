import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSettings } from '../../context/AppSettingsContext';
import SupportModal from '../../components/SupportModal';
import { EXNSHOP_ABOUT } from '../../constants/exnshopAbout';

export default function AboutUs() {
  const navigate = useNavigate();
  const { settings: appSettings } = useAppSettings();
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  const about = appSettings?.aboutUs;
  const missionText = about?.missionText || EXNSHOP_ABOUT.missionText;
  const whatWeDoText = about?.whatWeDoText || EXNSHOP_ABOUT.whatWeDoText;
  const stats =
    about?.stats && about.stats.length > 0 ? about.stats : [...EXNSHOP_ABOUT.stats];
  const principles =
    about?.whyChooseUs && about.whyChooseUs.length > 0
      ? about.whyChooseUs
      : [...EXNSHOP_ABOUT.whyChooseUs];

  const email =
    appSettings?.supportEmail || appSettings?.contactEmail || EXNSHOP_ABOUT.office.email;
  const phone =
    appSettings?.supportPhone || appSettings?.contactPhone || EXNSHOP_ABOUT.office.phone;
  const address =
    appSettings?.companyAddress ||
    [appSettings?.companyCity, appSettings?.companyState, appSettings?.companyCountry]
      .filter(Boolean)
      .join(', ') ||
    EXNSHOP_ABOUT.office.address;

  return (
    <div className="pb-8 bg-white min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-b from-blue-50 to-white pb-6 pt-4 sticky top-0 z-10 border-b border-neutral-100">
        <div className="px-4 md:px-6 lg:px-8 max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-neutral-900 hover:text-primary transition-colors shrink-0"
              aria-label="Back"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h1 className="text-lg sm:text-xl font-bold text-neutral-900">About Us</h1>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-6 lg:px-8 py-6 max-w-3xl mx-auto">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white p-2 mb-4 shadow-md border border-neutral-200">
            <img
              src="/exnshop_logo.png"
              alt="ExnShop"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/exnshop_logo.png';
              }}
            />
          </div>
          <h2 className="text-3xl font-bold text-neutral-900 mb-2">
            {appSettings?.appName || 'ExnShop'}
          </h2>
          <p className="text-sm text-primary font-semibold tracking-wide">
            {EXNSHOP_ABOUT.tagline}
          </p>
        </div>

        {/* Our story */}
        <section className="mb-10">
          <h3 className="text-lg font-bold text-neutral-900 mb-3">{EXNSHOP_ABOUT.storyTitle}</h3>
          <div className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap space-y-3">
            {missionText.split('\n\n').map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </section>

        {/* What we do + stats */}
        <section className="mb-10">
          <h3 className="text-lg font-bold text-neutral-900 mb-3">What we do</h3>
          <p className="text-sm text-neutral-700 leading-relaxed mb-4">{whatWeDoText}</p>
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat, idx) => (
              <div
                key={idx}
                className="bg-cream rounded-xl p-3 border border-blue-100"
              >
                <div className="text-2xl font-bold text-primary mb-1">{stat.value}</div>
                <div className="text-xs text-neutral-700 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Registered Office */}
        <section className="mb-10 bg-neutral-50 rounded-2xl p-5 border border-neutral-200">
          <h3 className="text-lg font-bold text-neutral-900 mb-3">
            {EXNSHOP_ABOUT.office.label}
          </h3>
          <div className="space-y-2 text-sm text-neutral-700">
            <p className="font-semibold text-neutral-900">{EXNSHOP_ABOUT.office.legalName}</p>
            <p>{address}</p>
            <p>
              <span className="font-semibold text-neutral-900">CIN:</span>{' '}
              {EXNSHOP_ABOUT.office.cin}
            </p>
            <p>
              <span className="font-semibold text-neutral-900">Contact No:</span>{' '}
              <a href={`tel:${phone}`} className="text-primary hover:underline">
                {phone}
              </a>
            </p>
            <p>
              <span className="font-semibold text-neutral-900">Email:</span>{' '}
              <button
                type="button"
                onClick={() => setIsSupportModalOpen(true)}
                className="text-primary hover:underline"
              >
                {email}
              </button>
            </p>
          </div>
        </section>

        {/* What we stand for */}
        <section className="mb-10">
          <h3 className="text-lg font-bold text-neutral-900 mb-1">
            {EXNSHOP_ABOUT.principlesTitle}
          </h3>
          <p className="text-sm text-neutral-600 mb-4">{EXNSHOP_ABOUT.principlesIntro}</p>
          <div className="space-y-4">
            {principles.map((item, idx) => (
              <div
                key={idx}
                className="flex gap-3 p-4 rounded-xl border border-neutral-200 bg-white shadow-sm"
              >
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {idx + 1}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900 mb-1">{item.title}</h4>
                  <p className="text-xs text-neutral-600 leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mb-8 rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-6 text-white text-center">
          <h3 className="text-lg font-bold mb-2">{EXNSHOP_ABOUT.ctaTitle}</h3>
          <p className="text-sm text-white/90 mb-5">{EXNSHOP_ABOUT.ctaText}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="px-5 py-2.5 rounded-xl bg-white text-primary font-semibold text-sm hover:bg-blue-50 transition-colors"
            >
              Create an account
            </button>
            <button
              type="button"
              onClick={() => setIsSupportModalOpen(true)}
              className="px-5 py-2.5 rounded-xl border border-white/60 text-white font-semibold text-sm hover:bg-white/10 transition-colors"
            >
              Talk to us
            </button>
          </div>
        </section>

        {/* Contact strip */}
        <div className="bg-cream rounded-2xl p-5 border border-blue-100 mb-8">
          <h3 className="text-base font-bold text-neutral-900 mb-3 text-center">Get In Touch</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <span className="text-neutral-600">Email:</span>
              <button
                type="button"
                onClick={() => setIsSupportModalOpen(true)}
                className="text-primary font-medium hover:underline"
              >
                {email}
              </button>
            </div>
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              <span className="text-neutral-600">Phone:</span>
              <a href={`tel:${phone}`} className="text-primary font-medium hover:underline">
                +91 {phone}
              </a>
            </div>
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-neutral-500">
            © {new Date().getFullYear()} {EXNSHOP_ABOUT.office.legalName}. All rights reserved.
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Source:{' '}
            <a
              href="https://www.exnshop.in/about"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary"
            >
              exnshop.in/about
            </a>
          </p>
        </div>
      </div>

      <SupportModal isOpen={isSupportModalOpen} onClose={() => setIsSupportModalOpen(false)} />
    </div>
  );
}
