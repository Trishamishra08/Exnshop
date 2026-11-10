import { memo, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../../../../context/CartContext";
import { useWishlist } from "../../../../hooks/useWishlist";
import { useTranslation } from "../../../../hooks/useTranslation";
import { calculateProductPrice } from "../../../../utils/priceUtils";
import type { HomeTheme } from "./homeTheme";

/**
 * Compact "Crazy Deals" product card (4 across on a phone, like the mockup):
 * discount badge, wishlist heart, rating, name, price + MRP, Add to Cart.
 * Uses the same cart / wishlist / price helpers as ProductCard — only the look differs.
 */
function DealCard({ product, theme }: { product: any; theme: HomeTheme }) {
  const navigate = useNavigate();
  const { getTranslatedField, t } = useTranslation();
  const { cart, addToCart, updateQuantity } = useCart();
  const btnRef = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);

  const productId = String(product.id || product._id);
  const { isWishlisted, toggleWishlist } = useWishlist(productId);
  const { displayPrice, mrp, discount } = useMemo(() => calculateProductPrice(product), [product]);
  const name = getTranslatedField(product, "name") || getTranslatedField(product, "productName") || product.name || product.productName || "";
  const image = product.imageUrl || product.mainImage || product.image || product.galleryImages?.[0];
  const rating = Number(product.rating || 0);
  const reviews = Number(product.reviewsCount ?? product.reviews ?? 0);

  const qty = useMemo(() => {
    const item = cart.items.find((i: any) => i?.product && String(i.product.id || i.product._id) === productId);
    return item?.quantity || 0;
  }, [cart.items, productId]);

  const run = useCallback(async (fn: () => Promise<any>) => {
    if (pending.current) return;
    pending.current = true;
    try {
      await fn();
    } finally {
      pending.current = false;
    }
  }, []);

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const fmtCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(n));

  return (
    <div
      onClick={() => {
        if (product.isSponsored) {
          // Same fire-and-forget ad-click tracking as ProductCard
          import("../../../../services/api/config").then(({ default: api }) => {
            api.post(`/products/${productId}/ad-click`).catch(() => {});
          });
        }
        navigate(`/product/${productId}`);
      }}
      className="bg-white rounded-xl border border-neutral-100 shadow-[0_1px_6px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col cursor-pointer h-full"
    >
      <div className="relative aspect-square" style={{ background: theme.tint }}>
        {image ? (
          <img src={image} alt={name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-2xl">🛍️</div>
        )}
        {discount > 0 && (
          <span
            className="absolute top-1 left-1 text-white text-[8px] sm:text-[10px] font-bold px-1 py-px rounded"
            style={{ background: theme.brand }}
          >
            {discount}% OFF
          </span>
        )}
        <button
          type="button"
          aria-label={isWishlisted ? t("common.removeFromWishlist", "Remove from wishlist") : t("common.addToWishlist", "Add to wishlist")}
          onClick={(e) => {
            stop(e);
            toggleWishlist(e);
          }}
          className="absolute top-1 right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white shadow flex items-center justify-center"
        >
          <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" viewBox="0 0 24 24" fill={isWishlisted ? theme.brand : "none"} stroke={isWishlisted ? theme.brand : "#1f2937"} strokeWidth="2.2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      <div className="px-1.5 pt-1 pb-1.5 sm:p-2 flex flex-col flex-1">
        {(rating > 0 || reviews > 0) && (
          <div className="flex items-center gap-0.5 text-[8.5px] sm:text-[11px] text-neutral-500 leading-none">
            <span className="text-amber-400">★</span>
            <span className="font-semibold text-neutral-800">{rating.toFixed(1)}</span>
            {reviews > 0 && <span>({fmtCount(reviews)})</span>}
          </div>
        )}
        <p className="text-[9.5px] min-[400px]:text-[10.5px] sm:text-[13px] font-semibold text-neutral-900 leading-tight tracking-tight line-clamp-1 mt-0.5">{name}</p>
        <div className="flex items-baseline gap-1 mt-0.5 flex-wrap">
          <span className="text-[11px] min-[400px]:text-[12.5px] sm:text-base font-bold text-neutral-900 leading-none">{fmt(displayPrice)}</span>
          {mrp && mrp > displayPrice && <span className="text-[8px] min-[400px]:text-[9px] sm:text-[11px] text-neutral-400 line-through leading-none">{fmt(mrp)}</span>}
        </div>

        <div className="mt-auto pt-1.5">
          {qty > 0 ? (
            <div
              onClick={stop}
              className="flex items-center justify-between rounded-full h-6 sm:h-8 px-0.5 text-white text-[11px] sm:text-sm"
              style={{ background: theme.brand }}
            >
              <button type="button" className="w-5 h-5 font-bold" onClick={(e) => { stop(e); run(() => updateQuantity(productId, qty - 1)); }}>−</button>
              <span className="font-bold">{qty}</span>
              <button type="button" className="w-5 h-5 font-bold" onClick={(e) => { stop(e); run(() => updateQuantity(productId, qty + 1)); }}>+</button>
            </div>
          ) : (
            <button
              ref={btnRef}
              type="button"
              onClick={(e) => {
                stop(e);
                run(() => addToCart(product, btnRef.current));
              }}
              className="w-full h-6 sm:h-8 rounded-full flex items-center justify-center gap-0.5 sm:gap-1.5 text-[8.5px] min-[400px]:text-[9.5px] sm:text-[13px] font-semibold border whitespace-nowrap"
              style={{ color: theme.brand, borderColor: theme.tintBorder, background: theme.tint }}
            >
              <svg className="w-2.5 h-2.5 sm:w-4 sm:h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              {t("common.addToCart", "Add to Cart")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(DealCard);
