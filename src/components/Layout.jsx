import { Outlet, useMatch } from 'react-router-dom';
import Sidebar from './Sidebar';
import { CompanyProvider } from '../contexts/CompanyContext';

export default function Layout() {
  const companyMatch = useMatch('/company/:companyId/*');
  const companyIdFromRoute = companyMatch?.params?.companyId ?? null;

  return (
    <CompanyProvider companyIdFromRoute={companyIdFromRoute}>
      <div className="flex min-h-screen bg-[#f1f5f9]">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </CompanyProvider>
  );
}
