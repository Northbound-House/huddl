import { getCardCreatedAtIso, getCardUpdatedAtIso } from '@/lib/cardTimestamps';

/** Normalize Firestore Timestamp or ISO string to ISO string. */
function isoFromMaybe(v) {
  if (v == null || v === '') return null;
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
  if (typeof v === 'object' && (v.seconds != null || v._seconds != null)) {
    const sec = v._seconds ?? v.seconds;
    const ns = v._nanoseconds ?? v.nanoseconds ?? 0;
    const ms = sec * 1000 + Math.floor(ns / 1e6);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function maxIso(...candidates) {
  let best = null;
  let bestMs = -Infinity;
  for (const iso of candidates) {
    if (!iso || typeof iso !== 'string') continue;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = iso;
    }
  }
  return best;
}

/** Latest ISO timestamp from card content, votes, and comments. */
function latestFromCards(cards) {
  let best = null;
  for (const card of cards || []) {
    best = maxIso(best, getCardUpdatedAtIso(card), getCardCreatedAtIso(card));
    for (const com of card.comments || []) {
      const ca = com?.created_at ?? com?.createdAt;
      best = maxIso(best, typeof ca === 'string' ? ca : null);
    }
  }
  return best;
}

/**
 * Best-effort "last interacted" time: board updates, then max card/comment activity.
 * @param board {{ created_at?: string, updated_at?: string }}
 * @param cards {Array}
 * @returns {string | null} ISO string
 */
export function computeBoardLastActivityIso(board, cards) {
  if (!board) return null;
  return maxIso(isoFromMaybe(board.updated_at), isoFromMaybe(board.created_at), latestFromCards(cards));
}

/** Compact English relative time, e.g. "15m ago", "2d ago". */
export function formatRelativeTimeAgo(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 0) return 'just now';
  if (sec < 15) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 8) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${Math.max(1, y)}y ago`;
}
