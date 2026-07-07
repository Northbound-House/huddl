/** Human-readable labels for `board.ceremony_type` (includes legacy values). */
const LABELS = {
  retrospective: 'Retrospective',
  daily_standup: 'Daily standup',
  team_collab: 'Collaboration session',
  sprint_review: 'Sprint review',
  sprint_planning: 'Sprint planning (legacy)',
};

/**
 * @returns {string} Display label, or empty string for custom blank boards (`ceremony_type` === `blank`).
 */
export function getCeremonyLabel(ceremonyType) {
  if (ceremonyType === 'blank') return '';
  if (!ceremonyType) return 'Session';
  if (ceremonyType === 'team_collab') return LABELS.team_collab;
  return LABELS[ceremonyType] ?? ceremonyType.replace(/_/g, ' ');
}
