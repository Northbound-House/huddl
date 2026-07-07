import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44, isFirestoreBackend } from '@/api/base44Client';
import { normalizeEmail } from '@/lib/email';

const UserAccessContext = createContext(null);

/** Local dev (no Firebase): treat as full access. Firebase: Circle / org membership only — no global admin role. */
function resolveIsGlobalAdmin(isFirebaseAuth) {
  return !isFirebaseAuth;
}

export function UserAccessProvider({ children }) {
  const { sessionUser, isFirebaseAuth } = useAuth();
  const email = normalizeEmail(sessionUser?.email);
  const uid = sessionUser?.uid;

  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState([]);
  const [organizationMemberships, setOrganizationMemberships] = useState([]);
  const [refreshTick, setRefreshTick] = useState(0);
  /** Last identity we finished loading for — used to avoid `accessLoading` during `refreshAccess()` only. */
  const accessIdentityRef = useRef(null);

  const isGlobalAdmin = resolveIsGlobalAdmin(isFirebaseAuth);

  const refreshAccess = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    if (!isFirebaseAuth) {
      accessIdentityRef.current = null;
      setLoading(false);
      setMemberships([]);
      setOrganizationMemberships([]);
      return;
    }

    const hasEmail = Boolean(email);
    const teamByUid =
      isFirestoreBackend && uid && typeof base44.entities.TeamMembership?.listForUid === 'function';

    if (!hasEmail && !teamByUid) {
      accessIdentityRef.current = null;
      setLoading(false);
      setMemberships([]);
      setOrganizationMemberships([]);
      return;
    }

    const identity = `${email || ''}|${uid || ''}`;
    const prevIdentity = accessIdentityRef.current;
    const identityChanged = prevIdentity != null && prevIdentity !== identity;
    /**
     * `refreshAccess()` bumps tick — do not flip global loading or Home will disable board queries and lists “blink”.
     * Requires a prior successful load (`prevIdentity` set) so retries after errors still show the spinner.
     */
    const silentRefresh = refreshTick > 0 && !identityChanged && prevIdentity != null;

    let cancelled = false;
    (async () => {
      if (!silentRefresh) {
        setLoading(true);
      }
      try {
        let mems = [];
        if (isFirestoreBackend && hasEmail && base44.entities.TeamMembership?.syncUidForEmail) {
          mems = await base44.entities.TeamMembership.listForEmail(email);
          if (uid) await base44.entities.TeamMembership.syncUidForEmail(email, uid);
          mems = await base44.entities.TeamMembership.listForEmail(email);
        } else if (isFirestoreBackend && !hasEmail && teamByUid) {
          mems = await base44.entities.TeamMembership.listForUid(uid);
        } else if (hasEmail) {
          mems = await base44.entities.TeamMembership.filter({ email });
        }

        let orgMems = [];
        if (hasEmail && base44.entities.OrganizationMembership?.listForEmail) {
          orgMems = await base44.entities.OrganizationMembership.listForEmail(email);
          if (isFirestoreBackend && uid && base44.entities.OrganizationMembership.syncUidForEmail) {
            await base44.entities.OrganizationMembership.syncUidForEmail(email, uid);
            orgMems = await base44.entities.OrganizationMembership.listForEmail(email);
          }
        } else if (
          !hasEmail &&
          isFirestoreBackend &&
          uid &&
          typeof base44.entities.OrganizationMembership?.listForUid === 'function'
        ) {
          orgMems = await base44.entities.OrganizationMembership.listForUid(uid);
        }

        if (isFirestoreBackend && uid && hasEmail && base44.entities.Organization?.ensurePersonalWorkspaceForUser) {
          if (orgMems.length === 0) {
            try {
              await base44.entities.Organization.ensurePersonalWorkspaceForUser({ uid, email });
              orgMems = await base44.entities.OrganizationMembership.listForEmail(email);
              if (uid && base44.entities.OrganizationMembership.syncUidForEmail) {
                await base44.entities.OrganizationMembership.syncUidForEmail(email, uid);
                orgMems = await base44.entities.OrganizationMembership.listForEmail(email);
              }
            } catch (e) {
              console.warn('ensurePersonalWorkspaceForUser', e);
            }
          }
        }

        if (cancelled) return;
        setMemberships(mems);
        setOrganizationMemberships(orgMems);
        accessIdentityRef.current = identity;
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          accessIdentityRef.current = null;
          setMemberships([]);
          setOrganizationMemberships([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isFirebaseAuth, isFirestoreBackend, email, uid, refreshTick]);

  const accessibleTeamIds = useMemo(() => {
    if (!isFirebaseAuth) return null;
    if (isGlobalAdmin) return null;
    return [...new Set(memberships.map((m) => m.team_id).filter(Boolean))];
  }, [isFirebaseAuth, isGlobalAdmin, memberships]);

  const orgAdminOrgIds = useMemo(() => {
    const ids = organizationMemberships
      .filter((m) => m.role === 'org_admin')
      .map((m) => m.organization_id)
      .filter(Boolean);
    return new Set(ids);
  }, [organizationMemberships]);

  /** Firestore: backfill member_emails / admin_emails (only callers allowed by rules: circle/org leads). */
  useEffect(() => {
    if (!isFirestoreBackend || !isFirebaseAuth || loading || !email) return;
    const Team = base44.entities.Team;
    const Org = base44.entities.Organization;
    if (!Team?.syncMemberDenorm || !Org?.syncMemberDenorm) return;

    const leadTeamIds = new Set(
      memberships.filter((m) => m.role === 'team_admin').map((m) => m.team_id).filter(Boolean)
    );
    leadTeamIds.forEach((tid) => {
      void Team.syncMemberDenorm(tid).catch(() => {});
    });

    const adminOrgIds = organizationMemberships
      .filter((m) => m.role === 'org_admin')
      .map((m) => m.organization_id)
      .filter(Boolean);
    const uniqueOrgIds = [...new Set(adminOrgIds)];
    uniqueOrgIds.forEach((oid) => {
      void Org.syncMemberDenorm(oid).catch(() => {});
    });

    if (Team.filter && uniqueOrgIds.length) {
      uniqueOrgIds.forEach((oid) => {
        void (async () => {
          try {
            const orgTeams = await Team.filter({ organization_id: oid });
            orgTeams.forEach((t) => {
              if (t?.id) void Team.syncMemberDenorm(t.id).catch(() => {});
            });
          } catch {
            /* ignore */
          }
        })();
      });
    }
  }, [isFirestoreBackend, isFirebaseAuth, loading, email, uid, memberships, organizationMemberships]);

  const isTeamAdmin = useCallback(
    (teamId) => {
      if (!isFirebaseAuth) return true;
      if (isGlobalAdmin) return true;
      return memberships.some((m) => m.team_id === teamId && m.role === 'team_admin');
    },
    [isFirebaseAuth, isGlobalAdmin, memberships]
  );

  const canManageTeamMembers = useCallback(
    (teamId) => {
      if (!isFirebaseAuth) return true;
      if (isGlobalAdmin) return true;
      return memberships.some((m) => m.team_id === teamId && m.role === 'team_admin');
    },
    [isFirebaseAuth, isGlobalAdmin, memberships]
  );

  const isOrgAdmin = useCallback(
    (organizationId) => {
      if (!organizationId) return false;
      if (!isFirebaseAuth) return true;
      if (isGlobalAdmin) return true;
      return orgAdminOrgIds.has(organizationId);
    },
    [isFirebaseAuth, isGlobalAdmin, orgAdminOrgIds]
  );

  /** Firebase: any signed-in user may create a Circle (scoped to their personal workspace org in Firestore rules). */
  const canCreateTeam = !isFirebaseAuth || isGlobalAdmin || (isFirebaseAuth && !!uid);

  const canDeleteTeam = useCallback(
    (team) => {
      if (!team?.id) return false;
      if (!isFirebaseAuth) return true;
      if (isGlobalAdmin) return true;
      if (isTeamAdmin(team.id)) return true;
      if (team?.organization_id && orgAdminOrgIds.has(team.organization_id)) return true;
      return false;
    },
    [isFirebaseAuth, isGlobalAdmin, isTeamAdmin, orgAdminOrgIds]
  );

  const value = useMemo(
    () => ({
      loading: isFirebaseAuth && loading,
      isGlobalAdmin,
      memberships,
      organizationMemberships,
      orgAdminOrgIds,
      accessibleTeamIds,
      isTeamAdmin,
      canManageTeamMembers,
      isOrgAdmin,
      canCreateTeam,
      canDeleteTeam,
      refreshAccess,
    }),
    [
      isFirebaseAuth,
      loading,
      isGlobalAdmin,
      memberships,
      organizationMemberships,
      orgAdminOrgIds,
      accessibleTeamIds,
      isTeamAdmin,
      canManageTeamMembers,
      isOrgAdmin,
      canCreateTeam,
      canDeleteTeam,
      refreshAccess,
    ]
  );

  return <UserAccessContext.Provider value={value}>{children}</UserAccessContext.Provider>;
}

export function useUserAccess() {
  const ctx = useContext(UserAccessContext);
  if (!ctx) {
    throw new Error('useUserAccess must be used within UserAccessProvider');
  }
  return ctx;
}
