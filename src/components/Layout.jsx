import { useState, useCallback, useEffect, useRef } from 'react';
import { Outlet, useMatch, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { CompanyProvider } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { useIdleTimeout } from '../hooks/useIdleTimeout';
import IdleWarningBanner from './IdleWarningBanner';
import NotificationBanner from './NotificationBanner';
import NotificationPermissionPrompt from './NotificationPermissionPrompt';
import { trackSessionTimeout } from '../utils/analytics';
import { initMessaging, onForegroundMessage, requestNotificationPermission } from '../utils/fcm';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const companyMatch = useMatch('/company/:companyId/*');
  const companyIdFromRoute = companyMatch?.params?.companyId ?? null;
  const navigate = useNavigate();
  const { currentUser, signOut, companyId: authCompanyId } = useAuth();
  const companyIdForContext = companyIdFromRoute || authCompanyId || null;
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [notification, setNotification] = useState(null);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const fgUnsubRef = useRef(() => {});

  const clearForegroundListener = useCallback(() => {
    fgUnsubRef.current();
    fgUnsubRef.current = () => {};
  }, []);

  const startForegroundListener = useCallback(async () => {
    clearForegroundListener();
    await initMessaging();
    const unsub = onForegroundMessage((payload) => {
      setNotification({
        title: payload.notification?.title || 'AttendX',
        body: payload.notification?.body || '',
        data: payload.data || {},
      });
    });
    fgUnsubRef.current = typeof unsub === 'function' ? unsub : () => {};
  }, [clearForegroundListener]);

  useEffect(() => {
    if (!currentUser) {
      clearForegroundListener();
      return undefined;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      return undefined;
    }

    let cancelled = false;

    if (Notification.permission === 'granted') {
      (async () => {
        await startForegroundListener();
        if (cancelled) clearForegroundListener();
      })();
      return () => {
        cancelled = true;
        clearForegroundListener();
      };
    }

    if (Notification.permission === 'default') {
      const timer = setTimeout(() => setShowPermissionPrompt(true), 30000);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [currentUser, startForegroundListener, clearForegroundListener]);

  const handleAllowNotifications = useCallback(async () => {
    const emailKey = currentUser?.email?.toLowerCase() || '';
    const token = await requestNotificationPermission(emailKey, companyIdForContext);
    setShowPermissionPrompt(false);
    if (token) {
      await startForegroundListener();
    }
  }, [currentUser?.email, companyIdForContext, startForegroundListener]);

  const dismissNotification = useCallback(() => setNotification(null), []);

  const handleIdleSignOut = useCallback(async () => {
    setShowIdleWarning(false);
    trackSessionTimeout();
    try {
      await signOut();
    } finally {
      navigate('/login?reason=idle');
    }
  }, [signOut, navigate]);

  const handleIdleWarning = useCallback(() => {
    setShowIdleWarning(true);
  }, []);

  const handleIdleActive = useCallback(() => {
    setShowIdleWarning(false);
  }, []);

  const { resetTimer } = useIdleTimeout({
    onWarning: handleIdleWarning,
    onSignOut: handleIdleSignOut,
    onActive: handleIdleActive,
    enabled: !!currentUser,
  });

  const handleStaySignedIn = useCallback(() => {
    setShowIdleWarning(false);
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <CompanyProvider companyIdFromRoute={companyIdForContext}>
      <div className="min-h-screen bg-[#f1f5f9] flex">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="lg:hidden sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 safe-bottom">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSidebarOpen(true);
              }}
              className="w-9 h-9 shrink-0 rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 text-gray-600"
              aria-label="Open menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="text-base font-semibold text-[#1B6B6B] truncate">AttendX</span>
          </div>

          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#f1f5f9]">
            <div className="p-4 md:p-6 lg:p-8 safe-bottom min-h-full">
              <Outlet />
            </div>
          </main>
        </div>

        <IdleWarningBanner
          visible={showIdleWarning}
          onStaySignedIn={handleStaySignedIn}
          onSignOut={handleIdleSignOut}
        />

        {notification && (
          <NotificationBanner
            notification={notification}
            onClose={dismissNotification}
            onClick={() => {
              const url = notification.data?.url;
              if (url) navigate(url);
              dismissNotification();
            }}
          />
        )}

        {showPermissionPrompt && (
          <NotificationPermissionPrompt
            onAllow={handleAllowNotifications}
            onDismiss={() => setShowPermissionPrompt(false)}
          />
        )}
      </div>
    </CompanyProvider>
  );
}
