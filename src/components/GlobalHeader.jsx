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

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotificationsOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch notifications count and items
  useEffect(() => {
    if (!effectiveCompanyId || !currentUser) {
      return undefined;
    }

    const items = [];
    let totalCount = 0;

    // Pending leave approvals (admin/HR only)
    if (role === 'admin' || role === 'companyadmin' || role === 'hrmanager') {
      const leaveQuery = query(
        collection(db, `companies/${effectiveCompanyId}/leave`),
        where('status', '==', 'Pending'),
        limit(10)
      );
      const unsubLeave = onSnapshot(leaveQuery, (snap) => {
        const count = snap.size;
        totalCount += count;
        items.push(...snap.docs.slice(0, 3).map((d) => ({
          id: d.id,
          type: 'leave',
          title: 'Leave request pending approval',
          subtitle: `${d.data().employeeName || 'Employee'} • ${d.data().leaveType || 'Leave'}`,
          timestamp: d.data().appliedDate?.toDate?.() || new Date(),
          link: `/company/${effectiveCompanyId}/leave`,
        })));
        setPendingCount(totalCount);
        setNotifications([...items].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5));
      });

      // Assigned audits (auditor/audit manager)
      if (role === 'auditor' || role === 'auditmanager') {
        const auditQuery = query(
          collection(db, `companies/${effectiveCompanyId}/audits`),
          where('auditorId', '==', currentUser.uid),
          where('status', '==', 'Assigned'),
          limit(10)
        );
        const unsubAudit = onSnapshot(auditQuery, (snap) => {
          const count = snap.size;
          totalCount += count;
          items.push(...snap.docs.slice(0, 3).map((d) => ({
            id: d.id,
            type: 'audit',
            title: 'New audit assigned',
            subtitle: d.data().auditTypeName || 'Audit',
            timestamp: d.data().createdAt?.toDate?.() || new Date(),
            link: `/company/${effectiveCompanyId}/audit`,
          })));
          setPendingCount(totalCount);
          setNotifications([...items].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5));
        });
        return () => {
          unsubLeave();
          unsubAudit();
          setPendingCount(0);
          setNotifications([]);
        };
      }

      return () => {
        unsubLeave();
        setPendingCount(0);
        setNotifications([]);
      };
    }

    return undefined;
  }, [effectiveCompanyId, currentUser, role]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      if (import.meta.env.DEV) console.error('Sign out error', err);
    }
  };

  if (!effectiveCompanyId) return null;

  return (
    <header className="sticky top-0 z-50 h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
      {/* Left: Company pill */}
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
          style={{ backgroundColor: company?.color || '#1B6B6B' }}
        >
          {company?.initials || '—'}
        </div>
        <span className="text-sm font-medium text-gray-800 hidden sm:block">{company?.name || 'Company'}</span>
      </div>

      {/* Right: Calendar, Notifications, User */}
      <div className="flex items-center gap-4">
        {/* Calendar icon */}
        <button
          type="button"
          onClick={() => navigate(`/company/${effectiveCompanyId}/calendar`)}
          className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Calendar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>

        {/* Notifications bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors relative"
            aria-label="Notifications"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center border-2 border-white">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>

          {/* Notifications dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 top-12 w-80 bg-white border border-gray-200 rounded-xl shadow-xl py-2 z-50">
              <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">Notifications</span>
                {pendingCount > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{pendingCount}</span>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="text-3xl mb-2">✅</div>
                  <p className="text-sm text-gray-500">All caught up!</p>
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
                      className="w-full px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50 last:border-b-0"
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-lg flex-shrink-0">
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

        {/* User avatar */}
        <div className="relative" ref={userRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 hover:border-gray-300 transition-colors flex-shrink-0"
            aria-label="User menu"
          >
            <img
              src={
                currentUser?.photoURL ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.displayName || currentUser?.email || 'User')}&background=E1F5EE&color=0F6E56`
              }
              alt=""
              className="w-full h-full object-cover"
            />
          </button>

          {/* User dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 top-12 w-56 bg-white border border-gray-200 rounded-xl shadow-xl py-2 z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-800 truncate">{currentUser?.displayName || currentUser?.email}</p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{currentUser?.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigate(`/company/${effectiveCompanyId}/settings`);
                  setUserMenuOpen(false);
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Settings
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
