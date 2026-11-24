import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import exnshopLogo from '@assets/exnshop_logo.png';
import LanguageSelector from '../../../components/LanguageSelector';
import { getNotifications, markAsRead, type Notification as AdminNotificationItem } from '../../../services/api/admin/adminNotificationService';

interface AdminHeaderProps {
  onMenuClick: () => void;
  isSidebarOpen: boolean;
}

export default function AdminHeader({ onMenuClick, isSidebarOpen }: AdminHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const { t } = useLanguage();
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // This admin's own notifications (new seller/delivery signups, approvals needed, …)
  const adminId = String((user as any)?.id || (user as any)?._id || '');
  const [recent, setRecent] = useState<AdminNotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const loadNotifications = async () => {
    if (!adminId) return;
    try {
      const [list, unreadRes] = await Promise.all([
        getNotifications({ recipientType: 'Admin', recipientId: adminId, limit: 6 }),
        getNotifications({ recipientType: 'Admin', recipientId: adminId, isRead: false, limit: 1 }),
      ]);
      if (list.success) setRecent((list.data || []) as AdminNotificationItem[]);
      if (unreadRes.success) setUnread(Number((unreadRes as any).pagination?.total ?? (unreadRes.data || []).length) || 0);
    } catch {
      /* keep the last list */
    }
  };
  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminId]);
  const openNotification = async (n: AdminNotificationItem) => {
    setShowNotificationsDropdown(false);
    if (!n.isRead) {
      markAsRead(n._id).then(loadNotifications).catch(() => {});
    }
    navigate(n.link && n.link.startsWith('/admin') ? n.link : '/admin/notification');
  };

  const isActive = (path: string) => location.pathname.includes(path);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotificationsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  const handleLogoClick = () => {
    navigate('/admin');
  };

  return (
    <header className="bg-white shadow-sm border-b border-neutral-200 sticky top-0 z-30">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 sm:px-4 md:px-6 py-3 sm:py-4 gap-3 sm:gap-0">
        {/* Logo and Hamburger Menu */}
        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
          {/* Hamburger Menu Button */}
          <button
            onClick={onMenuClick}
            className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors flex-shrink-0"
            aria-label="Toggle menu"
          >
            {isSidebarOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M18 6L6 18M6 6L18 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M4 6H20M4 12H20M4 18H20"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          {/* Exnshop Logo */}
          <button
            onClick={handleLogoClick}
            className="hover:opacity-80 transition-opacity flex items-center gap-2"
          >
            <img
              src={exnshopLogo}
              alt="Exnshop"
              className="h-10 sm:h-12 w-auto object-contain cursor-pointer"
              style={{ maxWidth: '160px' }}
            />
            <span className="hidden sm:inline text-base font-bold text-primary tracking-tight">
              Exnshop
            </span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="hidden md:flex items-center gap-4 lg:gap-6">
          <button
            onClick={() => navigate('/admin/orders')}
            className={`relative px-3 lg:px-4 py-2 text-xs sm:text-sm font-medium transition-colors ${isActive('/admin/orders') ? 'text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'
              }`}
          >
            {t("common.orders", "Orders")}
          </button>
          <button
            onClick={() => navigate('/admin/customers')}
            className={`px-3 lg:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${isActive('/admin/customers') ? 'text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'
              }`}
          >
            {t("admin.manageCustomer", "Manage Customer")}
          </button>
          <button
            onClick={() => navigate('/admin/collect-cash')}
            className={`px-3 lg:px-4 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${isActive('/admin/collect-cash') ? 'text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'
              }`}
          >
            {t("admin.collectCash", "Collect Cash")}
          </button>
        </div>

        {/* Action Icons */}
        <div className="flex items-center gap-2 md:gap-4 relative">
          {/* Notifications Button */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => {
                if (!showNotificationsDropdown) loadNotifications();
                setShowNotificationsDropdown(!showNotificationsDropdown);
              }}
              className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors relative"
              aria-label="Notifications"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 8A6 6 0 0 0 6 8C6 11.3137 4 14 4 17H20C20 14 18 11.3137 18 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {showNotificationsDropdown && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-neutral-200 py-2 z-50 max-h-96 overflow-y-auto">
                <div className="px-4 py-2 border-b border-neutral-200">
                  <h3 className="text-sm font-semibold text-neutral-900">Notifications</h3>
                </div>
                {recent.length === 0 ? (
                  <div className="py-4 px-4 text-center text-sm text-neutral-500">
                    <p>No new notifications</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {recent.map((n) => (
                      <li key={n._id}>
                        <button
                          type="button"
                          onClick={() => openNotification(n)}
                          className={`w-full text-left px-4 py-2.5 hover:bg-neutral-50 ${n.isRead ? '' : 'bg-teal-50/60'}`}
                        >
                          <div className="flex items-start gap-2">
                            {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-teal-600 shrink-0" />}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-neutral-900 truncate">{n.title}</p>
                              <p className="text-xs text-neutral-600 line-clamp-2">{n.message}</p>
                              {(n as any).createdAt && (
                                <p className="text-[10px] text-neutral-400 mt-0.5">
                                  {new Date((n as any).createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="px-4 py-2 border-t border-neutral-200">
                  <button
                    onClick={() => {
                      navigate('/admin/notification');
                      setShowNotificationsDropdown(false);
                    }}
                    className="w-full text-center text-sm text-teal-600 hover:text-teal-700 font-medium"
                  >
                    View All Notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Language Selector */}
          <LanguageSelector variant="dropdown" />

          {/* Profile Button */}
          <button
            onClick={() => navigate('/admin/profile')}
            className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            aria-label="Profile"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors"
            aria-label="Logout"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9M16 17L21 12M21 12L16 7M21 12H9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}


