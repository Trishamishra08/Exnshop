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
    <div className="pb-24 sm:pb-6">
      {/* Welcome Banner */}
      <div className="relative bg-gradient-to-br from-[#f1faf5] to-[#e4f6eb] rounded-[20px] p-5 sm:p-6 overflow-hidden mb-6 flex flex-col justify-center min-h-[140px] shadow-sm">
        {/* Decorative Image Placeholder (Right side) */}
        <div className="absolute top-0 right-0 h-full w-[45%] opacity-90 pointer-events-none flex items-end justify-end">
          {/* We use a generic vector representation of the box as placeholder if real img is missing, but for now just abstract shapes */}
          <div className="absolute right-0 bottom-0 w-32 h-32 bg-green-200/40 rounded-tl-full blur-xl"></div>
          <div className="absolute right-4 top-4 w-12 h-12 bg-green-300/30 rounded-full blur-lg"></div>
        </div>
        
        <div className="relative z-10 w-[65%] sm:w-[70%]">
          <h1 className="text-[22px] sm:text-2xl font-extrabold text-[#0d163a] mb-1.5 leading-tight tracking-tight">
            Welcome Back,
          </h1>
          <p className="text-[13px] sm:text-sm text-gray-500 mb-3.5 leading-snug font-medium">
            Manage your store, track orders<br />and grow your business.
          </p>
          
          <button
            onClick={handleToggleShop}
            disabled={statusLoading}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-sm transition-colors ${
              isShopOpen ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#fee2e2] text-[#b91c1c]'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isShopOpen ? 'bg-[#15803d]' : 'bg-[#b91c1c]'}`}></span>
            {isShopOpen ? 'Shop is Live' : 'Shop is Closed'}
          </button>
        </div>
        
        <button className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm text-gray-600 hover:bg-gray-50 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {/* Overview Header */}
      <div className="flex items-center justify-between mb-4 mt-2">
        <h2 className="text-[20px] font-extrabold text-[#0d163a] tracking-tight">Overview</h2>
        <div className="relative">
          <select className="appearance-none bg-white border border-gray-200 text-gray-600 text-xs rounded-lg pl-8 pr-7 py-1.5 outline-none font-semibold cursor-pointer hover:bg-gray-50 transition-colors">
            <option>This Month</option>
            <option>Today</option>
            <option>This Year</option>
          </select>
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </div>
      </div>

      {/* 4 Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8">
        {/* Total Sales */}
        <div className="bg-[#f5fdf9] border border-[#e8f6f0] rounded-[16px] p-3.5 sm:p-4 relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/seller/orders?status=Delivered')}>
          <div className="flex flex-col h-full relative z-10">
            <div className="w-10 h-10 rounded-[10px] bg-[#dcfce7] flex items-center justify-center text-[#16a34a] mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
            </div>
            <p className="text-[13px] text-gray-500 font-medium mb-0.5">Total Sales</p>
            <h3 className="text-xl sm:text-2xl font-extrabold text-[#0d163a] mb-1.5">{formatCurrency(stats.totalSales)}</h3>
            <p className="text-[10px] sm:text-xs text-gray-400 font-medium flex items-center gap-1">
              <span className="text-[#16a34a] font-bold flex items-center gap-0.5"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg> 0%</span> vs last month
            </p>
          </div>
          <svg className="absolute top-4 right-3.5 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>

        {/* Pending Settlement */}
        <div className="bg-[#fffcf7] border border-[#fef3e2] rounded-[16px] p-3.5 sm:p-4 relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/seller/wallet')}>
          <div className="flex flex-col h-full relative z-10">
            <div className="w-10 h-10 rounded-[10px] bg-[#fef08a]/60 flex items-center justify-center text-[#d97706] mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><path d="M6 14h.01"/></svg>
            </div>
            <p className="text-[13px] text-gray-500 font-medium mb-0.5">Pending Settlement</p>
            <h3 className="text-xl sm:text-2xl font-extrabold text-[#0d163a] mb-1.5">{formatCurrency(stats.pendingSettlement)}</h3>
            <p className="text-[10px] sm:text-xs text-gray-400 font-medium">No settlement due</p>
          </div>
          <svg className="absolute top-4 right-3.5 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        
        {/* Total Orders */}
        <div className="bg-[#f5f8ff] border border-[#e8f0fe] rounded-[16px] p-3.5 sm:p-4 relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/seller/orders')}>
          <div className="flex flex-col h-full relative z-10">
            <div className="w-10 h-10 rounded-[10px] bg-[#dbeafe] flex items-center justify-center text-[#2563eb] mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            </div>
            <p className="text-[13px] text-gray-500 font-medium mb-0.5">Total Orders</p>
            <h3 className="text-xl sm:text-2xl font-extrabold text-[#0d163a] mb-1.5">{stats.totalOrders}</h3>
          </div>
          <svg className="absolute top-4 right-3.5 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        
        {/* Pending Orders */}
        <div className="bg-[#fdf7ff] border border-[#faefff] rounded-[16px] p-3.5 sm:p-4 relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/seller/orders?status=Received')}>
          <div className="flex flex-col h-full relative z-10">
            <div className="w-10 h-10 rounded-[10px] bg-[#f3e8ff] flex items-center justify-center text-[#9333ea] mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <p className="text-[13px] text-gray-500 font-medium mb-0.5">Pending Orders</p>
            <h3 className="text-xl sm:text-2xl font-extrabold text-[#0d163a] mb-1.5">{stats.pendingOrders}</h3>
          </div>
          <svg className="absolute top-4 right-3.5 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[20px] font-extrabold text-[#0d163a] tracking-tight">Recent Orders</h2>
        <button onClick={() => navigate('/seller/orders')} className="text-[#2563eb] text-[13px] font-bold flex items-center gap-0.5 hover:underline">
          View All <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <div className="space-y-3">
        {newOrders.slice(0, 5).map(order => (
          <div key={order.id} className="bg-white rounded-[16px] p-3 flex items-center justify-between border border-neutral-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/seller/orders/${order.id}`)}>
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 bg-[#f8fafc] rounded-xl border border-neutral-100 overflow-hidden flex-shrink-0 p-1">
                <img src={order.items?.[0]?.product?.images?.[0] || 'https://via.placeholder.com/100'} alt="Order item" className="w-full h-full object-cover rounded-lg" />
              </div>
              <div className="flex flex-col justify-center">
                <h4 className="font-extrabold text-[#0d163a] text-[15px] mb-1 tracking-tight">#{order.id.slice(-7).toUpperCase()}</h4>
                {order.status === 'Delivered' ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#15803d] bg-[#dcfce7] px-2 py-0.5 rounded-full w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#15803d]"></span> Delivered
                  </span>
                ) : order.status === 'Processing' || order.status === 'Processed' || order.status === 'Received' ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#d97706] bg-[#fef3c7] px-2 py-0.5 rounded-full w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d97706]"></span> Processing
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span> {order.status}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right flex items-center gap-3">
              <div className="flex flex-col justify-center items-end">
                <div className="font-extrabold text-[#0d163a] text-[15px] leading-tight mb-1">₹{order.amount}</div>
                <div className="text-[11px] text-gray-400 font-medium">
                  {new Date(order.orderDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <svg className="w-4 h-4 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </div>
        ))}
        {newOrders.length === 0 && (
          <div className="text-center text-gray-500 py-8 text-sm font-medium bg-gray-50 rounded-xl border border-dashed border-gray-200">
            No recent orders found
          </div>
        )}
      </div>
      
      {/* Hidden legacy sections for desktop or future expansion - but keeping mobile view exactly like image */}
      <div className="hidden">
        {/* Render other grids invisibly just in case logic relies on them, though mostly safe to remove */}
      </div>
    </div>
  );
}

