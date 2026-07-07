/**
 * Planned Firestore layout (adjust when you migrate off localStorage).
 *
 * Suggested model:
 * - teams/{teamId}                    — name, createdBy, etc.
 * - teams/{teamId}/members/{uid}      — role: 'admin' | 'member'
 * - invites/{inviteId}                — email, teamId, tokenHash, expiresAt, acceptedAt
 * - boards/{boardId}                  — title, ceremonyType, teamId, ownerId, archived
 * - boards/{boardId}/columns/{colId}  — title, order
 * - boards/{boardId}/cards/{cardId}   — columnId, content, order, votes, …
 *
 * Security rules should enforce: read/write only for members of the board’s team (or public read if you add that).
 */

export const COLLECTIONS = {
  teams: 'teams',
  invites: 'invites',
  boards: 'boards',
};

/** Subcollections under a board document. */
export const BOARD_SUB = {
  columns: 'columns',
  cards: 'cards',
};

/** Member doc under teams/{teamId}/members/{uid} */
export const TEAM_SUB = {
  members: 'members',
};
