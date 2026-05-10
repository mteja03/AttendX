import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const FEATURES = [
  {
    title: 'Employee management',
    sub: 'Full lifecycle — hire to exit',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    title: 'Audit workflows',
    sub: 'Internal & external, end-to-end',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: 'Documents & assets',
    sub: 'Organised, always accessible',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
  {
    label: 'Google OAuth',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    label: 'No passwords stored',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <div className="min-h-screen flex" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── LEFT BRANDING PANEL (desktop only) ── */}
      <div
        className="hidden lg:flex lg:w-[56%] flex-col justify-between p-14"
        style={{ background: '#0B3D3D' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border border-white/10">
            <img
              src="/logo/icon.png"
              alt="AttendX"
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>
          <span className="text-xl font-semibold tracking-tight text-white">
            Attend<span style={{ color: '#5DCAA5' }}>X</span>
          </span>
        </div>

        {/* Hero copy */}
        <div>
          <h1
            className="font-semibold leading-tight mb-4 text-white"
            style={{ fontSize: '38px', letterSpacing: '-0.5px' }}
          >
            All your HR,<br />in one place.
          </h1>
          <p className="text-base mb-10 leading-relaxed" style={{ color: '#9FE1CB', maxWidth: '300px' }}>
            A complete HRIS for Indian businesses — from day one to exit.
          </p>

          <div className="flex flex-col gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-center gap-4">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#9FE1CB' }}
                >
                  {f.icon}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: '#E1F5EE' }}>{f.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#5DCAA5' }}>{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trusted by */}
        <div>
          <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Trusted by</p>
          <div className="flex items-center gap-2 flex-wrap">
            {['PPFC/WZ', 'SB Motors', 'SB Ventures'].map((name) => (
              <span
                key={name}
                className="text-xs px-3 py-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.45)' }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT LOGIN PANEL ── */}
      <div className="flex-1 flex flex-col bg-white">

        {/* Mobile top bar */}
        <div className="flex lg:hidden items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0" style={{ background: '#1B6B6B' }}>
            <img
              src="/logo/icon.png"
              alt="AttendX"
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <span className="text-base font-semibold" style={{ color: '#1B6B6B' }}>
            Attend<span style={{ color: '#4ECDC4' }}>X</span>
          </span>
        </div>

        {/* Centered login form */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-[340px]">

            {/* Heading */}
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-1.5 hidden lg:block">
                Welcome back
              </h2>
              <h2 className="text-2xl font-semibold text-gray-900 mb-1.5 lg:hidden text-center">
                Sign in to AttendX
              </h2>
              <p className="text-sm text-gray-500 hidden lg:block">
                Sign in with your work Google account to continue.
              </p>
              <p className="text-sm text-gray-500 lg:hidden text-center">
                Use your authorised Google account.
              </p>
            </div>

            {/* Idle warning */}
            {idleSignOut && (
              <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-100 rounded-xl mb-4">
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
              <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-xl mb-4">
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
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl text-sm font-semibold transition-colors"
              style={{
                background: busy ? '#E8F5F5' : '#1B6B6B',
                color: busy ? '#1B6B6B' : '#ffffff',
                cursor: busy ? 'not-allowed' : 'pointer',
                boxShadow: busy ? 'none' : '0 2px 12px rgba(27,107,107,0.22)',
              }}
              onMouseEnter={(e) => {
                if (!busy) e.currentTarget.style.background = '#155858';
              }}
              onMouseLeave={(e) => {
                if (!busy) e.currentTarget.style.background = '#1B6B6B';
              }}
            >
              {isSigningIn ? (
                <>
                  <span
                    className="w-4 h-4 rounded-full border-2 border-[#1B6B6B] border-t-transparent"
                    style={{ animation: 'loginSpin 0.7s linear infinite', display: 'inline-block' }}
                    aria-hidden="true"
                  />
                  Signing in...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                    <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                    <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
                    <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18z"/>
                    <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            {/* Security badges */}
            <div className="flex items-center justify-center gap-5 mt-5">
              {SECURITY.map((s) => (
                <div key={s.label} className="flex items-center gap-1.5 text-gray-400">
                  {s.icon}
                  <span className="text-xs">{s.label}</span>
                </div>
              ))}
            </div>

            {/* Access notice */}
            <div className="flex items-start gap-2 mt-5 p-3.5 bg-gray-50 rounded-xl border border-gray-100">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <p className="text-xs text-gray-500 leading-relaxed">
                Only authorised accounts can access this platform. Contact your HR admin if you need access.
              </p>
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-gray-300 mt-8">
              © 2026 AttendX · HR Platform
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
        @keyframes loginSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}