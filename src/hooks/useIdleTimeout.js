import { useEffect, useRef, useCallback } from 'react';

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const WARNING_BEFORE_MS = 5 * 60 * 1000;

export function useIdleTimeout(onSignOut, onWarning, onActive) {
  const idleTimer = useRef(null);
  const warningTimer = useRef(null);
  const warningShown = useRef(false);

  const onSignOutRef = useRef(onSignOut);
  const onWarningRef = useRef(onWarning);
  const onActiveRef = useRef(onActive);
  onSignOutRef.current = onSignOut;
  onWarningRef.current = onWarning;
  onActiveRef.current = onActive;

  const resetTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);

    if (warningShown.current) {
      warningShown.current = false;
      onActiveRef.current?.();
    }

    warningTimer.current = setTimeout(() => {
      warningShown.current = true;
      onWarningRef.current?.();
    }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);

    idleTimer.current = setTimeout(() => {
      onSignOutRef.current?.();
    }, IDLE_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'focus'];

    let lastReset = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastReset > 60000) {
        lastReset = now;
        resetTimers();
      }
    };

    resetTimers();

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        resetTimers();
      }
    };
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warningTimer.current) clearTimeout(warningTimer.current);
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [resetTimers]);

  return resetTimers;
}
