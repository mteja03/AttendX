import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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
      console.error('Sign in error:', error);
    } finally {
      setIsSigningIn(false);
    }
  };

  const busy = isSigningIn || loading;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F0F4F4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle background texture + decorative orbs */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(rgba(27, 107, 107, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '-120px',
          right: '-120px',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #4ECDC420 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-150px',
          left: '-100px',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #1B6B6B15 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Card */}
      <div
        style={{
          background: 'white',
          borderRadius: '24px',
          padding: '52px 48px',
          width: '100%',
          maxWidth: '420px',
          margin: '0 20px',
          boxShadow:
            '0 4px 6px -1px rgba(0,0,0,0.05), 0 20px 60px -10px rgba(27,107,107,0.15)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '20px',
              overflow: 'hidden',
              marginBottom: '20px',
              boxShadow: '0 8px 24px rgba(27,107,107,0.2)',
            }}
          >
            <img
              src="/logo/icon.png"
              alt="AttendX"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '1px',
              marginBottom: '8px',
            }}
          >
            <span
              style={{
                fontSize: '28px',
                fontWeight: '700',
                color: '#1B6B6B',
                letterSpacing: '-0.5px',
              }}
            >
              Attend
            </span>
            <span
              style={{
                fontSize: '28px',
                fontWeight: '700',
                color: '#4ECDC4',
                letterSpacing: '-0.5px',
              }}
            >
              X
            </span>
          </div>

          <p
            style={{
              fontSize: '14px',
              color: '#94A3B8',
              margin: 0,
              letterSpacing: '0.3px',
            }}
          >
            HR Management Platform
          </p>
        </div>

        {idleSignOut && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 text-sm text-amber-700">
            <span>⏰</span>
            <span>You were signed out due to 4 hours of inactivity.</span>
          </div>
        )}

        {/* Divider with text */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              flex: 1,
              height: '1px',
              background: '#E8F0F0',
            }}
          />
          <span
            style={{
              fontSize: '13px',
              color: '#94A3B8',
              whiteSpace: 'nowrap',
            }}
          >
            Sign in to continue
          </span>
          <div
            style={{
              flex: 1,
              height: '1px',
              background: '#E8F0F0',
            }}
          />
        </div>

        {authError ? (
          <p
            style={{
              textAlign: 'center',
              fontSize: '13px',
              color: '#DC2626',
              marginBottom: '16px',
              lineHeight: 1.5,
            }}
          >
            {authError}
          </p>
        ) : null}

        {/* Google Sign In Button */}
        <button
          type="button"
          onClick={handleSignIn}
          disabled={busy}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '14px 24px',
            background: busy ? '#E8F5F5' : '#1B6B6B',
            color: busy ? '#1B6B6B' : 'white',
            border: 'none',
            borderRadius: '14px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: busy ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            letterSpacing: '0.2px',
            boxShadow: busy ? 'none' : '0 4px 14px rgba(27,107,107,0.3)',
          }}
          onMouseEnter={(e) => {
            if (!busy) {
              const t = e.currentTarget;
              t.style.background = '#155858';
              t.style.transform = 'translateY(-1px)';
              t.style.boxShadow = '0 6px 20px rgba(27,107,107,0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!busy) {
              const t = e.currentTarget;
              t.style.background = '#1B6B6B';
              t.style.transform = 'translateY(0)';
              t.style.boxShadow = '0 4px 14px rgba(27,107,107,0.3)';
            }
          }}
        >
          {isSigningIn ? (
            <>
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  border: '2px solid #1B6B6B',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'loginSpin 0.8s linear infinite',
                }}
              />
              Signing in...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"
                />
                <path
                  fill="#34A853"
                  d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"
                />
                <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z" />
                <path
                  fill="#EA4335"
                  d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"
                />
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {/* Footer note */}
        <p
          style={{
            textAlign: 'center',
            fontSize: '12px',
            color: '#B0BEC5',
            marginTop: '20px',
            marginBottom: 0,
            lineHeight: '1.5',
          }}
        >
          Only authorized accounts can access
          <br />
          this platform
        </p>
      </div>

      {/* Bottom brand text */}
      <p
        style={{
          position: 'absolute',
          bottom: '24px',
          fontSize: '12px',
          color: '#94A3B8',
        }}
      >
        © 2026 AttendX · HR Platform
      </p>

      <style>
        {`
        @keyframes loginSpin {
          to { transform: rotate(360deg); }
        }
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
      `}
      </style>
    </div>
  );
}
