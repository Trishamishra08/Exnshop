import { useEffect, useState } from "react";
import {
  getHomePageContent,
  saveHomePageContent,
  EMPTY_HOME_PAGE_CONTENT,
  type AdminHomePageContent,
  type AdminHomeBanner,
  type AdminTrustItem,
  type AdminOfferCard,
  type AdminProductSection,
} from "../../../services/api/admin/adminHomePageContentService";
import { uploadImage } from "../../../services/api/uploadService";
import { compressImage, validateImageFile } from "../../../utils/imageUpload";
import { TRUST_ICON_SVGS, OFFER_ICON_SVGS } from "../../user/components/home/homeIcons";
import { OFFER_STYLES } from "../../user/components/home/homeTheme";

/**
 * Admin › Home Page Content — everything on the customer home page that isn't
 * a product: banners (per mode), the trust strip, offer cards, the product
 * sections and the "Shop by Category" block. One Save writes it all.
 */

const MODE_OPTIONS = [
  { value: "All", label: "Both modes" },
  { value: "Quick", label: "Quick only" },
  { value: "ECommerce", label: "Shop All only" },
] as const;
const SORT_OPTIONS = [
  { value: "popular", label: "Most popular (products marked Popular)" },
  { value: "discount", label: "Biggest discount first" },
  { value: "newest", label: "Newest first" },
] as const;
const TRUST_ICON_KEYS = Object.keys(TRUST_ICON_SVGS);
const OFFER_ICON_KEYS = Object.keys(OFFER_ICON_SVGS);
const OFFER_STYLE_KEYS = Object.keys(OFFER_STYLES);

const input = "w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500";
const label = "block text-xs font-medium text-neutral-600 mb-1";

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function RowTools({ index, count, onMove, onRemove, active, onToggle }: { index: number; count: number; onMove: (to: number) => void; onRemove: () => void; active: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <label className="flex items-center gap-1 text-xs text-neutral-600 mr-1 cursor-pointer">
        <input type="checkbox" checked={active} onChange={onToggle} /> Show
      </label>
      <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)} className="w-7 h-7 rounded border border-neutral-300 text-neutral-600 disabled:opacity-30" title="Move up">↑</button>
      <button type="button" disabled={index === count - 1} onClick={() => onMove(index + 1)} className="w-7 h-7 rounded border border-neutral-300 text-neutral-600 disabled:opacity-30" title="Move down">↓</button>
      <button type="button" onClick={onRemove} className="w-7 h-7 rounded border border-red-200 text-red-600 hover:bg-red-50" title="Remove">✕</button>
    </div>
  );
}

