import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { normalizeEmail } from '@/lib/email';
import { sortTeamMembershipsForDisplay } from '@/lib/teamMembersSort';
import { getBoardTeamIds } from '@/lib/boardTeams';

function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Denormalized Circle membership for Firestore rules (see `boardDenormAccess` / `boardDenormAdmin` in firestore.rules).
 * Built from linked `teams` docs the caller can read.
 */
async function mergeBoardCollaboratorDenorm(db, row) {
  const tids = getBoardTeamIds(row);
  if (!tids.length) {
    return {
      ...row,
      board_collaborator_emails: [],
      board_collaborator_admin_emails: [],
      board_collaborator_uids: [],
    };
  }
  const emails = new Set();
  const adminOnly = new Set();
  const uids = new Set();
  for (const tid of tids) {
    try {
      const s = await getDoc(doc(db, 'teams', tid));
      if (!s.exists()) continue;
      const d = s.data();
      (d.member_emails || []).forEach((e) => {
        const x = normalizeEmail(e);
        if (x) emails.add(x);
      });
      (d.admin_emails || []).forEach((e) => {
        const x = normalizeEmail(e);
        if (x) {
          emails.add(x);
          adminOnly.add(x);
        }
      });
      (d.member_uids || []).forEach((u) => {
        if (typeof u === 'string' && u.length) uids.add(u);
      });
    } catch (e) {
      console.warn('mergeBoardCollaboratorDenorm team', tid, e);
    }
  }
  return {
    ...row,
    board_collaborator_emails: [...emails],
    board_collaborator_admin_emails: [...adminOnly],
    board_collaborator_uids: [...uids],
  };
}

/**
 * Same entity API as localDataClient, backed by Firestore top-level collections:
 * boards, columns, cards, teams — each document id is the entity id.
 */
