import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function GlobalHeader() {
  const navigate = useNavigate();
  const { currentUser, role, signOut, companyId: authCompanyId } = useAuth();
  const { companyId, company } = useCompany();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);
  const userRef = useRef(null);

  const effectiveCompanyId = companyId || authCompanyId;

  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotificationsOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!effectiveCompanyId || !currentUser) {
      return undefined;
    }

    const unsubs = [];
    let leaveItems = [];
    let auditItems = [];

    const updateState = () => {
      const all = [...leaveItems, ...auditItems].sort((a, b) => b.timestamp - a.timestamp);
      setPendingCount(all.length);
      setNotifications(all.slice(0, 5));
    };

    if (role === 'admin' || role === 'companyadmin' || role === 'hrmanager') {
      const leaveQuery = query(
        collection(db, `companies/${effectiveCompanyId}/leave`),
        where('status', '==', 'Pending'),
        limit(10),
      );
      const unsubLeave = onSnapshot(leaveQuery, (snap) => {
        leaveItems = snap.docs.map((d) => ({
          id: `leave-${d.id}`,
          type: 'leave',
          title: 'Leave request pending approval',
          subtitle: `${d.data().employeeName || 'Employee'} • ${d.data().leaveType || 'Leave'}`,
          timestamp: d.data().appliedDate?.toDate?.() || new Date(),
          link: `/company/${effectiveCompanyId}/leave`,
        }));
        updateState();
      });
      unsubs.push(unsubLeave);
    }

    if (role === 'auditor' || role === 'auditmanager') {
      const auditQuery = query(
        collection(db, `companies/${effectiveCompanyId}/audits`),
        where('auditorId', '==', currentUser.uid),
        where('status', '==', 'Assigned'),
        limit(10),
      );
      const unsubAudit = onSnapshot(auditQuery, (snap) => {
        auditItems = snap.docs.map((d) => ({
          id: `audit-${d.id}`,
          type: 'audit',
          title: 'New audit assigned',
          subtitle: d.data().auditTypeName || 'Audit',
          timestamp: d.data().createdAt?.toDate?.() || new Date(),
          link: `/company/${effectiveCompanyId}/audit`,
        }));
        updateState();
      });
      unsubs.push(unsubAudit);
    }

    return () => {
      unsubs.forEach((u) => u());
      setPendingCount(0);
      setNotifications([]);
    };
  }, [effectiveCompanyId, currentUser, role]);

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    try {
      await signOut();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Sign out error', err);
    }
  };

  if (!effectiveCompanyId) return null;

  const userInitial = (currentUser?.displayName || currentUser?.email || 'U').charAt(0).toUpperCase();
  const cardShadow = '0 4px 24px 0 rgba(0,0,0,0.08)';

  return (
    <header className="hidden lg:flex h-[69px] bg-white border-b border-gray-100 items-center justify-between px-6 flex-shrink-0 relative z-30">
      <button
        type="button"
        onClick={() => navigate(`/company/${effectiveCompanyId}/dashboard`)}
        className="flex items-center gap-3 pl-2 pr-3.5 py-2 rounded-xl hover:bg-gray-50 transition-colors"
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
          style={{ backgroundColor: company?.color || '#1B6B6B' }}
        >
          {company?.initials || '—'}
        </div>
        <span className="text-sm font-medium text-gray-800">{company?.name || 'Company'}</span>
      </button>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigate(`/company/${effectiveCompanyId}/calendar`)}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          title="Calendar"
          aria-label="Calendar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>

        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors relative"
            title="Notifications"
            aria-label="Notifications"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {pendingCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div
              className="absolute right-0 top-12 w-80 bg-white border border-gray-100 rounded-2xl py-1 z-50 overflow-hidden"
              style={{ boxShadow: cardShadow }}
            >
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">Notifications</span>
                {pendingCount > 0 && (
                  <span className="text-xs bg-[#E1F5EE] text-[#0F6E56] px-2 py-0.5 rounded-full font-medium">
                    {pendingCount} new
                  </span>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#E1F5EE] flex items-center justify-center mx-auto mb-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-800 mb-1">All caught up</p>
                  <p className="text-xs text-gray-400">No pending items right now.</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {notifications.map((notif) => (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => {
                        navigate(notif.link);
                        setNotificationsOpen(false);
                      }}
                      className="w-full px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50 last:border-b-0 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base"
                          style={{
                            background:
                              notif.type === 'leave' ? '#FAEEDA' : notif.type === 'audit' ? '#EEEDFE' : '#E6F1FB',
                          }}
                        >
                          {notif.type === 'leave' ? '🏖️' : notif.type === 'audit' ? '📋' : '🔔'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{notif.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{notif.subtitle}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-gray-200 mx-2" />

        <div className="relative" ref={userRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-9 h-9 rounded-full overflow-hidden hover:ring-2 hover:ring-gray-100 transition-all flex-shrink-0"
            title={currentUser?.displayName || currentUser?.email}
            aria-label="User menu"
          >
            {currentUser?.photoURL ? (
              <img src={currentUser.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#E1F5EE] text-[#0F6E56] text-xs font-semibold flex items-center justify-center">
                {userInitial}
              </div>
            )}
          </button>

          {userMenuOpen && (
            <div
              className="absolute right-0 top-12 w-60 bg-white border border-gray-100 rounded-2xl py-1 z-50 overflow-hidden"
              style={{ boxShadow: cardShadow }}
            >
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {currentUser?.displayName || currentUser?.email}
                </p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{currentUser?.email}</p>
                {role && (
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#E1F5EE] text-[#0F6E56] uppercase tracking-wide">
                    {role}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigate(`/company/${effectiveCompanyId}/settings`);
                  setUserMenuOpen(false);
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Settings
              </button>
              <div className="h-px bg-gray-50 my-1" />
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
