import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { auth, googleAuthProvider, isFirebaseConfigured } from '@/lib/firebase';
import { pickFirebasePhotoUrl } from '@/lib/profilePrompt';
import {
  ALLOWED_AUTH_EMAIL_DOMAIN,
  DOMAIN_BLOCKING_ERROR_CODE,
  isSignInEmailAllowed,
} from '@/lib/authPolicy';

/** Used when Firebase env vars are missing (local development without cloud auth). */
export const LOCAL_DEV_USER = {
  full_name: 'Local User',
  email: 'user@localhost.local',
  photoURL: null,
  uid: null,
};

function mapFirebaseUser(u) {
  if (!u) return null;
  return {
    full_name: u.displayName || u.email?.split('@')[0] || 'User',
    email: u.email || '',
    photoURL: pickFirebasePhotoUrl(u),
    uid: u.uid,
  };
}

/** User-facing message for Firebase Auth errors (email/password). */
function emailAuthErrorMessage(e) {
  const code = e?.code;
  const byCode = {
    'auth/email-already-in-use': 'That email is already registered. Sign in instead.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a stronger password (at least 6 characters).',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/operation-not-allowed': 'Email/password sign-in is not enabled for this project.',
  };
  if (
    code === 'auth/internal-error' &&
    (e?.message?.includes(DOMAIN_BLOCKING_ERROR_CODE) || e?.message?.includes('Cloud Function'))
  ) {
    return `Sign in with your @${ALLOWED_AUTH_EMAIL_DOMAIN} account. This account is not allowed on Huddl.`;
  }
  return byCode[code] || e?.message || 'Could not complete sign-in.';
}

/** User-facing message for Google sign-in (popup / OAuth). */
function googleAuthErrorMessage(e) {
  const code = e?.code;
  if (code === 'auth/unauthorized-domain') {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return (
      `This domain isn’t authorized for sign-in. In Firebase Console → Authentication → Settings → Authorized domains, add “${host}”. ` +
      `If you use 127.0.0.1 for local dev, add that too (not the same as localhost). Production: add your Hosting domain (e.g. huddle-ab42f.web.app).`
    );
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Google sign-in is disabled. In Firebase Console → Authentication → Sign-in method, enable Google.';
  }
  if (code === 'auth/popup-blocked') {
    return 'The browser blocked the sign-in window. Allow popups for this site and try again.';
  }
  if (code === 'auth/internal-error') {
    return `Sign in with your @${ALLOWED_AUTH_EMAIL_DOMAIN} Google account. This account is not allowed on Huddl.`;
  }
  return e?.message || 'Could not sign in with Google.';
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  /** Bumps when `reload(auth.currentUser)` runs so `sessionUser` recomputes (User mutates in place). */
  const [sessionRefreshTick, setSessionRefreshTick] = useState(0);
  const [authReady, setAuthReady] = useState(() => !isFirebaseConfigured() || !auth);

  const useCloudAuth = isFirebaseConfigured() && auth != null;

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return undefined;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (!isSignInEmailAllowed(user.email)) {
          try {
            await firebaseSignOut(auth);
          } catch {
            /* ignore */
          }
          toast.error(
            `Sign in with your @${ALLOWED_AUTH_EMAIL_DOMAIN} Google account. This account isn’t allowed on Huddl.`,
            { duration: 10_000 }
          );
          setFirebaseUser(null);
          setAuthReady(true);
          return;
        }
      }
      setFirebaseUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  /** Sync auth profile photo to Firestore so other users can show it on likes / avatars. */
  useEffect(() => {
    if (!useCloudAuth || !firebaseUser?.email) return;
    const photo = pickFirebasePhotoUrl(firebaseUser);
    if (!photo || !base44.entities.PublicProfile?.upsert) return;
    base44.entities.PublicProfile.upsert(firebaseUser.email, {
      photo_url: photo,
      display_name: firebaseUser.displayName || null,
    }).catch(() => {});
  }, [useCloudAuth, firebaseUser?.uid, firebaseUser?.email, firebaseUser?.photoURL, firebaseUser?.displayName]);

  const sessionUser = useMemo(() => {
    if (!useCloudAuth) return LOCAL_DEV_USER;
    return mapFirebaseUser(firebaseUser);
  }, [useCloudAuth, firebaseUser, sessionRefreshTick]);

  const needsSignIn = useCloudAuth && authReady && !firebaseUser;

  const isLoadingAuth = useCloudAuth && !authReady;

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleAuthProvider) {
      toast.error('Firebase Auth is not configured.');
      return;
    }
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (e) {
      if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') {
        return;
      }
      toast.error(googleAuthErrorMessage(e), { duration: 12_000 });
    }
  }, []);

  const signInWithEmailPassword = useCallback(async (email, password) => {
    if (!auth) {
      toast.error('Firebase Auth is not configured.');
      return false;
    }
    if (!isSignInEmailAllowed(email)) {
      toast.error(`Use your @${ALLOWED_AUTH_EMAIL_DOMAIN} account.`);
      return false;
    }
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return true;
    } catch (e) {
      toast.error(emailAuthErrorMessage(e));
      return false;
    }
  }, []);

  const signUpWithEmailPassword = useCallback(async (email, password) => {
    if (!auth) {
      toast.error('Firebase Auth is not configured.');
      return false;
    }
    if (!isSignInEmailAllowed(email)) {
      toast.error(`Use your @${ALLOWED_AUTH_EMAIL_DOMAIN} account.`);
      return false;
    }
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      return true;
    } catch (e) {
      toast.error(emailAuthErrorMessage(e));
      return false;
    }
  }, []);

  const sendPasswordReset = useCallback(async (email) => {
    if (!auth) {
      toast.error('Firebase Auth is not configured.');
      return false;
    }
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error('Enter your email address first.');
      return false;
    }
    try {
      await sendPasswordResetEmail(auth, trimmed);
      toast.success('Check your inbox for a link to reset your password.');
      return true;
    } catch (e) {
      toast.error(emailAuthErrorMessage(e));
      return false;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    if (!auth) return;
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      toast.error(e?.message || 'Sign out failed.');
    }
  }, []);

  /** Call after updateProfile / Storage upload so UI shows new name/photo. */
  const refreshSession = useCallback(async () => {
    if (!auth?.currentUser) return;
    try {
      await reload(auth.currentUser);
      setSessionRefreshTick((t) => t + 1);
    } catch (e) {
      toast.error(e?.message || 'Could not refresh profile.');
    }
  }, []);

  const navigateToLogin = useCallback(() => {
    window.location.href = '/';
  }, []);

  const value = useMemo(
    () => ({
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError: null,
      navigateToLogin,
      sessionUser,
      /** Raw Firebase user for profile checks (null when signed out or local dev). */
      firebaseUser: useCloudAuth ? firebaseUser : null,
      needsSignIn,
      signInWithGoogle,
      signInWithEmailPassword,
      signUpWithEmailPassword,
      sendPasswordReset,
      signOut: signOutUser,
      refreshSession,
      isFirebaseAuth: useCloudAuth,
    }),
    [
      isLoadingAuth,
      navigateToLogin,
      sessionUser,
      firebaseUser,
      needsSignIn,
      signInWithGoogle,
      signInWithEmailPassword,
      signUpWithEmailPassword,
      sendPasswordReset,
      signOutUser,
      refreshSession,
      useCloudAuth,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export async function getCurrentUser() {
  if (!isFirebaseConfigured() || !auth) {
    return LOCAL_DEV_USER;
  }
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(mapFirebaseUser(u));
    });
  });
}
