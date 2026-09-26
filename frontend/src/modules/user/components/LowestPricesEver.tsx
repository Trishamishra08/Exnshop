import { useRef, useState, useEffect, useMemo, memo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getProducts } from '../../../services/api/customerProductService';
import LazyImage from '../../../components/LazyImage';

import { useCart } from '../../../context/CartContext';
import { Product } from '../../../types/domain';
import { useWishlist } from '../../../hooks/useWishlist';
import { calculateProductPrice } from '../../../utils/priceUtils';
import { useTranslation } from '../../../hooks/useTranslation';
import { useCommerceMode } from '../../../context/CommerceModeContext';

interface LowestPricesEverProps {
  activeTab?: string;
  products?: Product[]; // Admin-selected products from home data
}

// Helper function to truncate text to a maximum length
const truncateText = (text: string, maxLength: number = 60): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

// Product Card Component - Defined outside to prevent recreation on every render
const ProductCard = memo(({
  product,
  cartQuantity,
  onAddToCart,
  onUpdateQuantity
}: {
  product: Product;
  cartQuantity: number;
  onAddToCart: (product: Product, element?: HTMLElement | null) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
}) => {
  const navigate = useNavigate();
  const { isWishlisted, toggleWishlist } = useWishlist(product.id);

  // Get Price and MRP using utility
  const { displayPrice, mrp, hasDiscount } = calculateProductPrice(product);

  const inCartQty = cartQuantity;

  let productName = product.name || product.productName || '';
  productName = productName.replace(/\s*-\s*(Fresh|Quality|Assured|Premium|Best|Top|Hygienic|Carefully|Selected).*$/i, '').trim();
  const displayName = truncateText(productName, 60);

  return (
    <div
      className="flex-shrink-0 w-[148px] sm:w-[160px]"
      style={{ scrollSnapAlign: 'start' }}
    >
      <div
        onClick={() => navigate(`/product/${product.id}`)}
        className="bg-white rounded-2xl overflow-hidden flex flex-col relative h-full max-h-full cursor-pointer border border-neutral-100 shadow-xs hover:shadow-md transition-all"
      >
        {/* Product Image Area */}
        <div className="relative block">
          <div className="w-full aspect-square bg-neutral-50 flex items-center justify-center overflow-hidden relative">
            {product.imageUrl ? (
              <LazyImage
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-neutral-100 text-neutral-400 text-4xl font-bold">
                {(product.name || product.productName || '?').charAt(0).toUpperCase()}
              </div>
            )}

            {/* Heart Icon - Top Right */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleWishlist(e);
              }}
              className="absolute top-2 right-2 z-30 w-7 h-7 rounded-full bg-white/95 backdrop-blur-xs flex items-center justify-center hover:bg-white transition-colors shadow-xs"
              aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill={isWishlisted ? "#ef4444" : "none"}
                xmlns="http://www.w3.org/2000/svg"
                className={isWishlisted ? "text-red-500" : "text-neutral-500"}
              >
                <path
                  d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Product Details */}
        <div className="p-2.5 flex-1 flex flex-col min-h-0 bg-white">
          {/* Product Name */}
          <div className="mb-1">
            <h3 className="text-[13px] font-bold text-neutral-900 line-clamp-2 leading-snug min-h-[2.1rem]" title={productName}>
              {displayName}
            </h3>
          </div>

          {/* Price + Add button row */}
          <div className="mt-auto flex items-end justify-between gap-1">
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-black text-neutral-900">
                ₹{displayPrice.toLocaleString('en-IN')}
              </span>
              {hasDiscount && (
                <span className="text-[11px] text-neutral-400 line-through">
                  ₹{mrp.toLocaleString('en-IN')}
                </span>
              )}
            </div>

            {/* Blue circular add / stepper */}
            <AnimatePresence mode="wait">
              {inCartQty === 0 ? (
                <motion.button
                  key="add-button"
                  type="button"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAddToCart(product, e.currentTarget);
                  }}
                  className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary-dark active:scale-95 transition-colors flex-shrink-0"
                  aria-label="Add to cart"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </motion.button>
              ) : (
                <motion.div
                  key="stepper"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-0.5 bg-primary rounded-full px-1 py-0.5 shadow-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onUpdateQuantity(product.id, inCartQty - 1);
                    }}
                    className="w-6 h-6 flex items-center justify-center text-white font-bold hover:bg-primary-dark rounded-full transition-colors p-0 leading-none"
                    aria-label="Decrease quantity"
                  >
                    <span className="relative top-[-1px]">−</span>
                  </motion.button>
                  <motion.span
                    key={inCartQty}
                    initial={{ scale: 1.2, y: -2 }}
                    animate={{ scale: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                    className="text-white font-bold min-w-[1rem] text-center text-xs"
                  >
                    {inCartQty}
                  </motion.span>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onUpdateQuantity(product.id, inCartQty + 1);
                    }}
                    className="w-6 h-6 flex items-center justify-center font-bold rounded-full transition-colors p-0 leading-none text-white hover:bg-primary-dark"
                    aria-label="Increase quantity"
                  >
                    <span className="relative top-[-1px]">+</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.product.id === nextProps.product.id &&
    prevProps.cartQuantity === nextProps.cartQuantity
  );
});

