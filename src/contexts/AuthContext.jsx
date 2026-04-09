/* eslint-disable react-refresh/only-export-components */
// Context files intentionally export multiple values — fast refresh limitation accepted for provider files.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase/config';
import { PLATFORM_CONFIG } from '../config/constants';
import { setSentryUser } from '../utils/sentry';
import { trackLogin, trackLogout } from '../utils/analytics';

const AuthContext = createContext(null);

export function roleNeedsDriveAccess(r) {
  return !!r && PLATFORM_CONFIG.DRIVE_UPLOAD_ROLES.includes(r);
}

/** Drive access token still within stored expiry window (55 min buffer) */
export function isTokenValid() {
  try {
    const expiry = localStorage.getItem('gat_expiry');
    if (!expiry) return false;
    return Date.now() < parseInt(expiry, 10);
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [googleAccessToken, setGoogleAccessToken] = useState(null);
  const [userPermissions, setUserPermissions] = useState(null);
  const [auditScope, setAuditScope] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser || !firebaseUser.email) {
        setCurrentUser(null);
        setSentryUser(null);
        setRole(null);
        setCompanyId(null);
        setUserPermissions(null);
        setAuditScope(null);
        setGoogleAccessToken(null);
        try {
          localStorage.removeItem('gat');
          localStorage.removeItem('gat_expiry');
        } catch {
          // ignore
        }
        setLoading(false);
        setAuthError('');
        return;
      }

      const checkWhitelist = async () => {
        try {
          const email = firebaseUser.email?.toLowerCase();
          let ref = doc(db, 'users', email || '');
          let snap = await getDoc(ref);
          if (!snap.exists()) {
            ref = doc(db, 'users', firebaseUser.uid);
            snap = await getDoc(ref);
          }

          if (!snap.exists()) {
            await signOut(auth);
            setSentryUser(null);
            setCurrentUser(null);
            setRole(null);
            setCompanyId(null);
            setUserPermissions(null);
            setAuditScope(null);
            setAuthError('Access denied. Contact your HR admin to get access.');
            setLoading(false);
            return;
          }

          const data = snap.data();

          if (data.isActive === false) {
            await signOut(auth);
            setSentryUser(null);
            setCurrentUser(null);
            setRole(null);
            setCompanyId(null);
            setUserPermissions(null);
            setAuditScope(null);
            setAuthError('Your account has been deactivated. Contact HR admin.');
            setLoading(false);
            return;
          }

          setCurrentUser(firebaseUser);
          setSentryUser(firebaseUser);
          setRole(data.role || null);
          setCompanyId(data.companyId ?? null);
          setUserPermissions(data.permissions ?? null);
          setAuditScope(data.auditScope ?? null);
          setAuthError('');
          try {
            const refUsed = snap.ref;
            await updateDoc(refUsed, {
              lastLogin: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            });
          } catch {
            // ignore lastLogin write failures (e.g. rules)
          }
          try {
            try {
              await firebaseUser.getIdTokenResult();
            } catch (tokenErr) {
              console.warn('Could not refresh ID token:', tokenErr);
            }

            const userRole = data.role || null;
            const needsDrive = roleNeedsDriveAccess(userRole);

            if (needsDrive) {
              const stored = localStorage.getItem('gat');
              const expiryStr = localStorage.getItem('gat_expiry');
              const expiry = expiryStr ? parseInt(expiryStr, 10) : null;
              const tokenStillValid = !!(stored && expiry && Date.now() < expiry);

              if (stored && tokenStillValid) {
                setGoogleAccessToken(stored);
              } else {
                try {
                  localStorage.removeItem('gat');
                  localStorage.removeItem('gat_expiry');
                } catch {
                  // ignore
                }
                setGoogleAccessToken(null);
              }
            } else {
              try {
                localStorage.removeItem('gat');
                localStorage.removeItem('gat_expiry');
              } catch {
                // ignore
              }
              setGoogleAccessToken(null);
            }
          } catch {
            setGoogleAccessToken(null);
          }
          setLoading(false);
        } catch (error) {
          console.error('Error checking users whitelist', error);
          await signOut(auth);
          setSentryUser(null);
          setCurrentUser(null);
          setRole(null);
          setCompanyId(null);
          setUserPermissions(null);
          setAuditScope(null);
          setAuthError('Access denied. Contact your HR admin to get access.');
          setLoading(false);
        }
      };

      setLoading(true);
      checkWhitelist();
    });

    return () => unsubscribe();
  }, []);

  const persistDriveToken = useCallback((accessToken) => {
    if (!accessToken) return;
    setGoogleAccessToken(accessToken);
    try {
      localStorage.setItem('gat', accessToken);
      const expiry = Date.now() + PLATFORM_CONFIG.DRIVE_TOKEN_EXPIRY_MS;
      localStorage.setItem('gat_expiry', String(expiry));
    } catch {
      // ignore
    }
  }, []);

  const getValidToken = useCallback(async () => {
    if (!roleNeedsDriveAccess(role)) {
      return null;
    }

    try {
      const stored = localStorage.getItem('gat');
      const expiryStr = localStorage.getItem('gat_expiry');
      const expiry = expiryStr ? parseInt(expiryStr, 10) : 0;
      if (stored && expiry && Date.now() < expiry) {
        setGoogleAccessToken(stored);
        return stored;
      }
    } catch {
      /* ignore */
    }

    try {
      const user = auth.currentUser;
      if (!user) return null;
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;
      if (accessToken) {
        persistDriveToken(accessToken);
        return accessToken;
      }
    } catch (e) {
      console.error('Token refresh failed:', e);
      return null;
    }
    return null;
  }, [persistDriveToken, role]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError('');
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken ?? null;

    const adminEmail = PLATFORM_CONFIG.ADMIN_EMAIL.toLowerCase();
    if (user?.email?.toLowerCase() === adminEmail) {
      const email = PLATFORM_CONFIG.ADMIN_EMAIL;
      const userRef = doc(db, 'users', email);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email,
          name: user.displayName || 'Krishna Teja',
          photoURL: user.photoURL || '',
          role: 'admin',
          companyId: null,
          isActive: true,
          createdAt: new Date(),
        });
      }
    }

    const emailLower = user?.email?.toLowerCase();
    let userRef = doc(db, 'users', emailLower || '');
    let userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      userRef = doc(db, 'users', user.uid);
      userSnap = await getDoc(userRef);
    }

    const userRole = userSnap.exists() ? userSnap.data()?.role : null;
    const needsDrive = roleNeedsDriveAccess(userRole);

    if (needsDrive && accessToken) {
      persistDriveToken(accessToken);
    } else {
      try {
        localStorage.removeItem('gat');
        localStorage.removeItem('gat_expiry');
      } catch {
        // ignore
      }
      setGoogleAccessToken(null);
    }
    trackLogin();
  }, [persistDriveToken]);

  const signOutUser = useCallback(async () => {
    trackLogout();
    try {
      localStorage.removeItem('gat');
      localStorage.removeItem('gat_expiry');
    } catch {
      // ignore
    }
    setGoogleAccessToken(null);
    setAuditScope(null);
    setSentryUser(null);
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({
      currentUser,
      role,
      userRole: role,
      companyId,
      userPermissions,
      auditScope,
      googleAccessToken,
      getValidToken,
      isTokenValid,
      loading,
      authError,
      signInWithGoogle,
      signOut: signOutUser,
    }),
    [
      currentUser,
      role,
      companyId,
      userPermissions,
      auditScope,
      googleAccessToken,
      getValidToken,
      loading,
      authError,
      signInWithGoogle,
      signOutUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
