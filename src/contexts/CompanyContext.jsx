import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const CompanyContext = createContext(null);

export function CompanyProvider({ children, companyIdFromRoute }) {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(!!companyIdFromRoute);

  useEffect(() => {
    if (!companyIdFromRoute) {
      setCompany(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getDoc(doc(db, 'companies', companyIdFromRoute))
      .then((snap) => {
        if (!cancelled) {
          setCompany(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        }
      })
      .catch(() => {
        if (!cancelled) setCompany(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [companyIdFromRoute]);

  const value = useMemo(
    () => ({ companyId: companyIdFromRoute, company, companyLoading: loading }),
    [companyIdFromRoute, company, loading],
  );

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  return ctx || { companyId: null, company: null, companyLoading: false };
}