ProductCard.displayName = 'ProductCard';

export default function LowestPricesEver({ activeTab = 'all', products: adminProducts }: LowestPricesEverProps) {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { cart } = useCart();
  const { mode } = useCommerceMode();

  // Memoize cart items lookup for performance
  const cartItemsMap = useMemo(() => {
    const map = new Map();
    cart.items.forEach(item => {
      if (item?.product) {
        const id = String(item.product.id || item.product._id);
        map.set(id, (map.get(id) || 0) + item.quantity);
      }
    });
    return map;
  }, [cart.items]);

  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    // Use admin-selected products if provided, otherwise fallback to fetching
    if (adminProducts && adminProducts.length > 0) {
      const mappedProducts = adminProducts.map((p: any) => {
        let productName = p.productName || p.name || '';
        productName = productName.replace(/\s*-\s*(Fresh|Quality|Assured|Premium|Best|Top|Hygienic|Carefully|Selected).*$/i, '').trim();

        let packValue = p.variations?.[0]?.title || p.pack || 'Standard';
        if (packValue && packValue.includes(' - ')) {
          packValue = packValue.split(' - ')[0].trim();
        }

        return {
          ...p,
          id: p._id || p.id || p.id,
          name: productName,
          imageUrl: p.mainImage || p.imageUrl || p.mainImage,
          mrp: p.mrp || p.price,
          pack: packValue
        };
      });
      setProducts(mappedProducts);
    } else {
      // Fallback: fetch products if admin hasn't configured any
      const fetchDiscountedProducts = async () => {
        try {
          const response = await getProducts({ limit: 50, mode: mode === 'ECommerce' ? 'ecommerce' : 'quick' });
          if (response.success && response.data) {
            const mappedProducts = (response.data as any[]).map(p => {
              let productName = p.productName || p.name || '';
              productName = productName.replace(/\s*-\s*(Fresh|Quality|Assured|Premium|Best|Top|Hygienic|Carefully|Selected).*$/i, '').trim();

              let packValue = p.variations?.[0]?.title || p.pack || 'Standard';
              if (packValue && packValue.includes(' - ')) {
                packValue = packValue.split(' - ')[0].trim();
              }

              return {
                ...p,
                id: p._id || p.id,
                name: productName,
                imageUrl: p.mainImage || p.imageUrl,
                mrp: p.mrp || p.price,
                pack: packValue
              };
            });
            setProducts(mappedProducts);
          }
        } catch (err) {
          console.error("Failed to fetch products for LowestPricesEver", err);
        }
      };
      fetchDiscountedProducts();
    }
  }, [adminProducts, mode]);

  // Get products for this section
  const getFilteredProducts = () => {
    if (adminProducts && adminProducts.length > 0) {
      return products.slice(0, 20);
    }

    let filtered = products;

    if (activeTab !== 'all') {
      if (activeTab === 'grocery') {
        filtered = products.filter((p) =>
          ['snacks', 'atta-rice', 'dairy-breakfast', 'masala-oil', 'biscuits-bakery', 'cold-drinks', 'fruits-veg'].includes(p.categoryId)
        );
      } else {
        filtered = products.filter((p) => p.categoryId === activeTab);
      }
    }

    return filtered
      .filter((product) => {
        if (!product.mrp) return false;
        const discount = Math.round(((product.mrp - product.price) / product.mrp) * 100);
        return discount > 0;
      })
      .slice(0, 10);
  };

  const discountedProducts = getFilteredProducts();

  const { addToCart, updateQuantity } = useCart();

  const handleAddToCart = useCallback((product: Product, element?: HTMLElement | null) => {
    addToCart(product, element);
  }, [addToCart]);

  const handleUpdateQuantity = useCallback((productId: string, quantity: number) => {
    updateQuantity(productId, quantity);
  }, [updateQuantity]);

  if (discountedProducts.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#f7fbff] pt-4 pb-2" data-section="lowest-prices">
      {/* Section Header */}
      <div className="px-4 md:px-6 flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-1.5 text-lg md:text-xl font-black text-neutral-900 tracking-tight">
          <span aria-hidden="true">👑</span>
          {t("home.lowestPricesEver", "Lowest Prices Ever")}
        </h2>
        <Link
          to="/categories"
          className="flex items-center gap-1 text-primary font-bold text-sm hover:underline"
        >
          {t("common.viewAll", "View All")}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      {/* Horizontal Scrollable Product Cards */}
      <div
        ref={scrollContainerRef}
        className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4 md:px-6 pb-1"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {discountedProducts.map((product) => {
          const cartQuantity = cartItemsMap.get(product.id) || 0;
          return (
            <ProductCard
              key={product.id}
              product={product}
              cartQuantity={cartQuantity}
              onAddToCart={handleAddToCart}
              onUpdateQuantity={handleUpdateQuantity}
            />
          );
        })}
      </div>
    </div>
  );
}