function Card({ title, hint, children, onAdd, addLabel }: { title: string; hint?: string; children: React.ReactNode; onAdd?: () => void; addLabel?: string }) {
  return (
    <section className="bg-white rounded-lg shadow-sm border border-neutral-200 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-800">{title}</h2>
          {hint && <p className="text-xs text-neutral-500 mt-0.5">{hint}</p>}
        </div>
        {onAdd && (
          <button type="button" onClick={onAdd} className="px-3 py-1.5 rounded-md bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 flex-shrink-0">
            + {addLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function ImagePicker({ value, onChange, hint, aspect }: { value?: string; onChange: (url: string) => void; hint: string; aspect: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pick = async (file?: File) => {
    if (!file) return;
    const v = validateImageFile(file);
    if (!v.valid) return setErr(v.error || "Invalid image");
    setErr("");
    setBusy(true);
    try {
      const compressed = await compressImage(file, 2000, 0.85);
      const res = await uploadImage(compressed, "exnshop/banners");
      onChange(res.secureUrl);
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <label className={`relative block w-full rounded-md border-2 border-dashed border-neutral-300 hover:border-teal-500 cursor-pointer overflow-hidden bg-neutral-50 ${aspect}`}>
        {value ? (
          <img src={value} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500 text-center px-2">{busy ? "Uploading…" : hint}</span>
        )}
        {value && busy && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs">Uploading…</span>}
        <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </div>
  );
}

export default function AdminHomePageContent() {
  const [content, setContent] = useState<AdminHomePageContent>(EMPTY_HOME_PAGE_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    getHomePageContent()
      .then((data) => setContent({ ...EMPTY_HOME_PAGE_CONTENT, ...(data || {}) }))
      .catch((e) => setMessage({ type: "err", text: e?.response?.data?.message || "Could not load home page content" }))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof AdminHomePageContent>(key: K, value: AdminHomePageContent[K]) => setContent((c) => ({ ...c, [key]: value }));
  const patch = <T,>(list: T[], i: number, change: Partial<T>) => list.map((x, j) => (j === i ? { ...x, ...change } : x));

  const save = async () => {
    if (content.banners.some((b) => !b.image)) {
      setMessage({ type: "err", text: "Every banner needs an image (or remove the empty banner)." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveHomePageContent(content);
      setContent({ ...EMPTY_HOME_PAGE_CONTENT, ...saved });
      setMessage({ type: "ok", text: "Saved. The customer home page shows the changes right away." });
    } catch (e: any) {
      setMessage({ type: "err", text: e?.response?.data?.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-neutral-500">Loading…</div>;

  const { banners, trustItems, offerCards, productSections, shopByCategory } = content;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="p-6 pb-0 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-800">Home Page Content</h1>
          <p className="text-sm text-neutral-500">Banners, trust strip, offer cards and home sections shown to customers.</p>
        </div>
        <button type="button" onClick={save} disabled={saving} className="px-5 py-2 rounded-md bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-60">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {message && (
        <div className="px-6 pt-4">
          <div className={`px-4 py-3 rounded border text-sm ${message.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{message.text}</div>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* ── Banners ── */}
        <Card
          title="Banners"
          hint="Shown at the top of the home page (carousel if more than one). Upload 3:1 images, e.g. 1800×600; optional mobile image 900×300. Leave the text fields empty for finished artwork."
          onAdd={() => set("banners", [...banners, { image: "", link: "/categories", mode: "All", isActive: true } as AdminHomeBanner])}
          addLabel="Add banner"
        >
          {banners.length === 0 && <p className="text-sm text-neutral-500">No banners — the home page shows the built-in banner (Promo Strip heading + real discounts).</p>}
          <div className="space-y-4">
            {banners.map((b, i) => (
              <div key={b._id || `new-${i}`} className="border border-neutral-200 rounded-lg p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-sm font-semibold text-neutral-700">Banner {i + 1}{b.title ? ` — ${b.title}` : ""}</span>
                  <RowTools index={i} count={banners.length} active={b.isActive} onToggle={() => set("banners", patch(banners, i, { isActive: !b.isActive }))} onMove={(to) => set("banners", move(banners, i, to))} onRemove={() => set("banners", banners.filter((_, j) => j !== i))} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
                  <div>
                    <span className={label}>Image (desktop) *</span>
                    <ImagePicker aspect="aspect-[3/1]" value={b.image} hint="Click to upload (3:1, e.g. 1800×600)" onChange={(url) => set("banners", patch(banners, i, { image: url }))} />
                  </div>
                  <div>
                    <span className={label}>Image (mobile, optional)</span>
                    <ImagePicker aspect="aspect-[3/1]" value={b.mobileImage} hint="Optional smaller image" onChange={(url) => set("banners", patch(banners, i, { mobileImage: url }))} />
                    {b.mobileImage && (
                      <button type="button" className="text-xs text-red-600 mt-1" onClick={() => set("banners", patch(banners, i, { mobileImage: "" }))}>Remove mobile image</button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <div><span className={label}>Name (admin only)</span><input className={input} value={b.title || ""} onChange={(e) => set("banners", patch(banners, i, { title: e.target.value }))} /></div>
                  <div>
                    <span className={label}>Show in</span>
                    <select className={input} value={b.mode} onChange={(e) => set("banners", patch(banners, i, { mode: e.target.value as any }))}>
                      {MODE_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div><span className={label}>Link when tapped</span><input className={input} placeholder="/categories or /category/kurtis" value={b.link || ""} onChange={(e) => set("banners", patch(banners, i, { link: e.target.value }))} /></div>
                  <div><span className={label}>Headline (optional)</span><input className={input} maxLength={60} value={b.headline || ""} onChange={(e) => set("banners", patch(banners, i, { headline: e.target.value }))} /></div>
                  <div><span className={label}>Subtitle (optional)</span><input className={input} maxLength={90} value={b.subtitle || ""} onChange={(e) => set("banners", patch(banners, i, { subtitle: e.target.value }))} /></div>
                  <div><span className={label}>Button text (optional)</span><input className={input} maxLength={24} placeholder="Shop Now" value={b.buttonText || ""} onChange={(e) => set("banners", patch(banners, i, { buttonText: e.target.value }))} /></div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Search + fallback headline ── */}
        <Card title="Search & built-in banner" hint="The search box hint, and the headline used when a mode has no banner image (an active Promo Strip heading takes priority).">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><span className={label}>Search box placeholder</span><input className={input} value={content.searchPlaceholder} onChange={(e) => set("searchPlaceholder", e.target.value)} /></div>
            <div><span className={label}>Built-in banner headline</span><input className={input} value={content.fallbackHeadline} onChange={(e) => set("fallbackHeadline", e.target.value)} /></div>
          </div>
        </Card>

        {/* ── Trust strip ── */}
        <Card title="Trust strip" hint="The row of small icons under the banner (3–5 items look best). Only list promises you actually offer." onAdd={() => set("trustItems", [...trustItems, { label: "", icon: "delivery", isActive: true }])} addLabel="Add item">
          {trustItems.length === 0 && <p className="text-sm text-neutral-500">No items — the strip is hidden.</p>}
          <div className="space-y-2">
            {trustItems.map((it: AdminTrustItem, i) => (
              <div key={it._id || `new-${i}`} className="flex flex-wrap items-end gap-3 border border-neutral-200 rounded-lg p-3">
                <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-800 [&>svg]:w-6 [&>svg]:h-6">{TRUST_ICON_SVGS[it.icon]}</div>
                <div className="flex-1 min-w-[160px]"><span className={label}>Label *</span><input className={input} maxLength={30} value={it.label} onChange={(e) => set("trustItems", patch(trustItems, i, { label: e.target.value }))} /></div>
                <div className="w-40">
                  <span className={label}>Icon</span>
                  <select className={input} value={it.icon} onChange={(e) => set("trustItems", patch(trustItems, i, { icon: e.target.value }))}>
                    {TRUST_ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[160px]"><span className={label}>Link (optional)</span><input className={input} placeholder="/return-policy" value={it.link || ""} onChange={(e) => set("trustItems", patch(trustItems, i, { link: e.target.value }))} /></div>
                <RowTools index={i} count={trustItems.length} active={it.isActive} onToggle={() => set("trustItems", patch(trustItems, i, { isActive: !it.isActive }))} onMove={(to) => set("trustItems", move(trustItems, i, to))} onRemove={() => set("trustItems", trustItems.filter((_, j) => j !== i))} />
              </div>
            ))}
          </div>
        </Card>

        {/* ── Offer cards ── */}
        <Card title="Offer cards" hint="The small cards under the trust strip (two side by side). Keep offers real — customers will expect them." onAdd={() => set("offerCards", [...offerCards, { title: "", text: "", icon: "tag", style: "blue", link: "/categories", mode: "All", isActive: true }])} addLabel="Add card">
          {offerCards.length === 0 && <p className="text-sm text-neutral-500">No cards — the row is hidden.</p>}
          <div className="space-y-3">
            {offerCards.map((c: AdminOfferCard, i) => {
              const st = OFFER_STYLES[c.style] || OFFER_STYLES.blue;
              return (
                <div key={c._id || `new-${i}`} className="border border-neutral-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2 border min-w-[220px]" style={{ background: st.bg, borderColor: st.border }}>
                      <span className="w-5 h-5 [&>svg]:w-full [&>svg]:h-full" style={{ color: st.icon }}>{OFFER_ICON_SVGS[c.icon]}</span>
                      <div className="leading-tight">
                        <p className="text-sm font-extrabold italic" style={{ color: st.title }}>{c.title || "Title"}</p>
                        <p className="text-xs text-neutral-700">{c.text || "Text"}</p>
                      </div>
                    </div>
                    <RowTools index={i} count={offerCards.length} active={c.isActive} onToggle={() => set("offerCards", patch(offerCards, i, { isActive: !c.isActive }))} onMove={(to) => set("offerCards", move(offerCards, i, to))} onRemove={() => set("offerCards", offerCards.filter((_, j) => j !== i))} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><span className={label}>Title *</span><input className={input} maxLength={40} value={c.title} onChange={(e) => set("offerCards", patch(offerCards, i, { title: e.target.value }))} /></div>
                    <div className="md:col-span-2"><span className={label}>Text</span><input className={input} maxLength={80} value={c.text} onChange={(e) => set("offerCards", patch(offerCards, i, { text: e.target.value }))} /></div>
                    <div>
                      <span className={label}>Icon</span>
                      <select className={input} value={c.icon} onChange={(e) => set("offerCards", patch(offerCards, i, { icon: e.target.value }))}>
                        {OFFER_ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className={label}>Colour</span>
                      <select className={input} value={c.style} onChange={(e) => set("offerCards", patch(offerCards, i, { style: e.target.value }))}>
                        {OFFER_STYLE_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className={label}>Show in</span>
                      <select className={input} value={c.mode} onChange={(e) => set("offerCards", patch(offerCards, i, { mode: e.target.value as any }))}>
                        {MODE_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-3"><span className={label}>Link when tapped</span><input className={input} value={c.link || ""} onChange={(e) => set("offerCards", patch(offerCards, i, { link: e.target.value }))} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── Product sections ── */}
        <Card title="Product sections" hint="Rows of product cards below 'Shop by Category'. A section with no matching products hides itself." onAdd={() => set("productSections", [...productSections, { title: "", subtitle: "", emoji: "", sort: "newest", limit: 12, tinted: false, isActive: true }])} addLabel="Add section">
          {productSections.length === 0 && <p className="text-sm text-neutral-500">No sections.</p>}
          <div className="space-y-3">
            {productSections.map((s: AdminProductSection, i) => (
              <div key={s._id || `new-${i}`} className="border border-neutral-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="text-sm font-semibold text-neutral-700">{s.emoji} {s.title || `Section ${i + 1}`}</span>
                  <RowTools index={i} count={productSections.length} active={s.isActive} onToggle={() => set("productSections", patch(productSections, i, { isActive: !s.isActive }))} onMove={(to) => set("productSections", move(productSections, i, to))} onRemove={() => set("productSections", productSections.filter((_, j) => j !== i))} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                  <div className="md:col-span-2"><span className={label}>Title *</span><input className={input} maxLength={40} value={s.title} onChange={(e) => set("productSections", patch(productSections, i, { title: e.target.value }))} /></div>
                  <div className="md:col-span-3"><span className={label}>Subtitle</span><input className={input} maxLength={80} value={s.subtitle || ""} onChange={(e) => set("productSections", patch(productSections, i, { subtitle: e.target.value }))} /></div>
                  <div><span className={label}>Emoji</span><input className={input} maxLength={8} value={s.emoji || ""} onChange={(e) => set("productSections", patch(productSections, i, { emoji: e.target.value }))} /></div>
                  <div className="md:col-span-3">
                    <span className={label}>Which products</span>
                    <select className={input} value={s.sort} onChange={(e) => set("productSections", patch(productSections, i, { sort: e.target.value as any }))}>
                      {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div><span className={label}>How many</span><input type="number" min={4} max={30} className={input} value={s.limit} onChange={(e) => set("productSections", patch(productSections, i, { limit: Math.min(30, Math.max(4, Number(e.target.value) || 12)) }))} /></div>
                  <label className="md:col-span-2 flex items-center gap-2 text-sm text-neutral-700 mt-5 cursor-pointer">
                    <input type="checkbox" checked={s.tinted} onChange={() => set("productSections", patch(productSections, i, { tinted: !s.tinted }))} /> Coloured background box
                  </label>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Shop by Category ── */}
        <Card title="Shop by Category" hint="The grid of category tiles (images come from each category).">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div><span className={label}>Title</span><input className={input} value={shopByCategory.title} onChange={(e) => set("shopByCategory", { ...shopByCategory, title: e.target.value })} /></div>
            <div><span className={label}>How many tiles</span><input type="number" min={4} max={30} className={input} value={shopByCategory.limit} onChange={(e) => set("shopByCategory", { ...shopByCategory, limit: Math.min(30, Math.max(4, Number(e.target.value) || 12)) })} /></div>
            <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer pb-2">
              <input type="checkbox" checked={shopByCategory.isActive} onChange={() => set("shopByCategory", { ...shopByCategory, isActive: !shopByCategory.isActive })} /> Show on home page
            </label>
          </div>
        </Card>

        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={saving} className="px-6 py-2.5 rounded-md bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
