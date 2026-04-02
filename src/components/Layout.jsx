import { useState, useCallback } from 'react';
import { Outlet, useMatch, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { CompanyProvider } from '../contexts/CompanyContext';
import { useAuth } from '../contexts/AuthContext';
import { useIdleTimeout } from '../hooks/useIdleTimeout';
import IdleWarningBanner from './IdleWarningBanner';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const companyMatch = useMatch('/company/:companyId/*');
  const companyIdFromRoute = companyMatch?.params?.companyId ?? null;
  const navigate = useNavigate();
  const { currentUser, signOut } = useAuth();
  const [showIdleWarning, setShowIdleWarning] = useState(false);

  const handleIdleSignOut = useCallback(async () => {
    setShowIdleWarning(false);
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

  const resetIdleTimers = useIdleTimeout(
    currentUser ? handleIdleSignOut : null,
    currentUser ? handleIdleWarning : null,
    currentUser ? handleIdleActive : null,
  );

  const handleStaySignedIn = useCallback(() => {
    setShowIdleWarning(false);
    resetIdleTimers();
  }, [resetIdleTimers]);

  return (
    <CompanyProvider companyIdFromRoute={companyIdFromRoute}>
      <div className="min-h-screen bg-[#f1f5f9]">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 text-gray-600"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <img src="/logo/icon.png" className="w-7 h-7 rounded-lg object-cover" alt="" />
            <span className="font-bold text-[#1B6B6B]">AttendX</span>
          </div>

          <div className="w-9" aria-hidden />
        </div>

        <main className="lg:ml-56 min-h-screen overflow-y-auto pt-14 lg:pt-0 bg-[#f1f5f9]">
          <Outlet />
        </main>

        <IdleWarningBanner
          visible={showIdleWarning}
          onStaySignedIn={handleStaySignedIn}
          onSignOut={handleIdleSignOut}
        />
      </div>
    </CompanyProvider>
  );
}
