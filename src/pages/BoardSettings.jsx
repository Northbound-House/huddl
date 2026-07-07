import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44, isFirestoreBackend } from '@/api/base44Client';
import { fetchVisibleTeams } from '@/api/accessQueries';
import { db } from '@/lib/firebase';
import { ArrowLeft, ExternalLink, Settings, Trash2, UserMinus, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useUserAccess } from '@/context/UserAccessContext';
import MainHeader from '@/components/MainHeader';
import { circleDetailPath } from '@/lib/orgPaths';
import { cn } from '@/lib/utils';
import { canAccessBoard, canAdminBoard, isPersonalBoard, isUnassignedBoard } from '@/lib/boardAccess';
import { normalizeEmail } from '@/lib/email';
import { boardTeamsWritePayload, getBoardTeamIds } from '@/lib/boardTeams';
import {
  getHuddlKindLabel,
  getLayoutLabelForBoard,
  isSessionHuddl,
} from '@/lib/huddlBoardModel';
import SessionScheduleFields from '@/components/board/SessionScheduleFields';
import {
  buildSessionScheduleFromForm,
  describeSessionSchedule,
  formatSessionScheduleSummaryFromBoard,
  isSessionScheduleComplete,
  sessionScheduleToFormState,
  sessionScheduleWritePayload,
} from '@/lib/sessionSchedule';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useBoardPresence } from '@/hooks/useBoardPresence';
import BoardOnlineIndicator from '@/components/board/BoardOnlineIndicator';

