/** Resolve a created/updated time from a card object (snake_case, camelCase, numeric). */
export function getCardCreatedAtIso(card) {
  return pickTimestampIso(card, ['created_at', 'createdAt', 'created_date', 'CreatedDate']);
}

export function getCardUpdatedAtIso(card) {
  return pickTimestampIso(card, ['updated_at', 'updatedAt', 'updated_date', 'UpdatedDate']);
}

function pickTimestampIso(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    const v = obj[key];
    const iso = coerceToIsoString(v);
    if (iso) return iso;
  }
  return null;
}

function coerceToIsoString(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : v;
  }
  if (typeof v === 'object' && typeof v.toDate === 'function') {
    try {
      const d = v.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    } catch {
      return null;
    }
  }
  if (typeof v === 'object' && (v._seconds != null || v.seconds != null)) {
    const sec = v._seconds ?? v.seconds;
    const ns = v._nanoseconds ?? v.nanoseconds ?? 0;
    const ms = sec * 1000 + Math.floor(ns / 1e6);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Format an ISO-like string for display; returns null if missing/invalid. */
export function formatWhenLabel(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return null;
  }
}
