import { useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isFirestoreBackend } from '@/api/base44Client';

function sortRetroSessions(rows) {
  return [...rows].sort((a, b) => {
    const byDate = String(b.session_date ?? '').localeCompare(String(a.session_date ?? ''));
    if (byDate !== 0) return byDate;
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
  });
}

/**
 * Pushes Firestore changes into TanStack Query cache so the board updates live
 * without full page reload (replaces polling when using Firestore).
 */
export function useFirestoreBoardLiveSync({
  queryClient,
  boardId,
  boardQueryKey,
  columnsQueryKey,
  cardsQueryKey,
  retroSessionsQueryKey,
  retroSessionQueryKey,
  activeRetroSessionId,
  enabled,
  isSessionHuddlBoard,
  sessionId,
}) {
  useEffect(() => {
    if (!isFirestoreBackend || !db || !boardId || !enabled) {
      return undefined;
    }

    const unsubs = [];
    const onErr = (label) => (err) => {
      console.error(`[Huddl] Firestore sync (${label})`, err);
    };

    const boardRef = doc(db, 'boards', boardId);
    unsubs.push(
      onSnapshot(
        boardRef,
        (snap) => {
          if (!snap.exists()) {
            queryClient.setQueryData(boardQueryKey, undefined);
            return;
          }
          queryClient.setQueryData(boardQueryKey, { id: snap.id, ...snap.data() });
        },
        onErr('board')
      )
    );

    const colsQ = query(
      collection(db, 'columns'),
      where('board_id', '==', boardId),
      orderBy('order', 'asc')
    );
    unsubs.push(
      onSnapshot(
        colsQ,
        (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          queryClient.setQueryData(columnsQueryKey, rows);
        },
        onErr('columns')
      )
    );

    const cardsCol = collection(db, 'cards');
    const cardsQ =
      isSessionHuddlBoard && sessionId
        ? query(cardsCol, where('board_id', '==', boardId), where('session_id', '==', sessionId))
        : query(cardsCol, where('board_id', '==', boardId));

    unsubs.push(
      onSnapshot(
        cardsQ,
        (snap) => {
          let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (!isSessionHuddlBoard || !sessionId) {
            rows = rows.filter((c) => !c.session_id);
          }
          rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          queryClient.setQueryData(cardsQueryKey, rows);
        },
        onErr('cards')
      )
    );

    if (isSessionHuddlBoard && retroSessionsQueryKey) {
      const sessQ = query(collection(db, 'retrospective_sessions'), where('board_id', '==', boardId));
      unsubs.push(
        onSnapshot(
          sessQ,
          (snap) => {
            const rows = sortRetroSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
            queryClient.setQueryData(retroSessionsQueryKey, rows);
          },
          onErr('retroSessions')
        )
      );
    }

    if (isSessionHuddlBoard && activeRetroSessionId && retroSessionQueryKey) {
      const sref = doc(db, 'retrospective_sessions', activeRetroSessionId);
      unsubs.push(
        onSnapshot(
          sref,
          (snap) => {
            if (!snap.exists()) {
              queryClient.setQueryData(retroSessionQueryKey, null);
              return;
            }
            queryClient.setQueryData(retroSessionQueryKey, { id: snap.id, ...snap.data() });
          },
          onErr('retroSession')
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [
    queryClient,
    boardId,
    enabled,
    isSessionHuddlBoard,
    sessionId,
    activeRetroSessionId,
    boardQueryKey,
    columnsQueryKey,
    cardsQueryKey,
    retroSessionsQueryKey,
    retroSessionQueryKey,
  ]);
}
