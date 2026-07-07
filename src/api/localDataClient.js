import { normalizeEmail } from '@/lib/email';
import { FEEDBACK_LOG_VIEWER_EMAIL } from '@/lib/feedbackAccess';
import { getBoardTeamIds } from '@/lib/boardTeams';

const STORAGE_KEY = 'huddle-board-app-v1';
const LEGACY_STORAGE_KEY = 'sprint-board-app-v1';

function migrateCardsTimestamps(data) {
  if (!data.cards?.length) return false;
  let changed = false;
  for (const c of data.cards) {
    const hasCreated = c.created_at != null && c.created_at !== '';
    if (!hasCreated && c.updated_at) {
      c.created_at = c.updated_at;
      changed = true;
    }
  }
  if (changed) save(data);
  return changed;
}

function load() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        raw = legacy;
        localStorage.setItem(STORAGE_KEY, legacy);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    if (!raw) {
      const initial = {
        boards: [],
        columns: [],
        cards: [],
        teams: [],
        team_memberships: [],
        organizations: [],
        organization_memberships: [],
        retrospective_sessions: [],
        public_profiles: [],
        board_labels: [],
        product_feedback: [],
      };
      save(initial);
      return initial;
    }
    const data = JSON.parse(raw);
    if (!Array.isArray(data.organizations)) {
      data.organizations = [];
      save(data);
    }
    if (!Array.isArray(data.organization_memberships)) {
      data.organization_memberships = [];
      save(data);
    }
    if (!Array.isArray(data.team_memberships)) {
      data.team_memberships = [];
      save(data);
    }
    if (!Array.isArray(data.retrospective_sessions)) {
      data.retrospective_sessions = [];
      save(data);
    }
    if (!Array.isArray(data.public_profiles)) {
      data.public_profiles = [];
      save(data);
    }
    if (!Array.isArray(data.board_labels)) {
      data.board_labels = [];
      save(data);
    }
    if (!Array.isArray(data.product_feedback)) {
      data.product_feedback = [];
      save(data);
    }
    migrateCardsTimestamps(data);
    return data;
  } catch {
    const initial = {
      boards: [],
      columns: [],
      cards: [],
      teams: [],
      team_memberships: [],
      organizations: [],
      organization_memberships: [],
      retrospective_sessions: [],
      public_profiles: [],
      board_labels: [],
      product_feedback: [],
    };
    save(initial);
    return initial;
  }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function makeEntityAPI(collectionName) {
  return {
    async filter(query, sortField) {
      const data = load();
      let rows = data[collectionName].filter((row) =>
        Object.entries(query).every(([k, v]) => row[k] === v)
      );
      if (sortField) {
        rows = [...rows].sort((a, b) => (a[sortField] ?? 0) - (b[sortField] ?? 0));
      }
      return rows;
    },
    async list(sortField) {
      const data = load();
      let rows = [...data[collectionName]];
      if (sortField) {
        rows.sort((a, b) => {
          const av = a[sortField];
          const bv = b[sortField];
          if (typeof av === 'number' && typeof bv === 'number') return av - bv;
          return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' });
        });
      }
      return rows;
    },
    async create(payload) {
      const data = load();
      const id = crypto.randomUUID();
      const row = { id, ...payload };
      data[collectionName].push(row);
      save(data);
      return row;
    },
    async update(id, updates) {
      const data = load();
      const idx = data[collectionName].findIndex((r) => r.id === id);
      if (idx === -1) throw new Error('Not found');
      data[collectionName][idx] = { ...data[collectionName][idx], ...updates };
      save(data);
      return data[collectionName][idx];
    },
    async delete(id) {
      const data = load();
      data[collectionName] = data[collectionName].filter((r) => r.id !== id);
      save(data);
    },
  };
}

