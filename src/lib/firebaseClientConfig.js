/**
 * Public Firebase web app config (same as Firebase Console → Project settings → Your apps).
 * Used when VITE_FIREBASE_* env vars are missing at build time so Hosting deploys still work.
 * Override any value with VITE_FIREBASE_* in .env.local / CI if needed.
 *
 * **authDomain:** `app.huddl.cloud` is the preferred host so Google’s “Sign in to continue to …”
 * screen can show that domain instead of `*.firebaseapp.com` once this domain is added in
 * Firebase → Authentication → Settings → Authorized domains and connected as a Hosting custom
 * domain (or revert `VITE_FIREBASE_AUTH_DOMAIN` to `huddle-ab42f.firebaseapp.com` until that’s done).
 *
 * @see https://firebase.google.com/docs/web/setup
 */
export const embeddedFirebaseConfig = {
  apiKey: 'AIzaSyD2bJQzUvY5Z4eW8-12OuBhgsqzcCzXpCE',
  authDomain: 'app.huddl.cloud',
  projectId: 'huddle-ab42f',
  storageBucket: 'huddle-ab42f.firebasestorage.app',
  messagingSenderId: '982364135541',
  appId: '1:982364135541:web:29a02c15bb7c79d86c183c',
  measurementId: 'G-ZZ9GGS7P39',
};
