import { boardTeamsWritePayload } from '@/lib/boardTeams';
import { normalizeEmail } from '@/lib/email';
import { normalizeStoredDescription } from '@/lib/richTextConversion';
import { isFeedbackLogViewer } from '@/lib/feedbackAccess';

/**
 * @param {unknown} raw
 * @returns {object}
 */
export function assertTrelloBoardExport(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid file: expected a JSON object.');
  }
  const o = /** @type {{ lists?: unknown; cards?: unknown }} */ (raw);
  if (!Array.isArray(o.lists) || !Array.isArray(o.cards)) {
    throw new Error('This JSON does not look like a Trello board export (need lists and cards).');
  }
  return o;
}

/**
 * Trello comment bodies are usually Markdown. We keep them as plain text; strip HTML if present.
 * @param {unknown} raw
 * @returns {string}
 */
export function trelloCommentToPlainText(raw) {
  if (raw == null) return '';
  const s0 = String(raw).trim();
  if (!s0) return '';
  let s = s0
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
  if (/<[a-z][\s\S]*>/i.test(s)) {
    s = s.replace(/<[^>]+>/g, '');
  }
  return s.trim();
}

/**
 * @param {any} action
 * @returns {string}
 */
/**
 * Resolve Trello member display name from board `members` export (used for card creators).
 * @param {any[]} members
 * @param {string | null | undefined} memberId
 * @returns {string | null}
 */
export function trelloMemberDisplayName(members, memberId) {
  if (memberId == null || memberId === '') return null;
  const id = String(memberId);
  const list = Array.isArray(members) ? members : [];
  const m = list.find((x) => x && typeof x === 'object' && String(x.id) === id);
  if (!m) return null;
  const full = String(m.fullName || '').trim();
  if (full) return full;
  const u = String(m.username || '').trim();
  if (u) return `@${u}`;
  return null;
}

function authorFromCommentAction(action) {
  const m = action?.memberCreator;
  if (m && typeof m === 'object') {
    const name = String(m.fullName || '').trim();
    if (name) return name;
    const u = String(m.username || '').trim();
    if (u) return `@${u}`;
  }
  return 'Trello';
}

/**
 * @param {any} trello
 * @returns {Map<string, { text: string; author_name: string; created_at: string; votes: number; voted_by: string[] }[]>}
 */
