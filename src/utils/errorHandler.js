import { captureError } from './sentry';

/**
 * Detects Firebase/network error type
 * and returns a user-friendly message key.
 */
export const getErrorMessage = (error) => {
  if (!error) return 'unknown_error';

  const code = error?.code || '';
  const message = error?.message || '';
  const combined = `${code}${message}`.toLowerCase();

  if (
    combined.includes('unauthenticated') ||
    combined.includes('auth/id-token-expired') ||
    combined.includes('auth/user-token-expired') ||
    combined.includes('auth/requires-recent-login') ||
    combined.includes('not authenticated')
  ) {
    return 'auth_expired';
  }

  // Permission issue — user is logged in
  // but lacks access to this resource
  if (
    combined.includes('permission-denied') ||
    combined.includes('unauthorized') ||
    combined.includes('missing or insufficient')
  ) {
    return 'permission_denied';
  }

  if (
    combined.includes('network') ||
    combined.includes('offline') ||
    combined.includes('unavailable') ||
    combined.includes('failed to fetch') ||
    combined.includes('net::err')
  ) {
    return 'network_error';
  }

  if (
    combined.includes('quota') ||
    combined.includes('resource-exhausted') ||
    combined.includes('too-many-requests')
  ) {
    return 'quota_error';
  }

  if (combined.includes('not-found') || combined.includes('does not exist')) {
    return 'not_found';
  }

  return 'unknown_error';
};

export const ERROR_MESSAGES = {
  auth_expired: {
    title: 'Session Expired',
    message: 'Your session has expired. Please sign out and sign in again.',
    action: 'Sign Out',
    actionType: 'signout',
    icon: '🔐',
  },
  permission_denied: {
    title: 'Access Restricted',
    message: "You don't have permission to perform this action. Contact your admin if you think this is a mistake.",
    action: 'OK',
    actionType: 'dismiss',
    icon: '🔒',
  },
  network_error: {
    title: 'No Connection',
    message: 'Unable to reach the server. Please check your internet connection and try again.',
    action: 'Retry',
    actionType: 'retry',
    icon: '📡',
  },
  quota_error: {
    title: 'Too Many Requests',
    message: 'Too many requests. Please wait a moment and try again.',
    action: 'OK',
    actionType: 'dismiss',
    icon: '⏳',
  },
  not_found: {
    title: 'Not Found',
    message: 'The record you are looking for no longer exists.',
    action: 'Go Back',
    actionType: 'back',
    icon: '🔍',
  },
  unknown_error: {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again.',
    action: 'Retry',
    actionType: 'retry',
    icon: '⚠️',
  },
};

/**
 * Logs error to Firestore for admin review.
 */
export const logError = async (error, context = {}) => {
  captureError(error, context);
  try {
    const { getAuth } = await import('firebase/auth');
    const { getFirestore, collection, addDoc } = await import('firebase/firestore');
    const { app } = await import('../firebase/config');

    const auth = getAuth(app);
    const db = getFirestore(app);
    const user = auth.currentUser;

    await addDoc(collection(db, 'errorLogs'), {
      timestamp: new Date(),
      ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      errorCode: error?.code || 'unknown',
      errorMessage: error?.message || String(error),
      context: {
        page: window.location.pathname,
        userEmail: user?.email || 'unknown',
        companyId: context.companyId || null,
        action: context.action || null,
        ...context,
      },
      userAgent: navigator.userAgent,
      url: window.location.href,
    });
  } catch (logErr) {
    console.error('Error logging failed:', logErr);
  }
};
