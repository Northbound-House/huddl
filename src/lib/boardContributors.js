import { normalizeEmail } from '@/lib/email';
import { getBoardTeamIds } from '@/lib/boardTeams';
import { initialsFromEmail, hueFromString, voterAvatarColors } from '@/lib/voterDisplay';

/** Two-letter initials from a display name (e.g. "Casey Sweet" → "CS"). */
export function initialsFromDisplayName(name) {
  if (!name || typeof name !== 'string') return '?';
  const t = name.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[parts.length - 1][0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  const letters = t.replace(/[^a-zA-Z]/g, '');
  if (letters.length >= 2) return letters.slice(0, 2).toUpperCase();
  if (t.length >= 2) return t.slice(0, 2).toUpperCase();
  return t.slice(0, 1).toUpperCase() || '?';
}

function normalizeParticipantNameKey(raw) {
  const n = (raw || '').trim().replace(/\s+/g, ' ');
  return n.toLowerCase();
}

/**
 * People who created an item or posted in the Conversation (not voters-only).
 * Prefer `author_email` when present so avatars match `public_profiles` / Google photos.
 *
 * @returns {Array<{ kind: 'email'|'name', email?: string, displayName: string, initials: string }>}
 */
export function aggregateBoardParticipants(cards) {
  const map = new Map();

  const addEmail = (rawEmail, rawName) => {
    const e = normalizeEmail(rawEmail);
    if (!e) return;
    const key = `e:${e}`;
    const incoming = (rawName && String(rawName).trim()) || '';
    const prev = map.get(key);
    const fallbackLocal = e.includes('@') ? e.split('@')[0] : e;
    const displayName =
      [incoming, prev?.displayName, fallbackLocal].find((x) => x && String(x).trim()) || e;
    map.set(key, {
      kind: 'email',
      email: e,
      displayName,
      initials: initialsFromEmail(e),
    });
  };

  const addName = (raw) => {
    const n = (raw || '').trim();
    if (!n || /^anonymous$/i.test(n)) return;
    const nk = normalizeParticipantNameKey(n);
    const key = `n:${nk}`;
    if (map.has(key)) return;
    map.set(key, {
      kind: 'name',
      displayName: n,
      initials: initialsFromDisplayName(n),
    });
  };

  for (const card of cards || []) {
    if (normalizeEmail(card.author_email)) {
      addEmail(card.author_email, card.author_name);
    } else {
      addName(card.author_name);
    }
    for (const c of card.comments || []) {
      if (normalizeEmail(c?.author_email)) {
        addEmail(c.author_email, c?.author_name);
      } else {
        addName(c?.author_name);
      }
    }
  }

  const list = [...map.values()];
  list.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'email' ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
  });
  return list;
}

export function contributorAvatarColors(c) {
  if (c.kind === 'email') return voterAvatarColors(c.email);
  const h = hueFromString(c.displayName);
  return {
    background: `hsl(${h} 52% 42%)`,
    foreground: '#fff',
  };
}

function displayNamesMatch(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  return x === y;
}

/**
 * Attach profile photo when the signed-in user matches a contributor:
 * by normalized email, or by display name (cards only store author_name, not email).
 */
export function enrichContributorsWithSessionPhoto(contributors, sessionUser) {
  if (!sessionUser?.photoURL) return contributors;
  const meEmail = sessionUser.email ? normalizeEmail(sessionUser.email) : '';
  const meName = (sessionUser.full_name || '').trim();

  return contributors.map((c) => {
    if (c.photoURL) return c;
    if (c.kind === 'email' && meEmail && normalizeEmail(c.email) === meEmail) {
      return { ...c, photoURL: sessionUser.photoURL };
    }
    if (c.kind === 'name' && meName && displayNamesMatch(c.displayName, meName)) {
      return { ...c, photoURL: sessionUser.photoURL };
    }
    return c;
  });
}

/** Merge Firestore `public_profiles` photos + display names (keyed by normalized email), then session photo for self / name match. */
export function enrichContributorsWithPublicPhotos(contributors, sessionUser, photoByEmail) {
  if (!photoByEmail || typeof photoByEmail !== 'object') {
    return enrichContributorsWithSessionPhoto(contributors, sessionUser);
  }
  const withPublic = contributors.map((c) => {
    if (c.kind !== 'email') return c;
    const entry = photoByEmail[c.email];
    if (!entry) return c;
    const url = typeof entry === 'string' ? entry : entry?.photo_url ?? null;
    const dn =
      typeof entry === 'object' && typeof entry.display_name === 'string'
        ? entry.display_name.trim()
        : '';
    let next = { ...c };
    if (dn) {
      next.displayName = dn;
      next.initials = initialsFromDisplayName(dn);
    }
    if (url) next.photoURL = url;
    return next;
  });
  return enrichContributorsWithSessionPhoto(withPublic, sessionUser);
}

/** Circle name(s), "Personal", or "Unassigned" (e.g. global-admin Huddl Boards with no Circle). */
export function resolveBoardTeamLabel(board, teams = []) {
  const ids = getBoardTeamIds(board);
  if (ids.length) {
    const names = ids
      .map((id) => teams.find((x) => x.id === id)?.name)
      .filter(Boolean);
    if (names.length === 0) return ids.length === 1 ? 'Circle' : `${ids.length} Circles`;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  }
  if (board?.owner_uid || board?.owner_email) return 'Personal';
  return 'Unassigned';
}
