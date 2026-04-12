import { useEffect, useRef, useCallback } from 'react';

/** 4 hours in milliseconds */
export const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/** Warning window length (5 minutes before full idle timeout) — used by IdleWarningBanner countdown */
export const WARNING_BEFORE_MS = 5 * 60 * 1000;

const IDLE_TIME = IDLE_TIMEOUT_MS;

/** Fire warning this many ms after last activity (5 min before sign-out) */
const WARNING_TIME = IDLE_TIME - WARNING_BEFORE_MS;

/** Only genuine user interactions reset the timer — not visibility/focus/mousemove noise */
const USER_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

const listenerOpts = { passive: true };

export function useIdleTimeout({ onWarning, onSignOut, onActive, enabled = true } = {}) {
  const idleTimerRef = useRef(null);
  const warningTimerRef = useRef(null);
  const isWarningRef = useRef(false);

  const onWarningRef = useRef(onWarning);
  const onSignOutRef = useRef(onSignOut);
  const onActiveRef = useRef(onActive);

  useEffect(() => {
    onWarningRef.current = onWarning;
    onSignOutRef.current = onSignOut;
    onActiveRef.current = onActive;
  }, [onWarning, onSignOut, onActive]);

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  }, []);

  const startTimers = useCallback(() => {
    clearTimers();

    warningTimerRef.current = setTimeout(() => {
      isWarningRef.current = true;
      onWarningRef.current?.();
    }, WARNING_TIME);

    idleTimerRef.current = setTimeout(() => {
      onSignOutRef.current?.();
    }, IDLE_TIME);
  }, [clearTimers]);

  const handleUserActivity = useCallback(() => {
    if (isWarningRef.current) {
      isWarningRef.current = false;
      onActiveRef.current?.();
    }
    startTimers();
  }, [startTimers]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      isWarningRef.current = false;
      return undefined;
    }

    startTimers();

    USER_EVENTS.forEach((event) => {
      window.addEventListener(event, handleUserActivity, listenerOpts);
    });

    return () => {
      clearTimers();
      USER_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleUserActivity, listenerOpts);
      });
    };
  }, [enabled, startTimers, clearTimers, handleUserActivity]);

  return { resetTimer: handleUserActivity };
}

export default useIdleTimeout;
