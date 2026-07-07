import { normalizeEmail } from '@/lib/email';

/**
 * Only these Google (and any email) accounts may sign in.
 * Override for local dev: VITE_ALLOWED_AUTH_EMAIL_DOMAIN=example.com in `.env`
 * Set to empty string to allow ALL domains (public deployment).
 */
const raw = import.meta.env.VITE_ALLOWED_AUTH_EMAIL_DOMAIN;
export const ALLOWED_AUTH_EMAIL_DOMAIN =
  typeof raw === 'string' && raw.trim().length > 0 ? raw.trim().toLowerCase() : 'jackhenry.com';

/** True when domain restriction is disabled (public mode). */
export const ALLOW_ALL_DOMAINS = raw === '' || raw === 'false' || raw === 'null';

/**
 * Must match the message thrown by Cloud Functions blocking (Identity) auth, so the client
 * can show a clear toast instead of a generic `auth/internal-error` when the server blocks sign-in.
 */
export const DOMAIN_BLOCKING_ERROR_CODE = 'HUDDL_DOMAIN_NOT_ALLOWED';

/**
 * @param {string|null|undefined} email
 * @returns {boolean}
 */
export function isSignInEmailAllowed(email) {
  if (!email || typeof email !== 'string') return false;
  const e = normalizeEmail(email);
  if (!e.includes('@')) return false;

  // Public mode: allow any valid email
  if (ALLOW_ALL_DOMAINS) return true;

  // Restricted mode: check domain matches
  const at = e.lastIndexOf('@');
  const domain = e.slice(at + 1);
  return domain === ALLOWED_AUTH_EMAIL_DOMAIN;
}

/**
 * Circle membership invites (create wizard, Circle page) use the same domain as org sign-in.
 * @param {string|null|undefined} email
 * @returns {boolean}
 */
export function isCircleInviteEmailAllowed(email) {
  return isSignInEmailAllowed(email);
}
