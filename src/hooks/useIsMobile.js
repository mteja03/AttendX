import { useState, useEffect } from 'react';

const MQ = '(max-width: 767px)';

/** True when viewport width < 768px (matches Tailwind `md`). */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MQ).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(MQ);
    const handler = () => setIsMobile(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

export default useIsMobile;
