import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { base44, isFirestoreBackend } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import BoardColumnComponent from '@/components/board/BoardColumnComponent';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  CalendarDays,
  History,
  Lock,
  Plus,
  Settings,
  Trash2,
  Unlock,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useUserAccess } from '@/context/UserAccessContext';
import MainHeader from '@/components/MainHeader';
import { canAccessBoard, canAdminBoard } from '@/lib/boardAccess';
import { getBoardTeamIds } from '@/lib/boardTeams';
import { normalizeEmail } from '@/lib/email';
import { cn } from '@/lib/utils';
import { isSessionHuddl } from '@/lib/huddlBoardModel';
import { formatRetroLongDate, formatRetroShortDate, getLocalDateKey } from '@/lib/retrospectiveDates';
import { useFirestoreBoardLiveSync } from '@/hooks/useFirestoreBoardLiveSync';
import { trackEvent } from '@/lib/analytics';
import { useBoardPresence } from '@/hooks/useBoardPresence';
import BoardOnlineIndicator from '@/components/board/BoardOnlineIndicator';
import { collectVoterEmailsFromCards } from '@/lib/voterEmails';
import { appendActivityLog } from '@/lib/itemModel';
import { openSessionsToCloseBeforeAnchor } from '@/lib/sessionSchedule';

const DND_TYPE_COLUMN = 'COLUMN';

/** LocalStorage backend only: poll for multi-tab / simulated collaboration. Firestore uses live listeners. */
const LIVE_BOARD_POLL_MS = 5000;

