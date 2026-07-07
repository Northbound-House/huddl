import { normalizeEmail } from '@/lib/email';

const ACTIVITY_MAX = 40;

/**
 * Primary line for an Item — legacy cards only had `content`.
 * @param {object} card
 * @returns {string}
 */
export function getItemTitle(card) {
  const t = (card.title ?? '').trim();
  if (t) return t;
  const c = (card.content ?? '').trim();
  return c || 'Item';
}

/**
 * @param {object} card
 * @returns {string}
 */
export function getItemDescription(card) {
  return (card.description ?? '').trim();
}

/**
 * @param {object} card
 * @returns {number}
 */
export function conversationCount(card) {
  return (card.comments || []).length;
}

/**
 * Copy of card.comments sorted newest-first (does not mutate storage order).
 * @param {object[]} comments
 * @returns {object[]}
 */
export function sortCommentsNewestFirst(comments) {
  if (!Array.isArray(comments) || comments.length === 0) return [];
  return [...comments].sort((a, b) => {
    const ta = Date.parse(String(a.created_at ?? a.createdAt ?? 0)) || 0;
    const tb = Date.parse(String(b.created_at ?? b.createdAt ?? 0)) || 0;
    return tb - ta;
  });
}

/**
 * @param {object} card
 * @returns {{ done: number, total: number }}
 */
export function getChecklistProgress(card) {
  const lists = card.checklists || [];
  let done = 0;
  let total = 0;
  for (const list of lists) {
    for (const it of list.items || []) {
      total += 1;
      if (it.is_completed) done += 1;
    }
  }
  return { done, total };
}

/**
 * @param {object} card
 * @returns {number}
 */
export function attachmentCount(card) {
  return (card.attachments || []).length;
}

/**
 * @param {object} card
 * @param {{ summary: string, actor_email?: string }} entry
 * @returns {object[]}
 */
export function appendActivityLog(card, entry) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `a-${Date.now()}`;
  const row = {
    id,
    created_at: new Date().toISOString(),
    summary: entry.summary,
    actor_email: entry.actor_email ? normalizeEmail(entry.actor_email) : '',
  };
  const prev = Array.isArray(card.activity_log) ? card.activity_log : [];
  return [...prev, row].slice(-ACTIVITY_MAX);
}

/**
 * @param {string} [dueDate] YYYY-MM-DD or ISO
 * @returns {'overdue' | 'today' | 'upcoming' | 'none'}
 */
export function dueDateState(dueDate) {
  if (!dueDate) return 'none';
  const d = dueDate.includes('T') ? dueDate.slice(0, 10) : dueDate;
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayKey = `${y}-${m}-${day}`;
  if (d < todayKey) return 'overdue';
  if (d === todayKey) return 'today';
  return 'upcoming';
}
