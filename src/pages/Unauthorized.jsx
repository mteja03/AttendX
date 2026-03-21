import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_LABELS, getNavItems } from '../utils/roles';

export default function Unauthorized() {
  const navigate = useNavigate();
  const { userRole, companyId } = useAuth();
  const label = ROLE_LABELS[userRole] || userRole || 'User';
  const navItems = getNavItems(userRole === 'admin' ? 'admin' : userRole);
  const paths = navItems.map((i) => i.to).filter((to) => to !== 'dashboard');

  return (
    <div className="text-center py-16 px-4 max-w-lg mx-auto">
      <p className="text-5xl mb-4">🔒</p>
      <h1 className="text-xl font-semibold text-gray-800 mb-2">Access Restricted</h1>
      <p className="text-gray-500 mb-6">You don&apos;t have permission to view this page.</p>
      <div className="bg-gray-50 rounded-xl p-4 max-w-sm mx-auto mb-6 text-left">
        <p className="text-sm font-medium text-gray-700 mb-2">Your role: {label}</p>
        <p className="text-sm text-gray-500 mb-3">Contact your HR Admin to request additional access.</p>
        {companyId && paths.length > 0 && (
          <div className="border-t border-gray-200 pt-3 mt-3">
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
      </div>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="px-6 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]"
      >
        Go Back
      </button>
    </div>
  );
}
