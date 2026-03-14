import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { currentUser, loading, signInWithGoogle } = useAuth();
  const { authError } = useAuth();

  if (!loading && currentUser) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error signing in with Google', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 text-white font-semibold tracking-tight text-2xl">
            <span>AX</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-slate-900">AttendX</h1>
            <p className="text-slate-500 text-sm">HR Management Platform</p>
          </div>
        </div>

        <div className="h-px bg-slate-200 mb-6" />

        {authError && (
          <p className="mb-4 text-xs text-red-600 text-center">{authError}</p>
        )}

        <button
          type="button"
          onClick={handleSignIn}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2.5 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 48 48">
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.4 31.9 29.1 35 24 35 16.8 35 11 29.2 11 22S16.8 9 24 9c3.6 0 6.8 1.5 9.1 3.9l5.7-5.7C35.9 3.3 30.3 1 24 1 11.8 1 2 10.8 2 23s9.8 22 22 22 22-9.8 22-22c0-1.5-.1-2.5-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.7 16 18.9 13 24 13c3.6 0 6.8 1.5 9.1 3.9l5.7-5.7C35.9 6.3 30.3 4 24 4 16 4 8.9 8.1 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 42c5-0.1 9.6-2 12.9-5.3l-6-4.9C29.5 33.3 26.9 34.5 24 34.5 19 34.5 14.7 31.4 13 27l-6.6 5C8.9 39.9 15.9 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-1.1 2.9-3.1 5.3-5.9 6.8l.1.1 6 4.9C37 39.7 42 35 43.6 28.5c.4-1.3.6-2.7.6-4.5 0-1.5-.1-2.5-.4-3.5z"
            />
          </svg>
          <span>Sign in with Google</span>
        </button>

        <p className="mt-6 text-[11px] text-slate-500 text-center">
          Only authorized company emails can access this system.
        </p>
      </div>
    </div>
  );
}

