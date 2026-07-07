/** Top-level Circles list */
export function circlesPath() {
  return '/circles';
}

/** @param {string} teamId */
export function circleDetailPath(teamId) {
  if (!teamId) return '/circles';
  return `/circles/${teamId}`;
}

/**
 * @deprecated Prefer {@link circlesPath} — kept for call sites that passed orgId for routing.
 * Org id is ignored; Circles are the top-level hierarchy in the UI.
 */
export function orgTeamsPath(_orgId) {
  return '/circles';
}

/**
 * @param {string | null | undefined} _orgId
 * @param {string} teamId
 */
export function orgTeamDetailPath(_orgId, teamId) {
  return circleDetailPath(teamId);
}

/** @deprecated Legacy workspace URL; redirects to Circles in the router. */
export function orgOverviewPath(_orgId) {
  return '/circles';
}

/**
 * @param {{ organization_id?: string | null } | null | undefined} team
 * @param {string | null | undefined} fallbackOrgId
 */
export function orgIdForTeam(team, fallbackOrgId) {
  if (team?.organization_id) return team.organization_id;
  return fallbackOrgId ?? null;
}
