/* eslint-disable react-refresh/only-export-components */
// Context files intentionally export multiple values — fast refresh limitation accepted for provider files.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

const CompanyContext = createContext(null);

export function CompanyProvider({ children, companyIdFromRoute }) {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(!!companyIdFromRoute);

  useEffect(() => {
    if (!companyIdFromRoute) {
      const id = requestAnimationFrame(() => {
        setCompany(null);
        setLoading(false);
      });
      return () => cancelAnimationFrame(id);
    }

    let unsub = null;
    const id = requestAnimationFrame(() => {
      setLoading(true);
      unsub = onSnapshot(
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
    });

    return () => {
      cancelAnimationFrame(id);
      if (unsub) unsub();
    };
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
