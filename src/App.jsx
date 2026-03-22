import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import CompanyLayout from './components/CompanyLayout';
import Companies from './pages/Companies';
import AdminUsers from './pages/AdminUsers';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Leave from './pages/Leave';
import Documents from './pages/Documents';
import EmployeeProfile from './pages/EmployeeProfile';
import TeamMembers from './pages/TeamMembers';
import Settings from './pages/Settings';
import Assets from './pages/Assets';
import Reports from './pages/Reports';
import Library from './pages/Library';
import OrgChart from './pages/OrgChart';
import CompanyCalendar from './pages/Calendar';
import Login from './pages/Login';
import Unauthorized from './pages/Unauthorized';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';

function ProtectedRoute({ children }) {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f1f5f9]">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function RoleRoute({ allowedRoles, children }) {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f1f5f9]">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
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
  if (companyId) {
    return <Navigate to={`/company/${companyId}/dashboard`} replace />;
  }
  return <Navigate to="/companies" replace />;
}

function LoginRoute() {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f1f5f9]">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  return <Login />;
}

function AppRoutes() {
  return (
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
        <Route path="companies" element={<Companies />} />
        <Route path="admin/users" element={<AdminUsers />} />
        <Route path="unauthorized" element={<Unauthorized />} />
        <Route path="company/:companyId" element={<CompanyLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <RoleRoute allowedRoles={['admin', 'hrmanager', 'manager', 'itmanager']}>
                <Dashboard />
              </RoleRoute>
            }
          />
          <Route
            path="employees"
            element={
              <RoleRoute allowedRoles={['admin', 'hrmanager', 'manager', 'itmanager']}>
                <Employees />
              </RoleRoute>
            }
          />
          <Route
            path="employees/:empId"
            element={
              <RoleRoute allowedRoles={['admin', 'hrmanager', 'manager', 'itmanager']}>
                <EmployeeProfile />
              </RoleRoute>
            }
          />
          <Route
            path="leave"
            element={
              <RoleRoute allowedRoles={['admin', 'hrmanager', 'manager']}>
                <Leave />
              </RoleRoute>
            }
          />
          <Route
            path="calendar"
            element={
              <RoleRoute allowedRoles={['admin', 'hrmanager', 'manager', 'itmanager']}>
                <CompanyCalendar />
              </RoleRoute>
            }
          />
          <Route
            path="documents"
            element={
              <RoleRoute allowedRoles={['admin', 'hrmanager']}>
                <Documents />
              </RoleRoute>
            }
          />
          <Route
            path="policies"
            element={
              <RoleRoute allowedRoles={['admin', 'hrmanager']}>
                <Library />
              </RoleRoute>
            }
          />
          <Route
            path="assets"
            element={
              <RoleRoute allowedRoles={['admin', 'hrmanager', 'manager', 'itmanager']}>
                <Assets />
              </RoleRoute>
            }
          />
          <Route
            path="reports"
            element={
              <RoleRoute allowedRoles={['admin', 'hrmanager']}>
                <Reports />
              </RoleRoute>
            }
          />
          <Route
            path="team"
            element={
              <RoleRoute allowedRoles={['admin', 'hrmanager']}>
                <TeamMembers />
              </RoleRoute>
            }
          />
          <Route
            path="orgchart"
            element={
              <RoleRoute allowedRoles={['admin', 'hrmanager']}>
                <OrgChart />
              </RoleRoute>
            }
          />
          <Route
            path="settings"
            element={
              <RoleRoute allowedRoles={['admin', 'hrmanager']}>
                <Settings />
              </RoleRoute>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
