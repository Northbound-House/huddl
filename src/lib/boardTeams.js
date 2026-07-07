/** Must stay in sync with `boardTeamAccess` / `boardTeamAdminAny` in `firestore.rules` (indexed slots). */
export const MAX_BOARD_TEAM_IDS_FOR_FIRESTORE = 30;

/**
 * Normalizes board team linkage: prefers `team_ids`, falls back to legacy `team_id`.
 * @returns {string[]}
 */
export function getBoardTeamIds(board) {
  if (!board) return [];
  if (Array.isArray(board.team_ids) && board.team_ids.length) {
    return [...new Set(board.team_ids.filter(Boolean))];
  }
  if (board.team_id) return [board.team_id];
  return [];
}

/**
 * Payload for Firestore/local updates: `team_ids` plus legacy `team_id` (first id) for older queries.
 */
export function boardTeamsWritePayload(teamIds) {
  const ids = [...new Set((teamIds || []).filter(Boolean))].slice(0, MAX_BOARD_TEAM_IDS_FOR_FIRESTORE);
  return {
    team_ids: ids,
    team_id: ids.length === 1 ? ids[0] : ids[0] ?? null,
  };
}

export function boardSharesTeam(board, teamId) {
  if (!teamId || !board) return false;
  return getBoardTeamIds(board).includes(teamId);
}
