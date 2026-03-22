import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { ROLE_COLORS, ROLE_LABELS, getNavItems } from '../utils/roles';

function NavIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function BuildingIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  );
}

function UsersIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function DashboardIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function EmployeesIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function LeaveIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function DocumentsIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function AssetsIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7v10" />
    </svg>
  );
}

function SettingsIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

const navIcons = {
  dashboard: DashboardIcon,
  employees: EmployeesIcon,
  leave: LeaveIcon,
  documents: DocumentsIcon,
  assets: AssetsIcon,
  team: UsersIcon,
  settings: SettingsIcon,
};

export default function Sidebar() {
  const { currentUser, role, signOut } = useAuth();
  const { companyId, company } = useCompany();
  const isAdmin = role === 'admin';
  const inCompany = !!companyId;

  const companyNavItems = getNavItems(isAdmin ? 'admin' : role);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Error signing out', err);
    }
  };

  const linkClass = (isActive) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-[#4ECDC4] text-[#1B6B6B]'
        : 'text-white/70 hover:bg-white/[0.08] hover:text-white'
    }`;

  const roleBadgeClass = ROLE_COLORS[role] || 'bg-slate-100 text-slate-700';
  const roleLabel = ROLE_LABELS[role] || role || 'User';

  return (
    <aside className="flex flex-col h-screen bg-[#1B6B6B] w-56 fixed left-0 top-0 overflow-hidden text-white">
      <div className="flex items-center gap-3 p-4 border-b border-white/10 flex-shrink-0">
        <img
          src="/logo/icon.png"
          alt="AttendX"
          className="w-9 h-9 rounded-xl object-cover flex-shrink-0"
          onError={(e) => {
            e.target.style.display = 'none';
            const el = e.target.nextElementSibling;
            if (el) el.style.display = 'flex';
          }}
        />
        <div
          style={{ display: 'none' }}
          className="w-9 h-9 rounded-xl bg-[#4ECDC4] flex items-center justify-center text-[#1B6B6B] font-bold text-sm flex-shrink-0"
        >
          AX
        </div>
        <div>
          <p className="text-white font-bold text-base tracking-wide leading-none">AttendX</p>
          <p className="text-white/40 text-xs mt-0.5">HR Platform</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto min-h-0 p-3 space-y-4 scrollbar-none">
        {isAdmin && (
          <>
            <div>
              <p className="px-3 text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Admin Controls</p>
              <div className="space-y-0.5">
                <NavLink to="/companies" className={({ isActive }) => linkClass(isActive)}>
                  <BuildingIcon className="w-5 h-5 shrink-0" />
                  All Companies
                </NavLink>
                <NavLink to="/admin/users" className={({ isActive }) => linkClass(isActive)}>
                  <UsersIcon className="w-5 h-5 shrink-0" />
                  Platform Users
                </NavLink>
              </div>
            </div>

            {inCompany && (
              <div>
                <Link to="/companies" className="flex items-center gap-2 px-3 py-2 text-white/60 hover:text-white text-sm">
                  ← All Companies
                </Link>
                <div className="flex items-center gap-2 mt-2 mb-2 px-3 py-2 rounded-lg bg-white/10">
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold shrink-0"
                    style={{ backgroundColor: company?.color || '#1B6B6B' }}
                  >
                    {company?.initials || '—'}
                  </div>
                  <span className="text-sm font-medium text-white truncate">{company?.name || 'Company'}</span>
                </div>
                <p className="px-3 text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Current Company</p>
                <div className="space-y-0.5">
                  {companyNavItems.map(({ to, label }) => {
                    const Icon = navIcons[to] || NavIcon;
                    return (
                      <NavLink key={to} to={`/company/${companyId}/${to}`} className={({ isActive }) => linkClass(isActive)}>
                        <Icon className="w-5 h-5 shrink-0" />
                        {label}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {!isAdmin && inCompany && (
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-white/10">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold"
                style={{ backgroundColor: company?.color || '#1B6B6B' }}
              >
                {company?.initials || '—'}
              </div>
              <span className="text-sm font-medium truncate">{company?.name || 'Company'}</span>
            </div>
            {companyNavItems.map(({ to, label }) => {
              const Icon = navIcons[to] || NavIcon;
              return (
                <NavLink key={to} to={`/company/${companyId}/${to}`} className={({ isActive }) => linkClass(isActive)}>
                  <Icon className="w-5 h-5 shrink-0" />
                  {label}
                </NavLink>
              );
            })}
          </div>
        )}
      </nav>

      {currentUser && (
        <div className="flex-shrink-0 border-t border-white/10 p-3">
          <div className="flex items-center gap-3 mb-2">
            <img
              src={
                currentUser.photoURL ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || currentUser.email || 'User')}`
              }
              alt=""
              className="h-9 w-9 rounded-full object-cover"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{currentUser.displayName || currentUser.email}</p>
              <p className="text-xs text-white/60 truncate">{currentUser.email}</p>
            </div>
          </div>
          {role && (
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${roleBadgeClass}`}>{roleLabel}</span>
          )}
          <button type="button" onClick={handleSignOut} className="w-full text-left text-xs text-white/60 hover:text-red-200">
            Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}
