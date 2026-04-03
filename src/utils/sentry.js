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
        'Loading chunk',
        'Loading CSS chunk',
        'Importing a module script failed',
        'Unable to preload CSS',
        /ChunkLoadError/,
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

        // Don't send chunk load errors
        const msg = error?.message || '';
        if (
          msg.includes('Failed to fetch dynamically') ||
          msg.includes('Loading chunk') ||
          msg.includes('Importing a module') ||
          msg.includes('Unable to preload')
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
