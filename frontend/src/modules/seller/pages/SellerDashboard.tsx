import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardCard from '../components/DashboardCard';
import OrderChart from '../components/OrderChart';
import AlertCard from '../components/AlertCard';
import { getSellerDashboardStats, DashboardStats, NewOrder } from '../../../services/api/dashboardService';
import { getSellerProfile, toggleShopStatus } from '../../../services/api/auth/sellerAuthService';
import { useToast } from '../../../context/ToastContext';
import { useLanguage } from '../../../context/LanguageContext';

export default function SellerDashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [newOrders, setNewOrders] = useState<NewOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [isShopOpen, setIsShopOpen] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [statsResponse, profileResponse] = await Promise.all([
          getSellerDashboardStats(),
          getSellerProfile()
        ]);

        if (statsResponse.success) {
          setStats(statsResponse.data.stats);
          setNewOrders(statsResponse.data.newOrders);
        } else {
          setError(statsResponse.message || 'Failed to fetch dashboard data');
        }

        if (profileResponse.success) {
          const shopStatus = profileResponse.data.isShopOpen ?? true;
          setIsShopOpen(shopStatus);
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Error loading dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const handleToggleShop = async () => {
    try {
      setStatusLoading(true);
      const response = await toggleShopStatus();

      if (response.success) {
        setIsShopOpen(response.data.isShopOpen);
        showToast(`Shop is now ${response.data.isShopOpen ? 'Open' : 'Closed'}`, 'success');
      } else {
        showToast('Failed to toggle shop status: ' + (response.message || 'Unknown error'), 'error');
      }
    } catch (error: any) {
      showToast('Error toggling shop status: ' + (error.response?.data?.message || error.message || 'Unknown error'), 'error');
    } finally {
      setStatusLoading(false);
    }
  };


  const getStatusBadgeClass = (status: NewOrder['status']) => {
    switch (status) {
      case 'Out For Delivery':
        return 'text-blue-800 bg-blue-100 border border-blue-400';
      case 'Received':
        return 'text-blue-600 bg-blue-50';
      case 'Payment Pending':
        return 'text-orange-600 bg-orange-50';
      case 'Cancelled':
        return 'text-red-600 bg-pink-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatCurrency = (value: number) => `₹${(value || 0).toLocaleString('en-IN')}`;

  const totalPages = Math.ceil(newOrders.length / entriesPerPage);
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = startIndex + entriesPerPage;
  const displayedOrders = newOrders.slice(startIndex, endIndex);

  // Icons for KPI cards
  const userIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );

  const categoryIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 6H21M8 12H21M8 18H21M3 6H3.01M3 12H3.01M3 18H3.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const subcategoryIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 6H21M8 12H21M8 18H21M3 6H3.01M3 12H3.01M3 18H3.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const productIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20 7H4C2.89543 7 2 7.89543 2 9V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V9C22 7.89543 21.1046 7 20 7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 21V5C16 4.46957 15.7893 3.96086 15.4142 3.58579C15.0391 3.21071 14.5304 3 14 3H10C9.46957 3 8.96086 3.21071 8.58579 3.58579C8.21071 3.96086 8 4.46957 8 5V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const ordersIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const completedOrdersIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 7H18C19.1046 7 20 7.89543 20 9V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V9C4 7.89543 4.89543 7 6 7H8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const pendingOrdersIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const cancelledOrdersIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 7L8 15M8 7L16 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 7H18C19.1046 7 20 7.89543 20 9V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V9C4 7.89543 4.89543 7 6 7H8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const processingOrdersIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3V6M12 18V21M4.2 4.2L6.3 6.3M17.7 17.7L19.8 19.8M3 12H6M18 12H21M4.2 19.8L6.3 17.7M17.7 6.3L19.8 4.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );

  const shippedOrdersIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 7L12 3L21 7M3 7L12 11M3 7V17L12 21M21 7L12 11M21 7V17L12 21M12 11V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const returnOrdersIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 14L4 9L9 4M4 9H14C17.3137 9 20 11.6863 20 15C20 18.3137 17.3137 21 14 21H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const salesIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 3V19C3 20.1046 3.89543 21 5 21H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 15L11 11L14 14L20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const settlementIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M2 10H22" stroke="currentColor" strokeWidth="2" />
      <path d="M6 15H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const balanceIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 9V7a4 4 0 0 0-8 0v2M5 9h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="14" r="1.5" fill="currentColor" />
    </svg>
  );

  // Alert icons
  const soldOutIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20 7H4C2.89543 7 2 7.89543 2 9V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V9C22 7.89543 21.1046 7 20 7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 21V5C16 4.46957 15.7893 3.96086 15.4142 3.58579C15.0391 3.21071 14.5304 3 14 3H10C9.46957 3 8.96086 3.21071 8.58579 3.58579C8.21071 3.96086 8 4.46957 8 5V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 12H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const lowStockIcon = (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20 7H4C2.89543 7 2 7.89543 2 9V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V9C22 7.89543 21.1046 7 20 7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 21V5C16 4.46957 15.7893 3.96086 15.4142 3.58579C15.0391 3.21071 14.5304 3 14 3H10C9.46957 3 8.96086 3.21071 8.58579 3.58579C8.21071 3.96086 8 4.46957 8 5V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 9V15M9 12H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-8 text-center text-red-500 bg-white rounded-lg shadow-sm border border-neutral-200">
        {error || 'Stats not available'}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with Shop Status Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-lg shadow-sm border border-neutral-200 gap-4 sm:gap-0">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{t("seller.dashboard", "Dashboard")}</h1>
          <p className="text-sm text-gray-500">{t("seller.overview", "Overview of your store performance")}</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <span className={`text-sm font-medium ${isShopOpen ? 'text-green-600' : 'text-red-500'}`}>
            {isShopOpen ? t("seller.shopIsLive", "Shop is Live") : t("seller.shopIsClosed", "Shop is Closed")}
          </span>
          <button
            onClick={handleToggleShop}
            disabled={statusLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
              isShopOpen ? 'bg-teal-600' : 'bg-gray-200'
            } ${statusLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`${
                isShopOpen ? 'translate-x-6' : 'translate-x-1'
              } inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out`}
            />
          </button>
        </div>
      </div>
      {/* Revenue & Settlement Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <DashboardCard
          icon={salesIcon}
          title={t("seller.totalSales", "Total Sales")}
          value={formatCurrency(stats.totalSales)}
          subtitle={`${formatCurrency(stats.monthSales)} this month`}
          accentColor="#16a34a"
          to="/seller/orders?status=Delivered"
        />
        <DashboardCard
          icon={settlementIcon}
          title={t("seller.pendingSettlement", "Pending Settlement")}
          value={formatCurrency(stats.pendingSettlement)}
          subtitle={stats.nextSettlementDate ? `Next: ${new Date(stats.nextSettlementDate).toLocaleDateString('en-GB')}` : 'No settlement due'}
          accentColor="#eab308"
          to="/seller/wallet"
        />
        <DashboardCard
          icon={balanceIcon}
          title={t("seller.availableBalance", "Available Balance")}
          value={formatCurrency(stats.availableBalance)}
          subtitle={`${formatCurrency(stats.totalSettlementPaid)} settled to date`}
          accentColor="#3b82f6"
          to="/seller/wallet"
        />
        <DashboardCard
          icon={salesIcon}
          title={t("seller.todaySales", "Today's Sales")}
          value={formatCurrency(stats.todaySales)}
          subtitle={`${formatCurrency(stats.weekSales)} this week`}
          accentColor="#0d9488"
          to="/seller/orders?status=Delivered"
        />
      </div>

      {/* Order Status Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 sm:gap-3">
        <DashboardCard compact icon={ordersIcon} title={t("seller.totalOrders", "Total Orders")} value={stats.totalOrders} accentColor="#3b82f6" to="/seller/orders" />
        <DashboardCard compact icon={pendingOrdersIcon} title={t("seller.pendingOrders", "Pending")} value={stats.pendingOrders} accentColor="#a855f7" to="/seller/orders?status=Received" />
        <DashboardCard compact icon={processingOrdersIcon} title={t("seller.processingOrders", "Processing")} value={stats.processingOrders} accentColor="#f97316" to="/seller/orders?status=Processed" />
        <DashboardCard compact icon={shippedOrdersIcon} title={t("seller.shippedOrders", "Shipped")} value={stats.shippedOrders} accentColor="#6366f1" to="/seller/orders?status=Shipped" />
        <DashboardCard compact icon={completedOrdersIcon} title={t("seller.completedOrders", "Delivered")} value={stats.completedOrders} accentColor="#16a34a" to="/seller/orders?status=Delivered" />
        <DashboardCard compact icon={cancelledOrdersIcon} title={t("seller.cancelledOrders", "Cancelled")} value={stats.cancelledOrders} accentColor="#ef4444" to="/seller/orders?status=Cancelled" />
        <DashboardCard compact icon={returnOrdersIcon} title={t("seller.returnOrders", "Return/RTO")} value={stats.returnOrders} accentColor="#dc2626" to="/seller/orders?status=Returned" />
      </div>

      {/* Catalog Snapshot */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <DashboardCard compact icon={userIcon} title={t("seller.totalCustomers", "Customers")} value={stats.totalUser} accentColor="#3b82f6" to="/seller/orders" />
        <DashboardCard compact icon={categoryIcon} title={t("seller.sellingCategories", "Categories")} value={stats.sellingCategories ?? stats.totalCategory} accentColor="#eab308" to="/seller/category" />
        <DashboardCard compact icon={subcategoryIcon} title={t("seller.totalSubcategory", "Subcategories")} value={stats.totalSubcategory} accentColor="#ec4899" to="/seller/subcategory" />
        <DashboardCard compact icon={productIcon} title={t("seller.totalProduct", "Products")} value={stats.totalProduct} accentColor="#f97316" to="/seller/product/list" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <OrderChart
          title={t("seller.salesGraph", "Sales")}
          dailyData={stats.dailySalesData}
          yearlyData={stats.yearlySalesData}
          valuePrefix="₹"
          color="#0d9488"
          height={260}
        />
        <OrderChart
          title={t("seller.orderGraph", "Orders")}
          dailyData={stats.dailyOrderData}
          yearlyData={stats.yearlyOrderData}
          color="#3b82f6"
          height={260}
        />
      </div>

      {/* Alerts Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AlertCard
          icon={soldOutIcon}
          title={t("seller.productSoldOut", "Product Sold Out")}
          value={stats.soldOutProducts}
          accentColor="#ec4899"
          to="/seller/product/stock?stock=out_of_stock"
        />
        <AlertCard
          icon={lowStockIcon}
          title={t("seller.productLowStock", "Product low on Stock")}
          value={stats.lowStockProducts}
          accentColor="#eab308"
          to="/seller/product/stock?stock=low_stock"
        />
      </div>

      {/* View New Orders Table Section */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
        {/* Teal Header Bar */}
        <div className="bg-teal-600 text-white px-4 sm:px-6 py-3">
          <h2 className="text-base sm:text-lg font-semibold">{t("seller.viewNewOrders", "View New Orders")}</h2>
        </div>

        {/* Show Entries Control */}
        <div className="px-4 sm:px-6 py-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-700">Show</span>
            <input
              type="number"
              value={entriesPerPage}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 10;
                setEntriesPerPage(Math.max(1, Math.min(100, value)));
                setCurrentPage(1);
              }}
              className="w-16 px-2 py-1 border border-neutral-300 rounded text-sm text-neutral-900 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
              min="1"
              max="100"
            />
            <span className="text-sm text-neutral-700">entries</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    O. Date
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-neutral-400 cursor-pointer"
                    >
                      <path
                        d="M7 10L12 5L17 10M7 14L12 19L17 14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    Status
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-neutral-400 cursor-pointer"
                    >
                      <path
                        d="M7 10L12 5L17 10M7 14L12 19L17 14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    Amount
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-neutral-400 cursor-pointer"
                    >
                      <path
                        d="M7 10L12 5L17 10M7 14L12 19L17 14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    Action
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-neutral-400 cursor-pointer"
                    >
                      <path
                        d="M7 10L12 5L17 10M7 14L12 19L17 14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neutral-200">
              {displayedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-neutral-50">
                  <td className="px-4 sm:px-6 py-3 text-sm text-neutral-900">{order.id}</td>
                  <td className="px-4 sm:px-6 py-3 text-sm text-neutral-600">{order.orderDate}</td>
                  <td className="px-4 sm:px-6 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-3 text-sm text-neutral-900">₹ {order.amount}</td>
                  <td className="px-4 sm:px-6 py-3">
                    <button
                      onClick={() => navigate(`/seller/orders/${order.id}`)}
                      className="bg-teal-600 hover:bg-teal-700 text-white p-2 rounded transition-colors"
                      aria-label="View order details"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle
                          cx="11"
                          cy="11"
                          r="8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M21 21L16.65 16.65"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <div className="text-xs sm:text-sm text-neutral-700">
            Showing {startIndex + 1} to {Math.min(endIndex, newOrders.length)} of {newOrders.length} entries
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className={`p-2 border border-neutral-300 rounded ${currentPage === 1
                ? 'text-neutral-400 cursor-not-allowed bg-neutral-50'
                : 'text-neutral-700 hover:bg-neutral-50'
                }`}
              aria-label="Previous page"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M15 18L9 12L15 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className={`p-2 border border-neutral-300 rounded ${currentPage === totalPages
                ? 'text-neutral-400 cursor-not-allowed bg-neutral-50'
                : 'text-neutral-700 hover:bg-neutral-50'
                }`}
              aria-label="Next page"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M9 18L15 12L9 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

