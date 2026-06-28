import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PublicLayout from './PublicLayout';

export default function PublicRoute({ children }) {
  const { currentUser, loading, companyId } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: '#1B6B6B' }} />
      </div>
    );
  }

  if (currentUser && companyId) {
    return <Navigate to={`/company/${companyId}/dashboard`} replace />;
  }

  if (currentUser) {
    return <Navigate to="/companies" replace />;
  }

  return <PublicLayout>{children}</PublicLayout>;
}
