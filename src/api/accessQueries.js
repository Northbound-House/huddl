import {
  collection,
  documentId,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { normalizeEmail } from '@/lib/email';
import { getBoardTeamIds } from '@/lib/boardTeams';

/** Client-side visibility for localStorage backend (same rules as {@link fetchVisibleBoards}). */
export function filterVisibleBoardsLocal(boards, { isGlobalAdmin, accessibleTeamIds, ownerUid, email }) {
  if (isGlobalAdmin) return boards;
  const teamSet = new Set(accessibleTeamIds ?? []);
  return boards.filter((b) => {
    const tids = getBoardTeamIds(b);
    if (tids.some((tid) => teamSet.has(tid))) return true;
    if (b.owner_uid && ownerUid && b.owner_uid === ownerUid) return true;
    if (b.owner_email && email && normalizeEmail(b.owner_email) === normalizeEmail(email)) return true;
    return false;
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Firestore: add `team_id` from every `team_memberships` row for this email (fresh read; avoids stale context). */
async function addTeamIdsFromMemberEmail(db, teamIdSet, memberEmail) {
  const em = normalizeEmail(memberEmail ?? '');
  if (!em) return;
  try {
    const memSnap = await getDocs(
      query(collection(db, 'team_memberships'), where('email', '==', em))
    );
    memSnap.docs.forEach((d) => {
      const tid = d.data().team_id;
      if (typeof tid === 'string' && tid.length) teamIdSet.add(tid);
    });
  } catch (e) {
    console.warn('team_memberships by email', e);
  }
}

/**
 * Firestore: discover team ids from denormalized arrays on `teams` (works when membership rows are missing/mismatched
 * but syncTeamMemberDenorm populated member_emails / admin_emails).
 */
async function addTeamIdsFromTeamsDenormQueries(db, teamIdSet, memberEmail) {
  const em = normalizeEmail(memberEmail ?? '');
  if (!em) return;
  for (const field of ['member_emails', 'admin_emails']) {
    try {
      const snap = await getDocs(
        query(collection(db, 'teams'), where(field, 'array-contains', em))
      );
      snap.docs.forEach((d) => teamIdSet.add(d.id));
    } catch (e) {
      console.warn(`teams ${field} array-contains`, e);
    }
  }
}

/** Firestore: membership rows tagged with Auth `uid` (after sync) — covers token email mismatch / missing email. */
async function addTeamIdsFromMemberUid(db, teamIdSet, memberUid) {
  if (!memberUid || typeof memberUid !== 'string') return;
  try {
    const memSnap = await getDocs(
      query(collection(db, 'team_memberships'), where('uid', '==', memberUid))
    );
    memSnap.docs.forEach((d) => {
      const tid = d.data().team_id;
      if (typeof tid === 'string' && tid.length) teamIdSet.add(tid);
    });
  } catch (e) {
    console.warn('team_memberships by uid', e);
  }
}

/**
 * Team ids used to query `boards` by `team_ids` / `team_id` in {@link fetchVisibleBoards} (same as team discovery for Home).
 */
export async function collectBoardDiscoveryTeamIds(db, { accessibleTeamIds, memberEmail, memberUid, creatorUid }) {
  const teamIdSet = new Set(accessibleTeamIds ?? []);
  await addTeamIdsFromMemberEmail(db, teamIdSet, memberEmail);
  await addTeamIdsFromMemberUid(db, teamIdSet, memberUid);
  await addTeamIdsFromTeamsDenormQueries(db, teamIdSet, memberEmail);
  if (creatorUid) {
    const qCreatedTeams = query(collection(db, 'teams'), where('created_by_uid', '==', creatorUid));
    const teamSnap = await getDocs(qCreatedTeams);
    teamSnap.docs.forEach((d) => teamIdSet.add(d.id));
  }
  return teamIdSet;
}

/**
 * Boards linked to a Circle: two queries (Firestore rules may deny `team_ids array-contains` when other matching
 * docs exist that the user cannot read — always run `team_id ==` separately).
 * @param {import('firebase/firestore').Firestore} db
 * @param {(row: { id: string } & Record<string, unknown>) => void} push
 */
export async function appendBoardsForTeamIdQuery(db, tid, push) {
  try {
    const q1 = query(collection(db, 'boards'), where('team_ids', 'array-contains', tid));
    const snap1 = await getDocs(q1);
    snap1.docs.forEach((d) => push({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('boards team_ids array-contains', tid, e);
  }
  try {
    const q2 = query(collection(db, 'boards'), where('team_id', '==', tid));
    const snap2 = await getDocs(q2);
    snap2.docs.forEach((d) => push({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('boards team_id ==', tid, e);
  }
}

/**
 * Rich snapshot for Home “missing boards” debugging: resolved team ids, per-team board query results, vs {@link fetchVisibleBoards}.
 *
 * @param {import('firebase/firestore').Firestore} db
 * @param {object} params
 * @param {string[]} [params.membershipTeamIdsFromContext] — `team_id` values from React context (detects discovery mismatch).
 */
export async function fetchHomeBoardVisibilityDebug(db, params) {
  const {
    isGlobalAdmin,
    accessibleTeamIds = [],
    ownerUid,
    creatorUid = null,
    memberEmail = null,
    memberUid = null,
    membershipTeamIdsFromContext = [],
  } = params;

  const generatedAt = new Date().toISOString();
  const base = {
    generatedAt,
    session: {
      memberEmailNorm: normalizeEmail(memberEmail ?? '') || null,
      memberUid: memberUid || null,
    },
    contextAccessibleTeamIds: [...accessibleTeamIds],
    contextMembershipTeamIds: [...new Set(membershipTeamIdsFromContext.filter(Boolean))].sort(),
  };

  if (isGlobalAdmin) {
    return { ...base, note: 'isGlobalAdmin — full boards list in dev' };
  }

  const stepErrors = [];
  const teamIdSet = new Set(accessibleTeamIds ?? []);
  const em = normalizeEmail(memberEmail ?? '');

  try {
    if (em) {
      const memSnap = await getDocs(query(collection(db, 'team_memberships'), where('email', '==', em)));
      memSnap.docs.forEach((d) => {
        const tid = d.data().team_id;
        if (typeof tid === 'string' && tid.length) teamIdSet.add(tid);
      });
      base.team_memberships_email_query = { docCount: memSnap.size };
    } else {
      base.team_memberships_email_query = { skipped: true, reason: 'no normalized session email' };
    }
  } catch (e) {
    stepErrors.push({ step: 'team_memberships_email', message: String(e?.message || e), code: e?.code ?? null });
    base.team_memberships_email_query = { error: String(e?.message || e), code: e?.code ?? null };
  }

  try {
    if (memberUid) {
      const memSnap = await getDocs(query(collection(db, 'team_memberships'), where('uid', '==', memberUid)));
      memSnap.docs.forEach((d) => {
        const tid = d.data().team_id;
        if (typeof tid === 'string' && tid.length) teamIdSet.add(tid);
      });
      base.team_memberships_uid_query = { docCount: memSnap.size };
    } else {
      base.team_memberships_uid_query = { skipped: true };
    }
  } catch (e) {
    stepErrors.push({ step: 'team_memberships_uid', message: String(e?.message || e), code: e?.code ?? null });
    base.team_memberships_uid_query = { error: String(e?.message || e), code: e?.code ?? null };
  }

  try {
    if (em) {
      for (const field of ['member_emails', 'admin_emails']) {
        const snap = await getDocs(query(collection(db, 'teams'), where(field, 'array-contains', em)));
        snap.docs.forEach((d) => teamIdSet.add(d.id));
      }
      base.teams_denorm_queries = { ok: true };
    } else {
      base.teams_denorm_queries = { skipped: true };
    }
  } catch (e) {
    stepErrors.push({ step: 'teams_denorm', message: String(e?.message || e), code: e?.code ?? null });
    base.teams_denorm_queries = { error: String(e?.message || e), code: e?.code ?? null };
  }

  try {
    if (creatorUid) {
      const teamSnap = await getDocs(query(collection(db, 'teams'), where('created_by_uid', '==', creatorUid)));
      teamSnap.docs.forEach((d) => teamIdSet.add(d.id));
      base.teams_created_by_uid_query = { docCount: teamSnap.size };
    } else {
      base.teams_created_by_uid_query = { skipped: true };
    }
  } catch (e) {
    stepErrors.push({ step: 'teams_created_by_uid', message: String(e?.message || e), code: e?.code ?? null });
    base.teams_created_by_uid_query = { error: String(e?.message || e), code: e?.code ?? null };
  }

  const resolvedTeamIds = [...teamIdSet].sort();
  const inContextNotResolved = base.contextMembershipTeamIds.filter((id) => !teamIdSet.has(id));

  const probeTeam = async (tid) => {
    const row = { teamId: tid };
    try {
      const snap1 = await getDocs(query(collection(db, 'boards'), where('team_ids', 'array-contains', tid)));
      row.team_ids_array_contains = {
        count: snap1.size,
        sample: snap1.docs.slice(0, 25).map((d) => ({
          id: d.id,
          title: d.data().title ?? '',
          team_ids: d.data().team_ids ?? null,
          team_id: d.data().team_id ?? null,
        })),
      };
    } catch (e) {
      row.team_ids_array_contains = { error: String(e?.message || e), code: e?.code ?? null };
    }
    try {
      const snap2 = await getDocs(query(collection(db, 'boards'), where('team_id', '==', tid)));
      row.team_id_equals = {
        count: snap2.size,
        sample: snap2.docs.slice(0, 25).map((d) => ({
          id: d.id,
          title: d.data().title ?? '',
          team_ids: d.data().team_ids ?? null,
          team_id: d.data().team_id ?? null,
        })),
      };
    } catch (e) {
      row.team_id_equals = { error: String(e?.message || e), code: e?.code ?? null };
    }
    return row;
  };

  const teamBoardQueries = [];
  for (const tid of resolvedTeamIds) {
    teamBoardQueries.push(await probeTeam(tid));
  }

  const extraTeamProbes = [];
  for (const tid of [...new Set(inContextNotResolved)]) {
    extraTeamProbes.push(await probeTeam(tid));
  }

  let fetchVisibleBoardsSummary = null;
  try {
    const rows = await fetchVisibleBoards(db, {
      isGlobalAdmin,
      accessibleTeamIds,
      ownerUid,
      creatorUid,
      memberEmail,
      memberUid,
    });
    fetchVisibleBoardsSummary = {
      count: rows.length,
      boards: rows.slice(0, 80).map((r) => ({
        id: r.id,
        title: r.title ?? '',
        team_ids: r.team_ids ?? null,
        team_id: r.team_id ?? null,
        owner_uid: r.owner_uid ?? null,
      })),
    };
  } catch (e) {
    fetchVisibleBoardsSummary = { error: String(e?.message || e), code: e?.code ?? null };
  }

  let collaboratorProbe = null;
  try {
    const c = { emails: null, uids: null };
    if (em) {
      const sc = await getDocs(
        query(collection(db, 'boards'), where('board_collaborator_emails', 'array-contains', em))
      );
      c.emails = { count: sc.size, ids: sc.docs.slice(0, 20).map((d) => d.id) };
    }
    if (memberUid) {
      const su = await getDocs(
        query(collection(db, 'boards'), where('board_collaborator_uids', 'array-contains', memberUid))
      );
      c.uids = { count: su.size, ids: su.docs.slice(0, 20).map((d) => d.id) };
    }
    collaboratorProbe = c;
  } catch (e) {
    collaboratorProbe = { error: String(e?.message || e), code: e?.code ?? null };
  }

  return {
    ...base,
    stepErrors,
    resolvedTeamIds,
    inContextMembershipTeamIdsNotInResolvedSet: inContextNotResolved,
    teamBoardQueries,
    extraTeamProbesForContextOnlyTeams: extraTeamProbes.length ? extraTeamProbes : undefined,
    collaboratorProbe,
    fetchVisibleBoardsSummary,
  };
}

/**
 * Boards visible to the user: all teams’ boards when `isGlobalAdmin` (local dev); otherwise team boards plus personal
 * boards (`owner_uid`). Team ids: context list, live `team_memberships` by email, and Circles you created (`created_by_uid`).
 */
export async function fetchVisibleBoards(
  db,
  {
    isGlobalAdmin,
    accessibleTeamIds,
    ownerUid,
    creatorUid = null,
    memberEmail = null,
    memberUid = null,
  }
) {
  if (isGlobalAdmin) {
    const snap = await getDocs(collection(db, 'boards'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const seen = new Map();
  const push = (row) => {
    if (!seen.has(row.id)) seen.set(row.id, row);
  };
  const emNorm = normalizeEmail(memberEmail ?? '');
  if (emNorm) {
    try {
      const qc = query(
        collection(db, 'boards'),
        where('board_collaborator_emails', 'array-contains', emNorm)
      );
      const sc = await getDocs(qc);
      sc.docs.forEach((d) => push({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('boards board_collaborator_emails', e);
    }
  }
  if (memberUid) {
    try {
      const qu = query(
        collection(db, 'boards'),
        where('board_collaborator_uids', 'array-contains', memberUid)
      );
      const su = await getDocs(qu);
      su.docs.forEach((d) => push({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('boards board_collaborator_uids', e);
    }
  }
  const teamIdSet = await collectBoardDiscoveryTeamIds(db, {
    accessibleTeamIds,
    memberEmail,
    memberUid,
    creatorUid,
  });
  for (const tid of teamIdSet) {
    await appendBoardsForTeamIdQuery(db, tid, push);
  }
  if (ownerUid) {
    const q = query(collection(db, 'boards'), where('owner_uid', '==', ownerUid));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => push({ id: d.id, ...d.data() }));
  }
  return [...seen.values()];
}

/**
 * Teams visible: all when `isGlobalAdmin` (local dev); otherwise teams from membership ids plus
 * any Circle where `created_by_uid` matches, plus live `team_memberships` by email (avoids stale context).
 */
export async function fetchVisibleTeams(
  db,
  { isGlobalAdmin, accessibleTeamIds, creatorUid = null, memberEmail = null, memberUid = null }
) {
  if (isGlobalAdmin) {
    const snap = await getDocs(query(collection(db, 'teams'), orderBy('name', 'asc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const seen = new Map();
  const push = (row) => {
    if (row?.id) seen.set(row.id, row);
  };
  const teamIdSet = await collectBoardDiscoveryTeamIds(db, {
    accessibleTeamIds,
    memberEmail,
    memberUid,
    creatorUid,
  });
  for (const part of chunk([...teamIdSet], 10)) {
    if (!part.length) continue;
    const q = query(collection(db, 'teams'), where(documentId(), 'in', part));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => push({ id: d.id, ...d.data() }));
  }
  return [...seen.values()].sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' })
  );
}

/**
 * Step-by-step Firestore visibility probe for support / self-serve debugging.
 * Enable from Home with `?accessDebug=1` (see {@link Home}).
 *
 * @returns {Promise<{
 *   generatedAt: string,
 *   fetchVisibleError: { code?: string, message: string } | null,
 *   fetchVisibleBoardCount: number,
 *   teamIdSetSize: number,
 *   teamIdSample: string[],
 *   steps: Array<Record<string, unknown>>,
 * }>}
 */
export async function diagnoseVisibleBoardsAccess(
  db,
  {
    isGlobalAdmin,
    accessibleTeamIds,
    ownerUid,
    creatorUid = null,
    memberEmail = null,
    memberUid = null,
  }
) {
  const generatedAt = new Date().toISOString();
  const steps = [];
  const teamIdSet = new Set(accessibleTeamIds ?? []);
  steps.push({
    name: 'context_accessibleTeamIds',
    count: teamIdSet.size,
    sample: [...teamIdSet].slice(0, 5),
  });

  if (isGlobalAdmin) {
    try {
      const snap = await getDocs(collection(db, 'boards'));
      steps.push({ name: 'isGlobalAdmin', note: 'local dev — full boards collection', docCount: snap.size });
      return {
        generatedAt,
        fetchVisibleError: null,
        fetchVisibleBoardCount: snap.size,
        teamIdSetSize: teamIdSet.size,
        teamIdSample: [],
        steps,
      };
    } catch (e) {
      steps.push({ name: 'isGlobalAdmin', error: String(e?.message || e), code: e?.code ?? null });
      return {
        generatedAt,
        fetchVisibleError: { code: e?.code ?? null, message: String(e?.message || e) },
        fetchVisibleBoardCount: 0,
        teamIdSetSize: teamIdSet.size,
        teamIdSample: [],
        steps,
      };
    }
  }

  const em = normalizeEmail(memberEmail ?? '');
  try {
    if (!em) {
      steps.push({ name: 'team_memberships_email', skipped: true, reason: 'no normalized email from session' });
    } else {
      const snap = await getDocs(query(collection(db, 'team_memberships'), where('email', '==', em)));
      const before = teamIdSet.size;
      snap.docs.forEach((d) => {
        const tid = d.data().team_id;
        if (typeof tid === 'string' && tid.length) teamIdSet.add(tid);
      });
      steps.push({
        name: 'team_memberships_email',
        docCount: snap.size,
        teamIdSetDelta: teamIdSet.size - before,
        teamIdSetSize: teamIdSet.size,
      });
    }
  } catch (e) {
    steps.push({
      name: 'team_memberships_email',
      error: String(e?.message || e),
      code: e?.code ?? null,
    });
  }

  try {
    if (!memberUid) {
      steps.push({ name: 'team_memberships_uid', skipped: true, reason: 'no uid' });
    } else {
      const before = teamIdSet.size;
      const snap = await getDocs(query(collection(db, 'team_memberships'), where('uid', '==', memberUid)));
      snap.docs.forEach((d) => {
        const tid = d.data().team_id;
        if (typeof tid === 'string' && tid.length) teamIdSet.add(tid);
      });
      steps.push({
        name: 'team_memberships_uid',
        docCount: snap.size,
        teamIdSetDelta: teamIdSet.size - before,
        teamIdSetSize: teamIdSet.size,
      });
    }
  } catch (e) {
    steps.push({
      name: 'team_memberships_uid',
      error: String(e?.message || e),
      code: e?.code ?? null,
    });
  }

  for (const field of ['member_emails', 'admin_emails']) {
    try {
      if (!em) {
        steps.push({ name: `teams_${field}`, skipped: true });
        continue;
      }
      const before = teamIdSet.size;
      const snap = await getDocs(query(collection(db, 'teams'), where(field, 'array-contains', em)));
      snap.docs.forEach((d) => teamIdSet.add(d.id));
      steps.push({
        name: `teams_${field}_array_contains`,
        docCount: snap.size,
        teamIdSetDelta: teamIdSet.size - before,
        teamIdSetSize: teamIdSet.size,
      });
    } catch (e) {
      steps.push({
        name: `teams_${field}_array_contains`,
        error: String(e?.message || e),
        code: e?.code ?? null,
      });
    }
  }

  try {
    if (!creatorUid) {
      steps.push({ name: 'teams_created_by_uid', skipped: true });
    } else {
      const before = teamIdSet.size;
      const snap = await getDocs(query(collection(db, 'teams'), where('created_by_uid', '==', creatorUid)));
      snap.docs.forEach((d) => teamIdSet.add(d.id));
      steps.push({
        name: 'teams_created_by_uid',
        docCount: snap.size,
        teamIdSetDelta: teamIdSet.size - before,
        teamIdSetSize: teamIdSet.size,
      });
    }
  } catch (e) {
    steps.push({
      name: 'teams_created_by_uid',
      error: String(e?.message || e),
      code: e?.code ?? null,
    });
  }

  try {
    if (!em) {
      steps.push({ name: 'boards_collaborator_emails', skipped: true });
    } else {
      const snap = await getDocs(
        query(collection(db, 'boards'), where('board_collaborator_emails', 'array-contains', em))
      );
      steps.push({ name: 'boards_collaborator_emails', docCount: snap.size });
    }
  } catch (e) {
    steps.push({
      name: 'boards_collaborator_emails',
      error: String(e?.message || e),
      code: e?.code ?? null,
    });
  }

  try {
    if (!memberUid) {
      steps.push({ name: 'boards_collaborator_uids', skipped: true });
    } else {
      const snap = await getDocs(
        query(collection(db, 'boards'), where('board_collaborator_uids', 'array-contains', memberUid))
      );
      steps.push({ name: 'boards_collaborator_uids', docCount: snap.size });
    }
  } catch (e) {
    steps.push({
      name: 'boards_collaborator_uids',
      error: String(e?.message || e),
      code: e?.code ?? null,
    });
  }

  const uniqueBoardIds = new Set();
  let boardQueryFailures = 0;
  for (const tid of teamIdSet) {
    let tidFailures = 0;
    try {
      const snap1 = await getDocs(query(collection(db, 'boards'), where('team_ids', 'array-contains', tid)));
      snap1.docs.forEach((d) => uniqueBoardIds.add(d.id));
    } catch {
      tidFailures += 1;
    }
    try {
      const snap2 = await getDocs(query(collection(db, 'boards'), where('team_id', '==', tid)));
      snap2.docs.forEach((d) => uniqueBoardIds.add(d.id));
    } catch {
      tidFailures += 1;
    }
    if (tidFailures) boardQueryFailures += 1;
  }
  steps.push({
    name: 'boards_via_team_queries',
    teamCount: teamIdSet.size,
    uniqueBoardIdsFromTeamQueries: uniqueBoardIds.size,
    boardQueryFailures,
  });

  try {
    if (!ownerUid) {
      steps.push({ name: 'boards_owner_uid', skipped: true });
    } else {
      const snap = await getDocs(query(collection(db, 'boards'), where('owner_uid', '==', ownerUid)));
      snap.docs.forEach((d) => uniqueBoardIds.add(d.id));
      steps.push({ name: 'boards_owner_uid', docCount: snap.size, cumulativeUniqueBoardIds: uniqueBoardIds.size });
    }
  } catch (e) {
    steps.push({
      name: 'boards_owner_uid',
      error: String(e?.message || e),
      code: e?.code ?? null,
    });
  }

  let fetchVisibleError = null;
  let fetchVisibleBoardCount = 0;
  try {
    const rows = await fetchVisibleBoards(db, {
      isGlobalAdmin,
      accessibleTeamIds,
      ownerUid,
      creatorUid,
      memberEmail,
      memberUid,
    });
    fetchVisibleBoardCount = rows.length;
    steps.push({
      name: 'fetchVisibleBoards_aggregate',
      count: fetchVisibleBoardCount,
      note: 'should match unique boards user can read (rules may filter query results)',
    });
  } catch (e) {
    fetchVisibleError = { code: e?.code ?? null, message: String(e?.message || e) };
    steps.push({ name: 'fetchVisibleBoards_aggregate', error: fetchVisibleError.message, code: fetchVisibleError.code });
  }

  return {
    generatedAt,
    fetchVisibleError,
    fetchVisibleBoardCount,
    teamIdSetSize: teamIdSet.size,
    teamIdSample: [...teamIdSet].slice(0, 8),
    steps,
  };
}
