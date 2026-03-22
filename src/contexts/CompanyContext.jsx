import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

const CompanyContext = createContext(null);

export function CompanyProvider({ children, companyIdFromRoute }) {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(!!companyIdFromRoute);

  useEffect(() => {
    if (!companyIdFromRoute) {
      setCompany(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'companies', companyIdFromRoute),
      (snap) => {
        if (snap.exists()) {
          setCompany({ id: snap.id, ...snap.data() });
        } else {
          setCompany(null);
        }
        setLoading(false);
      },
      () => {
        setCompany(null);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [companyIdFromRoute]);

  const value = useMemo(
    () => ({ companyId: companyIdFromRoute, company, companyLoading: loading }),
    [companyIdFromRoute, company, loading],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  return ctx || { companyId: null, company: null, companyLoading: false };
}
