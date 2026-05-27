import { useState, useCallback, useEffect, useRef } from 'react';
import { Outlet, useMatch, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { CompanyProvider } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { useIdleTimeout } from '../hooks/useIdleTimeout';
import IdleWarningBanner from './IdleWarningBanner';
import GlobalHeader from './GlobalHeader';
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
    const id = requestAnimationFrame(() => setSidebarOpen(false));
    return () => cancelAnimationFrame(id);
  }, [location.pathname]);

  return (
    <CompanyProvider companyIdFromRoute={companyIdForContext}>
      <div className="flex h-screen overflow-hidden bg-[#f1f5f9]">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <GlobalHeader onOpenMenu={() => setSidebarOpen(true)} />

          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#f1f5f9]">
            <div className="safe-bottom safe-x p-4 md:p-6 lg:p-8">
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