export function indexCommentActionsByCardId(trello) {
  /** @type {Map<string, { text: string; author_name: string; created_at: string; votes: number; voted_by: string[] }[]>} */
  const map = new Map();
  const actions = Array.isArray(trello.actions) ? trello.actions : [];
  for (const a of actions) {
    if (a.type !== 'commentCard') continue;
    const idCard = a?.data?.idCard;
    const textRaw = a?.data?.text;
    if (!idCard || textRaw == null) continue;
    const plain = trelloCommentToPlainText(String(textRaw));
    if (!plain) continue;
    const created_at =
      typeof a.date === 'string' && a.date.length ? a.date : new Date().toISOString();
    const row = {
      text: plain,
      author_name: authorFromCommentAction(a),
      created_at,
      votes: 0,
      voted_by: [],
    };
    const key = String(idCard);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  for (const arr of map.values()) {
    arr.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
  }
  return map;
}

/**
 * @typedef {{ ownerUid: string | null; ownerEmail: string | null }} TrelloImportOwnerOptions
 */

/**
 * Creates a personal ongoing Huddl board from a Trello JSON export (columns ordered by list `pos`).
 *
 * @param {typeof import('@/api/base44Client').base44} base44
 * @param {unknown} trelloRaw -- parsed JSON or will be parsed
 * @param {TrelloImportOwnerOptions} ownerOpts
 * @returns {Promise<{ board: object; stats: { columnCount: number; cardCount: number; commentCount: number } }>}
 */
export async function runTrelloBoardImport(base44, trelloRaw, ownerOpts) {
  if (!isFeedbackLogViewer(ownerOpts.ownerEmail)) {
    throw new Error('Trello import is not available for this account.');
  }

  const trello = typeof trelloRaw === 'string' ? JSON.parse(trelloRaw) : trelloRaw;
  assertTrelloBoardExport(trello);

  const { ownerUid, ownerEmail } = ownerOpts;
  const members = trello.members;
  const commentsByCardId = indexCommentActionsByCardId(trello);

  const openLists = trello.lists
    .filter((l) => l && typeof l === 'object' && !l.closed)
    .sort((a, b) => (Number(a.pos) || 0) - (Number(b.pos) || 0));

  if (!openLists.length) {
    throw new Error('No open lists found in this export (all lists may be archived).');
  }

  const openListIds = new Set(openLists.map((l) => String(l.id)));

  const openCards = trello.cards.filter(
    (c) => c && typeof c === 'object' && !c.closed && openListIds.has(String(c.idList))
  );

  const now = new Date().toISOString();
  const title = String(trello.name || 'Imported board').trim() || 'Imported board';
  const description = String(trello.desc || '').trim();

  const teamPayload = boardTeamsWritePayload([]);
  const normEmail = normalizeEmail(ownerEmail || '');
  const board = await base44.entities.Board.create({
    title,
    description,
    ceremony_type: 'blank',
    huddl_type: 'ongoing',
    layout_id: 'blank',
    session_start_mode: null,
    session_schedule: null,
    session_frequency: null,
    ...teamPayload,
    owner_uid: ownerUid ?? null,
    owner_email: ownerUid ? null : normEmail ? ownerEmail : null,
    is_archived: false,
    created_at: now,
    updated_at: now,
  });

  /** @type {Record<string, string>} */
  const trelloListIdToColumnId = {};

  for (let i = 0; i < openLists.length; i++) {
    const list = openLists[i];
    const col = await base44.entities.BoardColumn.create({
      board_id: board.id,
      title: String(list.name || 'Untitled').trim() || 'Untitled',
      order: i,
    });
    trelloListIdToColumnId[String(list.id)] = col.id;
  }

  /** @type {Record<string, typeof openCards>} */
  const cardsByListId = {};
  for (const c of openCards) {
    const lid = String(c.idList);
    if (!cardsByListId[lid]) cardsByListId[lid] = [];
    cardsByListId[lid].push(c);
  }
  for (const lid of Object.keys(cardsByListId)) {
    cardsByListId[lid].sort((a, b) => (Number(a.pos) || 0) - (Number(b.pos) || 0));
  }

  let commentCount = 0;
  let cardCount = 0;

  for (const list of openLists) {
    const lid = String(list.id);
    const columnId = trelloListIdToColumnId[lid];
    const listCards = cardsByListId[lid] || [];
    for (let i = 0; i < listCards.length; i++) {
      const c = listCards[i];
      const name = String(c.name || '').trim() || 'Card';
      const descRaw = String(c.desc || '').trim();
      const descriptionNormalized = descRaw ? normalizeStoredDescription(descRaw) : '';
      const tcId = String(c.id);
      const comments = commentsByCardId.get(tcId) || [];
      commentCount += comments.length;

      const isoActivity =
        typeof c.dateLastActivity === 'string' && c.dateLastActivity.length
          ? c.dateLastActivity
          : now;

      await base44.entities.Card.create({
        board_id: board.id,
        column_id: columnId,
        title: name,
        content: name,
        description: descriptionNormalized ? descriptionNormalized : null,
        author_name: trelloMemberDisplayName(members, c.idMemberCreator) || 'Trello',
        votes: 0,
        voted_by: [],
        order: i,
        comments,
        created_at: isoActivity,
        updated_at: isoActivity,
      });
      cardCount += 1;
    }
  }

  return {
    board,
    stats: {
      columnCount: openLists.length,
      cardCount,
      commentCount,
    },
  };
}
