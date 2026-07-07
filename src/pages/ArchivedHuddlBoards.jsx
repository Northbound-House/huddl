import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Archive } from 'lucide-react';
import { base44, isFirestoreBackend } from '@/api/base44Client';
import { fetchVisibleBoards, fetchVisibleTeams, filterVisibleBoardsLocal } from '@/api/accessQueries';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import MainHeader from '@/components/MainHeader';
import BoardSummaryCard from '@/components/BoardSummaryCard';
import { resolveBoardTeamLabel } from '@/lib/boardContributors';
import { buildContributorsAndLastActivity } from '@/lib/boardHomeBatch';
import { canAdminBoard } from '@/lib/boardAccess';
import { useAuth } from '@/lib/AuthContext';
import { useUserAccess } from '@/context/UserAccessContext';
import { normalizeEmail } from '@/lib/email';

export default function ArchivedHuddlBoards() {
  const { sessionUser } = useAuth();
  const {
    loading: accessLoading,
    isGlobalAdmin,
    accessibleTeamIds,
    isTeamAdmin,
  } = useUserAccess();

  const accessKey = isGlobalAdmin
    ? 'all'
    : `${accessibleTeamIds?.join(',') ?? 'none'}:${sessionUser?.uid ?? ''}`;
  const memberKey = normalizeEmail(sessionUser?.email ?? '');

  const { data: boards = [], isLoading: boardsLoading } = useQuery({
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
    enabled:
      !accessLoading &&
      (!isFirestoreBackend || !!sessionUser?.uid),
  });

  const { data: teams = [] } = useQuery({
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
    enabled:
      !accessLoading &&
      (!isFirestoreBackend || !!sessionUser?.uid),
  });

  const adminAccess = useMemo(
    () => ({
      uid: sessionUser?.uid ?? null,
      email: sessionUser?.email ?? null,
      isTeamAdmin,
    }),
    [sessionUser?.uid, sessionUser?.email, isTeamAdmin]
  );

  const archivedBoards = useMemo(
    () =>
      boards.filter((b) => b.is_archived && canAdminBoard(b, adminAccess)),
    [boards, adminAccess]
  );

  const boardsForContributorBatch = useMemo(() => archivedBoards, [archivedBoards]);

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
    enabled: boardsForContributorBatch.length > 0 && !accessLoading,
    staleTime: 45_000,
    refetchInterval: 90_000,
    refetchOnWindowFocus: true,
  });
  const contributorsByBoard = boardBatch?.contributorsByBoard ?? {};
  const lastActivityByBoard = boardBatch?.lastActivityByBoard ?? {};

  const isLoading = accessLoading || boardsLoading;

  return (
    <div className="min-h-screen">
      <MainHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <Button variant="ghost" size="sm" className="rounded-xl -ml-2 mb-2 w-fit" asChild>
              <Link to="/" className="gap-2 text-muted-foreground">
                <ArrowLeft className="w-4 h-4" />
                Back to Huddl
              </Link>
            </Button>
            <h1 className="font-heading font-semibold text-xl sm:text-2xl flex items-center gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted border border-border/60">
                <Archive className="w-5 h-5 text-muted-foreground" aria-hidden />
              </span>
              Archived Huddl Boards
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Boards you manage that are archived stay here until you restore them from the board header.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
          </div>
        ) : archivedBoards.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-muted/20 px-5 py-10 sm:px-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
              You don&apos;t have any archived Huddl Boards. Only <strong>Circle Leads</strong> and{' '}
              <strong>personal owners</strong> can archive a board. When you archive one, it will appear here — open it
              from this list and use <strong>Restore Huddl Board</strong> in the header to bring it back to your home
              list.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {archivedBoards.map((b) => (
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
      </main>
    </div>
  );
}
