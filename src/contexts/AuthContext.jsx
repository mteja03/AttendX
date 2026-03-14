import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser || !firebaseUser.email) {
        setCurrentUser(null);
        setRole(null);
        setCompanyId(null);
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
    await signOut(auth);
  };

  const value = useMemo(
    () => ({
      currentUser,
      role,
      companyId,
      loading,
      authError,
      signInWithGoogle,
      signOut: signOutUser,
    }),
    [currentUser, role, companyId, loading, authError],
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

