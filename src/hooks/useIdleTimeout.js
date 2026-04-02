import { useEffect, useRef, useCallback } from 'react';

/** 4 hours idle → warning, then sign-out */
export const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000;
/** Warning appears this many ms before auto sign-out */
export const WARNING_BEFORE_MS = 5 * 60 * 1000;

/**
 * @param {(() => void | Promise<void>) | null} onSignOut
 * @param {(() => void) | null} onWarning
 * @param {(() => void) | null} onActive — e.g. hide warning when user is active again after warning
 */
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
    if (!onSignOut) return undefined;

    const events = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'focus',
    ];

    let lastReset = 0;

    const handleActivity = (e) => {
      if (e?.type === 'visibilitychange' && document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastReset > 60000) {
        lastReset = now;
        resetTimers();
      }
    };

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[IdleTimeout] timers started');
    }

    resetTimers();

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', handleActivity);

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warningTimer.current) clearTimeout(warningTimer.current);
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
      document.removeEventListener('visibilitychange', handleActivity);
    };
  }, [resetTimers, onSignOut]);

  return resetTimers;
}
