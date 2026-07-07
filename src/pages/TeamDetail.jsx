import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44, isFirestoreBackend } from '@/api/base44Client';
import { fetchVisibleBoards, filterVisibleBoardsLocal } from '@/api/accessQueries';
import { db } from '@/lib/firebase';
import { deleteField } from 'firebase/firestore';
import { ALLOWED_AUTH_EMAIL_DOMAIN, isCircleInviteEmailAllowed } from '@/lib/authPolicy';
import { normalizeEmail } from '@/lib/email';
import { sortTeamMembershipsForDisplay } from '@/lib/teamMembersSort';
import { ArrowLeft, LayoutGrid, Link2, Plus, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useUserAccess } from '@/context/UserAccessContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import BoardSummaryCard from '@/components/BoardSummaryCard';
import { reassignBoardsAfterCircleRemoved } from '@/lib/circleDelete';
import { buildContributorsAndLastActivity } from '@/lib/boardHomeBatch';
import { boardSharesTeam, boardTeamsWritePayload, getBoardTeamIds } from '@/lib/boardTeams';
import MainHeader from '@/components/MainHeader';
import { circlesPath } from '@/lib/orgPaths';
import { cn } from '@/lib/utils';

async function listMembersForTeam(teamId) {
  if (base44.entities.TeamMembership.listForTeam) {
    return base44.entities.TeamMembership.listForTeam(teamId);
  }
  return base44.entities.TeamMembership.filter({ team_id: teamId });
}

async function deleteTeamCascade(teamId) {
  if (isFirestoreBackend && base44.entities.TeamMembership.deleteAllForTeam) {
    await base44.entities.TeamMembership.deleteAllForTeam(teamId);
  } else {
    const mems = await base44.entities.TeamMembership.filter({ team_id: teamId });
    for (const m of mems) {
      await base44.entities.TeamMembership.delete(m.id);
    }
  }
  await base44.entities.Team.delete(teamId);
}