export function createFirestoreBase44(db) {
  const boardsCol = () => collection(db, 'boards');
  const columnsCol = () => collection(db, 'columns');
  const cardsCol = () => collection(db, 'cards');
  const retrospectiveSessionsCol = () => collection(db, 'retrospective_sessions');
  const teamsCol = () => collection(db, 'teams');
  const teamMembershipsCol = () => collection(db, 'team_memberships');
  const organizationsCol = () => collection(db, 'organizations');
  const organizationMembershipsCol = () => collection(db, 'organization_memberships');
  const boardLabelsCol = () => collection(db, 'board_labels');
  const productFeedbackCol = () => collection(db, 'product_feedback');

  async function deleteBoardCascade(boardId) {
    const [cardsSnap, colsSnap, sessSnap, labelsSnap] = await Promise.all([
      getDocs(query(cardsCol(), where('board_id', '==', boardId))),
      getDocs(query(columnsCol(), where('board_id', '==', boardId))),
      getDocs(query(retrospectiveSessionsCol(), where('board_id', '==', boardId))),
      getDocs(query(boardLabelsCol(), where('board_id', '==', boardId))),
    ]);
    const batch = writeBatch(db);
    cardsSnap.forEach((d) => batch.delete(d.ref));
    colsSnap.forEach((d) => batch.delete(d.ref));
    sessSnap.forEach((d) => batch.delete(d.ref));
    labelsSnap.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'boards', boardId));
    await batch.commit();
  }

  /** Denormalized for Firestore rules: lowercase emails on the team document. */
  async function syncTeamMemberDenorm(teamId) {
    if (!teamId) return;
    try {
      const snap = await getDocs(query(teamMembershipsCol(), where('team_id', '==', teamId)));
      const member_emails = [];
      const admin_emails = [];
      const member_uids = [];
      snap.forEach((d) => {
        const em = normalizeEmail(d.data().email);
        if (!em) return;
        member_emails.push(em);
        if (d.data().role === 'team_admin') admin_emails.push(em);
        const u = d.data().uid;
        if (typeof u === 'string' && u.length) member_uids.push(u);
      });
      const member_uids_unique = [...new Set(member_uids)];
      await updateDoc(doc(db, 'teams', teamId), { member_emails, admin_emails, member_uids: member_uids_unique });
    } catch (e) {
      console.warn('syncTeamMemberDenorm', teamId, e);
    }
  }

  async function syncOrganizationMemberDenorm(organizationId) {
    if (!organizationId) return;
    try {
      const snap = await getDocs(
        query(organizationMembershipsCol(), where('organization_id', '==', organizationId))
      );
      const member_emails = [];
      const admin_emails = [];
      snap.forEach((d) => {
        const em = normalizeEmail(d.data().email);
        if (!em) return;
        member_emails.push(em);
        if (d.data().role === 'org_admin') admin_emails.push(em);
      });
      await updateDoc(doc(db, 'organizations', organizationId), { member_emails, admin_emails });
    } catch (e) {
      console.warn('syncOrganizationMemberDenorm', organizationId, e);
    }
  }

  return {
    auth: {
      async me() {
        return {
          full_name: 'Local User',
          email: 'user@localhost.local',
        };
      },
    },
    entities: {
      AppConfig: {
        async getGlobal() {
          const s = await getDoc(doc(db, 'app_config', 'global'));
          if (!s.exists()) return { global_admin_emails: [] };
          const d = s.data();
          return {
            global_admin_emails: Array.isArray(d.global_admin_emails) ? d.global_admin_emails : [],
          };
        },
      },

      /** Per-user UI prefs (e.g. theme). Document id = Firebase Auth uid. */
      UserPreferences: {
        async get(uid) {
          if (!uid) return null;
          const s = await getDoc(doc(db, 'user_preferences', uid));
          if (!s.exists()) return null;
          return { id: s.id, ...s.data() };
        },
        async set(uid, data) {
          if (!uid) return;
          await setDoc(
            doc(db, 'user_preferences', uid),
            stripUndefined({
              ...data,
              updated_at: new Date().toISOString(),
            }),
            { merge: true }
          );
        },
      },

      /** Doc id = normalized email. Readable by any signed-in user; writable only for own doc (enforced in rules). */
      PublicProfile: {
        async getByEmails(emails) {
          const normalized = [...new Set((emails || []).map((e) => normalizeEmail(e)).filter(Boolean))];
          const out = {};
          /** Direct reads by doc id — reliable for email-shaped ids; keys always normalized email. */
          await Promise.all(
            normalized.map(async (em) => {
              const snap = await getDoc(doc(db, 'public_profiles', em));
              if (!snap.exists()) return;
              const d = snap.data();
              const photo_url = d?.photo_url ?? null;
              const display_name =
                typeof d?.display_name === 'string' ? d.display_name.trim() || null : null;
              if (photo_url || display_name) {
                out[em] = { photo_url, display_name };
              }
            })
          );
          return out;
        },
        async upsert(email, data) {
          const em = normalizeEmail(email);
          if (!em) return;
          await setDoc(
            doc(db, 'public_profiles', em),
            stripUndefined({
              email: em,
              photo_url: data?.photo_url ?? null,
              display_name: data?.display_name ?? null,
              updated_at: new Date().toISOString(),
            }),
            { merge: true }
          );
        },
      },

      BoardLabel: {
        async filter(q) {
          if (!q?.board_id) return [];
          const snap = await getDocs(query(boardLabelsCol(), where('board_id', '==', q.board_id)));
          return snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) =>
              String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' })
            );
        },
        async create(payload) {
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          const row = { id, ...payload, created_at: payload.created_at ?? now };
          await setDoc(doc(db, 'board_labels', id), stripUndefined(row));
          return row;
        },
        async update(id, updates) {
          const ref = doc(db, 'board_labels', id);
          await updateDoc(ref, stripUndefined(updates));
          const s = await getDoc(ref);
          return { id: s.id, ...s.data() };
        },
        async delete(id) {
          await deleteDoc(doc(db, 'board_labels', id));
        },
      },

      TeamMembership: {
        /** Same shape as localStorage client: equality on team_id, email, or both. */
        async filter(q) {
          if (!q || typeof q !== 'object') return [];
          const teamId = q.team_id;
          const rawEmail = q.email;
          if (teamId != null && rawEmail != null) {
            const em = normalizeEmail(rawEmail);
            const snap = await getDocs(
              query(teamMembershipsCol(), where('team_id', '==', teamId), where('email', '==', em))
            );
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          }
          if (rawEmail != null) {
            const e = normalizeEmail(rawEmail);
            if (!e) return [];
            const snap = await getDocs(query(teamMembershipsCol(), where('email', '==', e)));
            let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            if (teamId != null) rows = rows.filter((r) => r.team_id === teamId);
            return rows;
          }
          if (teamId != null) {
            const snap = await getDocs(query(teamMembershipsCol(), where('team_id', '==', teamId)));
            let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            return rows.filter((row) => Object.entries(q).every(([k, v]) => row[k] === v));
          }
          return [];
        },
        async listForEmail(email) {
          const e = normalizeEmail(email);
          if (!e) return [];
          const snap = await getDocs(query(teamMembershipsCol(), where('email', '==', e)));
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
        async listForUid(uid) {
          if (!uid) return [];
          const snap = await getDocs(query(teamMembershipsCol(), where('uid', '==', uid)));
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
        async listForTeam(teamId) {
          const snap = await getDocs(query(teamMembershipsCol(), where('team_id', '==', teamId)));
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          return sortTeamMembershipsForDisplay(rows);
        },
        async create({ team_id, email, role }) {
          const em = normalizeEmail(email);
          if (!em) throw new Error('Email is required');
          const dup = await getDocs(
            query(teamMembershipsCol(), where('team_id', '==', team_id), where('email', '==', em))
          );
          if (!dup.empty) throw new Error('That person is already on this team.');
          const id = crypto.randomUUID();
          const row = {
            id,
            team_id,
            email: em,
            role,
            uid: null,
            created_at: new Date().toISOString(),
          };
          await setDoc(doc(db, 'team_memberships', id), stripUndefined(row));
          await syncTeamMemberDenorm(team_id);
          return row;
        },
        async delete(id) {
          const ref = doc(db, 'team_memberships', id);
          const prev = await getDoc(ref);
          const teamId = prev.exists() ? prev.data()?.team_id : null;
          await deleteDoc(ref);
          if (teamId) await syncTeamMemberDenorm(teamId);
        },
        /** Attach Firebase Auth uid to rows for this email (first login / claim). */
        async syncUidForEmail(email, uid) {
          const e = normalizeEmail(email);
          if (!e || !uid) return;
          const snap = await getDocs(query(teamMembershipsCol(), where('email', '==', e)));
          const teamIds = new Set();
          snap.forEach((d) => {
            if (d.data().team_id) teamIds.add(d.data().team_id);
          });
          const batch = writeBatch(db);
          snap.forEach((d) => {
            if (!d.data().uid) batch.update(d.ref, { uid });
          });
          if (snap.size) await batch.commit();
          for (const tid of teamIds) {
            await syncTeamMemberDenorm(tid);
          }
        },
        async deleteAllForTeam(teamId) {
          const snap = await getDocs(query(teamMembershipsCol(), where('team_id', '==', teamId)));
          const batch = writeBatch(db);
          snap.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          await syncTeamMemberDenorm(teamId);
        },
        async update(id, updates) {
          const ref = doc(db, 'team_memberships', id);
          const prevTeam = (await getDoc(ref)).data()?.team_id;
          await updateDoc(ref, stripUndefined(updates));
          const s = await getDoc(ref);
          const row = { id: s.id, ...s.data() };
          if (row.team_id) await syncTeamMemberDenorm(row.team_id);
          else if (prevTeam) await syncTeamMemberDenorm(prevTeam);
          return row;
        },
      },

      Organization: {
        async get(id) {
          if (!id) return null;
          const s = await getDoc(doc(db, 'organizations', id));
          if (!s.exists()) return null;
          return { id: s.id, ...s.data() };
        },
        /**
         * Idempotent: ensures every signed-in user has a private "Personal" workspace org
         * (document id `personal_{uid}`) and an org_admin membership.
         */
        async ensurePersonalWorkspaceForUser({ uid, email }) {
          const em = normalizeEmail(email);
          if (!uid || !em) return null;
          const id = `personal_${uid}`;
          const ref = doc(db, 'organizations', id);
          const snap = await getDoc(ref);
          if (!snap.exists()) {
            const row = {
              id,
              name: 'Personal',
              is_personal_workspace: true,
              personal_owner_uid: uid,
              created_at: new Date().toISOString(),
            };
            await setDoc(ref, stripUndefined(row));
          }
          const memSnap = await getDocs(
            query(
              organizationMembershipsCol(),
              where('organization_id', '==', id),
              where('email', '==', em)
            )
          );
          if (memSnap.empty) {
            const memId = crypto.randomUUID();
            await setDoc(
              doc(db, 'organization_memberships', memId),
              stripUndefined({
                id: memId,
                organization_id: id,
                email: em,
                role: 'org_admin',
                uid,
                created_at: new Date().toISOString(),
              })
            );
          }
          const s = await getDoc(ref);
          await syncOrganizationMemberDenorm(id);
          return s.exists() ? { id: s.id, ...s.data() } : null;
        },
        async list(sortField) {
          const snap = await getDocs(query(organizationsCol(), orderBy(sortField || 'name', 'asc')));
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
        async create(payload) {
          const id = crypto.randomUUID();
          const row = { id, ...payload, created_at: payload.created_at ?? new Date().toISOString() };
          await setDoc(doc(db, 'organizations', id), stripUndefined(row));
          await syncOrganizationMemberDenorm(id);
          return row;
        },
        async update(id, updates) {
          const ref = doc(db, 'organizations', id);
          await updateDoc(ref, stripUndefined(updates));
          const s = await getDoc(ref);
          return { id: s.id, ...s.data() };
        },
        async delete(id) {
          await deleteDoc(doc(db, 'organizations', id));
        },
        /** Recompute member_emails / admin_emails on the org doc. */
        async syncMemberDenorm(organizationId) {
          await syncOrganizationMemberDenorm(organizationId);
        },
      },

      OrganizationMembership: {
        async filter(q) {
          if (!q || typeof q !== 'object') return [];
          if (q.organization_id != null && q.email != null) {
            const em = normalizeEmail(q.email);
            const snap = await getDocs(
              query(
                organizationMembershipsCol(),
                where('organization_id', '==', q.organization_id),
                where('email', '==', em)
              )
            );
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          }
          if (q.email != null) {
            const em = normalizeEmail(q.email);
            if (!em) return [];
            const snap = await getDocs(query(organizationMembershipsCol(), where('email', '==', em)));
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          }
          if (q.organization_id != null) {
            const snap = await getDocs(
              query(organizationMembershipsCol(), where('organization_id', '==', q.organization_id))
            );
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            rows.sort((a, b) => String(a.email ?? '').localeCompare(String(b.email ?? '')));
            return rows;
          }
          return [];
        },
        async listForEmail(email) {
          const e = normalizeEmail(email);
          if (!e) return [];
          const snap = await getDocs(query(organizationMembershipsCol(), where('email', '==', e)));
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
        async listForUid(uid) {
          if (!uid) return [];
          const snap = await getDocs(query(organizationMembershipsCol(), where('uid', '==', uid)));
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
        async create({ organization_id, email, role }) {
          const em = normalizeEmail(email);
          if (!em) throw new Error('Email is required');
          const dup = await getDocs(
            query(
              organizationMembershipsCol(),
              where('organization_id', '==', organization_id),
              where('email', '==', em)
            )
          );
          if (!dup.empty) throw new Error('That person is already a member.');
          const id = crypto.randomUUID();
          const row = {
            id,
            organization_id,
            email: em,
            role: role || 'member',
            uid: null,
            created_at: new Date().toISOString(),
          };
          await setDoc(doc(db, 'organization_memberships', id), stripUndefined(row));
          await syncOrganizationMemberDenorm(organization_id);
          return row;
        },
        async delete(id) {
          const ref = doc(db, 'organization_memberships', id);
          const prev = await getDoc(ref);
          const oid = prev.exists() ? prev.data()?.organization_id : null;
          await deleteDoc(ref);
          if (oid) await syncOrganizationMemberDenorm(oid);
        },
        async update(id, updates) {
          const ref = doc(db, 'organization_memberships', id);
          const prevOid = (await getDoc(ref)).data()?.organization_id;
          await updateDoc(ref, stripUndefined(updates));
          const s = await getDoc(ref);
          const row = { id: s.id, ...s.data() };
          if (row.organization_id) await syncOrganizationMemberDenorm(row.organization_id);
          else if (prevOid) await syncOrganizationMemberDenorm(prevOid);
          return row;
        },
        async syncUidForEmail(email, uid) {
          const e = normalizeEmail(email);
          if (!e || !uid) return;
          const snap = await getDocs(query(organizationMembershipsCol(), where('email', '==', e)));
          const orgIds = new Set();
          snap.forEach((d) => {
            if (d.data().organization_id) orgIds.add(d.data().organization_id);
          });
          const batch = writeBatch(db);
          snap.forEach((d) => {
            if (!d.data().uid) batch.update(d.ref, { uid });
          });
          if (snap.size) await batch.commit();
          for (const oid of orgIds) {
            await syncOrganizationMemberDenorm(oid);
          }
        },
      },

      Board: {
        async filter(q) {
          if (!q || typeof q !== 'object') return [];
          if (q.id) {
            const snap = await getDoc(doc(db, 'boards', q.id));
            if (!snap.exists()) return [];
            return [{ id: snap.id, ...snap.data() }];
          }
          if ('team_id' in q) {
            const tid = q.team_id;
            if (tid === null || tid === undefined) {
              const snap = await getDocs(boardsCol());
              return snap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .filter((b) => {
                  const hasTeams = Array.isArray(b.team_ids) && b.team_ids.length > 0;
                  const hasLegacy = b.team_id != null && b.team_id !== '';
                  return !hasTeams && !hasLegacy;
                });
            }
            const seen = new Map();
            try {
              const snapA = await getDocs(query(boardsCol(), where('team_ids', 'array-contains', tid)));
              snapA.docs.forEach((d) => seen.set(d.id, { id: d.id, ...d.data() }));
            } catch (e) {
              console.warn('Board.filter team_ids array-contains', tid, e);
            }
            try {
              const snapB = await getDocs(query(boardsCol(), where('team_id', '==', tid)));
              snapB.docs.forEach((d) => seen.set(d.id, { id: d.id, ...d.data() }));
            } catch (e) {
              console.warn('Board.filter team_id', tid, e);
            }
            return [...seen.values()];
          }
          return [];
        },
        async list() {
          const snap = await getDocs(boardsCol());
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
        async create(payload) {
          const id = crypto.randomUUID();
          let row = { id, ...payload };
          if (!row.team_ids?.length && row.team_id) {
            row = { ...row, team_ids: [row.team_id] };
          }
          if (row.team_ids?.length === 1 && !row.team_id) {
            row = { ...row, team_id: row.team_ids[0] };
          }
          row = await mergeBoardCollaboratorDenorm(db, row);
          await setDoc(doc(db, 'boards', id), stripUndefined(row));
          return row;
        },
        async update(id, updates) {
          const ref = doc(db, 'boards', id);
          const prevSnap = await getDoc(ref);
          if (!prevSnap.exists()) throw new Error('Board not found');
          let next = { id: prevSnap.id, ...prevSnap.data(), ...updates };
          if (!next.team_ids?.length && next.team_id) {
            next = { ...next, team_ids: [next.team_id] };
          }
          if (Array.isArray(next.team_ids) && next.team_ids.length === 1 && !next.team_id) {
            next = { ...next, team_id: next.team_ids[0] };
          }
          next = await mergeBoardCollaboratorDenorm(db, next);
          const { id: _rowId, ...toWrite } = next;
          await updateDoc(ref, stripUndefined(toWrite));
          const s = await getDoc(ref);
          return { id: s.id, ...s.data() };
        },
        async delete(id) {
          await deleteBoardCascade(id);
        },
      },

      RetrospectiveSession: {
        async filter(q) {
          if (!q?.board_id) return [];
          if (q.session_date) {
            const snap = await getDocs(
              query(
                retrospectiveSessionsCol(),
                where('board_id', '==', q.board_id),
                where('session_date', '==', q.session_date)
              )
            );
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          }
          const snap = await getDocs(
            query(retrospectiveSessionsCol(), where('board_id', '==', q.board_id))
          );
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          rows.sort((a, b) => {
            const byDate = String(b.session_date ?? '').localeCompare(String(a.session_date ?? ''));
            if (byDate !== 0) return byDate;
            return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
          });
          return rows;
        },
        async getOrCreateForDate(boardId, sessionDate) {
          const existing = await this.filter({ board_id: boardId, session_date: sessionDate });
          const openSessions = existing.filter((s) => !s.closed_at);
          if (openSessions.length) {
            return openSessions.sort((a, b) =>
              String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
            )[0];
          }
          const id = crypto.randomUUID();
          const row = {
            id,
            board_id: boardId,
            session_date: sessionDate,
            created_at: new Date().toISOString(),
          };
          await setDoc(doc(db, 'retrospective_sessions', id), stripUndefined(row));
          return row;
        },
        async update(id, updates) {
          const ref = doc(db, 'retrospective_sessions', id);
          const payload = { ...updates };
          if (payload.closed_at === null) {
            payload.closed_at = deleteField();
          }
          await updateDoc(ref, stripUndefined(payload));
        },
        async delete(id) {
          await deleteDoc(doc(db, 'retrospective_sessions', id));
        },
      },

      BoardColumn: {
        async filter(q, sortField) {
          const boardId = q.board_id;
          if (!boardId) return [];
          const qy = query(
            columnsCol(),
            where('board_id', '==', boardId),
            orderBy(sortField || 'order', 'asc')
          );
          const snap = await getDocs(qy);
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
        async list(sortField) {
          const snap = await getDocs(columnsCol());
          let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (sortField) {
            rows.sort((a, b) => (a[sortField] ?? 0) - (b[sortField] ?? 0));
          }
          return rows;
        },
        async create(payload) {
          const id = crypto.randomUUID();
          const row = { id, ...payload };
          await setDoc(doc(db, 'columns', id), stripUndefined(row));
          return row;
        },
        async update(id, updates) {
          const ref = doc(db, 'columns', id);
          await updateDoc(ref, stripUndefined(updates));
          const s = await getDoc(ref);
          return { id: s.id, ...s.data() };
        },
        async delete(id) {
          await deleteDoc(doc(db, 'columns', id));
        },
      },

      Team: {
        async filter(q) {
          if (!q || typeof q !== 'object') return [];
          if (q.organization_id != null) {
            const snap = await getDocs(query(teamsCol(), where('organization_id', '==', q.organization_id)));
            let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            rows.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' }));
            return rows;
          }
          return [];
        },
        async get(id) {
          if (!id) return null;
          const s = await getDoc(doc(db, 'teams', id));
          if (!s.exists()) return null;
          return { id: s.id, ...s.data() };
        },
        async list(sortField) {
          const snap = await getDocs(query(teamsCol(), orderBy(sortField || 'name', 'asc')));
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
        async create(payload) {
          const id = crypto.randomUUID();
          const row = { id, ...payload };
          await setDoc(doc(db, 'teams', id), stripUndefined(row));
          const leadEmail = normalizeEmail(payload.created_by_email);
          if (leadEmail) {
            const memId = crypto.randomUUID();
            await setDoc(
              doc(db, 'team_memberships', memId),
              stripUndefined({
                id: memId,
                team_id: id,
                email: leadEmail,
                role: 'team_admin',
                uid: payload.created_by_uid ?? null,
                created_at: new Date().toISOString(),
              })
            );
            await syncTeamMemberDenorm(id);
          }
          return row;
        },
        async update(id, updates) {
          const ref = doc(db, 'teams', id);
          await updateDoc(ref, stripUndefined(updates));
          const s = await getDoc(ref);
          return { id: s.id, ...s.data() };
        },
        async delete(id) {
          await deleteDoc(doc(db, 'teams', id));
        },
        /** Recompute member_emails / admin_emails on the team doc (call after fixing data or backfills). */
        async syncMemberDenorm(teamId) {
          await syncTeamMemberDenorm(teamId);
        },
      },

      Card: {
        async filter(q) {
          const boardId = q.board_id;
          if (!boardId) return [];
          let snap;
          if (q.session_id) {
            snap = await getDocs(
              query(
                cardsCol(),
                where('board_id', '==', boardId),
                where('session_id', '==', q.session_id)
              )
            );
          } else {
            snap = await getDocs(query(cardsCol(), where('board_id', '==', boardId)));
          }
          let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (!q.session_id) {
            rows = rows.filter((c) => !c.session_id);
          }
          return rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        },
        /** All cards on a board (including retrospective session cards). For analytics / home list contributors. */
        async listAllForBoard(boardId) {
          if (!boardId) return [];
          const snap = await getDocs(query(cardsCol(), where('board_id', '==', boardId)));
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
        async create(payload) {
          const now = new Date().toISOString();
          const id = crypto.randomUUID();
          const row = {
            id,
            ...payload,
            created_at: payload.created_at ?? now,
            updated_at: payload.updated_at ?? now,
          };
          await setDoc(doc(db, 'cards', id), stripUndefined(row));
          return row;
        },
        async update(id, updates) {
          const ref = doc(db, 'cards', id);
          await updateDoc(ref, stripUndefined(updates));
          const s = await getDoc(ref);
          return { id: s.id, ...s.data() };
        },
        async delete(id) {
          await deleteDoc(doc(db, 'cards', id));
        },
        async reorder(boardId, cardId, destColumnId, destIndex, sessionId) {
          let snap;
          if (sessionId) {
            snap = await getDocs(
              query(
                cardsCol(),
                where('board_id', '==', boardId),
                where('session_id', '==', sessionId)
              )
            );
          } else {
            snap = await getDocs(query(cardsCol(), where('board_id', '==', boardId)));
          }
          let boardCards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          if (!sessionId) {
            boardCards = boardCards.filter((c) => !c.session_id);
          }
          const card = boardCards.find((c) => c.id === cardId);
          if (!card) return;

          const others = boardCards.filter((c) => c.id !== cardId);
          const byCol = {};
          for (const c of others) {
            if (!byCol[c.column_id]) byCol[c.column_id] = [];
            byCol[c.column_id].push(c);
          }
          for (const k of Object.keys(byCol)) {
            byCol[k].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          }
          if (!byCol[destColumnId]) byCol[destColumnId] = [];
          const destList = [...byCol[destColumnId]];
          const moved = { ...card, column_id: destColumnId };
          const clampedIndex = Math.max(0, Math.min(destIndex, destList.length));
          destList.splice(clampedIndex, 0, moved);
          byCol[destColumnId] = destList;

          const batch = writeBatch(db);
          for (const colId of Object.keys(byCol)) {
            byCol[colId].forEach((c, i) => {
              const ref = doc(db, 'cards', c.id);
              batch.update(ref, stripUndefined({ column_id: colId, order: i }));
            });
          }
          await batch.commit();
        },
      },

      ProductFeedback: {
        async create(payload) {
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          const row = stripUndefined({
            id,
            kind: payload.kind,
            body: typeof payload.body === 'string' ? payload.body.trim() : '',
            page_path: typeof payload.page_path === 'string' ? payload.page_path : '',
            submitter_email: normalizeEmail(payload.submitter_email),
            submitter_uid: payload.submitter_uid ?? null,
            created_at: now,
          });
          await setDoc(doc(db, 'product_feedback', id), row);
          return row;
        },
        /** Only permitted for the feedback log viewer (enforced in Firestore rules). */
        async listForLog(_viewerEmail) {
          const snap = await getDocs(
            query(productFeedbackCol(), orderBy('created_at', 'desc'), limit(300))
          );
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
      },
    },
  };
}
