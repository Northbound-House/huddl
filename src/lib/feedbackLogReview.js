import { normalizeEmail } from '@/lib/email';

function storageKey(email) {
  const em = normalizeEmail(email);
  return `huddl.feedbackLog.lastReviewedAt.${em || 'unknown'}`;
}

/** ISO timestamp of when the viewer last opened the feedback log (best-effort). */
export function readFeedbackLastReviewedAt(email) {
  try {
    const v = localStorage.getItem(storageKey(email));
    return v && typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function writeFeedbackLastReviewedAt(email, iso = new Date().toISOString()) {
  try {
    localStorage.setItem(storageKey(email), iso);
  } catch {
    /* ignore */
  }
}

/**
 * @param {Array<{ created_at?: string }>} items — newest-first list is fine
 * @param {string | null} lastReviewedAtIso
 * @returns {number} count of items submitted after last review (all items if never reviewed)
 */
export function countNewFeedbackSinceReview(items, lastReviewedAtIso) {
  if (!items?.length) return 0;
  if (!lastReviewedAtIso) return items.length;
  const t = new Date(lastReviewedAtIso).getTime();
  if (Number.isNaN(t)) return items.length;
  return items.filter((r) => {
    if (!r.created_at) return false;
    const ct = new Date(r.created_at).getTime();
    return !Number.isNaN(ct) && ct > t;
  }).length;
}
