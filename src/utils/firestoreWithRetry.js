import { getAuth } from 'firebase/auth';
import { app } from '../firebase/config';

/**
 * Wraps Firestore write/read operations with a single auto-retry after token refresh for auth failures.
 */
export const withRetry = async (operation) => {
  try {
    return await operation();
  } catch (error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    const isAuthError =
      code.includes('permission-denied') || code.includes('unauthenticated') || message.includes('auth');

    if (isAuthError) {
      try {
        const auth = getAuth(app);
        const user = auth.currentUser;
        if (user) {
          await user.getIdToken(true);
          return await operation();
        }
      } catch {
        throw { ...error, _retryFailed: true, _needsReauth: true };
      }
    }

    throw error;
  }
};
