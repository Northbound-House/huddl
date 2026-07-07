import { isFirestoreBackend } from '@/api/base44Client';

/**
 * Resolves which organization_id to use when creating a new Circle (Team).
 * @param {{ uid: string | null, orgAdminOrgIds: Set<string> }} args
 */
export function pickOrganizationIdForNewCircle({ uid, orgAdminOrgIds }) {
  if (!isFirestoreBackend) return null;
  if (!uid) return null;
  const personal = `personal_${uid}`;
  if (orgAdminOrgIds.has(personal)) return personal;
  const fromRole = [...orgAdminOrgIds][0];
  if (fromRole) return fromRole;
  // Personal workspace is created on first load; rules allow teams under personal_${uid} for that uid.
  return personal;
}
