import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [googleAccessToken, setGoogleAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser || !firebaseUser.email) {
        setCurrentUser(null);
        setRole(null);
        setCompanyId(null);
        setGoogleAccessToken(null);
        try {
          localStorage.removeItem('gat');
          localStorage.removeItem('gat_expiry');
        } catch (_) {
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
            setCurrentUser(null);
            setRole(null);
            setCompanyId(null);
            setAuthError('Access denied. Contact your HR admin to get access.');
            setLoading(false);
            return;
          }

          const data = snap.data();

          if (data.isActive === false) {
            await signOut(auth);
            setCurrentUser(null);
            setRole(null);
            setCompanyId(null);
            setAuthError('Your account has been deactivated. Contact HR admin.');
            setLoading(false);
            return;
          }

          setCurrentUser(firebaseUser);
          setRole(data.role || null);
          setCompanyId(data.companyId ?? null);
          setAuthError('');
          try {
            // Refresh auth state and restore Drive token if still valid
            try {
              await firebaseUser.getIdTokenResult();
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('Could not refresh ID token:', e);
            }

            const stored = localStorage.getItem('gat');
            const expiryStr = localStorage.getItem('gat_expiry');
            const expiry = expiryStr ? parseInt(expiryStr, 10) : null;
            const isValid = stored && expiry && Date.now() < expiry;

            if (isValid) {
              setGoogleAccessToken(stored);
            } else {
              try {
                localStorage.removeItem('gat');
                localStorage.removeItem('gat_expiry');
              } catch (_) {
                // ignore
              }
              setGoogleAccessToken(null);
            }
          } catch (_) {
            setGoogleAccessToken(null);
          }
          setLoading(false);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Error checking users whitelist', error);
          await signOut(auth);
          setCurrentUser(null);
          setRole(null);
          setCompanyId(null);
          setAuthError('Access denied. Contact your HR admin to get access.');
          setLoading(false);
        }
      };

      setLoading(true);
      checkWhitelist();
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError('');
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;
    if (accessToken) {
      setGoogleAccessToken(accessToken);
      try {
        localStorage.setItem('gat', accessToken);
        const expiry = Date.now() + 55 * 60 * 1000;
        localStorage.setItem('gat_expiry', expiry.toString());
      } catch (_) {
        // ignore
      }
    }

    if (user?.email?.toLowerCase() === 'mteja0852@gmail.com') {
      const email = 'mteja0852@gmail.com';
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
  };

  const signOutUser = async () => {
    try {
      localStorage.removeItem('gat');
      localStorage.removeItem('gat_expiry');
    } catch (_) {
      // ignore
    }
    setGoogleAccessToken(null);
    await signOut(auth);
  };

  const value = useMemo(
    () => ({
      currentUser,
      role,
      companyId,
      googleAccessToken,
      loading,
      authError,
      signInWithGoogle,
      signOut: signOutUser,
    }),
    [currentUser, role, companyId, googleAccessToken, loading, authError],
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

