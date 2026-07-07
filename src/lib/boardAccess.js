import { normalizeEmail } from '@/lib/email';
import { getBoardTeamIds } from '@/lib/boardTeams';

/**
 * @param access {{ accessibleTeamIds: string[] | null, uid?: string | null, email?: string | null }}
 */
export function canAccessBoard(board, access) {
  if (!board || !access) return false;
  const teamIds = getBoardTeamIds(board);
  if (teamIds.length) {
    const ids = access.accessibleTeamIds;
    if (!ids?.length) return false;
    return teamIds.some((tid) => ids.includes(tid));
  }
  if (board.owner_uid && access.uid) return board.owner_uid === access.uid;
  if (board.owner_email && access.email) {
    return normalizeEmail(board.owner_email) === normalizeEmail(access.email);
  }
  return false;
}

/**
 * Who may delete the board, delete columns, close sessions, or perform other destructive board-level actions:
 * - Circle Leads (`team_admin` membership) for any linked team
 * - Circle creator (`teams.created_by_uid`) when passed via `access.teamCreatedByUid` (matches Team detail “Circle Lead”)
 * - Denormalized `board_collaborator_admin_emails` (same source as Firestore `boardDenormAdmin`)
 * - The owner of a personal board (`owner_uid` / `owner_email`)
 *
 * @param board {{ team_ids?: string[], team_id?: string | null, owner_uid?: string | null, owner_email?: string | null, board_collaborator_admin_emails?: string[] }}
 * @param access {{ uid?: string | null, email?: string | null, isTeamAdmin: (teamId: string) => boolean, teamCreatedByUid?: Record<string, string | null | undefined> }}
 */
export function canAdminBoard(board, access) {
  if (!board || !access) return false;
  const emNorm = access.email ? normalizeEmail(access.email) : '';
  if (emNorm && Array.isArray(board.board_collaborator_admin_emails) && board.board_collaborator_admin_emails.length) {
    if (board.board_collaborator_admin_emails.some((e) => normalizeEmail(e) === emNorm)) return true;
  }
  const teamIds = getBoardTeamIds(board);
  if (teamIds.length) {
    if (teamIds.some((tid) => access.isTeamAdmin(tid))) return true;
    const uid = access.uid ?? null;
    const byTeam = access.teamCreatedByUid;
    if (uid && byTeam && typeof byTeam === 'object') {
      for (const tid of teamIds) {
        const creator = byTeam[tid];
        if (creator && creator === uid) return true;
      }
    }
    return false;
  }
  if (board.owner_uid && access.uid) return board.owner_uid === access.uid;
  if (board.owner_email && access.email) {
    return normalizeEmail(board.owner_email) === normalizeEmail(access.email);
  }
  return false;
}

/** Personal boards use `owner_uid` / `owner_email` instead of team linkage. */
export function isPersonalBoard(board) {
  return Boolean(board && getBoardTeamIds(board).length === 0 && (board.owner_uid || board.owner_email));
}

/** Workspace boards with no team and no personal owner (legacy; assign Personal or Circle in settings). */
export function isUnassignedBoard(board) {
  return Boolean(
    board &&
      getBoardTeamIds(board).length === 0 &&
      !board.owner_uid &&
      !board.owner_email
  );
}
