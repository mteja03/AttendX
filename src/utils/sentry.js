import * as Sentry from '@sentry/react';

export const initSentry = () => {
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      release: 'attendx@1.0.0',
      enabled: import.meta.env.PROD,
      tracesSampleRate: 0.2,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection',
        'Network request failed',
        'Load failed',
        // Chunk load errors after deploy
        'Failed to fetch dynamically imported module',
        'error loading dynamically imported module',
        'Loading chunk',
        'Loading CSS chunk',
        'Importing a module script failed',
        'Unable to preload CSS',
        /ChunkLoadError/,
        // Firebase network blips — user-side, not a bug
        'Failed to get document because the client is offline',
        'Could not reach Cloud Firestore backend',
        'The operation could not be completed',
      ],
      beforeSend(event, hint) {
        const error = hint.originalException;

        // Don't send auth errors
        if (
          error?.code?.includes('permission-denied') ||
          error?.code?.includes('unauthenticated')
        ) {
          return null;
        }

        // Check message on both hint.originalException AND event exception values
        // (handled errors caught by React error boundaries have different shapes)
        const msg = error?.message || '';
        const allMsgs = [
          msg,
          ...(event?.exception?.values?.map((v) => v.value || '') || []),
        ].join(' ');

        // Don't send chunk load errors (any browser/shape variant)
        if (
          allMsgs.includes('Failed to fetch dynamically') ||
          allMsgs.includes('error loading dynamically imported module') ||
          allMsgs.includes('Loading chunk') ||
          allMsgs.includes('Importing a module') ||
          allMsgs.includes('Unable to preload') ||
          allMsgs.includes('dynamically imported module')
        ) {
          return null;
        }

        // Firebase offline / network blips
        if (
          allMsgs.includes('client is offline') ||
          allMsgs.includes('Could not reach Cloud Firestore') ||
          error?.code === 'unavailable'
        ) {
          return null;
        }

        return event;
      },
    });
  }
};

export const setSentryUser = (user) => {
  if (user) {
    Sentry.setUser({ email: user.email, id: user.uid });
  } else {
    Sentry.setUser(null);
  }
};

export const captureError = (error, context = {}) => {
  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });
    Sentry.captureException(error);
  });
};

export const safeAsync = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    captureError(error, { context: fn?.name || 'anonymous_async_handler' });
    throw error;
  }
};