export default function Board() {
  const { id: boardId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { sessionUser: currentUser } = useAuth();
  const { loading: accessLoading, accessibleTeamIds, isTeamAdmin } = useUserAccess();

  const boardQueryKey = useMemo(() => ['board', boardId], [boardId]);
  const columnsQueryKey = useMemo(() => ['columns', boardId], [boardId]);

  const pollMs = isFirestoreBackend ? false : LIVE_BOARD_POLL_MS;

  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: boardQueryKey,
    queryFn: async () => {
      const boards = await base44.entities.Board.filter({ id: boardId });
      return boards[0];
    },
    enabled: !!boardId,
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
  });

  /** One-shot backfill of `board_collaborator_*` for circle boards created before denorm rules (see firestoreDataClient). */
  const collabDenormAttemptKeyRef = useRef('');

  useEffect(() => {
    if (!isFirestoreBackend || !boardId || !board) return;
    if (!getBoardTeamIds(board).length) return;
    const collab = board.board_collaborator_emails;
    if (Array.isArray(collab) && collab.length > 0) return;

    const attemptKey = `${boardId}:${(board.team_ids || []).join(',') || board.team_id || ''}`;
    if (collabDenormAttemptKeyRef.current === attemptKey) return;
    collabDenormAttemptKeyRef.current = attemptKey;

    let cancelled = false;
    (async () => {
      try {
        await base44.entities.Board.update(boardId, { updated_at: new Date().toISOString() });
        if (!cancelled) {
          queryClient.invalidateQueries({ queryKey: ['boards'] });
          queryClient.invalidateQueries({ queryKey: boardQueryKey });
        }
      } catch (e) {
        collabDenormAttemptKeyRef.current = '';
        console.warn('board collaborator denorm backfill', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFirestoreBackend, boardId, board, boardQueryKey, queryClient]);

  const { data: columns = [], isLoading: columnsLoading } = useQuery({
    queryKey: columnsQueryKey,
    queryFn: () => base44.entities.BoardColumn.filter({ board_id: boardId }, 'order'),
    enabled: !!boardId,
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
  });

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [columns]
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

  const isSessionHuddlBoard = useMemo(() => (board ? isSessionHuddl(board) : false), [board]);
  const sessionIdFromUrl = searchParams.get('session');
  const focusItemId = searchParams.get('item');
  /** Calendar “today” for live session — default board view always uses this, not schedule period anchors. */
  const todayKey = getLocalDateKey();

  const getItemDeepLink = useCallback(
    (cardId) => {
      const u = new URL(`${window.location.origin}/board/${boardId}`);
      const session = searchParams.get('session');
      if (session) u.searchParams.set('session', session);
      u.searchParams.set('item', cardId);
      return `${u.pathname}${u.search}`;
    },
    [boardId, searchParams]
  );

  const setItemInUrl = useCallback(
    (cardId) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (cardId) next.set('item', cardId);
          else next.delete('item');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const retroSessionsQueryKey = useMemo(() => ['retroSessions', boardId], [boardId]);
  const retroSessionQueryKey = useMemo(
    () => ['retroSession', boardId, sessionIdFromUrl ? `id:${sessionIdFromUrl}` : `live:${todayKey}`],
    [boardId, sessionIdFromUrl, todayKey]
  );

  const { data: retroSessionList = [] } = useQuery({
    queryKey: retroSessionsQueryKey,
    queryFn: () => base44.entities.RetrospectiveSession.filter({ board_id: boardId }),
    enabled: !!boardId && !!board && isSessionHuddlBoard,
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
  });

  const { data: activeRetroSession, isLoading: retroSessionLoading } = useQuery({
    queryKey: retroSessionQueryKey,
    queryFn: async () => {
      if (sessionIdFromUrl) {
        const list = await base44.entities.RetrospectiveSession.filter({ board_id: boardId });
        return list.find((s) => s.id === sessionIdFromUrl) ?? null;
      }
      return base44.entities.RetrospectiveSession.getOrCreateForDate(boardId, todayKey);
    },
    enabled: !!boardId && !!board && isSessionHuddlBoard,
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
  });

  const cardsQueryKey = useMemo(
    () => ['cards', boardId, isSessionHuddlBoard ? activeRetroSession?.id : 'all'],
    [boardId, isSessionHuddlBoard, activeRetroSession?.id]
  );

  const liveSyncEnabled =
    !!boardId &&
    !!board &&
    (!isSessionHuddlBoard || (!!activeRetroSession?.id && !retroSessionLoading));

  useFirestoreBoardLiveSync({
    queryClient,
    boardId,
    boardQueryKey,
    columnsQueryKey,
    cardsQueryKey,
    retroSessionsQueryKey,
    retroSessionQueryKey,
    activeRetroSessionId: activeRetroSession?.id,
    enabled: liveSyncEnabled,
    isSessionHuddlBoard,
    sessionId: isSessionHuddlBoard ? activeRetroSession?.id : undefined,
  });

  const presenceEnabled = Boolean(
    boardId &&
      board &&
      currentUser &&
      (!isFirestoreBackend || !!currentUser.uid)
  );
  const { onlineUsers, myPresenceUid } = useBoardPresence({
    boardId,
    enabled: presenceEnabled,
    sessionUser: currentUser,
  });

  const { data: cards = [] } = useQuery({
    queryKey: cardsQueryKey,
    queryFn: () =>
      isSessionHuddlBoard && activeRetroSession?.id
        ? base44.entities.Card.filter({ board_id: boardId, session_id: activeRetroSession.id })
        : base44.entities.Card.filter({ board_id: boardId }),
    enabled:
      !!boardId &&
      !!board &&
      (!isSessionHuddlBoard || (!!activeRetroSession?.id && !retroSessionLoading)),
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
  });

  const boardLabelsQueryKey = useMemo(() => ['board_labels', boardId], [boardId]);
  const { data: boardLabels = [] } = useQuery({
    queryKey: boardLabelsQueryKey,
    queryFn: () => base44.entities.BoardLabel.filter({ board_id: boardId }),
    enabled: !!boardId,
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
  });

  const voterEmails = useMemo(() => collectVoterEmailsFromCards(cards), [cards]);
  const voterEmailsKey = useMemo(() => [...voterEmails].sort().join('|'), [voterEmails]);

  const { data: voterPhotoByEmail = {} } = useQuery({
    queryKey: ['public_profiles', 'batch', boardId, voterEmailsKey],
    queryFn: () => base44.entities.PublicProfile.getByEmails(voterEmails),
    enabled: voterEmails.length > 0 && !!boardId,
    staleTime: 60_000,
  });

  /** Read-only: closed session, or viewing an older session from Past sessions (URL). Live “today” session is editable when open. */
  const boardReadOnly = Boolean(
    isSessionHuddlBoard &&
      activeRetroSession &&
      (Boolean(activeRetroSession.closed_at) ||
        (Boolean(sessionIdFromUrl) && activeRetroSession.session_date !== todayKey))
  );
  const isActivePeriodSession = Boolean(
    isSessionHuddlBoard &&
      activeRetroSession?.session_date &&
      activeRetroSession.session_date === todayKey
  );
  const [pastOpen, setPastOpen] = React.useState(false);
  const [sessionActionDialog, setSessionActionDialog] = React.useState(null);
  const [columnDeleteTarget, setColumnDeleteTarget] = React.useState(null);
  const [boardDeleteOpen, setBoardDeleteOpen] = React.useState(false);
  const [boardDeletePending, setBoardDeletePending] = React.useState(false);

  const closeRetroSessionMutation = useMutation({
    mutationFn: async ({ sessionId, reopen }) => {
      if (reopen) {
        await base44.entities.RetrospectiveSession.update(sessionId, {
          closed_at: null,
        });
        return { outcome: 'reopened' };
      }
      const cards = await base44.entities.Card.filter({
        board_id: boardId,
        session_id: sessionId,
      });
      if (!cards.length) {
        await base44.entities.RetrospectiveSession.delete(sessionId);
        return { outcome: 'discarded' };
      }
      await base44.entities.RetrospectiveSession.update(sessionId, {
        closed_at: new Date().toISOString(),
      });
      return { outcome: 'closed' };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['retroSession', boardId] });
      queryClient.invalidateQueries({ queryKey: ['retroSessions', boardId] });
      if (data?.outcome === 'discarded') {
        toast.success('No cards — session was not saved');
      } else if (data?.outcome === 'reopened') {
        toast.success('Session reopened');
      } else {
        toast.success('Session closed');
      }
      setSessionActionDialog(null);
    },
    onError: () => toast.error('Could not update session'),
  });

  const autoCloseStaleRef = useRef('');
  useEffect(() => {
    if (!currentUser || !isSessionHuddlBoard || !board) return;
    if (!retroSessionList?.length) return;
    const toClose = openSessionsToCloseBeforeAnchor(todayKey, retroSessionList);
    if (!toClose.length) return;
    const sig = `${todayKey}:${toClose
      .map((s) => s.id)
      .sort()
      .join(',')}`;
    if (autoCloseStaleRef.current === sig) return;
    autoCloseStaleRef.current = sig;
    (async () => {
      try {
        for (const s of toClose) {
          const cards = await base44.entities.Card.filter({
            board_id: boardId,
            session_id: s.id,
          });
          if (!cards.length) {
            await base44.entities.RetrospectiveSession.delete(s.id);
          } else {
            await base44.entities.RetrospectiveSession.update(s.id, {
              closed_at: new Date().toISOString(),
            });
          }
        }
        queryClient.invalidateQueries({ queryKey: ['retroSession', boardId] });
        queryClient.invalidateQueries({ queryKey: ['retroSessions', boardId] });
      } catch {
        autoCloseStaleRef.current = '';
      }
    })();
  }, [
    currentUser,
    isSessionHuddlBoard,
    board,
    retroSessionList,
    todayKey,
    boardId,
    queryClient,
  ]);

  const openCloseSessionDialog = useCallback(() => setSessionActionDialog('close'), []);
  const openReopenSessionDialog = useCallback(() => setSessionActionDialog('reopen'), []);

  const runCloseSession = useCallback(() => {
    if (!activeRetroSession?.id) return;
    closeRetroSessionMutation.mutate({ sessionId: activeRetroSession.id, reopen: false });
  }, [activeRetroSession?.id, closeRetroSessionMutation]);

  const runReopenSession = useCallback(() => {
    if (!activeRetroSession?.id) return;
    closeRetroSessionMutation.mutate({ sessionId: activeRetroSession.id, reopen: true });
  }, [activeRetroSession?.id, closeRetroSessionMutation]);

  const sessionsByDateCount = useMemo(() => {
    const m = {};
    for (const s of retroSessionList) {
      m[s.session_date] = (m[s.session_date] || 0) + 1;
    }
    return m;
  }, [retroSessionList]);

  const sessionListPrimaryLabel = useCallback(
    (s) => {
      const dup = sessionsByDateCount[s.session_date] > 1;
      if (dup && s.created_at) {
        const t = new Date(s.created_at).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        });
        return `${formatRetroShortDate(s.session_date)} · ${t}`;
      }
      return formatRetroShortDate(s.session_date);
    },
    [sessionsByDateCount]
  );

  const addCardMutation = useMutation({
    mutationFn: (cardData) => base44.entities.Card.create(cardData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', boardId] });
      queryClient.invalidateQueries({ queryKey: ['boardContributors'] });
    },
  });

  const updateCardMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Card.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', boardId] });
      queryClient.invalidateQueries({ queryKey: ['boardContributors'] });
    },
  });

  const createLabelMutation = useMutation({
    mutationFn: ({ name, color = 'gray' }) =>
      base44.entities.BoardLabel.create({
        board_id: boardId,
        name,
        color,
        created_at: new Date().toISOString(),
      }),
    onSuccess: (_, { color: labelColor = 'gray' } = {}) => {
      trackEvent('board_label_create', { color_key: String(labelColor) });
      queryClient.invalidateQueries({ queryKey: boardLabelsQueryKey });
    },
    onError: () => toast.error('Could not create label'),
  });

  const updateBoardLabelMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BoardLabel.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardLabelsQueryKey }),
    onError: () => toast.error('Could not update label'),
  });

  const reorderCardMutation = useMutation({
    mutationFn: ({ boardId: bid, cardId, destColumnId, destIndex, sessionId }) =>
      base44.entities.Card.reorder(bid, cardId, destColumnId, destIndex, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', boardId] });
      queryClient.invalidateQueries({ queryKey: ['boardContributors'] });
    },
  });

  const deleteCardMutation = useMutation({
    mutationFn: (id) => base44.entities.Card.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', boardId] });
      queryClient.invalidateQueries({ queryKey: ['boardContributors'] });
    },
  });

  const updateBoardMutation = useMutation({
    mutationFn: (data) => base44.entities.Board.update(boardId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
  });

  const addColumnMutation = useMutation({
    mutationFn: async () => {
      const nextOrder = sortedColumns.length;
      await base44.entities.BoardColumn.create({
        board_id: boardId,
        title: 'New section',
        order: nextOrder,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['columns', boardId] }),
    onError: (e) => toast.error(e?.message || 'Could not add Section'),
  });

  const updateColumnMutation = useMutation({
    mutationFn: ({ id, title }) => base44.entities.BoardColumn.update(id, { title }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['columns', boardId] }),
    onError: () => toast.error('Could not rename Section'),
  });

  const deleteColumnMutation = useMutation({
    mutationFn: async (column) => {
      const currentCards = cards;
      const currentCols = queryClient.getQueryData(['columns', boardId]) ?? [];
      const colCards = currentCards.filter((c) => c.column_id === column.id);
      for (const c of colCards) {
        await base44.entities.Card.delete(c.id);
      }
      await base44.entities.BoardColumn.delete(column.id);
      const remaining = currentCols
        .filter((c) => c.id !== column.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      await Promise.all(remaining.map((c, i) => base44.entities.BoardColumn.update(c.id, { order: i })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', boardId] });
      queryClient.invalidateQueries({ queryKey: ['columns', boardId] });
      queryClient.invalidateQueries({ queryKey: ['boardContributors'] });
    },
    onError: () => toast.error('Could not delete Section'),
  });

  const handleAddCard = async (columnId, content) => {
    if (boardReadOnly) return;
    const now = new Date().toISOString();
    const trimmed = content.trim();
    const authorEmail = normalizeEmail(currentUser?.email || '');
    await addCardMutation.mutateAsync({
      board_id: boardId,
      column_id: columnId,
      content: trimmed,
      title: trimmed,
      author_name: currentUser?.full_name || 'Anonymous',
      ...(authorEmail ? { author_email: authorEmail } : {}),
      votes: 0,
      voted_by: [],
      order: cards.filter((c) => c.column_id === columnId).length,
      created_at: now,
      updated_at: now,
      ...(isSessionHuddlBoard && activeRetroSession?.id ? { session_id: activeRetroSession.id } : {}),
    });
    trackEvent('item_add', { is_session_board: isSessionHuddlBoard ? 1 : 0 });
  };

  const handleVote = async (card) => {
    if (boardReadOnly) return;
    const raw = currentUser?.email || '';
    const email = normalizeEmail(raw);
    if (!email) return;
    const votedBy = card.voted_by || [];
    const hasVoted = votedBy.some((e) => normalizeEmail(e) === email);
    const newVotedBy = hasVoted
      ? votedBy.filter((e) => normalizeEmail(e) !== email)
      : [...votedBy, email];

    await updateCardMutation.mutateAsync({
      id: card.id,
      data: {
        votes: newVotedBy.length,
        voted_by: newVotedBy,
      },
    });
  };

  const handleDeleteCard = async (cardId) => {
    await deleteCardMutation.mutateAsync(cardId);
  };

  const handleAddComment = async (card, newComment) => {
    const existing = card.comments || [];
    const payload = {
      ...newComment,
      votes: 0,
      voted_by: [],
    };
    const activity_log = appendActivityLog(card, {
      summary: 'Added to Conversation',
      actor_email: currentUser?.email,
    });
    await updateCardMutation.mutateAsync({
      id: card.id,
      data: {
        comments: [...existing, payload],
        activity_log,
        updated_at: new Date().toISOString(),
      },
    });
    trackEvent('item_comment_add', { is_session_board: isSessionHuddlBoard ? 1 : 0 });
  };

  const handlePatchCard = async (cardId, partial) => {
    await updateCardMutation.mutateAsync({
      id: cardId,
      data: partial,
    });
  };

  const handleCreateBoardLabel = async ({ name, color = 'gray' }) => {
    return createLabelMutation.mutateAsync({ name, color });
  };

  const handleUpdateBoardLabel = async (labelId, data) => {
    return updateBoardLabelMutation.mutateAsync({ id: labelId, data });
  };

  const handleCommentVote = async (card, commentIndex) => {
    if (boardReadOnly) return;
    const raw = currentUser?.email || '';
    const email = normalizeEmail(raw);
    if (!email) return;
    const comments = [...(card.comments || [])];
    if (commentIndex < 0 || commentIndex >= comments.length) return;
    const prev = comments[commentIndex];
    const votedBy = prev.voted_by || [];
    const hasVoted = votedBy.some((e) => normalizeEmail(e) === email);
    const newVotedBy = hasVoted
      ? votedBy.filter((e) => normalizeEmail(e) !== email)
      : [...votedBy, email];
    comments[commentIndex] = {
      ...prev,
      voted_by: newVotedBy,
      votes: newVotedBy.length,
    };
    await updateCardMutation.mutateAsync({
      id: card.id,
      data: { comments },
    });
  };

  const handleUpdateCardContent = async (cardId, content) => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error('Item text cannot be empty');
      return;
    }
    await updateCardMutation.mutateAsync({
      id: cardId,
      data: {
        content: trimmed,
        title: trimmed,
        updated_at: new Date().toISOString(),
      },
    });
  };

  const handleRenameColumn = async (columnId, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await updateColumnMutation.mutateAsync({ id: columnId, title: trimmed });
  };

  const handleRequestDeleteColumn = (column) => {
    if (boardReadOnly) return;
    if (!userCanAdminBoard) {
      toast.error('Only Circle Leads or the personal owner can delete Sections.');
      return;
    }
    setColumnDeleteTarget(column);
  };

  const confirmDeleteColumn = () => {
    if (!columnDeleteTarget) return;
    deleteColumnMutation.mutate(columnDeleteTarget);
    setColumnDeleteTarget(null);
  };

  const handleDragEnd = async (result) => {
    if (boardReadOnly) return;
    const { destination, source, type } = result;
    if (!destination) return;

    if (type === DND_TYPE_COLUMN) {
      if (destination.droppableId !== 'board-columns' || source.droppableId !== 'board-columns') return;
      if (source.index === destination.index) return;
      const reordered = Array.from(sortedColumns);
      const [removed] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, removed);
      try {
        await Promise.all(reordered.map((c, i) => base44.entities.BoardColumn.update(c.id, { order: i })));
        queryClient.invalidateQueries({ queryKey: ['columns', boardId] });
        trackEvent('section_reorder', { is_session_board: isSessionHuddlBoard ? 1 : 0 });
      } catch (e) {
        toast.error(e?.message || 'Could not reorder Sections');
      }
      return;
    }

    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const { draggableId, destination: dest } = result;
    const card = cards.find((c) => c.id === draggableId);
    if (!card) return;

    try {
      await reorderCardMutation.mutateAsync({
        boardId,
        cardId: draggableId,
        destColumnId: dest.droppableId,
        destIndex: dest.index,
        sessionId: isSessionHuddlBoard ? activeRetroSession?.id : undefined,
      });
      trackEvent('item_move', {
        cross_column: source.droppableId !== dest.droppableId ? 1 : 0,
        is_session_board: isSessionHuddlBoard ? 1 : 0,
      });
    } catch (e) {
      toast.error(e?.message || 'Could not move Item');
    }
  };

  const handleArchive = async () => {
    if (!userCanAdminBoard) {
      toast.error('Only Circle Leads or the personal owner can archive or restore a Huddl Board.');
      return;
    }
    await updateBoardMutation.mutateAsync({ is_archived: !board?.is_archived });
    toast.success(board?.is_archived ? 'Huddl Board restored' : 'Huddl Board archived');
  };

  const openDeleteBoardDialog = () => {
    if (!userCanAdminBoard) {
      toast.error('Only Circle Leads or the personal owner can delete the Huddl Board.');
      return;
    }
    setBoardDeleteOpen(true);
  };

  const confirmDeleteBoard = async () => {
    setBoardDeletePending(true);
    try {
      await base44.entities.Board.delete(boardId);
      window.location.href = '/';
    } catch (e) {
      toast.error(e?.message || 'Could not delete Huddl Board');
    } finally {
      setBoardDeletePending(false);
    }
  };

  const isLoading =
    boardLoading ||
    columnsLoading ||
    (!isFirestoreBackend && accessLoading) ||
    (Boolean(board && isSessionHuddlBoard) && retroSessionLoading);

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="border-b border-border/60 bg-card/80 backdrop-blur-xl p-4">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex gap-5 p-6 overflow-x-auto">
          {Array(3)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-96 min-w-[320px] rounded-2xl" />
            ))}
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-heading font-bold text-xl mb-2">Huddl Board not found</h2>
          <Link to="/" className="text-primary hover:underline text-sm">
            Back to Huddl
          </Link>
        </div>
      </div>
    );
  }

  /**
   * Local backend: enforce visibility from context. Firestore: if Board.filter returned a doc, security rules
   * already allowed read — do not block on accessibleTeamIds (it often lags right after creating a Circle board).
   */
  if (
    !isFirestoreBackend &&
    !canAccessBoard(board, {
      accessibleTeamIds: accessibleTeamIds ?? [],
      uid: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
    })
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h2 className="font-heading font-bold text-xl mb-2">No access</h2>
          <p className="text-muted-foreground text-sm mb-4">
            This Huddl Board is for another Circle or person. Ask someone to invite you to the Circle, or sign in with
            the account that owns the Huddl Board.
          </p>
          <Link to="/" className="text-primary font-medium hover:underline text-sm">
            Back to Huddl
          </Link>
        </div>
      </div>
    );
  }

  if (isSessionHuddlBoard && sessionIdFromUrl && activeRetroSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h2 className="font-heading font-bold text-xl mb-2">Session not found</h2>
          <Button type="button" className="rounded-xl mt-2" onClick={() => setSearchParams({})}>
            Back to today&apos;s retrospective
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden">
      <MainHeader className="shrink-0" />
      <header className="shrink-0 border-b border-border/60 bg-card/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="p-2 rounded-xl hover:bg-muted transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary to-accent shrink-0">
                <UsersRound className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="font-heading font-bold text-lg text-foreground leading-tight truncate">{board.title}</h1>
                {isSessionHuddlBoard && activeRetroSession ? (
                  <p className="text-xs text-foreground/90 font-medium truncate flex items-center gap-1.5 mt-0.5">
                    <CalendarDays className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    {formatRetroLongDate(activeRetroSession.session_date)} · Retrospective
                    {boardReadOnly ? (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-normal">
                        · View only
                        {isActivePeriodSession && activeRetroSession.closed_at ? ' · Closed' : null}
                      </span>
                    ) : null}
                  </p>
                ) : (
                  board.description && (
                    <p className="text-xs text-muted-foreground truncate">{board.description}</p>
                  )
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isSessionHuddlBoard && activeRetroSession ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-xl sm:hidden"
                  onClick={() => setPastOpen(true)}
                  aria-label="Past sessions"
                >
                  <History className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl hidden sm:inline-flex"
                  onClick={() => setPastOpen(true)}
                >
                  <History className="w-4 h-4 mr-1.5" />
                  Past sessions
                </Button>
                {userCanAdminBoard && isActivePeriodSession && activeRetroSession?.id ? (
                  activeRetroSession.closed_at ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="rounded-xl sm:hidden"
                        disabled={closeRetroSessionMutation.isPending}
                        onClick={openReopenSessionDialog}
                        aria-label="Reopen session"
                      >
                        <Unlock className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl hidden sm:inline-flex"
                        disabled={closeRetroSessionMutation.isPending}
                        onClick={openReopenSessionDialog}
                      >
                        <Unlock className="w-4 h-4 mr-1.5" />
                        Reopen session
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="rounded-xl sm:hidden"
                        disabled={closeRetroSessionMutation.isPending}
                        onClick={openCloseSessionDialog}
                        aria-label="Close session"
                      >
                        <Lock className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="rounded-xl hidden sm:inline-flex"
                        disabled={closeRetroSessionMutation.isPending}
                        onClick={openCloseSessionDialog}
                      >
                        <Lock className="w-4 h-4 mr-1.5" />
                        Close session
                      </Button>
                    </>
                  )
                ) : null}
                {(sessionIdFromUrl || boardReadOnly) && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setSearchParams({})}
                  >
                    Today
                  </Button>
                )}
              </>
            ) : null}
            <BoardOnlineIndicator
              onlineUsers={onlineUsers}
              sessionUser={currentUser}
              myPresenceUid={myPresenceUid}
            />
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-xl shrink-0" asChild>
                    <Link to={`/board/${boardId}/settings`} aria-label="Huddl Board settings">
                      <Settings className="w-4 h-4" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Huddl Board settings</TooltipContent>
              </Tooltip>
              {userCanAdminBoard && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="rounded-xl shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={handleArchive}
                        aria-label={board.is_archived ? 'Restore Huddl Board' : 'Archive Huddl Board'}
                      >
                        {board.is_archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {board.is_archived ? 'Restore Huddl Board' : 'Archive Huddl Board'}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="rounded-xl shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={openDeleteBoardDialog}
                        aria-label="Delete Huddl Board"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Delete Huddl Board</TooltipContent>
                  </Tooltip>
                </>
              )}
            </TooltipProvider>
          </div>
        </div>
        {isSessionHuddlBoard && (
          <>
            <Dialog open={pastOpen} onOpenChange={setPastOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Past sessions</DialogTitle>
                  <DialogDescription>
                    Open a previous retrospective to review Items. Multiple sessions on the same day are listed with a
                    time.
                  </DialogDescription>
                </DialogHeader>
                <ul className="space-y-1 max-h-[min(60vh,360px)] overflow-y-auto pr-1">
                  {retroSessionList.length === 0 ? (
                    <li className="text-sm text-muted-foreground py-4 text-center">No past sessions yet.</li>
                  ) : (
                    retroSessionList.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="w-full text-left rounded-xl border border-border/60 px-3 py-2.5 text-sm hover:bg-muted/80 transition-colors flex justify-between gap-2"
                          onClick={() => {
                            setSearchParams({ session: s.id });
                            setPastOpen(false);
                          }}
                        >
                          <span className="font-medium">{sessionListPrimaryLabel(s)}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {s.session_date === todayKey
                              ? s.closed_at
                                ? 'Closed'
                                : 'Today'
                              : s.closed_at
                                ? 'Closed'
                                : 'Open'}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </DialogContent>
            </Dialog>

            <Dialog
              open={sessionActionDialog != null}
              onOpenChange={(open) => {
                if (!open) setSessionActionDialog(null);
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {sessionActionDialog === 'close' ? 'Close this session?' : 'Reopen this session?'}
                  </DialogTitle>
                  <DialogDescription asChild>
                    <div className="text-left text-sm text-muted-foreground space-y-3 pt-1">
                      {sessionActionDialog === 'close' ? (
                        <>
                          <p>
                            This session will be <strong className="text-foreground">locked</strong>: no one can add,
                            edit, move, or delete Items here.
                          </p>
                          <p>
                            A <strong className="text-foreground">new empty session for today</strong> will start right
                            away so you can run another retro. Items from this session
                            stay here and remain visible under{' '}
                            <strong className="text-foreground">Past sessions</strong>.
                          </p>
                        </>
                      ) : (
                        <p>
                          Participants will be able to add Items and move them in this session again. Use this if you
                          closed it by mistake or want to keep working here instead of your newer session for today.
                        </p>
                      )}
                    </div>
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:justify-end flex-col-reverse sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setSessionActionDialog(null)}
                    disabled={closeRetroSessionMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    onClick={sessionActionDialog === 'close' ? runCloseSession : runReopenSession}
                    disabled={closeRetroSessionMutation.isPending}
                  >
                    {closeRetroSessionMutation.isPending
                      ? 'Working…'
                      : sessionActionDialog === 'close'
                        ? 'Close session'
                        : 'Reopen session'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </header>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-5 p-5 h-full min-h-0 items-stretch">
            <Droppable droppableId="board-columns" type={DND_TYPE_COLUMN} direction="horizontal">
              {(dropProvided) => (
                <div
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  className="flex gap-5 items-stretch h-full min-h-0"
                >
                  {sortedColumns.map((column, index) => (
                    <Draggable
                      key={column.id}
                      draggableId={column.id}
                      index={index}
                      isDragDisabled={boardReadOnly}
                    >
                      {(colProvided, colSnapshot) => (
                        <BoardColumnComponent
                          column={column}
                          cards={cards.filter((c) => c.column_id === column.id)}
                          columnProvided={colProvided}
                          columnSnapshot={colSnapshot}
                          onAddCard={handleAddCard}
                          onVote={handleVote}
                          onDeleteCard={handleDeleteCard}
                          onAddComment={handleAddComment}
                          onCommentVote={handleCommentVote}
                          onUpdateCardContent={handleUpdateCardContent}
                          onPatchCard={handlePatchCard}
                          onCreateBoardLabel={handleCreateBoardLabel}
                          onUpdateBoardLabel={handleUpdateBoardLabel}
                          boardLabels={boardLabels}
                          focusItemId={focusItemId}
                          getItemDeepLink={getItemDeepLink}
                          onItemDetailOpen={setItemInUrl}
                          onItemDetailClose={() => setItemInUrl(null)}
                          onRenameColumn={handleRenameColumn}
                          onDeleteColumn={handleRequestDeleteColumn}
                          currentUser={currentUser}
                          currentUserEmail={currentUser?.email || ''}
                          photoByEmail={voterPhotoByEmail}
                          readOnly={boardReadOnly}
                          canDeleteColumn={userCanAdminBoard}
                        />
                      )}
                    </Draggable>
                  ))}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>

            <button
              type="button"
              onClick={() => addColumnMutation.mutate()}
              disabled={addColumnMutation.isPending || boardReadOnly}
              aria-label="Add a new Section"
              className={cn(
                'group/addcol shrink-0 flex flex-col items-stretch justify-center gap-3 self-stretch',
                'w-[min(100vw-2rem,280px)] sm:w-[260px]',
                'min-h-[min(220px,45vh)] rounded-2xl border-2 border-dashed border-border/70 bg-muted/15',
                'px-5 py-8 text-left transition-all duration-200',
                'hover:border-primary/45 hover:bg-primary/[0.06] hover:shadow-md',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:opacity-50 disabled:pointer-events-none'
              )}
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border/60 text-primary group-hover/addcol:scale-[1.03] transition-transform">
                <Plus className="w-6 h-6" strokeWidth={2.25} />
              </span>
              <span>
                <span className="block font-heading font-semibold text-base text-foreground">Add Section</span>
                <span className="mt-1 block text-xs text-muted-foreground leading-relaxed">
                  Creates a new Section next to your others. Drag the grip on any Section header to reorder.
                </span>
              </span>
            </button>
          </div>
        </div>
      </DragDropContext>

      <ConfirmDialog
        open={columnDeleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setColumnDeleteTarget(null);
        }}
        title="Delete Section?"
        description={
          columnDeleteTarget
            ? (() => {
                const n = cards.filter((c) => c.column_id === columnDeleteTarget.id).length;
                return n > 0
                  ? `This Section has ${n} Item${n === 1 ? '' : 's'}. Deleting it will permanently remove those Items.`
                  : 'Delete this Section?';
              })()
            : ''
        }
        confirmLabel="Delete Section"
        cancelLabel="Cancel"
        variant="destructive"
        confirmPending={deleteColumnMutation.isPending}
        onConfirm={confirmDeleteColumn}
      />

      <ConfirmDialog
        open={boardDeleteOpen}
        onOpenChange={setBoardDeleteOpen}
        title="Delete this Huddl Board?"
        description="This permanently removes all Sections, Items, and retrospective history. This cannot be undone."
        confirmLabel="Delete Huddl Board"
        cancelLabel="Cancel"
        variant="destructive"
        confirmPhrase="delete"
        confirmPending={boardDeletePending}
        onConfirm={confirmDeleteBoard}
      />
    </div>
  );
}
