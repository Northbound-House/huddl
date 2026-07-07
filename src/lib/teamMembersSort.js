/**
 * Circle roster: Circle Leads (`team_admin`) first, A→Z by email, then everyone else A→Z.
 * @param {Array<{ email?: string|null, role?: string|null }>} rows
 */
export function sortTeamMembershipsForDisplay(rows) {
  if (!rows?.length) return [];
  return [...rows].sort((a, b) => {
    const aLead = a.role === 'team_admin' ? 0 : 1;
    const bLead = b.role === 'team_admin' ? 0 : 1;
    if (aLead !== bLead) return aLead - bLead;
    return String(a.email ?? '').localeCompare(String(b.email ?? ''), undefined, { sensitivity: 'base' });
  });
}
