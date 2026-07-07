/**
 * Identity Platform blocking: only @jackhenry.com (or ALLOWED_AUTH_EMAIL_DOMAIN) can register or sign in.
 * Deploy with: firebase deploy --only functions
 * Requires: Firebase project upgraded to Authentication with Identity Platform, and
 * the blocking functions URL registered in Firebase Console → Auth → Settings → Blocking functions
 * (often filled automatically after the first successful deploy; see Firebase docs if sign-in still ignores them).
 *
 * Error message `HUDDL_DOMAIN_NOT_ALLOWED` must match DOMAIN_BLOCKING_ERROR_CODE in `src/lib/authPolicy.js`
 * (used by the web client for clearer toasts; Firebase may still surface `auth/internal-error` to the client).
 */
import { setGlobalOptions } from 'firebase-functions/v2';
import { beforeUserCreated, beforeUserSignedIn, HttpsError } from 'firebase-functions/v2/identity';

setGlobalOptions({ region: 'us-central1' });

const DEFAULT_DOMAIN = 'jackhenry.com';
const ERR_MSG = 'HUDDL_DOMAIN_NOT_ALLOWED';

const allowedDomain = (process.env.ALLOWED_AUTH_EMAIL_DOMAIN || DEFAULT_DOMAIN).toLowerCase();

function assertAllowedAuthEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new HttpsError('invalid-argument', ERR_MSG);
  }
  const at = email.lastIndexOf('@');
  if (at < 0) {
    throw new HttpsError('invalid-argument', ERR_MSG);
  }
  const domain = email.slice(at + 1).toLowerCase();
  if (domain !== allowedDomain) {
    throw new HttpsError('invalid-argument', ERR_MSG);
  }
}

export const authBlockBeforeUserCreated = beforeUserCreated((event) => {
  assertAllowedAuthEmail(event.data?.email);
});

export const authBlockBeforeUserSignedIn = beforeUserSignedIn((event) => {
  assertAllowedAuthEmail(event.data?.email);
});
