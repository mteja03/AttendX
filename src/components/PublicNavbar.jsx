import { Link, useLocation } from 'react-router-dom';

const NAV_LINKS = [
  { to: '/home', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/about', label: 'About' },
];

export default function PublicNavbar() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
        {/* Logo */}
        <Link to="/home" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 p-0.5">
            <img
              src="/logo/icon.png"
              alt=""
              className="w-full h-full rounded-md object-cover"
              onError={(e) => {
                const wrap = e.target.parentElement;
                if (wrap) wrap.style.display = 'none';
                const fb = wrap?.nextElementSibling;
                if (fb) fb.style.display = 'flex';
              }}
            />
          </div>
          <div
            style={{ display: 'none' }}
            className="w-8 h-8 rounded-lg bg-[#1B6B6B] flex items-center justify-center text-white font-semibold text-xs"
          >
            A
          </div>
          <span className="text-lg font-semibold" style={{ color: '#1B6B6B' }}>
            AttendX
          </span>
        </Link>

        {/* Nav links - hidden on small mobile */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV_LINKS.map(({ to, label }) => {
            const isActive = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors min-h-[44px] flex items-center ${
                  isActive
                    ? 'bg-[#E1F5EE] text-[#0F6E56] font-medium'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Login CTA */}
        <Link
          to="/login"
          className="bg-[#1B6B6B] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#155858] transition-colors min-h-[44px] flex items-center"
        >
          Login
        </Link>
      </div>

      {/* Mobile nav - visible on small screens only */}
      <nav className="sm:hidden flex items-center gap-1 px-4 pb-2">
        {NAV_LINKS.map(({ to, label }) => {
          const isActive = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors min-h-[44px] flex items-center ${
                isActive
                  ? 'bg-[#E1F5EE] text-[#0F6E56] font-medium'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
