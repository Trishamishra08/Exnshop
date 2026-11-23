import { Link } from 'react-router-dom';
import { useOrders } from '../../hooks/useOrders';
import { useTranslation } from '../../hooks/useTranslation';
import { customerOrderStatus } from '../../utils/orderStatus';

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function Orders() {
  const { orders } = useOrders();
  const { t } = useTranslation();

  if (orders.length === 0) {
    return (
      <div className="px-4 md:px-6 lg:px-8 py-12 md:py-16 text-center">
        <div className="text-6xl md:text-8xl mb-4">📦</div>
        <h2 className="text-xl md:text-2xl font-bold text-neutral-900 mb-2">{t("customer.noOrdersYet", "No orders yet")}</h2>
        <p className="text-neutral-600 mb-6 md:mb-8 md:text-lg">{t("customer.startShoppingPrompt", "Start shopping to see your orders here!")}</p>
        <Link
          to="/"
          className="inline-block bg-green-600 text-white px-6 md:px-8 py-3 md:py-4 rounded-lg font-semibold hover:bg-green-700 transition-colors md:text-lg"
        >
          {t("customer.startShopping", "Start Shopping")}
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-24 md:pb-8">
      <div className="px-4 md:px-6 lg:px-8 py-4 md:py-6 bg-white border-b border-neutral-200 mb-4 md:mb-6 sticky top-0 z-10">
        <h1 className="text-xl md:text-2xl font-bold text-neutral-900">{t("customer.myOrders", "My Orders")}</h1>
      </div>

      <div className="px-4 md:px-6 lg:px-8 space-y-4 md:space-y-6">
        {orders.map((order) => {
          const shortId = order.id.split('-').slice(-1)[0];
          // The products' photos and names, so an order can be recognised at a glance
          // (by the picture) without reading the order number.
          const items = ((order as any).items || []) as any[];
          const products = items.map((it) => ({
            name: it?.product?.productName || it?.productName || it?.name || '',
            image: it?.product?.mainImage || it?.productImage || it?.imageUrl || '',
          }));
          const first = products[0];
          const extra = Math.max(0, (order.totalItems || products.length) - 1);
          const status = customerOrderStatus(order.status);
          return (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              className="block bg-white rounded-xl border border-neutral-200 p-3 sm:p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex gap-3">
                {/* Product photo (first item); "+N" when the order has more */}
                <div className="relative flex-shrink-0 w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-lg bg-neutral-100 border border-neutral-200 overflow-hidden">
                  {first?.image ? (
                    <img src={first.image} alt={first.name || 'Product'} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl" aria-hidden="true">📦</div>
                  )}
                  {extra > 0 && (
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[11px] font-bold leading-none">
                      +{extra}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug">
                      {first?.name || `${t("common.order", "Order")} #${(order as any).orderNumber || shortId}`}
                      {first?.name && extra > 0 && (
                        <span className="font-normal text-neutral-500"> + {extra} {extra === 1 ? t("common.more_item", "more item") : t("common.more_items", "more items")}</span>
                      )}
                    </p>
                    <span
                      className={`flex-shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-0.5 rounded-full border text-[11px] font-semibold ${status.pill}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs text-neutral-500 whitespace-nowrap">{formatDate(order.createdAt)}</span>
                    {/* Both channels share this list; the tag tells a courier order from a rider-delivered one. */}
                    {(order as any).channel === "ECommerce" ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 whitespace-nowrap">E-commerce</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 whitespace-nowrap">Quick</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Other items' photos (when there's more than one) */}
              {products.length > 1 && (
                <div className="mt-2.5 flex items-center gap-1.5 overflow-hidden">
                  {products.slice(1, 6).map((p, i) => (
                    <div key={i} className="w-10 h-10 flex-shrink-0 rounded-md bg-neutral-100 border border-neutral-200 overflow-hidden">
                      {p.image ? (
                        <img src={p.image} alt={p.name || 'Product'} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-base" aria-hidden="true">📦</div>
                      )}
                    </div>
                  ))}
                  {products.length > 6 && (
                    <span className="text-xs font-semibold text-neutral-500">+{products.length - 6}</span>
                  )}
                </div>
              )}

              <div className="mt-2.5 pt-2.5 border-t border-neutral-100 flex items-center justify-between gap-2">
                <div className="min-w-0 text-xs text-neutral-500 truncate">
                  {t("common.order", "Order")} #{(order as any).orderNumber || shortId} · {order.totalItems} {order.totalItems === 1 ? t("common.item", "item") : t("common.items", "items")}
                </div>
                <div className="flex-shrink-0 text-lg font-bold text-neutral-900">
                  ₹{order.totalAmount.toFixed(0)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
