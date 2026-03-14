import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import CompanyLayout from './components/CompanyLayout';
import Companies from './pages/Companies';
import AdminUsers from './pages/AdminUsers';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Leave from './pages/Leave';
import Attendance from './pages/Attendance';
import Documents from './pages/Documents';
import TeamMembers from './pages/TeamMembers';
import Settings from './pages/Settings';
import Login from './pages/Login';
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
        <Route path="company/:companyId" element={<CompanyLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="employees" element={<Employees />} />
          <Route path="leave" element={<Leave />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="documents" element={<Documents />} />
          <Route path="team" element={<TeamMembers />} />
          <Route path="settings" element={<Settings />} />
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
