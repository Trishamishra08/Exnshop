/** Icons the admin can choose for trust-strip items and offer cards (keys match the backend enums). */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const TRUST_ICON_SVGS: Record<string, JSX.Element> = {
  delivery: (
    <svg viewBox="0 0 24 24" {...S}><path d="M1 6h13v10H1zM14 9h4l3 3v4h-7z" /><circle cx="5" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>
  ),
  returns: (
    <svg viewBox="0 0 24 24" {...S}><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>
  ),
  payments: (
    <svg viewBox="0 0 24 24" {...S}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>
  ),
  prime: (
    <svg viewBox="0 0 24 24" {...S}><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" /></svg>
  ),
  offers: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M12 2l2.4 2.1 3.2-.3.7 3.1 2.8 1.6-1.3 2.9 1.3 2.9-2.8 1.6-.7 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.7-3.1-2.8-1.6 1.3-2.9-1.3-2.9 2.8-1.6.7-3.1 3.2.3z" />
      <path d="M9 15l6-6" /><circle cx="9.5" cy="9.5" r="1" /><circle cx="14.5" cy="14.5" r="1" />
    </svg>
  ),
  quality: (
    <svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="9" r="6" /><path d="M8.5 14.5L7 22l5-3 5 3-1.5-7.5" /><path d="M9.5 9l1.8 1.8L14.5 7.5" /></svg>
  ),
  support: (
    <svg viewBox="0 0 24 24" {...S}><path d="M4 14v-3a8 8 0 0 1 16 0v3" /><rect x="2" y="13" width="5" height="7" rx="2" /><rect x="17" y="13" width="5" height="7" rx="2" /></svg>
  ),
  cod: (
    <svg viewBox="0 0 24 24" {...S}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>
  ),
  fast: (
    <svg viewBox="0 0 24 24" {...S}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>
  ),
};

export const OFFER_ICON_SVGS: Record<string, JSX.Element> = {
  card: (
    <svg viewBox="0 0 24 24" {...S} strokeWidth={2.2}><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20M6 15h4" /></svg>
  ),
  crown: (
    <svg viewBox="0 0 24 24" {...S} strokeWidth={2.2}><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z" /></svg>
  ),
  gift: (
    <svg viewBox="0 0 24 24" {...S} strokeWidth={2.2}><rect x="3" y="8" width="18" height="13" rx="1.5" /><path d="M12 8v13M3 12h18M12 8S9.5 3 7.5 4.5 9 8 12 8zm0 0s2.5-5 4.5-3.5S15 8 12 8z" /></svg>
  ),
  tag: (
    <svg viewBox="0 0 24 24" {...S} strokeWidth={2.2}><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" {...S} strokeWidth={2.2}><path d="M20 7H5a2 2 0 0 1 0-4h13v4" /><path d="M3 5v14a2 2 0 0 0 2 2h15V7" /><circle cx="16" cy="14" r="1.2" /></svg>
  ),
  truck: (
    <svg viewBox="0 0 24 24" {...S} strokeWidth={2.2}><path d="M1 6h13v10H1zM14 9h4l3 3v4h-7z" /><circle cx="5" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>
  ),
};
