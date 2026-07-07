import { normalizeEmail } from '@/lib/email';

/** Normalized author emails stored on cards/comments (when the user was signed in). */
export function collectAuthorEmailsFromCards(cards) {
  const set = new Set();
  for (const card of cards || []) {
    const e = normalizeEmail(card.author_email);
    if (e) set.add(e);
    for (const c of card.comments || []) {
      const e2 = normalizeEmail(c?.author_email);
      if (e2) set.add(e2);
    }
  }
  return [...set];
}

/** Collect unique normalized emails from card likes (items + comment likes). */
export function collectVoterEmailsFromCards(cards) {
  const set = new Set();
  for (const card of cards || []) {
    for (const v of card.owner_emails || []) {
      const e = normalizeEmail(v);
      if (e) set.add(e);
    }
    for (const v of card.voted_by || []) {
      const e = normalizeEmail(v);
      if (e) set.add(e);
    }
    for (const c of card.comments || []) {
      for (const v of c.voted_by || []) {
        const e = normalizeEmail(v);
        if (e) set.add(e);
      }
    }
  }
  return [...set];
}
