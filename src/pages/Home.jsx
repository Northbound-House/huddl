import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44, isFirestoreBackend } from '@/api/base44Client';
import {
  diagnoseVisibleBoardsAccess,
  fetchHomeBoardVisibilityDebug,
  fetchVisibleBoards,
  fetchVisibleTeams,
  filterVisibleBoardsLocal,
} from '@/api/accessQueries';
import { db } from '@/lib/firebase';
import { LayoutGrid, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useUserAccess } from '@/context/UserAccessContext';
import MainHeader from '@/components/MainHeader';
import CreateBoardWizard from '@/components/CreateBoardWizard';
import ImportTrelloBoardDialog from '@/components/ImportTrelloBoardDialog';
import BoardSummaryCard from '@/components/BoardSummaryCard';
import { resolveBoardTeamLabel } from '@/lib/boardContributors';
import { buildContributorsAndLastActivity } from '@/lib/boardHomeBatch';
import { normalizeEmail } from '@/lib/email';
import { isFeedbackLogViewer } from '@/lib/feedbackAccess';

export default function Home() {
  const { sessionUser, isFirebaseAuth } = useAuth();
  const showTrelloImport = isFeedbackLogViewer(sessionUser?.email);
  const {
    loading: accessLoading,
    isGlobalAdmin,
    accessibleTeamIds,
    memberships,
    organizationMemberships,
    refreshAccess,
  } = useUserAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const createBoardAnchorRef = useRef(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [importTrelloOpen, setImportTrelloOpen] = useState(false);
  const [accessDiagnoseReport, setAccessDiagnoseReport] = useState(null);
  const [accessDiagnoseRunning, setAccessDiagnoseRunning] = useState(false);

  const accessDebug =
    searchParams.get('accessDebug') === '1' ||
    searchParams.get('homeDebug') === '1' ||
    (typeof window !== 'undefined' &&
      (window.localStorage?.getItem('huddl_access_debug') === '1' ||
        window.localStorage?.getItem('huddl_home_debug') === '1'));

  const accessKey = isGlobalAdmin
    ? 'all'
    : `${accessibleTeamIds?.join(',') ?? 'none'}:${sessionUser?.uid ?? ''}`;
  const memberKey = normalizeEmail(sessionUser?.email ?? '');

  const {
    data: boards = [],
    isLoading: boardsLoading,
    isError: boardsQueryError,
    error: boardsQueryErrorDetail,
    refetch: refetchBoards,
  } = useQuery({
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
    /** Default app staleTime is 30s; circle boards use `byTeam` and would look “fresh” while this list stayed stale. */
    staleTime: 0,
    enabled: !accessLoading && (!isFirestoreBackend || !!sessionUser?.uid),
  });

  const {
    data: teams = [],
    isError: teamsQueryError,
    error: teamsQueryErrorDetail,
    refetch: refetchTeams,
  } = useQuery({
    queryKey: ['teams', 'visible', accessKey, sessionUser?.uid ?? '', memberKey],
    queryFn: async () => {
      if (!isFirestoreBackend) {
        return base44.entities.Team.list('name');
      }
      return fetchVisibleTeams(db, {
        isGlobalAdmin,
        accessibleTeamIds: accessibleTeamIds ?? [],
        creatorUid: sessionUser?.uid ?? null,
        memberEmail: sessionUser?.email ?? null,
        memberUid: sessionUser?.uid ?? null,
      });
    },
    staleTime: 0,
    enabled: !accessLoading && (!isFirestoreBackend || !!sessionUser?.uid),
  });

  const membershipTeamIdsForDebug = useMemo(
    () => [...new Set(memberships.map((m) => m.team_id).filter(Boolean))],
    [memberships]
  );

  const homeDebugKey = `${accessKey}|${memberKey}|${membershipTeamIdsForDebug.join(',')}`;

  const { data: homeBoardDebugSnapshot, isFetching: homeBoardDebugFetching } = useQuery({
    queryKey: ['homeBoardVisibilityDebug', homeDebugKey, sessionUser?.uid ?? ''],
    queryFn: () =>
      fetchHomeBoardVisibilityDebug(db, {
        isGlobalAdmin,
        accessibleTeamIds: accessibleTeamIds ?? [],
        ownerUid: sessionUser?.uid ?? null,
        creatorUid: sessionUser?.uid ?? null,
        memberEmail: sessionUser?.email ?? null,
        memberUid: sessionUser?.uid ?? null,
        membershipTeamIdsFromContext: membershipTeamIdsForDebug,
      }),
    enabled:
      accessDebug && isFirestoreBackend && !!sessionUser?.uid && !accessLoading && !isGlobalAdmin,
  });

  const runAccessDiagnose = useCallback(async () => {
    if (!isFirestoreBackend || !sessionUser?.uid) {
      toast.message('Diagnostics only apply when signed in on the cloud backend.');
      return;
    }
    setAccessDiagnoseRunning(true);
    setAccessDiagnoseReport(null);
    try {
      const report = await diagnoseVisibleBoardsAccess(db, {
        isGlobalAdmin,
        accessibleTeamIds: accessibleTeamIds ?? [],
        ownerUid: sessionUser?.uid ?? null,
        creatorUid: sessionUser?.uid ?? null,
        memberEmail: sessionUser?.email ?? null,
        memberUid: sessionUser?.uid ?? null,
      });
      setAccessDiagnoseReport(report);
      console.info('[Huddl] diagnoseVisibleBoardsAccess', report);
      toast.success('Access diagnosis complete — see panel and browser console.');
    } catch (e) {
      const msg = String(e?.message || e);
      setAccessDiagnoseReport({ fatal: msg, code: e?.code });
      console.error('[Huddl] diagnoseVisibleBoardsAccess failed', e);
      toast.error(msg);
    } finally {
      setAccessDiagnoseRunning(false);
    }
  }, [
    isFirestoreBackend,
    sessionUser?.uid,
    sessionUser?.email,
    isGlobalAdmin,
    accessibleTeamIds,
  ]);

  const orgIdsKey = useMemo(
    () =>
      [...new Set(organizationMemberships.map((m) => m.organization_id).filter(Boolean))]
        .sort()
        .join(','),
    [organizationMemberships]
  );

  const { data: membershipOrgs = [] } = useQuery({
    queryKey: ['organizations', 'collaborationPrompt', orgIdsKey],
    queryFn: async () => {
      const ids = [...new Set(organizationMemberships.map((m) => m.organization_id).filter(Boolean))];
      if (!ids.length) return [];
      const rows = await Promise.all(ids.map((id) => base44.entities.Organization.get(id)));
      return rows.filter(Boolean);
    },
    enabled: isFirebaseAuth && !accessLoading && organizationMemberships.length > 0,
  });

  const showCollaborationOrgPrompt =
    isFirebaseAuth &&
    membershipOrgs.length > 0 &&
    membershipOrgs.every((o) => o.is_personal_workspace);

  useEffect(() => {
    const t = searchParams.get('team');
    if (!t || !createBoardAnchorRef.current) return;
    if (!teams.some((tm) => tm.id === t)) return;
    createBoardAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [searchParams, teams]);

  const visibleBoards = boards.filter((b) => !b.is_archived);

  const boardsForContributorBatch = useMemo(() => visibleBoards, [visibleBoards]);

  const isLoading = accessLoading || boardsLoading;

  const boardIdsKey = useMemo(
    () =>
      boardsForContributorBatch
        .map((b) => b.id)
        .sort()
        .join(','),
    [boardsForContributorBatch]
  );

  const { data: boardBatch } = useQuery({
    queryKey: [
      'boardContributors',
      boardIdsKey,
      sessionUser?.email ?? '',
      sessionUser?.photoURL ?? '',
    ],
    queryFn: () => buildContributorsAndLastActivity(boardsForContributorBatch, sessionUser),
    enabled:
      boardsForContributorBatch.length > 0 && (isFirestoreBackend || !accessLoading),
    staleTime: 45_000,
    refetchInterval: 90_000,
    refetchOnWindowFocus: true,
  });
  const contributorsByBoard = boardBatch?.contributorsByBoard ?? {};
  const lastActivityByBoard = boardBatch?.lastActivityByBoard ?? {};

  const openWizard = () => {
    if (accessLoading) {
      toast.message('Loading…');
      return;
    }
    setWizardOpen(true);
  };

  const boardsErrMsg = boardsQueryErrorDetail?.message ?? boardsQueryErrorDetail?.toString?.() ?? '';

  return (
    <div className="min-h-screen">
      <MainHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        {accessDebug ? (
          <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15 px-4 py-3 space-y-3 text-sm">
            <div className="font-semibold text-amber-950 dark:text-amber-100">Access diagnostics (debug)</div>
            <p className="text-amber-950/90 dark:text-amber-50/90 leading-relaxed">
              Turn on with <code className="rounded bg-background/60 px-1">?accessDebug=1</code> or{' '}
              <code className="rounded bg-background/60 px-1">?homeDebug=1</code>, or{' '}
              <code className="rounded bg-background/60 px-1">localStorage.huddl_access_debug = &apos;1&apos;</code> /{' '}
              <code className="rounded bg-background/60 px-1">huddl_home_debug</code>. Turn off by removing those URL
              params and clearing those keys.
            </p>
            <ul className="list-disc pl-5 text-amber-950/85 dark:text-amber-50/85 space-y-1">
              <li>
                <strong>Browser:</strong> DevTools → Network → filter <code className="text-xs">firestore</code> or
                watch for failed requests; Console for <code className="text-xs">permission-denied</code> / index
                links.
              </li>
              <li>
                <strong>Firebase Console:</strong> Firestore → open a <code className="text-xs">boards</code> doc →
                confirm <code className="text-xs">team_ids</code> / <code className="text-xs">owner_uid</code> match how
                you created the board.
              </li>
              <li>
                <strong>Rules:</strong> Firebase Console → Firestore → Rules → Rules Playground (simulate a{' '}
                <code className="text-xs">boards</code> document read as your user).
              </li>
            </ul>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono bg-background/50 rounded-lg p-2 border border-border/60">
              <dt className="text-muted-foreground">accessLoading</dt>
              <dd>{String(accessLoading)}</dd>
              <dt className="text-muted-foreground">uid</dt>
              <dd className="break-all">{sessionUser?.uid ?? '(none)'}</dd>
              <dt className="text-muted-foreground">memberKey (normalized email)</dt>
              <dd className="break-all">{memberKey || '(empty)'}</dd>
              <dt className="text-muted-foreground">context accessibleTeamIds.length</dt>
              <dd>{accessibleTeamIds?.length ?? 0}</dd>
              <dt className="text-muted-foreground">context memberships.length</dt>
              <dd>{memberships?.length ?? 0}</dd>
              <dt className="text-muted-foreground">teams query count</dt>
              <dd>{teams.length}</dd>
              <dt className="text-muted-foreground">boards query count</dt>
              <dd>{boards.length}</dd>
              <dt className="text-muted-foreground">boards query error</dt>
              <dd className="break-words text-destructive">{boardsQueryError ? boardsErrMsg : 'none'}</dd>
              <dt className="text-muted-foreground">teams query error</dt>
              <dd className="break-words text-destructive">
                {teamsQueryError ? teamsQueryErrorDetail?.message ?? String(teamsQueryErrorDetail) : 'none'}
              </dd>
              <dt className="text-muted-foreground">React Query key (boards)</dt>
              <dd className="break-all text-[11px]">
                boards|visible|{accessKey}|{sessionUser?.uid ?? ''}|{memberKey || '(no email key)'}
              </dd>
              <dt className="text-muted-foreground">membership team_ids (context)</dt>
              <dd className="break-all">{membershipTeamIdsForDebug.join(', ') || '(none)'}</dd>
            </dl>
            <div className="space-y-1">
              <div className="text-xs font-medium text-amber-950 dark:text-amber-100">
                Live Firestore snapshot{' '}
                {homeBoardDebugFetching ? (
                  <span className="text-muted-foreground font-normal">(loading…)</span>
                ) : null}
              </div>
              <p className="text-[11px] text-amber-950/80 dark:text-amber-50/80 leading-relaxed">
                Compare <strong>resolvedTeamIds</strong> with <strong>contextMembershipTeamIds</strong>. If a Circle
                appears in the context list but <strong>inContextMembershipTeamIdsNotInResolvedSet</strong> is non-empty,
                live <code className="text-[10px]">team_memberships</code> reads are not matching your session email /
                uid. If <strong>teamBoardQueries</strong> shows boards but <strong>fetchVisibleBoardsSummary.count</strong>{' '}
                is lower, rules are filtering some documents out of list queries.
              </p>
              {isGlobalAdmin ? (
                <p className="text-xs text-muted-foreground">
                  Live snapshot is skipped in local / global-admin mode (Home lists all boards without Firestore team
                  discovery).
                </p>
              ) : homeBoardDebugSnapshot ? (
                <pre className="max-h-80 overflow-auto text-[11px] bg-background/80 border border-border/60 rounded-lg p-2 whitespace-pre-wrap break-words">
                  {JSON.stringify(homeBoardDebugSnapshot, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">Snapshot runs after access finishes loading.</p>
              )}
              {homeBoardDebugSnapshot ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => {
                    void navigator.clipboard.writeText(JSON.stringify(homeBoardDebugSnapshot, null, 2));
                    toast.success('Copied home visibility snapshot JSON');
                  }}
                >
                  Copy snapshot JSON
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="rounded-lg"
                disabled={accessDiagnoseRunning || !isFirestoreBackend}
                onClick={() => void runAccessDiagnose()}
              >
                {accessDiagnoseRunning ? 'Running…' : 'Run Firestore access probe'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => {
                  void refetchBoards();
                  void refetchTeams();
                  toast.message('Refetching boards and teams…');
                }}
              >
                Refetch boards + teams
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => {
                  refreshAccess();
                  toast.message('Membership refresh requested');
                }}
              >
                refreshAccess()
              </Button>
              {accessDiagnoseReport ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => {
                    void navigator.clipboard.writeText(JSON.stringify(accessDiagnoseReport, null, 2));
                    toast.success('Copied diagnosis JSON');
                  }}
                >
                  Copy diagnosis JSON
                </Button>
              ) : null}
            </div>
            {accessDiagnoseReport ? (
              <pre className="max-h-72 overflow-auto text-xs bg-background/80 border border-border/60 rounded-lg p-2 whitespace-pre-wrap break-words">
                {JSON.stringify(accessDiagnoseReport, null, 2)}
              </pre>
            ) : null}
          </section>
        ) : null}

        {showCollaborationOrgPrompt && (
          <section className="rounded-2xl border border-primary/25 bg-primary/[0.06] dark:bg-primary/10 px-4 py-4 sm:px-5 sm:py-4">
            <p className="text-sm text-foreground leading-relaxed">
              <strong className="font-semibold">Collaborate with others:</strong> you’re set up for private work. Create a{' '}
              <strong>Circle</strong> to add people and share Huddl Boards — Circles are the top-level way to collaborate
              in Huddl.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" className="rounded-xl" asChild>
                <Link to="/circles">Create Circle</Link>
              </Button>
            </div>
          </section>
        )}

        <section
          ref={createBoardAnchorRef}
          className="rounded-2xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-5 sm:p-7 shadow-sm scroll-mt-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary shrink-0" />
                Start a Huddl
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl">
                Name your Huddl Board, choose an Ongoing or Session Huddl, pick a layout, then set who can access it.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
              <Button
                type="button"
                size="lg"
                className="rounded-xl w-full sm:w-auto px-6"
                onClick={openWizard}
                disabled={accessLoading}
              >
                <Plus className="w-4 h-4 mr-2" />
                Start a Huddl Board
              </Button>
              {showTrelloImport ? (
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="rounded-xl w-full sm:w-auto px-6"
                  onClick={() => setImportTrelloOpen(true)}
                  disabled={accessLoading}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import from Trello
                </Button>
              ) : null}
            </div>
          </div>
          {isFirebaseAuth && !isGlobalAdmin && teams.length === 0 && !accessLoading ? (
            <p className="text-sm text-muted-foreground bg-muted/40 border border-border/60 rounded-xl px-3 py-2.5 mt-5">
              You don&apos;t belong to any Circles yet — the wizard still lets you create a <strong>personal</strong>{' '}
              Huddl Board. To collaborate, join or create a Circle (use <strong>Circles</strong> in the header).
            </p>
          ) : null}
        </section>

        <CreateBoardWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          teams={teams}
          sessionUser={sessionUser}
          isFirebaseAuth={isFirebaseAuth}
          accessLoading={accessLoading}
        />

        {showTrelloImport ? (
          <ImportTrelloBoardDialog
            open={importTrelloOpen}
            onOpenChange={setImportTrelloOpen}
            sessionUser={sessionUser}
            isFirebaseAuth={isFirebaseAuth}
            accessLoading={accessLoading}
            refreshAccess={refreshAccess}
          />
        ) : null}

        <section>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-muted-foreground" />
              Your Huddl Boards
            </h2>
            {!accessDebug && isFirebaseAuth && !isGlobalAdmin ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-8 shrink-0"
                onClick={() => {
                  setSearchParams(
                    (prev) => {
                      const n = new URLSearchParams(prev);
                      n.set('homeDebug', '1');
                      return n;
                    },
                    { replace: true }
                  );
                  try {
                    window.localStorage?.setItem('huddl_home_debug', '1');
                  } catch {
                    /* ignore */
                  }
                  toast.message('Home visibility debug is on — scroll to the amber panel.');
                }}
              >
                Debug board visibility
              </Button>
            ) : null}
          </div>
          {boardsQueryError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
              <p className="font-medium">Could not load your Huddl Boards</p>
              <p className="mt-1 font-mono text-xs break-words opacity-90">{boardsErrMsg}</p>
              <p className="mt-2 text-muted-foreground text-xs">
                Add <code className="rounded bg-muted px-1">?accessDebug=1</code> or{' '}
                <code className="rounded bg-muted px-1">?homeDebug=1</code>, or use the &quot;Debug board visibility&quot;
                control above the board list, then scroll to the amber panel.
              </p>
              <Button type="button" size="sm" variant="outline" className="mt-3 rounded-lg" onClick={() => void refetchBoards()}>
                Try again
              </Button>
            </div>
          ) : null}
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-36 rounded-2xl" />
              <Skeleton className="h-36 rounded-2xl" />
            </div>
          ) : visibleBoards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 p-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                {isFirebaseAuth && !isGlobalAdmin && !accessibleTeamIds?.length
                  ? 'No Huddl Boards yet. Once you’re in a Circle with shared Huddl Boards, they’ll show up here — or create a personal Huddl Board with Start a Huddl Board.'
                  : 'No Huddl Boards yet. Add your first Item or start from a template — use Start a Huddl Board above.'}
              </p>
              {isFirebaseAuth && !isGlobalAdmin && !accessDebug ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => {
                    setSearchParams(
                      (prev) => {
                        const n = new URLSearchParams(prev);
                        n.set('homeDebug', '1');
                        return n;
                      },
                      { replace: true }
                    );
                    try {
                      window.localStorage?.setItem('huddl_home_debug', '1');
                    } catch {
                      /* ignore */
                    }
                    toast.message('Debug panel enabled — scroll up to the amber section.');
                  }}
                >
                  Why don&apos;t I see Circle boards here?
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {visibleBoards.map((b) => (
                <li key={b.id}>
                  <BoardSummaryCard
                    board={b}
                    teamLabel={resolveBoardTeamLabel(b, teams)}
                    contributors={contributorsByBoard[b.id] ?? []}
                    lastActivityIso={lastActivityByBoard[b.id] ?? null}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
