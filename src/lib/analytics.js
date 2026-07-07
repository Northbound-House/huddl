import { getAnalytics, logEvent } from 'firebase/analytics';
import { firebaseApp } from '@/lib/firebase';

let analyticsInstance = null;
let analyticsFailed = false;

function getOrInitAnalytics() {
  if (typeof window === 'undefined' || !firebaseApp || analyticsFailed) {
    return null;
  }
  if (analyticsInstance) return analyticsInstance;
  try {
    analyticsInstance = getAnalytics(firebaseApp);
    return analyticsInstance;
  } catch {
    analyticsFailed = true;
    return null;
  }
}

/**
 * GA4 / Firebase Analytics custom events. No-ops when Analytics isn’t available
 * (no `measurementId`, unsupported environment, or local dev without config).
 *
 * @param {string} name — max 40 chars; use [a-z0-9_]+
 * @param {Record<string, string | number | boolean> | undefined} [params] — up to 25 params; values not PII
 */
export function trackEvent(name, params) {
  const a = getOrInitAnalytics();
  if (!a) return;
  try {
    logEvent(a, name, params);
  } catch (e) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[analytics]', name, e);
    }
  }
}
