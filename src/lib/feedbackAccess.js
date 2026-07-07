import { normalizeEmail } from '@/lib/email';

/** Only this account can open the in-app feedback log (Firestore rules mirror this). */
export const FEEDBACK_LOG_VIEWER_EMAIL = 'csweetwright@jackhenry.com';

export function isFeedbackLogViewer(email) {
  return normalizeEmail(email) === FEEDBACK_LOG_VIEWER_EMAIL;
}