function reorderCardsInBoard(boardId, cardId, destColumnId, destIndex, sessionId) {
  const data = load();
  let boardCards = data.cards.filter((c) => c.board_id === boardId);
  if (sessionId) {
    boardCards = boardCards.filter((c) => c.session_id === sessionId);
  } else {
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

  const next = [];
  for (const colId of Object.keys(byCol)) {
    byCol[colId].forEach((c, i) => {
      next.push({ ...c, column_id: colId, order: i });
    });
  }

  data.cards = data.cards.filter((c) => c.board_id !== boardId).concat(next);
  save(data);
}

const cardsEntity = makeEntityAPI('cards');

const CardAPI = {
  ...cardsEntity,
  async filter(query, sortField) {
    const data = load();
    let rows = data.cards.filter((row) => {
      if (row.board_id !== query.board_id) return false;
      if (query.session_id) return row.session_id === query.session_id;
      return true;
    });
    if (!query.session_id) {
      rows = rows.filter((c) => !c.session_id);
    }
    if (sortField) {
      rows = [...rows].sort((a, b) => (a[sortField] ?? 0) - (b[sortField] ?? 0));
    } else {
      rows = [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return rows;
  },
  async listAllForBoard(boardId) {
    const data = load();
    if (!boardId) return [];
    return data.cards.filter((c) => c.board_id === boardId);
  },
  async create(payload) {
    const now = new Date().toISOString();
    return cardsEntity.create({
      ...payload,
      created_at: payload.created_at ?? now,
      updated_at: payload.updated_at ?? now,
    });
  },
  reorder: reorderCardsInBoard,
};

const retrospectiveSessionsEntity = makeEntityAPI('retrospective_sessions');
const RetrospectiveSessionAPI = {
  ...retrospectiveSessionsEntity,
  async filter(q) {
    if (!q?.board_id) return [];
    if (q.session_date) {
      return retrospectiveSessionsEntity.filter({ board_id: q.board_id, session_date: q.session_date });
    }
    const rows = await retrospectiveSessionsEntity.filter({ board_id: q.board_id });
    return [...rows].sort((a, b) => {
      const byDate = String(b.session_date ?? '').localeCompare(String(a.session_date ?? ''));
      if (byDate !== 0) return byDate;
      return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
    });
  },
  async getOrCreateForDate(boardId, sessionDate) {
    const existing = await this.filter({ board_id: boardId, session_date: sessionDate });
    const openSessions = existing.filter((s) => !s.closed_at);
    if (openSessions.length) {
      return openSessions.sort((a, b) =>
        String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
      )[0];
    }
    return retrospectiveSessionsEntity.create({
      board_id: boardId,
      session_date: sessionDate,
      created_at: new Date().toISOString(),
    });
  },
};

function deleteBoardCascadeLocal(boardId) {
  const data = load();
  data.cards = data.cards.filter((c) => c.board_id !== boardId);
  data.columns = data.columns.filter((c) => c.board_id !== boardId);
  data.retrospective_sessions = data.retrospective_sessions.filter((s) => s.board_id !== boardId);
  if (Array.isArray(data.board_labels)) {
    data.board_labels = data.board_labels.filter((l) => l.board_id !== boardId);
  }
  data.boards = data.boards.filter((b) => b.id !== boardId);
  save(data);
}

const boardLabelsEntity = makeEntityAPI('board_labels');
const BoardLabelAPI = {
  ...boardLabelsEntity,
  async filter(q) {
    if (!q?.board_id) return [];
    const data = load();
    return data.board_labels
      .filter((row) => row.board_id === q.board_id)
      .sort((a, b) =>
        String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' })
      );
  },
};

const boardsEntity = makeEntityAPI('boards');
const BoardAPI = {
  ...boardsEntity,
  async filter(q) {
    const data = load();
    if (!q || typeof q !== 'object') return [];
    if (q.id) {
      const row = data.boards.find((r) => r.id === q.id);
      return row ? [row] : [];
    }
    if ('team_id' in q) {
      const tid = q.team_id;
      if (tid === null || tid === undefined) {
        return data.boards.filter((b) => getBoardTeamIds(b).length === 0);
      }
      return data.boards.filter((b) => getBoardTeamIds(b).includes(tid));
    }
    return [];
  },
  async create(payload) {
    let row = { ...payload };
    if (!row.team_ids?.length && row.team_id) {
      row = { ...row, team_ids: [row.team_id] };
    }
    if (row.team_ids?.length === 1 && !row.team_id) {
      row = { ...row, team_id: row.team_ids[0] };
    }
    const data = load();
    const id = crypto.randomUUID();
    const created = { id, ...row };
    data.boards.push(created);
    save(data);
    return created;
  },
  async delete(id) {
    deleteBoardCascadeLocal(id);
  },
};

const teamsEntity = makeEntityAPI('teams');
const TeamAPI = {
  ...teamsEntity,
  async get(id) {
    const data = load();
    const row = data.teams.find((r) => r.id === id);
    return row ?? null;
  },
  async filter(q) {
    const data = load();
    if (q?.organization_id != null) {
      return data.teams
        .filter((t) => t.organization_id === q.organization_id)
        .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base' }));
    }
    return [];
  },
  async create(payload) {
    const data = load();
    const id = crypto.randomUUID();
    const row = { id, ...payload };
    data.teams.push(row);
    const leadEmail = normalizeEmail(payload.created_by_email);
    if (leadEmail) {
      const memId = crypto.randomUUID();
      data.team_memberships.push({
        id: memId,
        team_id: id,
        email: leadEmail,
        role: 'team_admin',
        uid: payload.created_by_uid ?? null,
        created_at: new Date().toISOString(),
      });
    }
    save(data);
    return row;
  },
};

const organizationsEntity = makeEntityAPI('organizations');
const OrganizationAPI = {
  ...organizationsEntity,
  async get(id) {
    const data = load();
    const row = data.organizations.find((r) => r.id === id);
    if (row) return row;
    if (id === 'local') {
      return { id: 'local', name: 'Personal', is_personal_workspace: true };
    }
    return null;
  },
  async ensurePersonalWorkspaceForUser({ uid, email }) {
    const em = normalizeEmail(email);
    if (!uid || !em) return null;
    const id = `personal_${uid}`;
    const data = load();
    let org = data.organizations.find((r) => r.id === id);
    if (!org) {
      org = {
        id,
        name: 'Personal',
        is_personal_workspace: true,
        personal_owner_uid: uid,
        created_at: new Date().toISOString(),
      };
      data.organizations.push(org);
    }
    const hasMem = data.organization_memberships.some(
      (r) => r.organization_id === id && normalizeEmail(r.email) === em
    );
    if (!hasMem) {
      const memId = crypto.randomUUID();
      data.organization_memberships.push({
        id: memId,
        organization_id: id,
        email: em,
        role: 'org_admin',
        uid,
        created_at: new Date().toISOString(),
      });
    }
    save(data);
    return org;
  },
};

const organizationMembershipsEntity = makeEntityAPI('organization_memberships');
const OrganizationMembershipAPI = {
  ...organizationMembershipsEntity,
  async filter(q) {
    const data = load();
    if (!q || typeof q !== 'object') return [];
    if (q.organization_id != null && q.email != null) {
      const em = normalizeEmail(q.email);
      return data.organization_memberships.filter(
        (r) => r.organization_id === q.organization_id && normalizeEmail(r.email) === em
      );
    }
    if (q.email != null) {
      const em = normalizeEmail(q.email);
      return data.organization_memberships.filter((r) => normalizeEmail(r.email) === em);
    }
    if (q.organization_id != null) {
      return [...data.organization_memberships]
        .filter((r) => r.organization_id === q.organization_id)
        .sort((a, b) => String(a.email ?? '').localeCompare(String(b.email ?? '')));
    }
    return [];
  },
  async listForEmail(email) {
    return this.filter({ email });
  },
  async create({ organization_id, email, role }) {
    const em = normalizeEmail(email);
    if (!em) throw new Error('Email is required');
    const data = load();
    if (
      data.organization_memberships.some(
        (r) => r.organization_id === organization_id && normalizeEmail(r.email) === em
      )
    ) {
      throw new Error('That person is already a member.');
    }
    const id = crypto.randomUUID();
    const row = {
      id,
      organization_id,
      email: em,
      role: role || 'member',
      uid: null,
      created_at: new Date().toISOString(),
    };
    data.organization_memberships.push(row);
    save(data);
    return row;
  },
};

const teamMembershipsEntity = makeEntityAPI('team_memberships');

const PublicProfileAPI = {
  async getByEmails(emails) {
    const data = load();
    const norm = [...new Set((emails || []).map((e) => normalizeEmail(e)).filter(Boolean))];
    const out = {};
    for (const e of norm) {
      const row = data.public_profiles.find((r) => r.id === e);
      if (!row) continue;
      const photo_url = row.photo_url ?? null;
      const display_name =
        typeof row.display_name === 'string' ? row.display_name.trim() || null : null;
      if (photo_url || display_name) {
        out[e] = { photo_url, display_name };
      }
    }
    return out;
  },
  async upsert(email, payload) {
    const em = normalizeEmail(email);
    if (!em) return;
    const data = load();
    const row = {
      id: em,
      email: em,
      photo_url: payload?.photo_url ?? null,
      display_name: payload?.display_name ?? null,
      updated_at: new Date().toISOString(),
    };
    const i = data.public_profiles.findIndex((r) => r.id === em);
    if (i >= 0) data.public_profiles[i] = { ...data.public_profiles[i], ...row };
    else data.public_profiles.push(row);
    save(data);
  },
};

const ProductFeedbackAPI = {
  async create(payload) {
    const data = load();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const row = {
      id,
      kind: payload.kind,
      body: typeof payload.body === 'string' ? payload.body.trim() : '',
      page_path: typeof payload.page_path === 'string' ? payload.page_path : '',
      submitter_email: normalizeEmail(payload.submitter_email),
      submitter_uid: payload.submitter_uid ?? null,
      created_at: now,
    };
    data.product_feedback.push(row);
    save(data);
    return row;
  },
  async listForLog(viewerEmail) {
    if (normalizeEmail(viewerEmail) !== normalizeEmail(FEEDBACK_LOG_VIEWER_EMAIL)) return [];
    const data = load();
    return [...data.product_feedback].sort((a, b) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
    );
  },
};

/** Local-only persistence (localStorage). */
export const localBase44 = {
  auth: {
    async me() {
      return {
        full_name: 'Local User',
        email: 'user@localhost.local',
      };
    },
  },
  entities: {
    Board: BoardAPI,
    BoardColumn: makeEntityAPI('columns'),
    Card: CardAPI,
    BoardLabel: BoardLabelAPI,
    RetrospectiveSession: RetrospectiveSessionAPI,
    Team: TeamAPI,
    Organization: OrganizationAPI,
    OrganizationMembership: OrganizationMembershipAPI,
    TeamMembership: teamMembershipsEntity,
    PublicProfile: PublicProfileAPI,
    ProductFeedback: ProductFeedbackAPI,
    AppConfig: {
      async getGlobal() {
        return { global_admin_emails: [] };
      },
    },
    UserPreferences: {
      async get(uid) {
        if (!uid) return null;
        try {
          const raw = localStorage.getItem(`huddl-user-prefs-${uid}`);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return typeof parsed === 'object' && parsed ? { id: uid, ...parsed } : null;
        } catch {
          return null;
        }
      },
      async set(uid, data) {
        if (!uid) return;
        try {
          const raw = localStorage.getItem(`huddl-user-prefs-${uid}`);
          const prev = raw ? JSON.parse(raw) : {};
          const next = { ...(typeof prev === 'object' && prev ? prev : {}), ...data };
          localStorage.setItem(`huddl-user-prefs-${uid}`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      },
    },
  },
};
