import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { embeddedFirebaseConfig } from '@/lib/firebaseClientConfig';
import { ALLOWED_AUTH_EMAIL_DOMAIN } from '@/lib/authPolicy';

/**
 * Env vars (VITE_*) take priority; otherwise uses embedded public web config so production
 * builds work even when CI/Hosting does not inject environment variables.
 *
 * Set VITE_USE_FIRESTORE=false to completely disable Firebase (Jack Henry mode).
 * @see https://firebase.google.com/docs/web/setup
 */
function readFirebaseConfig() {
  // Explicit disable flag for Jack Henry deployment
  const useFirestore = import.meta.env.VITE_USE_FIRESTORE;
  if (useFirestore === 'false' || useFirestore === false) {
    return null;
  }

  const e = embeddedFirebaseConfig;
  const {
    VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID,
    VITE_FIREBASE_MEASUREMENT_ID,
  } = import.meta.env;

  const fallback = import.meta.env.PROD ? e : null;
  const apiKey = VITE_FIREBASE_API_KEY || fallback?.apiKey;
  const authDomain = VITE_FIREBASE_AUTH_DOMAIN || fallback?.authDomain;
  const projectId = VITE_FIREBASE_PROJECT_ID || fallback?.projectId;
  const storageBucket = VITE_FIREBASE_STORAGE_BUCKET || fallback?.storageBucket;
  const messagingSenderId = VITE_FIREBASE_MESSAGING_SENDER_ID || fallback?.messagingSenderId;
  const appId = VITE_FIREBASE_APP_ID || fallback?.appId;
  const measurementId = VITE_FIREBASE_MEASUREMENT_ID || fallback?.measurementId;

  if (!apiKey || !projectId || !appId) {
    return null;
  }

  const cfg = {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
  if (measurementId) {
    cfg.measurementId = measurementId;
  }
  return cfg;
}

const config = readFirebaseConfig();

/** True when all required web config keys are present (local dev or production). */
export function isFirebaseConfigured() {
  return config != null;
}

/** Firebase app singleton, or null if env is not configured (app stays on localStorage client). */
export const firebaseApp = (() => {
  if (!config) return null;
  return getApps().length ? getApps()[0] : initializeApp(config);
})();

/** Auth instance — email/password, Google sign-in, and session listeners. */
export const auth = firebaseApp ? getAuth(firebaseApp) : null;

/** Firestore — use for boards, invites, memberships once migrated. */
export const db = firebaseApp ? getFirestore(firebaseApp) : null;

/** Storage — profile photos under avatars/{uid}/… */
export const storage = firebaseApp ? getStorage(firebaseApp) : null;

/** Reuse one provider for "Sign in with Google". Always show Google account picker so multi-account users can choose. */
export const googleAuthProvider = (() => {
  if (!firebaseApp) return null;
  const p = new GoogleAuthProvider();
  const params = { prompt: 'select_account' };

  // Only restrict domain hint in Jack Henry mode (not public mode)
  if (ALLOWED_AUTH_EMAIL_DOMAIN && ALLOWED_AUTH_EMAIL_DOMAIN !== '') {
    params.hd = ALLOWED_AUTH_EMAIL_DOMAIN;
  }

  p.setCustomParameters(params);
  return p;
})();
