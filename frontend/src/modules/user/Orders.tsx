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

  console.log('📋 Orders component - orders:', orders);
  console.log('📋 Orders count:', orders.length);

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
          return (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              className="block bg-white rounded-xl border border-neutral-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-neutral-900 mb-1 truncate">
                    {t("common.order", "Order")} #{(order as any).orderNumber || shortId}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs text-neutral-500 whitespace-nowrap">{formatDate(order.createdAt)}</span>
                    {/* Both channels share this list; the tag tells a courier order from a rider-delivered one. */}
                    {(order as any).channel === "ECommerce" ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 whitespace-nowrap">E-commerce</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700 whitespace-nowrap">Quick</span>
                    )}
                  </div>
                </div>
                <span
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full border text-xs font-semibold ${customerOrderStatus(order.status).pill}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${customerOrderStatus(order.status).dot}`} />
                  {customerOrderStatus(order.status).label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-600">
                  {order.totalItems} {order.totalItems === 1 ? t("common.item", "item") : t("common.items", "items")}
                </div>
                <div className="text-lg font-bold text-neutral-900">
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
