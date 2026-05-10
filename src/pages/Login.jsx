import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const FEATURES = [
  {
    title: 'Employee management',
    sub: 'Full lifecycle — hire to exit',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    title: 'Leave & attendance',
    sub: 'Apply, approve, track in real time',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    title: 'Audit workflows',
    sub: 'Internal & external, end-to-end',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: 'Documents & assets',
    sub: 'Organised, always accessible',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
];

const SECURITY = [
  {
    label: 'SSL encrypted',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
  {
    label: 'Google OAuth',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    label: 'No passwords',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
      </svg>
    ),
  },
];

export default function Login() {
  const [searchParams] = useSearchParams();
  const idleSignOut = searchParams.get('reason') === 'idle';
  const { currentUser, loading, signInWithGoogle, authError } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  if (!loading && currentUser) {
    return <Navigate to="/" replace />;
  }

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Sign in error:', error);
    } finally {
      setIsSigningIn(false);
    }
  };

  const busy = isSigningIn || loading;

  return (
    <div className="min-h-screen flex bg-[#FAFBFB]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── LEFT BRANDING PANEL (desktop only) ── */}
      <aside className="hidden lg:flex lg:w-[54%] relative overflow-hidden">
        {/* Layered background: deep teal base + radial glows */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 100% 0%, rgba(93,202,165,0.18) 0%, transparent 50%), ' +
              'radial-gradient(80% 60% at 0% 100%, rgba(27,107,107,0.55) 0%, transparent 60%), ' +
              'linear-gradient(160deg, #0B3D3D 0%, #0E4A4A 60%, #103E3E 100%)',
          }}
          aria-hidden
        />
        {/* Soft decorative blobs */}
        <div
          className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, #5DCAA5 0%, transparent 70%)' }}
          aria-hidden
        />
        <div
          className="absolute -bottom-40 -left-32 w-[520px] h-[520px] rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, #1B6B6B 0%, transparent 70%)' }}
          aria-hidden
        />
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
          aria-hidden
        />

        <div className="relative z-10 flex flex-col justify-between w-full p-12 xl:p-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl overflow-hidden flex-shrink-0 ring-1 ring-white/15 shadow-lg shadow-black/20">
              <img
                src="/logo/icon.png"
                alt="AttendX"
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
            <span className="text-[22px] font-semibold tracking-tight text-white">
              Attend<span className="text-[#5DCAA5]">X</span>
            </span>
          </div>

          {/* Hero copy + features */}
          <div className="max-w-md">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[#5DCAA5] bg-[#5DCAA5]/10 px-2.5 py-1 rounded-full ring-1 ring-[#5DCAA5]/20 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5DCAA5] animate-pulse" />
              HR · Audit · Compliance
            </span>
            <h1
              className="font-semibold leading-[1.05] mb-5 text-white"
              style={{ fontSize: 'clamp(36px, 4vw, 46px)', letterSpacing: '-0.8px' }}
            >
              All your HR,<br />
              <span className="bg-gradient-to-r from-white to-[#9FE1CB] bg-clip-text text-transparent">
                in one place.
              </span>
            </h1>
            <p className="text-[15px] leading-relaxed text-[#9FE1CB]/90 max-w-[340px] mb-10">
              A complete HRIS for Indian businesses — from day one to exit. Built for teams that need clarity, not clutter.
            </p>

            <ul className="flex flex-col gap-4">
              {FEATURES.map((f) => (
                <li
                  key={f.title}
                  className="flex items-start gap-3.5 group"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ring-white/10 transition-all group-hover:ring-[#5DCAA5]/40 group-hover:scale-105"
                    style={{
                      background: 'linear-gradient(145deg, rgba(93,202,165,0.12), rgba(255,255,255,0.04))',
                      color: '#9FE1CB',
                    }}
                  >
                    {f.icon}
                  </div>
                  <div className="pt-0.5">
                    <p className="text-[14px] font-medium text-white/95">{f.title}</p>
                    <p className="text-[12.5px] mt-0.5 text-[#5DCAA5]/85">{f.sub}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Trusted by */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] uppercase tracking-[0.16em] text-white/40 font-medium">Trusted by</span>
              <span className="flex-1 h-px bg-white/10" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {['PPFC/WZ', 'SB Motors', 'SB Ventures'].map((name) => (
                <span
                  key={name}
                  className="text-xs font-medium px-3 py-1.5 rounded-full bg-white/[0.05] text-white/55 ring-1 ring-white/10 backdrop-blur-sm"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ── RIGHT LOGIN PANEL ── */}
      <main className="flex-1 flex flex-col bg-white relative overflow-hidden">
        {/* Layered ambient backdrop */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(70% 50% at 100% 0%, rgba(93,202,165,0.10) 0%, transparent 60%), ' +
              'radial-gradient(60% 50% at 0% 100%, rgba(27,107,107,0.07) 0%, transparent 65%)',
          }}
          aria-hidden
        />
        {/* Faint dot pattern */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.35]"
          style={{
            backgroundImage: 'radial-gradient(rgba(11,61,61,0.08) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
          }}
          aria-hidden
        />
        {/* Watermark in corner */}
        <div
          className="absolute -bottom-10 -right-10 pointer-events-none select-none opacity-[0.04]"
          aria-hidden
        >
          <span className="text-[260px] font-bold leading-none text-[#0B3D3D]">X</span>
        </div>

        {/* Mobile top bar — richer than before */}
        <div className="flex lg:hidden items-center justify-between px-6 py-4 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 ring-1 ring-[#1B6B6B]/15">
              <img
                src="/logo/icon.png"
                alt="AttendX"
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
            <span className="text-[17px] font-semibold tracking-tight text-[#0B3D3D]">
              Attend<span className="text-[#1B6B6B]">X</span>
            </span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-gray-400">HRIS</span>
        </div>

        {/* Centered login form */}
        <div className="flex-1 flex items-center justify-center px-6 py-10 lg:py-12 relative z-10">
          <div className="w-full max-w-[400px] animate-[loginRise_0.5s_ease-out]">

            {/* Heading */}
            <div className="mb-7 text-center lg:text-left">
              <h2 className="text-[28px] lg:text-[30px] font-semibold text-gray-900 tracking-tight leading-tight">
                <span className="hidden lg:inline">Welcome back</span>
                <span className="lg:hidden">Sign in to AttendX</span>
              </h2>
              <p className="text-[14px] text-gray-500 mt-2 leading-relaxed">
                <span className="hidden lg:inline">Sign in with your work Google account to continue.</span>
                <span className="lg:hidden">Use your authorised work Google account.</span>
              </p>
            </div>

            {/* Idle warning */}
            {idleSignOut && (
              <div
                role="status"
                className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-100 rounded-xl mb-3.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <p className="text-xs text-amber-700 leading-relaxed">
                  You were signed out after 4 hours of inactivity.
                </p>
              </div>
            )}

            {/* Auth error */}
            {authError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-xl mb-3.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-xs text-red-700 leading-relaxed">{authError}</p>
              </div>
            )}

            {/* Google Sign In */}
            <button
              type="button"
              onClick={handleSignIn}
              disabled={busy}
              aria-busy={busy}
              aria-live="polite"
              className={`group w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl text-[15px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1B6B6B]/25 ${
                busy
                  ? 'bg-[#E8F5F5] text-[#1B6B6B] cursor-not-allowed'
                  : 'bg-gradient-to-b from-[#1B6B6B] to-[#155858] text-white hover:from-[#155858] hover:to-[#0F4747] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(27,107,107,0.28)] active:translate-y-0 active:shadow-[0_2px_8px_rgba(27,107,107,0.22)] shadow-[0_4px_14px_rgba(27,107,107,0.22)]'
              }`}
            >
              {isSigningIn ? (
                <>
                  <span
                    className="w-4 h-4 rounded-full border-2 border-[#1B6B6B] border-t-transparent inline-block"
                    style={{ animation: 'loginSpin 0.7s linear infinite' }}
                    aria-hidden="true"
                  />
                  <span>Signing you in…</span>
                </>
              ) : (
                <>
                  <span className="w-7 h-7 rounded-full bg-white flex items-center justify-center transition-transform group-hover:scale-105">
                    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
                      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18z"/>
                      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
                    </svg>
                  </span>
                  Continue with Google
                </>
              )}
            </button>

            {/* Security badges row */}
            <div className="flex items-center justify-center gap-1 mt-5">
              {SECURITY.map((s, i) => (
                <div key={s.label} className="flex items-center">
                  <div className="flex items-center gap-1.5 text-gray-400 px-2.5">
                    <span className="text-[#1B6B6B]/70">{s.icon}</span>
                    <span className="text-[11.5px] font-medium">{s.label}</span>
                  </div>
                  {i < SECURITY.length - 1 && <span className="w-px h-3 bg-gray-200" aria-hidden />}
                </div>
              ))}
            </div>

            {/* Access notice */}
            <div className="flex items-start gap-2.5 mt-5 p-3.5 bg-gray-50/80 rounded-xl border border-gray-100">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <p className="text-[12px] text-gray-500 leading-relaxed">
                Only authorised accounts can access this platform. Contact your HR admin if you need access.
              </p>
            </div>

            {/* What's new */}
            <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#E1F5EE]">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1B6B6B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </span>
                  <span className="text-[12.5px] font-semibold text-gray-700">What's new</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">May 2026</span>
              </div>
              <ul className="space-y-2.5">
                {[
                  { tag: 'NEW', tagColor: 'bg-[#E1F5EE] text-[#0F6E56]', text: 'Platform analytics dashboard for admins' },
                  { tag: 'IMPROVED', tagColor: 'bg-blue-50 text-blue-700', text: 'Job architecture connector lines & layout' },
                  { tag: 'FIXED', tagColor: 'bg-amber-50 text-amber-700', text: 'Admin user menu clipping in tables' },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-2.5">
                    <span className={`text-[9.5px] font-bold tracking-wider px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${item.tagColor}`}>
                      {item.tag}
                    </span>
                    <span className="text-[12px] text-gray-600 leading-relaxed">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Support shortcut */}
            <a
              href="mailto:support@attendx.in?subject=Access%20request"
              className="group mt-3 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-gray-100 hover:border-[#1B6B6B]/30 hover:bg-[#1B6B6B]/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-[#1B6B6B]/8 flex items-center justify-center flex-shrink-0 ring-1 ring-[#1B6B6B]/10">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-800 leading-tight">Trouble signing in?</p>
                  <p className="text-[11.5px] text-gray-400 mt-0.5 truncate">Reach out to your HR admin or support team</p>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </a>

            {/* Footer */}
            <div className="mt-8 flex flex-col items-center gap-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 ring-1 ring-emerald-100">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-500" />
                </span>
                <span className="text-[10.5px] font-medium text-emerald-700">All systems operational</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[11.5px] text-gray-300">
                <span>© 2026 AttendX</span>
                <span aria-hidden>·</span>
                <span>HR Platform</span>
                <span aria-hidden>·</span>
                <span>Made in India</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
        @keyframes loginSpin { to { transform: rotate(360deg); } }
        @keyframes loginRise {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
