import { getLocalDateKey } from '@/lib/retrospectiveDates';

/**
 * @typedef {{
 *   cadence: 'daily'|'weekly'|'biweekly'|'monthly',
 *   weekday?: number|null,
 *   monthly_mode?: 'day_of_month'|'first_weekday'|null,
 *   day_of_month?: number|null,
 *   biweekly_anchor_date?: string|null,
 * }} SessionSchedule */

export const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function parseDateKey(key) {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return new Date();
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole calendar days from `fromKey` to `toKey` (local date strings). */
export function daysBetweenCalendarKeys(fromKey, toKey) {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * First occurrence of `weekday` (Sun=0) on or after the calendar day `todayKey`.
 * Used to pin bi-weekly rhythm to “the next Wednesday” when saving a new schedule.
 */
export function nextWeekdayOnOrAfter(todayKey, weekday) {
  const t = parseDateKey(todayKey);
  const dow = t.getDay();
  const delta = (weekday - dow + 7) % 7;
  t.setDate(t.getDate() + delta);
  return getLocalDateKey(t);
}

/**
 * When a board has no stored bi-weekly anchor yet, derive a stable first period from `board.created_at`.
 * (New saves use {@link nextWeekdayOnOrAfter} from “today” instead — see {@link buildSessionScheduleFromForm}.)
 */
export function inferBiweeklyAnchorFromBoard(board, weekday) {
  const raw = board?.created_at;
  let d = raw ? new Date(raw) : new Date();
  if (Number.isNaN(d.getTime())) d = new Date();
  return nextWeekdayOnOrAfter(getLocalDateKey(d), weekday);
}

/**
 * Start date (YYYY-MM-DD) of the bi-weekly period that contains `todayKey`, using `anchorKey` as period 0.
 * `anchorKey` should fall on `weekday` (the app sets it that way when saving).
 */
export function anchorBiWeeklyPeriodStart(todayKey, weekday, anchorKey) {
  const w = weekday != null ? Number(weekday) : 1;
  const anchor0 = anchorKey && /^\d{4}-\d{2}-\d{2}$/.test(anchorKey) ? anchorKey : nextWeekdayOnOrAfter(todayKey, w);
  const start0Key = lastWeekdayOnOrBefore(anchor0, w);
  const diff = daysBetweenCalendarKeys(start0Key, todayKey);
  if (diff < 0) return start0Key;
  const idx = Math.floor(diff / 14);
  const start = parseDateKey(start0Key);
  start.setDate(start.getDate() + idx * 14);
  return getLocalDateKey(start);
}

/**
 * Normalize board fields into a SessionSchedule (supports legacy `session_frequency`).
 * @param {object | null | undefined} board
 * @returns {SessionSchedule | null}
 */
export function getSessionSchedule(board) {
  if (!board) return null;
  const raw = board.session_schedule;
  if (raw && typeof raw === 'object' && raw.cadence) {
    const base = {
      cadence: raw.cadence,
      weekday: raw.weekday != null ? Number(raw.weekday) : null,
      monthly_mode: raw.monthly_mode ?? null,
      day_of_month: raw.day_of_month != null ? Number(raw.day_of_month) : null,
      biweekly_anchor_date:
        raw.biweekly_anchor_date && /^\d{4}-\d{2}-\d{2}$/.test(raw.biweekly_anchor_date)
          ? raw.biweekly_anchor_date
          : null,
    };
    if (raw.cadence === 'biweekly') {
      const w = base.weekday != null ? Number(base.weekday) : 1;
      if (!base.biweekly_anchor_date) {
        base.biweekly_anchor_date = inferBiweeklyAnchorFromBoard(board, w);
      }
    }
    return base;
  }
  const f = board.session_frequency;
  if (f === 'daily') {
    return { cadence: 'daily', weekday: null, monthly_mode: null, day_of_month: null, biweekly_anchor_date: null };
  }
  if (f === 'monthly') {
    return {
      cadence: 'monthly',
      monthly_mode: 'day_of_month',
      day_of_month: 1,
      weekday: null,
      biweekly_anchor_date: null,
    };
  }
  if (f === 'biweekly') {
    const w = 1;
    return {
      cadence: 'biweekly',
      weekday: w,
      monthly_mode: null,
      day_of_month: null,
      biweekly_anchor_date: inferBiweeklyAnchorFromBoard(board, w),
    };
  }
  if (f === 'weekly' || f === 'custom' || !f) {
    return { cadence: 'weekly', weekday: 1, monthly_mode: null, day_of_month: null, biweekly_anchor_date: null };
  }
  return { cadence: 'weekly', weekday: 1, monthly_mode: null, day_of_month: null, biweekly_anchor_date: null };
}

/**
 * Most recent date ≤ todayKey whose calendar day is the scheduled weekday (Sun=0).
 */
export function lastWeekdayOnOrBefore(todayKey, weekday) {
  const t = parseDateKey(todayKey);
  const dow = t.getDay();
  let delta = (dow - weekday + 7) % 7;
  t.setDate(t.getDate() - delta);
  return getLocalDateKey(t);
}

/**
 * Most recent scheduled calendar day (day_of_month, clamped) on or before todayKey.
 */
export function anchorMonthlyByDayOfMonth(todayKey, dayOfMonth) {
  const dom = Math.min(31, Math.max(1, dayOfMonth));
  const t = parseDateKey(todayKey);
  let y = t.getFullYear();
  let m = t.getMonth();
  for (let iter = 0; iter < 48; iter++) {
    const dim = daysInMonth(y, m);
    const use = Math.min(dom, dim);
    const candidate = new Date(y, m, use);
    const ck = getLocalDateKey(candidate);
    if (ck <= todayKey) return ck;
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return todayKey;
}

function firstWeekdayInMonth(year, monthIndex, weekday) {
  const d = new Date(year, monthIndex, 1);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(1 + diff);
  return d;
}

/**
 * Most recent "first weekday of month" occurrence on or before todayKey.
 */
export function anchorMonthlyFirstWeekday(todayKey, weekday) {
  const t = parseDateKey(todayKey);
  let y = t.getFullYear();
  let m = t.getMonth();
  let first = firstWeekdayInMonth(y, m, weekday);
  let ck = getLocalDateKey(first);
  if (ck <= todayKey) return ck;
  const prev = new Date(y, m - 1, 15);
  y = prev.getFullYear();
  m = prev.getMonth();
  first = firstWeekdayInMonth(y, m, weekday);
  return getLocalDateKey(first);
}

/**
 * Active retrospective session key for automatic scheduling (otherwise callers use today).
 * @param {object} board
 * @param {Date} [date]
 * @returns {string} YYYY-MM-DD
 */
export function getSessionAnchorDateKey(board, date = new Date()) {
  const todayKey = getLocalDateKey(date);
  const sched = getSessionSchedule(board);
  if (!sched || board.session_start_mode !== 'automatic') {
    return todayKey;
  }
  const { cadence, weekday, monthly_mode, day_of_month, biweekly_anchor_date } = sched;

  if (cadence === 'daily') {
    return todayKey;
  }
  if (cadence === 'weekly') {
    const w = weekday != null ? Number(weekday) : 1;
    return lastWeekdayOnOrBefore(todayKey, w);
  }
  if (cadence === 'biweekly') {
    const w = weekday != null ? Number(weekday) : 1;
    return anchorBiWeeklyPeriodStart(todayKey, w, biweekly_anchor_date ?? null);
  }
  if (cadence === 'monthly') {
    if (monthly_mode === 'day_of_month' && day_of_month != null) {
      return anchorMonthlyByDayOfMonth(todayKey, day_of_month);
    }
    if (monthly_mode === 'first_weekday' && weekday != null) {
      return anchorMonthlyFirstWeekday(todayKey, Number(weekday));
    }
    return anchorMonthlyByDayOfMonth(todayKey, 1);
  }
  return todayKey;
}

/**
 * Human-readable schedule summary for settings / tooltips.
 */
export function describeSessionSchedule(board) {
  const sched = getSessionSchedule(board);
  if (!sched || board.session_start_mode !== 'automatic') {
    return board.session_start_mode === 'automatic'
      ? 'Automatic — configure cadence in Huddl Board settings.'
      : 'Manual — you start each session.';
  }
  const { cadence, weekday, monthly_mode, day_of_month } = sched;
  const wd = WEEKDAY_OPTIONS.find((o) => o.value === Number(weekday))?.label ?? 'weekday';

  if (cadence === 'daily') {
    return 'Every local calendar day at midnight, the previous open session is closed and a new session starts for today. Older sessions stay under Past sessions.';
  }
  if (cadence === 'weekly') {
    return `Each ${wd} (at the start of that local calendar day), any still-open session from an earlier period is closed and a new session starts dated that ${wd}. Past sessions remain listed under Past sessions.`;
  }
  if (cadence === 'biweekly') {
    return `Every second ${wd} (at the start of that local calendar day), counting from the saved period start, any still-open session from an earlier period is closed and a new session starts. Past sessions remain listed under Past sessions.`;
  }
  if (cadence === 'monthly' && monthly_mode === 'day_of_month' && day_of_month != null) {
    return `On the ${ordinalDayOfMonth(day_of_month)} of each month (at the start of that local calendar day), the previous open session is closed and a new session starts. Past sessions stay under Past sessions.`;
  }
  if (cadence === 'monthly' && monthly_mode === 'first_weekday') {
    return `On the first ${wd} of each month (at the start of that local calendar day), the previous open session is closed and a new session starts. Past sessions stay under Past sessions.`;
  }
  return 'Automatic session schedule.';
}

export function ordinalDayOfMonth(n) {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

/**
 * Short label for review steps and read-only settings (e.g. "Weekly · Monday").
 * @param {SessionSchedule | null} sched
 */
export function formatSessionScheduleSummary(sched) {
  if (!sched?.cadence) return '';
  if (sched.cadence === 'daily') return 'Daily';
  if (sched.cadence === 'weekly') {
    const wd = WEEKDAY_OPTIONS.find((o) => o.value === Number(sched.weekday))?.label ?? 'weekday';
    return `Weekly · ${wd}`;
  }
  if (sched.cadence === 'biweekly') {
    const wd = WEEKDAY_OPTIONS.find((o) => o.value === Number(sched.weekday))?.label ?? 'weekday';
    return `Bi-weekly · ${wd}`;
  }
  if (sched.cadence === 'monthly') {
    if (sched.monthly_mode === 'day_of_month' && sched.day_of_month != null) {
      return `Monthly · ${ordinalDayOfMonth(sched.day_of_month)}`;
    }
    if (sched.monthly_mode === 'first_weekday') {
      const wd = WEEKDAY_OPTIONS.find((o) => o.value === Number(sched.weekday))?.label ?? 'weekday';
      return `Monthly · first ${wd}`;
    }
    return 'Monthly';
  }
  return '';
}

/** @param {object | null | undefined} board */
export function formatSessionScheduleSummaryFromBoard(board) {
  if (!board || board.session_start_mode !== 'automatic') return '';
  return formatSessionScheduleSummary(getSessionSchedule(board));
}

/**
 * @param {object | null | undefined} board
 * @returns {{ cadence: string, weekday: number, monthlyMode: string, dayOfMonth: number }}
 */
export function sessionScheduleToFormState(board) {
  const s = getSessionSchedule(board);
  if (!s) {
    return {
      cadence: 'weekly',
      weekday: 1,
      monthlyMode: 'day_of_month',
      dayOfMonth: 1,
      biweeklyAnchorDate: null,
    };
  }
  return {
    cadence: s.cadence,
    weekday: s.weekday != null ? Number(s.weekday) : 1,
    monthlyMode: s.monthly_mode === 'first_weekday' ? 'first_weekday' : 'day_of_month',
    dayOfMonth: s.day_of_month != null ? Number(s.day_of_month) : 1,
    biweeklyAnchorDate: s.biweekly_anchor_date ?? null,
  };
}

/**
 * @param {{ cadence: string, weekday: number, monthlyMode: string, dayOfMonth: number, biweeklyAnchorDate?: string|null }} form
 * @returns {SessionSchedule | null}
 */
export function buildSessionScheduleFromForm(form) {
  if (!form?.cadence) return null;
  const { cadence, weekday, monthlyMode, dayOfMonth, biweeklyAnchorDate } = form;
  if (cadence === 'daily') {
    return {
      cadence: 'daily',
      weekday: null,
      monthly_mode: null,
      day_of_month: null,
      biweekly_anchor_date: null,
    };
  }
  if (cadence === 'weekly') {
    return {
      cadence: 'weekly',
      weekday: Number(weekday) || 1,
      monthly_mode: null,
      day_of_month: null,
      biweekly_anchor_date: null,
    };
  }
  if (cadence === 'biweekly') {
    const w = Number(weekday) || 1;
    const anchor =
      biweeklyAnchorDate && /^\d{4}-\d{2}-\d{2}$/.test(biweeklyAnchorDate)
        ? biweeklyAnchorDate
        : nextWeekdayOnOrAfter(getLocalDateKey(), w);
    return {
      cadence: 'biweekly',
      weekday: w,
      monthly_mode: null,
      day_of_month: null,
      biweekly_anchor_date: anchor,
    };
  }
  if (cadence === 'monthly') {
    if (monthlyMode === 'first_weekday') {
      return {
        cadence: 'monthly',
        monthly_mode: 'first_weekday',
        weekday: Number(weekday) || 1,
        day_of_month: null,
        biweekly_anchor_date: null,
      };
    }
    const dom = Math.min(31, Math.max(1, Number(dayOfMonth) || 1));
    return {
      cadence: 'monthly',
      monthly_mode: 'day_of_month',
      weekday: null,
      day_of_month: dom,
      biweekly_anchor_date: null,
    };
  }
  return null;
}

/**
 * @param {SessionSchedule | null} sched
 */
export function isSessionScheduleComplete(sched) {
  if (!sched?.cadence) return false;
  if (sched.cadence === 'daily') return true;
  if (sched.cadence === 'weekly') return sched.weekday != null && !Number.isNaN(Number(sched.weekday));
  if (sched.cadence === 'biweekly') return sched.weekday != null && !Number.isNaN(Number(sched.weekday));
  if (sched.cadence === 'monthly') {
    if (sched.monthly_mode === 'day_of_month') {
      const d = Number(sched.day_of_month);
      return d >= 1 && d <= 31;
    }
    if (sched.monthly_mode === 'first_weekday') {
      return sched.weekday != null && !Number.isNaN(Number(sched.weekday));
    }
    return false;
  }
  return false;
}

/**
 * Open sessions that should be auto-closed because a new period anchor has superseded them.
 * @param {string} anchorKey — current period session_date
 * @param {Array<{ id: string, session_date: string, closed_at?: string|null }>} sessions
 * @returns {Array<{ id: string, session_date: string }>}
 */
export function openSessionsToCloseBeforeAnchor(anchorKey, sessions) {
  if (!sessions?.length) return [];
  return sessions.filter((s) => !s.closed_at && s.session_date && s.session_date < anchorKey);
}

/**
 * Build Firestore payload for session_schedule (+ clears legacy frequency when saving new shape).
 * @param {SessionSchedule} sched
 * @returns {object}
 */
export function sessionScheduleWritePayload(sched) {
  return {
    session_schedule: {
      cadence: sched.cadence,
      weekday: sched.weekday ?? null,
      monthly_mode: sched.monthly_mode ?? null,
      day_of_month: sched.day_of_month ?? null,
      biweekly_anchor_date:
        sched.cadence === 'biweekly' ? (sched.biweekly_anchor_date ?? null) : null,
    },
    session_frequency: null,
  };
}
