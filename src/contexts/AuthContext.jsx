/* eslint-disable react-refresh/only-export-components */
// Context files intentionally export multiple values — fast refresh limitation accepted for provider files.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase/config';
import { PLATFORM_CONFIG } from '../config/constants';
import { captureError, setSentryUser } from '../utils/sentry';
import { trackLogin, trackLogout } from '../utils/analytics';
import { DEFAULT_PERMISSIONS, VALID_ROLES } from '../utils/roles';

/** Firestore may store companyId as a string or a DocumentReference — always expose a string id in context. */
export function normalizeCompanyId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t || null;
  }
  if (typeof value === 'object' && typeof value.id === 'string' && value.id) {
    return value.id;
  }
  return null;
}

async function resolveUserFromTeamMembers(emailNorm) {
  if (!emailNorm) return { data: null, usersRef: null };
  try {
    const q = query(collectionGroup(db, 'teamMembers'), where('email', '==', emailNorm), limit(10));
    const snap = await getDocs(q);
    if (snap.empty) return { data: null, usersRef: null };
    const activeDoc = snap.docs.find((d) => d.data()?.isActive !== false) || snap.docs[0];
    const tm = activeDoc.data() || {};
    const companyId = activeDoc.ref.parent.parent.id;
    return {
      data: {
        email: tm.email || emailNorm,
        name: tm.name || '',
        role: tm.role,
        companyId,
        auditScope: tm.auditScope ?? null,
        permissions: tm.permissions ?? null,
        isActive: tm.isActive !== false,
        linkedEmployeeId: tm.employeeId || tm.empId || null,
        photoURL: tm.photoURL || '',
      },
      usersRef: null,
      listenRef: activeDoc.ref,
    };
  } catch (e) {
    if (import.meta.env.DEV) console.warn('Team member lookup failed', e);
    return { data: null, usersRef: null, listenRef: null };
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [userPermissions, setUserPermissions] = useState(null);
  const [auditScope, setAuditScope] = useState(null);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let unsubUserDoc = null;
    const cleanupUserDoc = () => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
    };

    const resetAuthState = () => {
      setSentryUser(null);
      setCurrentUser(null);
      setRole(null);
      setCompanyId(null);
      setUserPermissions(null);
      setAuditScope(null);
      setIsCompanyAdmin(false);
    };

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      // Tear down any previous user-doc listener before handling a new auth state.
      cleanupUserDoc();

      if (!firebaseUser || !firebaseUser.email) {
        setCurrentUser(null);
        setSentryUser(null);
        setRole(null);
        setCompanyId(null);
        setUserPermissions(null);
        setAuditScope(null);
        setIsCompanyAdmin(false);
        setLoading(false);
        setAuthError('');
        return;
      }

      const checkWhitelist = async () => {
        try {
          const email = firebaseUser.email?.toLowerCase();
          let userDocRef = null;
          let listenRef = null;
          let listenSource = null; // 'users' | 'teamMember'
          let data = null;

          let ref = doc(db, 'users', email || '');
          let snap = await getDoc(ref);
          if (snap.exists()) {
            userDocRef = snap.ref;
            data = snap.data();
          } else {
            ref = doc(db, 'users', firebaseUser.uid);
            snap = await getDoc(ref);
            if (snap.exists()) {
              userDocRef = snap.ref;
              data = snap.data();
            }
          }

          if (!data && email) {
            try {
              const byEmailField = query(collection(db, 'users'), where('email', '==', email), limit(2));
              const found = await getDocs(byEmailField);
              if (!found.empty) {
                const d = found.docs[0];
                userDocRef = d.ref;
                data = d.data();
              }
            } catch (lookupErr) {
              if (import.meta.env.DEV) console.warn('users collection email field lookup failed', lookupErr);
            }
          }

          if (userDocRef) {
            listenRef = userDocRef;
            listenSource = 'users';
          }

          if (!data) {
            const tmRes = await resolveUserFromTeamMembers(email);
            if (tmRes.data) {
              data = tmRes.data;
              userDocRef = tmRes.usersRef;
              if (tmRes.listenRef) {
                listenRef = tmRes.listenRef;
                listenSource = 'teamMember';
              }
            }
          }

          if (!data) {
            await signOut(auth);
            resetAuthState();
            setAuthError('Access denied. Contact your HR admin to get access.');
            setLoading(false);
            return;
          }

          // One-time fallback: auditmanager missing scope → pull from teamMembers and patch users doc.
          let fallbackScope = null;
          if ((data.auditScope == null || data.auditScope === '') && data.role === 'auditmanager') {
            try {
              const tmQuery = query(collectionGroup(db, 'teamMembers'), where('email', '==', email), limit(1));
              const tmSnap = await getDocs(tmQuery);
              if (!tmSnap.empty) {
                const tmData = tmSnap.docs[0].data();
                if (tmData.auditScope) {
                  fallbackScope = tmData.auditScope;
                  if (userDocRef) {
                    updateDoc(userDocRef, { auditScope: tmData.auditScope }).catch(() => {});
                  }
                }
              }
            } catch {
              // ignore
            }
          }

          // Normalize a raw snapshot (users doc or teamMember doc) into the fields we consume.
          const transformSnap = (snapshot) => {
            if (listenSource === 'teamMember') {
              const tm = snapshot.data() || {};
              return {
                role: tm.role,
                companyId: snapshot.ref.parent.parent.id,
                auditScope: tm.auditScope ?? null,
                permissions: tm.permissions ?? null,
                isActive: tm.isActive !== false,
              };
            }
            const raw = snapshot.data() || {};
            return {
              role: raw.role,
              companyId: raw.companyId,
              auditScope: raw.auditScope ?? null,
              permissions: raw.permissions ?? null,
              isActive: raw.isActive !== false,
            };
          };

          // Applies role/permissions/companyId/auditScope/isActive. Returns false (and signs out)
          // when the account is deactivated or the role becomes invalid.
          const applyUserData = (d) => {
            const companyAdminRole = d.role === 'companyadmin';
            const roleVal = d.role || null;

            if (d.isActive === false) {
              signOut(auth).catch(() => {});
              resetAuthState();
              setAuthError('Your account has been deactivated. Contact HR admin.');
              setLoading(false);
              return false;
            }

            if (!roleVal || !VALID_ROLES.includes(roleVal)) {
              signOut(auth).catch(() => {});
              resetAuthState();
              setAuthError('Access denied. Contact your HR admin to get access.');
              setLoading(false);
              return false;
            }

            const resolvedCompanyId = normalizeCompanyId(d.companyId);
            setCurrentUser(firebaseUser);
            setSentryUser(firebaseUser);
            setRole(roleVal);
            setCompanyId(resolvedCompanyId || null);
            // Fixed-permission roles always use defaults — ignore any saved permissions
            // so stale permissions from a previous role don't bleed through.
            const FIXED_PERMISSION_ROLES = ['auditor', 'itmanager', 'auditmanager'];
            const resolvedPermissions = FIXED_PERMISSION_ROLES.includes(roleVal)
              ? DEFAULT_PERMISSIONS[roleVal] ?? {}
              : d.permissions ?? DEFAULT_PERMISSIONS[roleVal] ?? {};
            setUserPermissions(resolvedPermissions);
            let resolvedScope = d.auditScope != null && d.auditScope !== '' ? d.auditScope : null;
            if (!resolvedScope && roleVal === 'auditmanager') resolvedScope = fallbackScope;
            setAuditScope(resolvedScope);
            setIsCompanyAdmin(companyAdminRole);
            setAuthError('');
            return true;
          };

          // Initial apply from the doc we just resolved.
          const applied = applyUserData({
            role: data.role,
            companyId: data.companyId,
            auditScope: data.auditScope ?? null,
            permissions: data.permissions ?? null,
            isActive: data.isActive !== false,
          });
          if (!applied) return;

          // One-time side effects: lastLogin write.
          if (userDocRef) {
            try {
              await updateDoc(userDocRef, {
                lastLogin: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
              });
            } catch {
              // ignore lastLogin write failures (e.g. rules)
            }
          }
          setLoading(false);

          // Live listener: role/permissions/isActive changes propagate without re-login.
          if (listenRef) {
            unsubUserDoc = onSnapshot(
              listenRef,
              (snapshot) => {
                if (!snapshot.exists()) {
                  signOut(auth).catch(() => {});
                  resetAuthState();
                  setAuthError('Your account has been removed. Contact your HR admin.');
                  return;
                }
                applyUserData(transformSnap(snapshot));
              },
              (listenErr) => {
                if (import.meta.env.DEV) console.warn('User doc live listener error', listenErr);
              },
            );
          }
        } catch (error) {
          captureError(error, { context: 'checkWhitelist' });
          if (import.meta.env.DEV) {
            if (import.meta.env.DEV) console.error('Error checking users whitelist', error);
          }
          await signOut(auth);
          resetAuthState();
          setAuthError('Access denied. Contact your HR admin to get access.');
          setLoading(false);
        }
      };

      setLoading(true);
      checkWhitelist();
    });

    return () => {
      cleanupUserDoc();
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError('');
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
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
          createdAt: serverTimestamp(),
        });
      }
    }
    trackLogin();
  }, []);

  const signOutUser = useCallback(async () => {
    trackLogout();
    setAuditScope(null);
    setIsCompanyAdmin(false);
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
      isCompanyAdmin,
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
      isCompanyAdmin,
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