export default function TeamDetail() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { sessionUser, isFirebaseAuth } = useAuth();
  const {
    loading: accessLoading,
    isGlobalAdmin,
    accessibleTeamIds,
    memberships,
    canManageTeamMembers,
    canDeleteTeam,
    refreshAccess,
  } = useUserAccess();

  const accessKey = isGlobalAdmin
    ? 'all'
    : `${accessibleTeamIds?.join(',') ?? 'none'}:${sessionUser?.uid ?? ''}`;
  const memberKey = normalizeEmail(sessionUser?.email ?? '');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => base44.entities.Team.get(teamId),
    enabled: !!teamId,
  });

  /**
   * Firestore: if Team.get returned a doc, security rules already granted read (member, creator, or org admin).
   * Do not rely only on accessibleTeamIds — it lags behind right after creating a Circle while memberships refetch.
   */
  const canView =
    !!team &&
    (isGlobalAdmin ||
      (isFirebaseAuth && isFirestoreBackend) ||
      (accessibleTeamIds != null && accessibleTeamIds.includes(team.id)));

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['team_memberships', teamId],
    queryFn: () => listMembersForTeam(teamId),
    enabled: !!teamId && !!team,
  });

  const sortedMembers = useMemo(() => sortTeamMembershipsForDisplay(members), [members]);

  const { data: teamBoards = [], isLoading: teamBoardsLoading } = useQuery({
    queryKey: ['boards', 'byTeam', teamId],
    queryFn: () => base44.entities.Board.filter({ team_id: teamId }),
    staleTime: 0,
    enabled: !!teamId && !!team && !!canView,
  });

  const { data: visibleBoards = [] } = useQuery({
    queryKey: ['boards', 'visible', accessKey, sessionUser?.uid ?? '', memberKey],
    queryFn: async () => {
      if (!isFirestoreBackend) {
        const all = await base44.entities.Board.list();
        return filterVisibleBoardsLocal(all, {
          isGlobalAdmin,
          accessibleTeamIds: accessibleTeamIds ?? [],
          ownerUid: sessionUser?.uid ?? null,
          email: sessionUser?.email ?? null,
        });
      }
      return fetchVisibleBoards(db, {
        isGlobalAdmin,
        accessibleTeamIds: accessibleTeamIds ?? [],
        ownerUid: sessionUser?.uid ?? null,
        creatorUid: sessionUser?.uid ?? null,
        memberEmail: sessionUser?.email ?? null,
        memberUid: sessionUser?.uid ?? null,
      });
    },
    staleTime: 0,
    enabled: !!teamId && !!team && !!canView,
  });

  const sortedTeamBoards = useMemo(
    () =>
      [...teamBoards].sort((a, b) =>
        String(a.title ?? '').localeCompare(String(b.title ?? ''), undefined, { sensitivity: 'base' })
      ),
    [teamBoards]
  );

  const teamBoardIdsKey = useMemo(
    () => sortedTeamBoards.map((b) => b.id).sort().join(','),
    [sortedTeamBoards]
  );

  const { data: teamBoardBatch } = useQuery({
    queryKey: [
      'boardContributors',
      teamBoardIdsKey,
      sessionUser?.email ?? '',
      sessionUser?.photoURL ?? '',
    ],
    queryFn: () => buildContributorsAndLastActivity(sortedTeamBoards, sessionUser),
    enabled: sortedTeamBoards.length > 0 && !!canView,
    staleTime: 45_000,
    refetchInterval: 90_000,
    refetchOnWindowFocus: true,
  });
  const teamContributorsByBoard = teamBoardBatch?.contributorsByBoard ?? {};
  const teamLastActivityByBoard = teamBoardBatch?.lastActivityByBoard ?? {};

  const linkableBoards = useMemo(
    () => visibleBoards.filter((b) => !b.is_archived && !boardSharesTeam(b, teamId)),
    [visibleBoards, teamId]
  );

  const [addExistingOpen, setAddExistingOpen] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [deleteTeamOpen, setDeleteTeamOpen] = useState(false);
  const [leaveCircleOpen, setLeaveCircleOpen] = useState(false);
  const [removeMemberTarget, setRemoveMemberTarget] = useState(null);

  const myMembership = useMemo(() => {
    const fromContext = memberships.find((m) => m.team_id === teamId) ?? null;
    const em = normalizeEmail(sessionUser?.email);
    if (!em) return fromContext;
    if (fromContext && normalizeEmail(fromContext.email) === em) return fromContext;
    const fromRoster = members.find((m) => normalizeEmail(m.email) === em);
    return fromRoster ?? fromContext;
  }, [memberships, teamId, members, sessionUser?.email]);

  const canLeaveCircle = Boolean(myMembership && myMembership.role !== 'team_admin');

  /** Context memberships can lag; roster + creator flag match Firestore for Circle Lead. */
  const amCircleLeadFromRoster = useMemo(() => {
    const em = normalizeEmail(sessionUser?.email);
    if (!em || !teamId) return false;
    return members.some((m) => normalizeEmail(m.email) === em && m.role === 'team_admin');
  }, [members, teamId, sessionUser?.email]);

  const canManage = Boolean(
    team &&
      (canManageTeamMembers(team.id) ||
        amCircleLeadFromRoster ||
        (isFirestoreBackend && sessionUser?.uid && team.created_by_uid === sessionUser.uid))
  );

  useEffect(() => {
    if (!addExistingOpen || !linkableBoards.length) return;
    setSelectedBoardId((prev) =>
      prev && linkableBoards.some((b) => b.id === prev) ? prev : linkableBoards[0].id
    );
  }, [addExistingOpen, linkableBoards]);

  const addMemberMutation = useMutation({
    mutationFn: async ({ email, role }) => {
      const em = normalizeEmail(email);
      if (!isCircleInviteEmailAllowed(em)) {
        throw new Error(
          `Only @${ALLOWED_AUTH_EMAIL_DOMAIN} email addresses can be added to a Circle.`
        );
      }
      const dup = await base44.entities.TeamMembership.filter({ team_id: teamId, email: em });
      if (dup.length) throw new Error('That person is already in this Circle.');
      return base44.entities.TeamMembership.create({
        team_id: teamId,
        email: em,
        role,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_memberships', teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Person added to Circle');
      setInviteEmail('');
      refreshAccess();
    },
    onError: (e) => toast.error(e?.message || 'Could not add person'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ id }) => base44.entities.TeamMembership.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_memberships', teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      toast.success('Removed from Circle');
      refreshAccess();
    },
    onError: () => toast.error('Could not remove'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }) => base44.entities.TeamMembership.update(id, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team_memberships', teamId] });
      toast.success('Role updated');
    },
    onError: () => toast.error('Could not update role'),
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async () => {
      await reassignBoardsAfterCircleRemoved(base44, teamId, {
        uid: sessionUser?.uid ?? null,
        email: sessionUser?.email ?? null,
      });
      await deleteTeamCascade(teamId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['team_memberships'] });
      queryClient.invalidateQueries({ queryKey: ['boardContributors'] });
      toast.success('Circle removed');
      refreshAccess();
      navigate(circlesPath());
    },
    onError: () => toast.error('Could not remove Circle'),
  });

  const leaveCircleMutation = useMutation({
    mutationFn: (membershipId) => base44.entities.TeamMembership.delete(membershipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['team_memberships'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      refreshAccess();
      toast.success('You left the Circle');
      setLeaveCircleOpen(false);
      navigate(circlesPath());
    },
    onError: () => toast.error('Could not leave this Circle'),
  });

  const linkBoardMutation = useMutation({
    mutationFn: async (boardId) => {
      const rows = await base44.entities.Board.filter({ id: boardId });
      const b = rows[0];
      if (!b) throw new Error('Huddl Board not found');
      const nextIds = [...new Set([...getBoardTeamIds(b), teamId])];
      const ownerClear = isFirestoreBackend
        ? { owner_uid: deleteField(), owner_email: deleteField() }
        : { owner_uid: null, owner_email: null };
      return base44.entities.Board.update(boardId, {
        ...boardTeamsWritePayload(nextIds),
        ...ownerClear,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      queryClient.invalidateQueries({ queryKey: ['boards', 'byTeam', teamId] });
      toast.success('Huddl Board assigned to this Circle');
      setAddExistingOpen(false);
      setSelectedBoardId('');
    },
    onError: () => toast.error('Could not link Huddl Board'),
  });

  const inviteEmailDomainError = useMemo(() => {
    const t = inviteEmail.trim();
    if (!t) return null;
    const n = normalizeEmail(t);
    if (!n || !n.includes('@')) return null;
    const domain = n.slice(n.lastIndexOf('@') + 1);
    if (!domain) return null;
    if (isCircleInviteEmailAllowed(n)) return null;
    return `Only @${ALLOWED_AUTH_EMAIL_DOMAIN} addresses can be invited.`;
  }, [inviteEmail]);

  const handleInvite = (e) => {
    e.preventDefault();
    if (!canManage) return;
    const em = normalizeEmail(inviteEmail);
    if (!em || !em.includes('@')) {
      toast.error('Enter a valid email');
      return;
    }
    if (!isCircleInviteEmailAllowed(em)) {
      toast.error(`Only @${ALLOWED_AUTH_EMAIL_DOMAIN} email addresses can be added to a Circle.`);
      return;
    }
    addMemberMutation.mutate({ email: em, role: inviteRole });
  };

  const confirmDeleteTeam = () => {
    setDeleteTeamOpen(false);
    deleteTeamMutation.mutate();
  };

  const confirmRemoveMember = () => {
    if (!removeMemberTarget) return;
    removeMemberMutation.mutate({ id: removeMemberTarget.id });
    setRemoveMemberTarget(null);
  };

  const bootLoading =
    isFirebaseAuth && isFirestoreBackend ? teamLoading : accessLoading || teamLoading;

  if (bootLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen">
        <MainHeader />
        <div className="flex flex-col items-center justify-center p-6 min-h-[50vh]">
          <h2 className="font-heading font-bold text-xl mb-2">Circle not found</h2>
          <Link to="/" className="text-primary text-sm hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="min-h-screen">
        <MainHeader />
        <div className="flex flex-col items-center justify-center p-6 max-w-md mx-auto text-center min-h-[50vh]">
          <h2 className="font-heading font-bold text-xl mb-2">No access</h2>
          <p className="text-muted-foreground text-sm mb-4">
            You’re not in this Circle. Ask a Lead to add your email.
          </p>
          <Link to={circlesPath()} className="text-primary text-sm font-medium hover:underline">
            Back to Circles
          </Link>
        </div>
      </div>
    );
  }

  const backToCircles = circlesPath();

  return (
    <div className="min-h-screen">
      <MainHeader />
      <header className="border-b border-border/60 bg-card/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link to={backToCircles} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-xl font-bold truncate">{team.name}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {membersLoading ? '…' : `${members.length} ${members.length === 1 ? 'person' : 'people'}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
            {canLeaveCircle && (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setLeaveCircleOpen(true)}
                disabled={leaveCircleMutation.isPending}
              >
                <UserMinus className="w-4 h-4 mr-2" />
                Leave Circle
              </Button>
            )}
            {canDeleteTeam(team) && (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl text-destructive border-destructive/40 hover:bg-destructive/10 shrink-0"
                onClick={() => setDeleteTeamOpen(true)}
                disabled={deleteTeamMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Circle
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="flex flex-row items-center justify-between gap-3 mb-4">
            <h2 className="font-heading font-semibold flex items-center gap-2 min-w-0">
              <LayoutGrid className="w-5 h-5 text-primary shrink-0" />
              <span className="truncate">Huddl Boards</span>
            </h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-xl shrink-0"
                  aria-label="Add Huddl Board"
                >
                  <Plus className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl min-w-[16rem] z-[60]">
                <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                  <Link to={`/?team=${encodeURIComponent(teamId)}`} className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 shrink-0" aria-hidden />
                    Start a Huddl Board
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-lg cursor-pointer"
                  disabled={!canManage || linkableBoards.length === 0}
                  title={
                    !canManage
                      ? 'Only a Circle Lead can link an existing Huddl Board'
                      : linkableBoards.length === 0
                        ? 'No other Huddl Boards available to add'
                        : undefined
                  }
                  onSelect={(e) => {
                    e.preventDefault();
                    if (!canManage || linkableBoards.length === 0) return;
                    setSelectedBoardId(linkableBoards[0]?.id ?? '');
                    setAddExistingOpen(true);
                  }}
                >
                  <Link2 className="w-4 h-4 shrink-0" aria-hidden />
                  Add existing Huddl to this Circle
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {teamBoardsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sortedTeamBoards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Start a Huddl Board to organize ideas, tasks, or plans. Use the + menu to create one or add an existing Huddl,
              or ask a Circle Lead for help.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {sortedTeamBoards.map((b) => (
                <li key={b.id}>
                  <BoardSummaryCard
                    board={b}
                    teamLabel={team?.name || 'Circle'}
                    contributors={teamContributorsByBoard[b.id] ?? []}
                    lastActivityIso={teamLastActivityByBoard[b.id] ?? null}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {canManage && (
          <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <h2 className="font-heading font-semibold mb-1 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Invite to Circle
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Invite people to your Circle with an <strong className="text-foreground">@{ALLOWED_AUTH_EMAIL_DOMAIN}</strong> address
              — they’ll see shared Huddl Boards after they sign in with that email.
            </p>
            <form onSubmit={handleInvite} className="space-y-3">
              {inviteEmailDomainError && (
                <p className="text-sm text-destructive" role="alert">
                  {inviteEmailDomainError}
                </p>
              )}
              <div className="grid sm:grid-cols-2 gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={`name@${ALLOWED_AUTH_EMAIL_DOMAIN}`}
                  className={cn(
                    'rounded-xl border bg-background px-3 py-2 text-sm',
                    inviteEmailDomainError ? 'border-destructive' : 'border-input'
                  )}
                  autoComplete="email"
                />
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member — can use Huddl Boards</SelectItem>
                    <SelectItem value="team_admin">Circle Lead — can manage this Circle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                className="rounded-xl"
                disabled={addMemberMutation.isPending || Boolean(inviteEmailDomainError)}
              >
                {addMemberMutation.isPending ? 'Adding…' : 'Add to Circle'}
              </Button>
            </form>
          </section>
        )}

        <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <h2 className="font-heading font-semibold mb-4">People</h2>
          {membersLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {canManage ? 'No one yet. Add someone above.' : 'No members listed yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {sortedMembers.map((m) => {
                const isSelf = Boolean(
                  sessionUser?.email && normalizeEmail(m.email) === normalizeEmail(sessionUser.email)
                );
                return (
                  <li key={m.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 first:pt-0">
                    <span className="text-sm font-medium text-foreground min-w-[180px] break-all">{m.email}</span>
                    <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                      {canManage ? (
                        <>
                          <Select
                            value={m.role === 'team_admin' ? 'team_admin' : 'member'}
                            onValueChange={(role) => updateRoleMutation.mutate({ id: m.id, role })}
                            disabled={updateRoleMutation.isPending}
                          >
                            <SelectTrigger className="w-[220px] rounded-xl h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="team_admin">Circle Lead</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRemoveMemberTarget({ id: m.id, email: m.email })}
                          >
                            Remove
                          </Button>
                        </>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {m.role === 'team_admin' ? 'Circle Lead' : 'Member'}
                          </span>
                          {isSelf && canLeaveCircle && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => setLeaveCircleOpen(true)}
                              disabled={leaveCircleMutation.isPending}
                            >
                              <UserMinus className="w-4 h-4 mr-2" />
                              Leave Circle
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <Dialog open={addExistingOpen} onOpenChange={setAddExistingOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add existing Huddl to this Circle</DialogTitle>
            <DialogDescription className="text-left text-sm">
              Choose a Huddl Board you can access that isn’t already shared with this Circle. It will be visible to
              everyone in the Circle.
            </DialogDescription>
          </DialogHeader>
          {linkableBoards.length > 0 && (
            <div className="space-y-3 py-1">
              <Select
                value={selectedBoardId}
                onValueChange={setSelectedBoardId}
                disabled={linkBoardMutation.isPending}
              >
                <SelectTrigger className="rounded-xl w-full">
                  <SelectValue placeholder="Choose a Huddl Board…" />
                </SelectTrigger>
                <SelectContent>
                  {linkableBoards.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.title}
                      {getBoardTeamIds(b).length ? ' (adds this Circle)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setAddExistingOpen(false)}
              disabled={linkBoardMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={!selectedBoardId || linkBoardMutation.isPending}
              onClick={() => {
                if (!selectedBoardId) return;
                linkBoardMutation.mutate(selectedBoardId);
              }}
            >
              {linkBoardMutation.isPending ? 'Adding…' : 'Add to Circle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={leaveCircleOpen}
        onOpenChange={(open) => {
          if (!open) setLeaveCircleOpen(false);
        }}
        title={`Leave “${team.name}”?`}
        description={
          <>
            <p>
              You’ll lose access to this Circle’s shared Huddl Boards. To come back later, a <strong>Circle Lead</strong>{' '}
              must add your email again.
            </p>
          </>
        }
        confirmLabel="Leave Circle"
        cancelLabel="Cancel"
        variant="destructive"
        confirmPending={leaveCircleMutation.isPending}
        onConfirm={() => {
          if (myMembership?.id) leaveCircleMutation.mutate(myMembership.id);
        }}
      />

      <ConfirmDialog
        open={deleteTeamOpen}
        onOpenChange={setDeleteTeamOpen}
        title="Delete this Circle?"
        description={
          <>
            <p>
              The Circle and its membership list will be removed. <strong>No Huddl Boards are deleted.</strong>
            </p>
            <p className="mt-2">
              For each Huddl Board that was only shared with this Circle, access becomes{' '}
              <strong>yours alone</strong> — the board stays on your Home as a personal Huddl Board (owned by you). If a
              board was shared with other Circles too, only this Circle is removed from it; other Circles keep access as
              before.
            </p>
            <p className="mt-2 text-muted-foreground text-sm">
              Other members will no longer see boards that belonged only to this Circle.
            </p>
          </>
        }
        confirmLabel="Delete Circle"
        cancelLabel="Cancel"
        variant="destructive"
        confirmPhrase="delete"
        confirmPending={deleteTeamMutation.isPending}
        onConfirm={confirmDeleteTeam}
      />

      <ConfirmDialog
        open={removeMemberTarget != null}
        onOpenChange={(open) => {
          if (!open) setRemoveMemberTarget(null);
        }}
        title="Remove from Circle?"
        description={
          removeMemberTarget
            ? `Remove ${removeMemberTarget.email} from this Circle? They will lose access to its Huddl Boards.`
            : ''
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="destructive"
        confirmPending={removeMemberMutation.isPending}
        onConfirm={confirmRemoveMember}
      />
    </div>
  );
}
