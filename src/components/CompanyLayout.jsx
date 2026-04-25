import { Outlet } from 'react-router-dom';
import GlobalHeader from './GlobalHeader';

export default function CompanyLayout() {
  return (
    <>
      <GlobalHeader />
      <Outlet />
    </>
  );
}
