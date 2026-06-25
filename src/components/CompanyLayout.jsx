import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PageLoader from './PageLoader';

export default function CompanyLayout() {
  const { companyId: routeCompanyId } = useParams();
  const { companyId: authCompanyId, currentUser, role, loading } = useAuth();

  if (loading) {
    return <PageLoader fullScreen message="Loading..." />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (role !== 'admin') {
    if (!authCompanyId || !routeCompanyId || authCompanyId !== routeCompanyId) {
      return <Navigate to="/access-restricted" replace />;
    }
  }

  return <Outlet />;
}