export default function BoardSettings() {
  const { id: boardId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { sessionUser: currentUser } = useAuth();
  const {
    loading: accessLoading,
    isGlobalAdmin,
    accessibleTeamIds,
    isTeamAdmin,
  } = useUserAccess();
  const accessKey = isGlobalAdmin ? 'all' : accessibleTeamIds?.join(',') ?? 'none';
  const memberKey = normalizeEmail(currentUser?.email ?? '');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [removeFromTeamOpen, setRemoveFromTeamOpen] = useState(false);
  const [deleteBoardConfirmOpen, setDeleteBoardConfirmOpen] = useState(false);
  const [assignmentMode, setAssignmentMode] = useState(
    /** @type {'personal' | 'teams'} */ ('personal')
  );
  /** Session Huddl: mirrors CreateBoardWizard options */
  const [sessionStartMode, setSessionStartMode] = useState(/** @type {'manual' | 'automatic'} */ ('manual'));
  const [sessionScheduleForm, setSessionScheduleForm] = useState(() =>
    /** @type {{ cadence: string, weekday: number, monthlyMode: string, dayOfMonth: number, biweeklyAnchorDate?: string|null }} */ ({
      cadence: 'weekly',
      weekday: 1,
      monthlyMode: 'day_of_month',
      dayOfMonth: 1,
      biweeklyAnchorDate: null,
    })
  );

  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ['board', boardId],
    queryFn: async () => {
      const rows = await base44.entities.Board.filter({ id: boardId });
      return rows[0];
    },
    enabled: !!boardId,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams', 'visible', accessKey, currentUser?.uid ?? '', memberKey],
    queryFn: async () => {
      if (!isFirestoreBackend) return base44.entities.Team.list('name');
      return fetchVisibleTeams(db, {
        isGlobalAdmin,
        accessibleTeamIds: accessibleTeamIds ?? [],
        creatorUid: currentUser?.uid ?? null,
        memberEmail: currentUser?.email ?? null,
        memberUid: currentUser?.uid ?? null,
      });
    },
    staleTime: 0,
    enabled:
      !accessLoading &&
      (!isFirestoreBackend || !!currentUser?.uid),
  });

  useEffect(() => {
    if (board) {
      setTitle(board.title ?? '');
      setDescription(board.description ?? '');
    }
  }, [board]);

  useEffect(() => {
    if (!board) return;
    if (getBoardTeamIds(board).length) setAssignmentMode('teams');
    else if (isPersonalBoard(board)) setAssignmentMode('personal');
    else if (isUnassignedBoard(board)) setAssignmentMode('teams');
    else setAssignmentMode('personal');
  }, [board]);

  useEffect(() => {
    if (!board || !isSessionHuddl(board)) return;
    setSessionStartMode(board.session_start_mode === 'automatic' ? 'automatic' : 'manual');
    setSessionScheduleForm(sessionScheduleToFormState(board));
  }, [board]);

  const patchSessionScheduleForm = React.useCallback((patch) => {
    setSessionScheduleForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const builtSessionSchedule = useMemo(
    () => buildSessionScheduleFromForm(sessionScheduleForm),
    [sessionScheduleForm]
  );

  const boardTeamIds = useMemo(() => getBoardTeamIds(board ?? null), [board]);
  const linkedTeamsQueryKey = useMemo(
    () => ['board', boardId, 'linkedTeams', [...boardTeamIds].sort().join(',')],
    [boardId, boardTeamIds]
  );
  const { data: boardLinkedTeams } = useQuery({
    queryKey: linkedTeamsQueryKey,
    queryFn: () => Promise.all(boardTeamIds.map((id) => base44.entities.Team.get(id))),
    enabled: !!boardId && boardTeamIds.length > 0,
  });
  const teamCreatedByUid = useMemo(() => {
    const out = {};
    for (const t of boardLinkedTeams ?? []) {
      if (t?.id) out[t.id] = t.created_by_uid ?? null;
    }
    return out;
  }, [boardLinkedTeams]);

  const userCanAdminBoard = useMemo(
    () =>
      board
        ? canAdminBoard(board, {
            uid: currentUser?.uid ?? null,
            email: currentUser?.email ?? null,
            isTeamAdmin,
            teamCreatedByUid,
          })
        : false,
    [board, currentUser?.uid, currentUser?.email, isTeamAdmin, teamCreatedByUid]
  );

  const canView = useMemo(() => {
    if (!board) return false;
    if (isFirestoreBackend) return true;
    return canAccessBoard(board, {
      accessibleTeamIds: accessibleTeamIds ?? [],
      uid: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
    });
  }, [board, accessibleTeamIds, currentUser?.uid, currentUser?.email]);

  const presenceEnabled = Boolean(
    boardId &&
      board &&
      currentUser &&
      (!isFirestoreBackend || !!currentUser.uid) &&
      canView
  );
  const { onlineUsers, myPresenceUid } = useBoardPresence({
    boardId,
    enabled: presenceEnabled,
    sessionUser: currentUser,
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Board.update(boardId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      toast.success('Huddl Board updated');
    },
    onError: () => toast.error('Could not save changes'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Board.delete(boardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      toast.success('Huddl Board deleted');
      navigate('/');
    },
    onError: () => toast.error('Could not delete Huddl Board'),
  });

  const assignedTeamNames = boardTeamIds
    .map((id) => teams.find((t) => t.id === id)?.name)
    .filter(Boolean);
  const personal = board && isPersonalBoard(board);

  const ownerLabel = (() => {
    if (!board || !personal) return null;
    if (board.owner_uid && currentUser?.uid && board.owner_uid === currentUser.uid) {
      return currentUser.email ? `You (${currentUser.email})` : 'You';
    }
    if (board.owner_email) return board.owner_email;
    return 'Personal Huddl Board';
  })();

  const handleSaveDetails = (e) => {
    e.preventDefault();
    if (!userCanAdminBoard) return;
    const t = title.trim();
    if (!t) {
      toast.error('Title is required');
      return;
    }
    updateMutation.mutate({
      title: t,
      description: (description || '').trim(),
    });
  };

  const handleSaveSessionScheduling = () => {
    if (!userCanAdminBoard || !board || !isSessionHuddl(board)) return;
    if (sessionStartMode === 'automatic' && !isSessionScheduleComplete(builtSessionSchedule)) {
      toast.error('Finish the session schedule (cadence and day).');
      return;
    }
    const sched =
      sessionStartMode === 'automatic' && builtSessionSchedule
        ? sessionScheduleWritePayload(builtSessionSchedule)
        : { session_schedule: null, session_frequency: null };
    updateMutation.mutate({
      session_start_mode: sessionStartMode,
      ...sched,
    });
  };

  const applyTeamScope = (val) => {
    if (!userCanAdminBoard) return;
    if (val === '__personal__') {
      if (isFirestoreBackend && !currentUser?.uid && !currentUser?.email) {
        toast.error('Sign in to make this a personal Huddl Board.');
        return;
      }
      updateMutation.mutate({
        team_ids: [],
        team_id: null,
        owner_uid: currentUser?.uid ?? null,
        owner_email: !currentUser?.uid ? currentUser?.email ?? null : null,
      });
    }
  };

  const onAssignmentModeChange = (mode) => {
    if (!userCanAdminBoard) return;
    if (mode === 'personal') {
      applyTeamScope('__personal__');
      setAssignmentMode('personal');
    } else if (mode === 'teams') {
      setAssignmentMode('teams');
    }
  };

  const toggleBoardTeam = (teamId) => {
    if (!userCanAdminBoard) return;
    const current = getBoardTeamIds(board);
    const next = current.includes(teamId) ? current.filter((x) => x !== teamId) : [...current, teamId];
    if (next.length === 0) {
      toast.error('Select at least one Circle, or choose Personal.');
      return;
    }
    updateMutation.mutate({
      ...boardTeamsWritePayload(next),
      owner_uid: null,
      owner_email: null,
    });
  };

  const openRemoveFromTeamDialog = () => {
    if (!userCanAdminBoard || !boardTeamIds.length) return;
    if (isFirestoreBackend && !currentUser?.uid && !currentUser?.email) {
      toast.error('Sign in to make this a personal Huddl Board.');
      return;
    }
    setRemoveFromTeamOpen(true);
  };

  const confirmRemoveFromTeam = () => {
    setRemoveFromTeamOpen(false);
    applyTeamScope('__personal__');
  };

  const openDeleteBoardDialog = () => {
    if (!userCanAdminBoard) return;
    setDeleteBoardConfirmOpen(true);
  };

  const confirmDeleteBoardSettings = () => {
    setDeleteBoardConfirmOpen(false);
    deleteMutation.mutate();
  };

  if ((!isFirestoreBackend && accessLoading) || boardLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <h2 className="font-heading font-bold text-xl mb-2">Huddl Board not found</h2>
        <Link to="/" className="text-primary text-sm hover:underline">
          Back to Huddl
        </Link>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 max-w-md mx-auto text-center">
        <h2 className="font-heading font-bold text-xl mb-2">No access</h2>
        <p className="text-muted-foreground text-sm mb-4">
          You can’t open settings for this Huddl Board. Ask a Circle Lead or the personal owner to grant access.
        </p>
        <Link to="/" className="text-primary text-sm font-medium hover:underline">
          Back to Huddl
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MainHeader />
      <header className="border-b border-border/60 bg-card/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Link
              to={`/board/${boardId}`}
              className="p-2 rounded-xl hover:bg-muted transition-colors shrink-0"
              aria-label="Back to Huddl Board"
            >
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary to-accent shrink-0">
                <Settings className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="font-heading font-bold text-lg truncate">Huddl Board settings</h1>
                <p className="text-xs text-muted-foreground truncate">{board.title}</p>
              </div>
            </div>
          </div>
          <BoardOnlineIndicator
            onlineUsers={onlineUsers}
            sessionUser={currentUser}
            myPresenceUid={myPresenceUid}
          />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {!userCanAdminBoard && (
          <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3">
            You can view these settings, but only <strong>Circle Leads</strong> or the <strong>personal owner</strong> can
            change them.
          </p>
        )}

        <section className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6 shadow-sm space-y-4">
          <h2 className="font-heading font-semibold text-base flex items-center gap-2">
            <UsersRound className="w-5 h-5 text-primary" />
            Name & description
          </h2>
          <form onSubmit={handleSaveDetails} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Huddl Board title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!userCanAdminBoard}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                placeholder="Huddl Board title"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!userCanAdminBoard}
                rows={3}
                className="mt-1 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                placeholder="Context for this Huddl Board"
              />
            </div>
            <Button type="submit" className="rounded-xl" disabled={!userCanAdminBoard || updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6 shadow-sm space-y-4">
          <h2 className="font-heading font-semibold text-base">Circle & visibility</h2>
          <p className="text-sm text-muted-foreground">
            Choose who this Huddl Board belongs to. Circle Huddl Boards are visible to everyone in that Circle. Personal
            Huddl Boards are only for the owner.
          </p>
          {boardTeamIds.length > 0 && userCanAdminBoard && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] dark:bg-amber-500/10 p-4 space-y-3">
              <p className="text-sm text-foreground">
                This Huddl Board is shared with{' '}
                <strong>{assignedTeamNames.length ? assignedTeamNames.join(', ') : 'one or more Circles'}</strong>. Remove
                it from all Circles to make it a <strong>personal</strong> Huddl Board you own — other Circle members will
                lose access.
              </p>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-amber-500/40 hover:bg-amber-500/10"
                onClick={openRemoveFromTeamDialog}
                disabled={updateMutation.isPending}
              >
                <UserMinus className="w-4 h-4 mr-2" />
                Remove from Circle
              </Button>
            </div>
          )}
          <div>
            <span className="text-xs font-medium text-muted-foreground">Assignment</span>
            <div className="mt-2 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="board-assignment"
                  className="mt-1 h-4 w-4"
                  checked={assignmentMode === 'personal'}
                  disabled={!userCanAdminBoard}
                  onChange={() => onAssignmentModeChange('personal')}
                />
                <span className="text-sm">
                  <span className="font-medium text-foreground">Personal</span>
                  <span className="text-muted-foreground"> — only the owner</span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="board-assignment"
                  className="mt-1 h-4 w-4"
                  checked={assignmentMode === 'teams'}
                  disabled={!userCanAdminBoard}
                  onChange={() => onAssignmentModeChange('teams')}
                />
                <span className="text-sm">
                  <span className="font-medium text-foreground">Circle</span>
                  <span className="text-muted-foreground">
                    {' '}
                    — share this Huddl Board with everyone in the Circle(s) you select below
                  </span>
                </span>
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              <strong>Remove from Circle</strong> above is a shortcut to make the Huddl Board personal.
            </p>
          </div>
          {assignmentMode === 'teams' && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Circles with access</p>
              {teams.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Circles available — join a Circle or create one on the Circles page.
                </p>
              ) : (
                <ul className="space-y-2">
                  {teams.map((t) => {
                    const checked = boardTeamIds.includes(t.id);
                    return (
                      <li key={t.id} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={`board-team-${t.id}`}
                          checked={checked}
                          disabled={!userCanAdminBoard || updateMutation.isPending}
                          onChange={() => toggleBoardTeam(t.id)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <label htmlFor={`board-team-${t.id}`} className="text-sm cursor-pointer flex-1">
                          {t.name}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {boardTeamIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {boardTeamIds.map((tid) => {
                const tname = teams.find((x) => x.id === tid)?.name || 'Circle';
                const teamHref = circleDetailPath(tid);
                return (
                  <Button key={tid} variant="outline" className="rounded-xl" asChild>
                    <Link to={teamHref} className="gap-2">
                      <ExternalLink className="w-4 h-4" />
                      {tname}
                    </Link>
                  </Button>
                );
              })}
            </div>
          )}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              Huddl type:{' '}
              <span className="font-medium text-foreground">{getHuddlKindLabel(board)}</span>
              {getLayoutLabelForBoard(board) ? (
                <>
                  {' '}
                  · <span className="font-medium text-foreground">{getLayoutLabelForBoard(board)}</span>
                </>
              ) : null}{' '}
              (layout set when created)
            </p>
          </div>

          {isSessionHuddl(board) && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4 mt-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Session scheduling</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  How new retrospective sessions are started. Past sessions stay in history regardless of this setting.
                </p>
              </div>
              {userCanAdminBoard ? (
                <>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">How should sessions start?</p>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={updateMutation.isPending}
                        onClick={() => setSessionStartMode('manual')}
                        className={cn(
                          'rounded-xl border px-3 py-3 text-left text-sm transition-colors',
                          sessionStartMode === 'manual'
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                            : 'border-border/80 hover:bg-muted/40'
                        )}
                      >
                        <span className="font-medium text-foreground">Manually</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          You start the next session when ready
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={updateMutation.isPending}
                        onClick={() => setSessionStartMode('automatic')}
                        className={cn(
                          'rounded-xl border px-3 py-3 text-left text-sm transition-colors',
                          sessionStartMode === 'automatic'
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                            : 'border-border/80 hover:bg-muted/40'
                        )}
                      >
                        <span className="font-medium text-foreground">Automatically</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          Use a repeating schedule (stored on this board)
                        </span>
                      </button>
                    </div>
                  </div>
                  {sessionStartMode === 'automatic' && (
                    <>
                      <SessionScheduleFields
                        idPrefix="board-settings-session-sched"
                        disabled={updateMutation.isPending}
                        value={sessionScheduleForm}
                        onChange={patchSessionScheduleForm}
                      />
                      <p className="text-xs text-muted-foreground leading-relaxed rounded-xl border border-border/50 bg-background/80 px-3 py-2">
                        {describeSessionSchedule({
                          ...board,
                          session_start_mode: 'automatic',
                          session_schedule: builtSessionSchedule,
                        })}
                      </p>
                    </>
                  )}
                  <Button
                    type="button"
                    className="rounded-xl"
                    disabled={updateMutation.isPending}
                    onClick={handleSaveSessionScheduling}
                  >
                    {updateMutation.isPending ? 'Saving…' : 'Save session scheduling'}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sessions:{' '}
                  <span className="font-medium text-foreground">
                    {board.session_start_mode === 'automatic'
                      ? `Automatic · ${formatSessionScheduleSummaryFromBoard(board) || 'scheduled'}`
                      : 'Manual'}
                  </span>
                </p>
              )}
            </div>
          )}
        </section>

        {personal && (
          <section className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6 shadow-sm space-y-4">
            <h2 className="font-heading font-semibold text-base">Owner</h2>
            <p className="text-sm text-muted-foreground">
              Personal Huddl Boards are private to you and are not shared with other people. To collaborate, assign this
              Huddl Board to a Circle in <strong>Circle & visibility</strong> above, or create a Circle on the{' '}
              <Link to="/circles" className="text-primary font-medium hover:underline">
                Circles
              </Link>{' '}
              page.
            </p>
            <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Owner: </span>
              <span className="font-medium text-foreground">{ownerLabel}</span>
            </div>
          </section>
        )}

        {boardTeamIds.length > 0 && (
          <section className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6 shadow-sm space-y-2">
            <h2 className="font-heading font-semibold text-base">Members & roles</h2>
            <p className="text-sm text-muted-foreground">
              This Huddl Board is shared with everyone in the selected Circles. Add or remove people and assign Leads on
              each Circle page.
            </p>
            <div className="flex flex-wrap gap-2">
              {boardTeamIds.map((tid) => {
                const teamHref = circleDetailPath(tid);
                return (
                  <Button key={tid} variant="outline" className="rounded-xl" asChild>
                    <Link to={teamHref}>
                      Manage: {teams.find((x) => x.id === tid)?.name || 'Circle'}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </section>
        )}

        {userCanAdminBoard && (
          <section className="rounded-2xl border border-destructive/30 bg-card p-5 sm:p-6 shadow-sm space-y-3">
            <h2 className="font-heading font-semibold text-base text-destructive">Danger zone</h2>
            <p className="text-sm text-muted-foreground">
              Deleting a Huddl Board removes all Sections, Items, and retrospective history. This cannot be undone.
            </p>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl"
              onClick={openDeleteBoardDialog}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteMutation.isPending ? 'Deleting…' : 'Delete this Huddl Board'}
            </Button>
          </section>
        )}

        <div className="pb-8">
          <Button variant="ghost" className="rounded-xl" asChild>
            <Link to={`/board/${boardId}`}>← Back to Huddl Board</Link>
          </Button>
        </div>
      </main>

      <ConfirmDialog
        open={removeFromTeamOpen}
        onOpenChange={setRemoveFromTeamOpen}
        title="Remove Huddl Board from Circle?"
        description={`Remove this Huddl Board from ${assignedTeamNames.length ? assignedTeamNames.join(', ') : 'these Circles'}? It will become a personal Huddl Board owned by you. Other Circle members will no longer see it.`}
        confirmLabel="Remove from Circle"
        cancelLabel="Cancel"
        variant="destructive"
        confirmPending={updateMutation.isPending}
        onConfirm={confirmRemoveFromTeam}
      />

      <ConfirmDialog
        open={deleteBoardConfirmOpen}
        onOpenChange={setDeleteBoardConfirmOpen}
        title="Delete this Huddl Board?"
        description="This permanently removes all Sections, Items, and retrospective history. This cannot be undone."
        confirmLabel="Delete Huddl Board"
        cancelLabel="Cancel"
        variant="destructive"
        confirmPhrase="delete"
        confirmPending={deleteMutation.isPending}
        onConfirm={confirmDeleteBoardSettings}
      />
    </div>
  );
}
