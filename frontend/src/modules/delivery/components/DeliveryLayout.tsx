import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DeliveryBottomNav from './DeliveryBottomNav';
import { DeliveryStatusProvider, useDeliveryStatus } from '../context/DeliveryStatusContext';
import { DeliveryUserProvider, useDeliveryUser } from '../context/DeliveryUserContext';
import { getDeliveryProfile } from '../../../services/api/delivery/deliveryService';
import { useDeliveryOrderNotifications } from '../../../hooks/useDeliveryOrderNotifications';
import OrderNotificationCard from './OrderNotificationCard';
import { AnimatePresence } from 'framer-motion';
import { registerFCMToken } from '../../../services/pushNotificationService';
import { useRingtoneAlert } from '../../../hooks/useRingtoneAlert';

const PUSH_PROMPT_DISMISSED_KEY = 'delivery_push_prompt_dismissed';

interface DeliveryLayoutContentProps {
  children: ReactNode;
}

function DeliveryLayoutContent({ children }: DeliveryLayoutContentProps) {
  const navigate = useNavigate();
  const { isOnline } = useDeliveryStatus();
  const { setUserName } = useDeliveryUser();
  const {
    currentNotification,
    notificationQueue,
    acceptOrder,
    rejectOrder,
  } = useDeliveryOrderNotifications();
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);

  // Count total actionable pending delivery assignments
  const actionableCount = (currentNotification ? 1 : 0) + notificationQueue.length;
  const { autoplayBlocked, enableAndPlaySound } = useRingtoneAlert('/assets/sound/delivery-alert.mp3', actionableCount > 0);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await getDeliveryProfile();
        if (profile?.name) {
          setUserName(profile.name);
        }
      } catch (error) {
        console.error('Failed to fetch profile in layout:', error);
      }
    };

    fetchProfile();
  }, [setUserName]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const permission = Notification.permission;
    const dismissed = localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) === '1';
    if (permission === 'default' && !dismissed) {
      setShowPushBanner(true);
    } else {
      setShowPushBanner(false);
    }
  }, []);

  const handleEnablePush = async () => {
    setPushEnabling(true);
    try {
      await registerFCMToken(true);
      setShowPushBanner(false);
    } catch (e) {
      console.warn('Push registration failed:', e);
    } finally {
      setPushEnabling(false);
    }
  };

  const handleDismissPushBanner = () => {
    localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, '1');
    setShowPushBanner(false);
  };

  return (
    // Phone-first app: on wider screens it sits in a centred phone-width column instead of stretching.
    <div className="min-h-screen bg-neutral-200">
    <div className={`relative flex flex-col min-h-screen w-full md:max-w-xl md:mx-auto md:shadow-xl md:border-x md:border-neutral-200 bg-neutral-100 transition-all duration-300 ${!isOnline ? 'grayscale' : ''}`}>
      {autoplayBlocked && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm font-semibold z-[10001] shrink-0">
          <span>🔔 Incoming delivery ringtone blocked by browser. Click to enable sound!</span>
          <button
            onClick={enableAndPlaySound}
            className="bg-white text-amber-800 px-3 py-1 rounded shadow hover:bg-neutral-100 font-bold transition-transform active:scale-95 ml-3"
          >
            Enable Sound
          </button>
        </div>
      )}

      {showPushBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
          <p className="text-sm text-amber-900 flex-1 min-w-0">
            Get order alerts when the app is closed.
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={pushEnabling}
              className="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-60"
            >
              {pushEnabling ? 'Enabling…' : 'Enable'}
            </button>
            <button
              type="button"
              onClick={handleDismissPushBanner}
              className="px-2 py-1.5 text-sm text-amber-800 hover:bg-amber-100 rounded"
            >
              Later
            </button>
          </div>
        </div>
      )}
      <main className="flex-1 overflow-y-auto scrollbar-hide pb-[calc(5rem+var(--safe-bottom))]">
        {children}
      </main>
      <DeliveryBottomNav />

      {/* Order Notification Card */}
      <AnimatePresence>
        {currentNotification && (
          <OrderNotificationCard
            key={currentNotification.orderId}
            notification={currentNotification}
            onAccept={(orderId) => acceptOrder(orderId, navigate)}
            onReject={rejectOrder}
          />
        )}
      </AnimatePresence>
    </div>
    </div>
  );
}

interface DeliveryLayoutProps {
  children: ReactNode;
}

export default function DeliveryLayout({ children }: DeliveryLayoutProps) {
  return (
    <DeliveryStatusProvider>
      <DeliveryUserProvider>
        <DeliveryLayoutContent>{children}</DeliveryLayoutContent>
      </DeliveryUserProvider>
    </DeliveryStatusProvider>
  );
}




