import { useEffect, useRef, useState } from 'react';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isFirestoreBackend } from '@/api/base44Client';

const HEARTBEAT_MS = 20_000;
/** If no heartbeat within this window, treat as offline (background tabs can throttle timers). */
const STALE_MS = 120_000;
/** Re-check staleness clock without touching React unless membership/display fields change. */
const STALE_TICK_MS = 10_000;

/** Normalize Firestore Timestamp, plain {seconds,nanoseconds}, ISO string, etc. */
function updatedAtToMillis(value) {
  if (value == null) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    const ns = typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
    return value.seconds * 1000 + Math.floor(ns / 1e6);
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function tabPresenceId() {
  try {
    let id = sessionStorage.getItem('huddl-presence-tab-id');
    if (!id) {
      id = `tab-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
      sessionStorage.setItem('huddl-presence-tab-id', id);
    }
    return id;
  } catch {
    return `tab-${Date.now()}`;
  }
}

/** Same stable fields as {@link BoardOnlineIndicator} — ignores heartbeat-only `lastSeenMs` churn. */
function onlineListDisplaySignature(rows) {
  const sorted = [...rows].sort((a, b) =>
    String(a.email ?? a.uid).localeCompare(String(b.email ?? b.uid), undefined, { sensitivity: 'base' })
  );
  return sorted
    .map((u) => [u.uid, u.email ?? '', u.display_name ?? '', u.photo_url ?? ''].join('\u0001'))
    .join('\u0002');
}

function filterFreshPresenceRows(now, rawMap) {
  const out = [];
  rawMap.forEach((row) => {
    const t = row.lastSeenMs;
    if (typeof t === 'number' && t > 0 && now - t < STALE_MS) out.push(row);
  });
  out.sort((a, b) =>
    String(a.email ?? a.uid).localeCompare(String(b.email ?? b.uid), undefined, { sensitivity: 'base' })
  );
  return out;
}

/**
 * Tracks who is currently viewing a board (heartbeat + live listener).
 * Firestore: `boards/{boardId}/presence/{uid}`. Local backend: BroadcastChannel (same browser / machine).
 *
 * @param {{ boardId: string|null|undefined, enabled: boolean, sessionUser: { uid?: string|null, email?: string|null, full_name?: string|null, photoURL?: string|null }|null }} args
 * @returns {{ onlineUsers: Array<{ uid: string, email: string|null, display_name: string|null, photo_url: string|null, lastSeenMs: number }>, myPresenceUid: string|null }}
 */
export function useBoardPresence({ boardId, enabled, sessionUser }) {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [myPresenceUid, setMyPresenceUid] = useState(null);

  const presenceMapRef = useRef(new Map());
  const lastOnlineListSigRef = useRef('');
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const emitOnlineUsersIfChanged = (rawMap) => {
    if (!enabledRef.current) return;
    const now = Date.now();
    const out = filterFreshPresenceRows(now, rawMap);
    const sig = onlineListDisplaySignature(out);
    if (sig !== lastOnlineListSigRef.current) {
      lastOnlineListSigRef.current = sig;
      setOnlineUsers(out);
    }
  };

  useEffect(() => {
    lastOnlineListSigRef.current = '';
    setOnlineUsers([]);
    presenceMapRef.current = new Map();
  }, [boardId]);

  useEffect(() => {
    if (!enabled) {
      lastOnlineListSigRef.current = '';
      setOnlineUsers([]);
      presenceMapRef.current = new Map();
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !boardId) {
      setMyPresenceUid(null);
      return undefined;
    }

    const firestoreUid = sessionUser?.uid ?? null;
    if (isFirestoreBackend && db && firestoreUid) {
      setMyPresenceUid(firestoreUid);
      const presCol = collection(db, 'boards', boardId, 'presence');
      const myRef = doc(db, 'boards', boardId, 'presence', firestoreUid);

      const writePresence = () => {
        setDoc(
          myRef,
          {
            updated_at: serverTimestamp(),
            email: sessionUser?.email || null,
            display_name: sessionUser?.full_name || null,
            photo_url: sessionUser?.photoURL || null,
          },
          { merge: true }
        ).catch((e) => {
          if (import.meta.env.DEV) console.warn('[Huddl] board presence write failed', e);
        });
      };

      writePresence();
      const hb = setInterval(writePresence, HEARTBEAT_MS);
      const onVisibility = () => {
        if (document.visibilityState === 'visible') writePresence();
      };
      document.addEventListener('visibilitychange', onVisibility);

      const unsub = onSnapshot(
        presCol,
        (snap) => {
          const m = new Map();
          snap.forEach((d) => {
            const data = d.data();
            const ts = updatedAtToMillis(data.updated_at);
            m.set(d.id, {
              uid: d.id,
              email: typeof data.email === 'string' ? data.email : null,
              display_name: typeof data.display_name === 'string' ? data.display_name : null,
              photo_url: typeof data.photo_url === 'string' ? data.photo_url : null,
              lastSeenMs: ts ?? 0,
            });
          });
          presenceMapRef.current = m;
          emitOnlineUsersIfChanged(m);
        },
        (err) => {
          if (import.meta.env.DEV) console.warn('[Huddl] board presence listener', err);
        }
      );

      const staleInterval = setInterval(() => {
        emitOnlineUsersIfChanged(presenceMapRef.current);
      }, STALE_TICK_MS);

      return () => {
        clearInterval(hb);
        clearInterval(staleInterval);
        document.removeEventListener('visibilitychange', onVisibility);
        unsub();
        deleteDoc(myRef).catch(() => {});
        setMyPresenceUid(null);
      };
    }

    if (!isFirestoreBackend && typeof BroadcastChannel !== 'undefined') {
      const synthetic = tabPresenceId();
      setMyPresenceUid(synthetic);
      const channel = new BroadcastChannel(`huddl-board-presence:${boardId}`);
      presenceMapRef.current = new Map();

      const broadcast = () => {
        channel.postMessage({
          type: 'hb',
          uid: synthetic,
          email: sessionUser?.email || 'user@localhost.local',
          display_name: sessionUser?.full_name || 'Local User',
          photo_url: sessionUser?.photoURL || null,
          ts: Date.now(),
        });
      };

      const onMsg = (ev) => {
        const data = ev?.data;
        if (!data) return;
        if (data.type === 'leave' && data.uid) {
          presenceMapRef.current.delete(data.uid);
          emitOnlineUsersIfChanged(presenceMapRef.current);
          return;
        }
        if (data.type !== 'hb' || !data.uid) return;
        presenceMapRef.current.set(data.uid, {
          uid: data.uid,
          email: typeof data.email === 'string' ? data.email : null,
          display_name: typeof data.display_name === 'string' ? data.display_name : null,
          photo_url: typeof data.photo_url === 'string' ? data.photo_url : null,
          lastSeenMs: data.ts,
        });
        emitOnlineUsersIfChanged(presenceMapRef.current);
      };

      channel.addEventListener('message', onMsg);
      broadcast();
      const hb = setInterval(broadcast, HEARTBEAT_MS);
      const staleInterval = setInterval(() => {
        emitOnlineUsersIfChanged(presenceMapRef.current);
      }, STALE_TICK_MS);

      return () => {
        clearInterval(hb);
        clearInterval(staleInterval);
        channel.removeEventListener('message', onMsg);
        try {
          channel.postMessage({ type: 'leave', uid: synthetic });
        } catch {
          /* ignore */
        }
        channel.close();
        setMyPresenceUid(null);
      };
    }

    setMyPresenceUid(null);
    return undefined;
  }, [
    enabled,
    boardId,
    isFirestoreBackend,
    sessionUser?.uid,
    sessionUser?.email,
    sessionUser?.full_name,
    sessionUser?.photoURL,
  ]);

  return { onlineUsers, myPresenceUid };
}
