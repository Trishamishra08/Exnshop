/**
 * Safety net for every <img> in the app: if a picture can't be loaded (file missing on the
 * server, bad URL, offline) it is swapped once for a neutral placeholder instead of showing
 * the browser's broken-image icon and the alt text. Components may still handle onError
 * themselves (e.g. show an emoji) — this only catches what they don't.
 */
const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f3f4f6"/>` +
      `<g fill="none" stroke="#c4c8cf" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">` +
      `<rect x="32" y="36" width="56" height="48" rx="6"/><circle cx="48" cy="52" r="5"/><path d="M34 80l18-18 12 12 8-8 16 16"/></g></svg>`
  );

export function installImageFallback() {
  if (typeof document === "undefined") return;
  document.addEventListener(
    "error",
    (e) => {
      const el = e.target as HTMLImageElement | null;
      if (!el || el.tagName !== "IMG" || el.dataset.fallbackApplied) return;
      el.dataset.fallbackApplied = "1";
      el.removeAttribute("srcset");
      el.src = PLACEHOLDER;
    },
    true // image errors don't bubble, so listen in the capture phase
  );
}
