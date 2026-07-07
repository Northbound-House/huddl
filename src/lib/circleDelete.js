import { normalizeEmail } from '@/lib/email';
import { boardTeamsWritePayload, getBoardTeamIds } from '@/lib/boardTeams';

/**
 * Before removing a Circle (team), update every Huddl Board that referenced it:
 * - If the board is still linked to other Circles, only remove this team from `team_ids`.
 * - If this was the only Circle, the board becomes a **personal** Huddl Board owned by the acting user (typically the Lead).
 */
export async function reassignBoardsAfterCircleRemoved(base44, teamId, { uid, email }) {
  const boards = await base44.entities.Board.filter({ team_id: teamId });
  const leadEmail = email ? normalizeEmail(email) : '';

  for (const board of boards) {
    const ids = getBoardTeamIds(board).filter((id) => id !== teamId);
    let payload;
    if (ids.length > 0) {
      payload = boardTeamsWritePayload(ids);
    } else {
      payload = {
        team_ids: [],
        team_id: null,
        owner_uid: uid ?? null,
        owner_email: !uid && leadEmail ? leadEmail : null,
      };
    }
    await base44.entities.Board.update(board.id, payload);
  }
}
