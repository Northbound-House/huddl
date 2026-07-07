import { normalizeEmail } from '@/lib/email';

export const PROFILE_PROMPT_STORAGE_KEY = 'huddl.profilePrompt.completed.v1';

export function pickFirebasePhotoUrl(u) {
  if (!u) return null;
  if (u.photoURL) return u.photoURL;
  return u.providerData?.find((p) => p.photoURL)?.photoURL || null;
}

/** True when display name is missing or looks like the email handle only. */
export function nameLooksGeneric(displayName, email) {
  const em = normalizeEmail(email);
  const local = em.includes('@') ? em.split('@')[0] : '';
  if (!local) return true;
  const dn = (displayName || '').trim();
  if (!dn) return true;
  return dn.toLowerCase() === local.toLowerCase();
}

export function needsProfilePromptAttention(firebaseUser) {
  if (!firebaseUser?.email) return false;
  const genericName = nameLooksGeneric(firebaseUser.displayName, firebaseUser.email);
  const missingPhoto = !pickFirebasePhotoUrl(firebaseUser);
  return genericName || missingPhoto;
}

export function readProfilePromptComplete(uid) {
  if (!uid) return true;
  try {
    return localStorage.getItem(PROFILE_PROMPT_STORAGE_KEY) === uid;
  } catch {
    return true;
  }
}

export function writeProfilePromptComplete(uid) {
  if (!uid) return;
  try {
    localStorage.setItem(PROFILE_PROMPT_STORAGE_KEY, uid);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('huddl-profile-prompt-complete', { detail: { uid } }));
    }
  } catch {
    /* ignore */
  }
}
