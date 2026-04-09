import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import CompanyLayout from './components/CompanyLayout';
import Login from './pages/Login';
import Unauthorized from './pages/Unauthorized';
import ErrorBoundary from './components/ErrorBoundary';
import PageLoader from './components/PageLoader';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';

const Companies = lazy(() => import('./pages/Companies'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Employees = lazy(() => import('./pages/Employees'));
const Leave = lazy(() => import('./pages/Leave'));
const Documents = lazy(() => import('./pages/Documents'));
const EmployeeProfile = lazy(() => import('./pages/EmployeeProfile'));
const TeamMembers = lazy(() => import('./pages/TeamMembers'));
const Settings = lazy(() => import('./pages/Settings'));
const Assets = lazy(() => import('./pages/Assets'));
const Reports = lazy(() => import('./pages/Reports'));
const Audit = lazy(() => import('./pages/audit/index.jsx'));
const Library = lazy(() => import('./pages/Library'));
const OrgChart = lazy(() => import('./pages/OrgChart'));
const CompanyCalendar = lazy(() => import('./pages/Calendar'));

function ProtectedRoute({ children }) {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <PageLoader fullScreen message="Loading..." />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function RoleRoute({ allowedRoles, children }) {
  const { role, loading } = useAuth();

  if (loading) {
    return <PageLoader fullScreen message="Loading..." />;
  }

  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

function HomeRedirect() {
  const { role, companyId } = useAuth();

  if (role === 'admin') {
    return <Navigate to="/companies" replace />;
  }
  if (role === 'companyadmin' && companyId) {
    return <Navigate to={`/company/${companyId}/dashboard`} replace />;
  }
  if (companyId) {
    return <Navigate to={`/company/${companyId}/dashboard`} replace />;
  }
  return <Navigate to="/companies" replace />;
}

function CompanyIndexRedirect() {
  return <Navigate to="dashboard" replace />;
}

function LoginRoute() {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <PageLoader fullScreen message="Loading..." />;
  }

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  return <Login />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader fullScreen message="Loading..." />}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route
            path="companies"
            element={
              <RoleRoute allowedRoles={['admin']}>
                <ErrorBoundary>
                  <Companies />
                </ErrorBoundary>
              </RoleRoute>
            }
          />
          <Route
            path="admin/users"
            element={
              <RoleRoute allowedRoles={['admin', 'companyadmin']}>
                <ErrorBoundary>
                  <AdminUsers />
                </ErrorBoundary>
              </RoleRoute>
            }
          />
          <Route path="unauthorized" element={<Unauthorized />} />
          <Route path="company/:companyId" element={<CompanyLayout />}>
            <Route index element={<CompanyIndexRedirect />} />
            <Route
              path="dashboard"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager', 'manager', 'itmanager']}>
                  <ErrorBoundary>
                    <Dashboard />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
            <Route
              path="employees"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager', 'manager', 'itmanager']}>
                  <ErrorBoundary>
                    <Employees />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
            <Route
              path="employees/:empId"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager', 'manager', 'itmanager']}>
                  <ErrorBoundary>
                    <EmployeeProfile />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
            <Route
              path="leave"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager', 'manager']}>
                  <ErrorBoundary>
                    <Leave />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
            <Route
              path="calendar"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager', 'manager', 'itmanager']}>
                  <ErrorBoundary>
                    <CompanyCalendar />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
            <Route
              path="documents"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager']}>
                  <ErrorBoundary>
                    <Documents />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
            <Route
              path="policies"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager']}>
                  <ErrorBoundary>
                    <Library />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
            <Route
              path="assets"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager', 'manager', 'itmanager']}>
                  <ErrorBoundary>
                    <Assets />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
            <Route
              path="reports"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager']}>
                  <ErrorBoundary>
                    <Reports />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
            <Route
              path="audit"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager', 'auditmanager', 'auditor']}>
                  <ErrorBoundary>
                    <Audit />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
            <Route
              path="team"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager']}>
                  <ErrorBoundary>
                    <TeamMembers />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
            <Route
              path="orgchart"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager']}>
                  <ErrorBoundary>
                    <OrgChart />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
            <Route
              path="settings"
              element={
                <RoleRoute allowedRoles={['admin', 'companyadmin', 'hrmanager']}>
                  <ErrorBoundary>
                    <Settings />
                  </ErrorBoundary>
                </RoleRoute>
              }
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
