import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS, getNavItems } from '../utils/roles';

export default function Unauthorized() {
  const navigate = useNavigate();
  const { userRole, companyId, currentUser, signOut } = useAuth();
  const email = currentUser?.email ?? '';
  const roleLabel = userRole ? ROLE_LABELS[userRole] || userRole : null;

  const detailMessage = !userRole
    ? `${email || 'This account'} is not set up as a user in AttendX. Please contact your administrator.`
    : !companyId
      ? `Your account (${roleLabel || userRole}) is not assigned to a company. Please contact your administrator.`
      : `You don't have permission to access this page.`;

  const navItems = getNavItems(userRole === 'admin' ? 'admin' : userRole);
  const paths = navItems.map((i) => i.to).filter((to) => to !== 'dashboard');

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Sign out failed', err);
    }
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-lg text-center border border-gray-100">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">🔒</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Access Restricted</h2>
        <p className="text-sm text-gray-500 mb-4">{detailMessage}</p>
        <p className="text-xs text-gray-400 mb-6">
          Signed in as: {email || '—'}
          {userRole && ` · Role: ${roleLabel || userRole}`}
        </p>
        {userRole && companyId && paths.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-4 text-left mb-6 border border-gray-100">
            <p className="text-xs font-medium text-gray-600 mb-2">You can open:</p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• Dashboard</li>
              {paths.map((p) => (
                <li key={p}>
                  • {navItems.find((n) => n.to === p)?.label || p}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]"
          >
            Sign Out & Try Again
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full py-2.5 text-[#1B6B6B] rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
