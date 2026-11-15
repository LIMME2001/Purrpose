// Purrpose core: pure functions only (no DOM, no storage). Fully unit-tested in /test.
// All timestamps are epoch milliseconds in local time. Weekday index: 0 = Monday ... 6 = Sunday.

export const SEC = 1000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** Accidental taps shorter than this are discarded when stopping a timer. */
export const MIN_ENTRY_MS = 10 * SEC;

export const PALETTE = [
  '#8b9cff', '#b79cff', '#ff8fb1', '#ff7a7a', '#ffb454',
  '#f2d45c', '#5ee0a0', '#4fd1c5', '#5cc8ff', '#a0a8b8',
];

export const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

/* ------------------------------------------------------------------ dates */

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** DST-safe day arithmetic. */
export function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function weekdayIndex(ts) {
  return (new Date(ts).getDay() + 6) % 7;
}

export function startOfWeek(ts) {
  return addDays(startOfDay(ts), -weekdayIndex(ts));
}

export function startOfMonth(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function startOfNextMonth(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}

/** Timestamp for "minutes after midnight" on the day that starts at dayStart. */
export function atMinutes(dayStart, minutes) {
  const d = new Date(dayStart);
  d.setHours(0, minutes, 0, 0);
  return d.getTime();
}

export function minutesOfDay(ts) {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

export function periodRange(period, now) {
  if (period === 'day') {
    const from = startOfDay(now);
    return { from, to: addDays(from, 1) };
  }
  if (period === 'week') {
    const from = startOfWeek(now);
    return { from, to: addDays(from, 7) };
  }
  if (period === 'year') {
    return { from: startOfYear(now), to: startOfNextYear(now) };
  }
  return { from: startOfMonth(now), to: startOfNextMonth(now) };
}

export function startOfYear(ts) {
  return new Date(new Date(ts).getFullYear(), 0, 1).getTime();
}

export function startOfNextYear(ts) {
  return new Date(new Date(ts).getFullYear() + 1, 0, 1).getTime();
}

/** Move a stats anchor one day/week/month/year back (-1) or forward (+1). */
export function shiftAnchor(period, anchor, dir) {
  const d = new Date(anchor);
  if (period === 'day') return addDays(anchor, dir);
  if (period === 'week') return addDays(anchor, 7 * dir);
  if (period === 'month') return new Date(d.getFullYear(), d.getMonth() + dir, 1, 12).getTime();
  if (period === 'year') return new Date(d.getFullYear() + dir, 0, 1, 12).getTime();
  return anchor;
}

/**
 * The [from, to) range a stats screen shows.
 * sel = { period: 'day'|'week'|'month'|'year'|'all'|'range', anchor, rangeFrom, rangeTo } (dates as yyyy-mm-dd)
 */
export function resolveRange(sel, entries, now) {
  const today = startOfDay(now);
  if (sel.period === 'all') {
    const first = entries.reduce((m, e) => Math.min(m, e.start), now);
    return { from: startOfDay(first), to: addDays(today, 1) };
  }
  if (sel.period === 'range') {
    const f = parseDateTime(sel.rangeFrom, '00:00');
    const t = parseDateTime(sel.rangeTo, '00:00');
    if (f !== null && t !== null && t >= f) return { from: f, to: addDays(t, 1) };
    return { from: addDays(today, -29), to: addDays(today, 1) };
  }
  return periodRange(sel.period, sel.anchor ?? now);
}

/** Human label for a stats range: "This week", "26 Oct – 1 Nov", "November 2026" ... */
export function periodLabel(period, from, to, now) {
  const fmt = (ts, o) => new Date(ts).toLocaleDateString('en-GB', o);
  const thisYear = new Date(now).getFullYear();
  const last = addDays(to, -1);
  const yearIf = (ts) => (new Date(ts).getFullYear() === thisYear ? {} : { year: 'numeric' });
  const today = startOfDay(now);
  if (period === 'day') {
    if (from === today) return 'Today';
    if (from === addDays(today, -1)) return 'Yesterday';
    return fmt(from, { weekday: 'short', day: 'numeric', month: 'short', ...yearIf(from) });
  }
  if (period === 'week') {
    const cur = startOfWeek(now);
    if (from === cur) return 'This week';
    if (from === addDays(cur, -7)) return 'Last week';
    return `${fmt(from, { day: 'numeric', month: 'short' })} – ${fmt(last, { day: 'numeric', month: 'short', ...yearIf(last) })}`;
  }
  if (period === 'month') {
    return from === startOfMonth(now) ? 'This month' : fmt(from, { month: 'long', year: 'numeric' });
  }
  if (period === 'year') {
    const y = new Date(from).getFullYear();
    return y === thisYear ? 'This year' : String(y);
  }
  if (period === 'all') return 'All time';
  const o = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${fmt(from, o)} – ${fmt(last, o)}`;
}

/* ------------------------------------------------------------- formatting */

const pad = (n) => String(n).padStart(2, '0');

/** 2h 05m / 45m / 30s */
export function fmtDur(ms) {
  const total = Math.max(0, Math.round(ms / SEC));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Compact hours for tables: "12.5 h", "<0.1 h", "–" for nothing. */
export function fmtHours(ms) {
  if (ms <= 0) return '–';
  const h = ms / HOUR;
  if (h < 0.1) return '<0.1 h';
  return `${h >= 100 ? Math.round(h) : h.toFixed(1)} h`;
}

/** 1:02:03 or 02:03 – for the live timer. */
export function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / SEC));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** minutes-after-midnight -> "09:30" */
export function fmtMinutes(min) {
  return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
}

/** "09:30" -> 570 (or null) */
export function parseTime(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function fmtHM(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDateInput(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-11-02" + "09:30" -> epoch ms (local) */
export function parseDateTime(dateStr, timeStr) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  const mins = parseTime(timeStr);
  if (!dm || mins === null) return null;
  return new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Math.floor(mins / 60), mins % 60).getTime();
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ---------------------------------------------------------- default state */

export function defaultState() {
  return {
    v: 2,
    lastBackupAt: 0,
    activities: [
      { id: 'study', name: 'Study', emoji: '📚', color: '#8b9cff', group: 'Study', goalMin: 0 },
      { id: 'japanese', name: 'Japanese', emoji: '🗣️', color: '#ff8fb1', group: 'Language', goalMin: 30 },
      { id: 'walking', name: 'Walking', emoji: '🚶', color: '#5ee0a0', group: 'Movement', goalMin: 30 },
      { id: 'workout', name: 'Workout', emoji: '💪', color: '#ffb454', group: 'Movement', goalMin: 0 },
      { id: 'work', name: 'Work', emoji: '💼', color: '#5cc8ff', group: 'Work', goalMin: 0 },
      { id: 'rest', name: 'Rest', emoji: '🛋️', color: '#b79cff', group: 'Rest', goalMin: 0 },
    ],
    entries: [],
    plan: [],
    active: null,
    settings: { dayStart: 7 * 60, dayEnd: 23 * 60 },
  };
}

/* -------------------------------------------------------- timer lifecycle */

export function netMs(e) {
  return Math.max(0, e.end - e.start - (e.pausedMs || 0));
}

export function activeElapsed(a, now) {
  const end = a.pausedAt ?? now;
  return Math.max(0, end - a.start - (a.pausedMs || 0));
}

/** View the running timer as a (still open) entry ending at `now`. */
export function activeAsEntry(a, now) {
  return {
    id: 'active',
    activityId: a.activityId,
    start: a.start,
    end: now,
    pausedMs: (a.pausedMs || 0) + (a.pausedAt ? now - a.pausedAt : 0),
    note: a.note || '',
    live: true,
  };
}

export function allEntries(state, now) {
  return state.active ? [...state.entries, activeAsEntry(state.active, now)] : state.entries;
}

/** Start "from now" (or from `startedAt` for "I began 10 minutes ago"). Stops whatever was running. */
export function startActivity(state, activityId, now, startedAt = now) {
  let s = state.active ? stopActive(state, now) : state;
  const start = Math.min(startedAt, now);
  return { ...s, active: { activityId, start, pausedAt: null, pausedMs: 0, note: '' } };
}

export function pauseActive(state, now) {
  const a = state.active;
  if (!a || a.pausedAt) return state;
  return { ...state, active: { ...a, pausedAt: now } };
}

export function resumeActive(state, now) {
  const a = state.active;
  if (!a || !a.pausedAt) return state;
  return { ...state, active: { ...a, pausedAt: null, pausedMs: (a.pausedMs || 0) + (now - a.pausedAt) } };
}

export function stopActive(state, now) {
  const a = state.active;
  if (!a) return state;
  const e = activeAsEntry(a, now);
  if (netMs(e) < MIN_ENTRY_MS) return { ...state, active: null };
  const entry = {
    id: uid(),
    activityId: a.activityId,
    start: e.start,
    end: e.end,
    pausedMs: e.pausedMs,
    note: a.note || '',
  };
  return { ...state, active: null, entries: [...state.entries, entry] };
}

export function discardActive(state) {
  return { ...state, active: null };
}

/**
 * Archive an activity: it disappears from Start, Plan and pickers, but every entry stays in stats.
 * A timer running on it is saved first; its plan blocks are removed.
 */
export function archiveActivity(state, id, now) {
  const s = state.active && state.active.activityId === id ? stopActive(state, now) : state;
  return {
    ...s,
    activities: s.activities.map((a) => (a.id === id ? { ...a, archived: true } : a)),
    plan: s.plan.filter((b) => b.activityId !== id),
  };
}

export function restoreActivity(state, id) {
  return { ...state, activities: state.activities.map((a) => (a.id === id ? { ...a, archived: false } : a)) };
}

export const isArchived = (a) => !!(a && a.archived);

/** Correct the start time of the running timer ("I actually started at 10:15"). */
export function setActiveStart(state, newStart, now) {
  const a = state.active;
  if (!a) return state;
  const start = Math.min(newStart, a.pausedAt ?? now);
  return { ...state, active: { ...a, start } };
}

export function setActiveNote(state, note) {
  if (!state.active) return state;
  return { ...state, active: { ...state.active, note } };
}

/* ----------------------------------------------------------- aggregation */

/** Net time of an entry inside [from, to), pro-rating pauses over the whole span. */
export function overlapMs(e, from, to) {
  const span = e.end - e.start;
  if (span <= 0) return 0;
  const ov = Math.max(0, Math.min(e.end, to) - Math.max(e.start, from));
  return ov * (netMs(e) / span);
}

export function totalsByActivity(entries, from, to) {
  const map = new Map();
  for (const e of entries) {
    const ms = overlapMs(e, from, to);
    if (ms > 0) map.set(e.activityId, (map.get(e.activityId) || 0) + ms);
  }
  return map;
}

export function activityMap(activities) {
  return new Map(activities.map((a) => [a.id, a]));
}

export function groupOf(activity) {
  return (activity && (activity.group || activity.name)) || 'Other';
}

/** group name -> { ms, color } (color of the largest activity in the group). */
export function totalsByGroup(entries, activities, from, to) {
  const byAct = totalsByActivity(entries, from, to);
  const acts = activityMap(activities);
  const groups = new Map();
  for (const [id, ms] of byAct) {
    const a = acts.get(id);
    const g = groupOf(a);
    const cur = groups.get(g) || { ms: 0, color: a ? a.color : '#a0a8b8', top: 0 };
    cur.ms += ms;
    if (ms > cur.top) {
      cur.top = ms;
      cur.color = a ? a.color : cur.color;
    }
    groups.set(g, cur);
  }
  return groups;
}

/**
 * Hours per activity for this week, this month, this year and all time (archived activities included).
 * Returns { rows: [{ activity, week, month, year, all }], totals: { week, month, year, all } }
 */
export function timespanTotals(entries, activities, now) {
  const spans = {
    week: periodRange('week', now),
    month: periodRange('month', now),
    year: periodRange('year', now),
    all: { from: -Infinity, to: Infinity },
  };
  const maps = Object.fromEntries(Object.entries(spans).map(([k, r]) => [k, totalsByActivity(entries, r.from, r.to)]));
  const rows = [];
  const totals = { week: 0, month: 0, year: 0, all: 0 };
  for (const activity of activities) {
    const row = { activity };
    for (const k of Object.keys(spans)) {
      row[k] = maps[k].get(activity.id) || 0;
      totals[k] += row[k];
    }
    if (row.all > 0) rows.push(row);
  }
  rows.sort((a, b) => b.all - a.all);
  return { rows, totals };
}

/** Map(monthStart -> net ms) for every month touching [from, to). */
export function bucketByMonth(entries, from, to, pred = () => true) {
  const map = new Map();
  for (let m = startOfMonth(from); m < to; m = startOfNextMonth(m)) map.set(m, 0);
  for (const e of entries) {
    if (!pred(e) || e.end <= from || e.start >= to) continue;
    let m = startOfMonth(Math.max(e.start, from));
    while (m < to && m < e.end) {
      const next = startOfNextMonth(m);
      map.set(m, (map.get(m) || 0) + overlapMs(e, Math.max(m, from), Math.min(next, to)));
      m = next;
    }
  }
  return map;
}

/** Map(dayStart -> net ms) for every day in [from, to). `from` must be a start of day. */
export function bucketByDay(entries, from, to, pred = () => true) {
  const map = new Map();
  for (let d = from; d < to; d = addDays(d, 1)) map.set(d, 0);
  for (const e of entries) {
    if (!pred(e) || e.end <= from || e.start >= to) continue;
    let d = startOfDay(Math.max(e.start, from));
    while (d < to && d < e.end) {
      const next = addDays(d, 1);
      map.set(d, (map.get(d) || 0) + overlapMs(e, d, next));
      d = next;
    }
  }
  return map;
}

/* ------------------------------------------------------------------ plan */

export function validateBlock(b) {
  if (!b.activityId) return 'Pick an activity';
  if (!Array.isArray(b.days) || b.days.length === 0) return 'Pick at least one day';
  if (!Number.isInteger(b.start) || !Number.isInteger(b.end)) return 'Enter a start and end time';
  if (b.end <= b.start) return 'End must be after start';
  return null;
}

export function blocksForDay(plan, dayIdx) {
  return plan.filter((b) => b.days.includes(dayIdx)).sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Planned net ms per activity in [from, to), counting only the part that has already passed (until `until`). */
export function plannedByActivity(plan, from, to, until = Infinity) {
  const map = new Map();
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    const idx = weekdayIndex(d);
    for (const b of plan) {
      if (!b.days.includes(idx)) continue;
      const s = Math.max(atMinutes(d, b.start), from);
      const e = Math.min(atMinutes(d, b.end), to, until);
      if (e > s) map.set(b.activityId, (map.get(b.activityId) || 0) + (e - s));
    }
  }
  return map;
}

/** The planned block happening right now, and the next one today. */
export function planNow(plan, now) {
  const idx = weekdayIndex(now);
  const mins = minutesOfDay(now);
  const today = blocksForDay(plan, idx);
  const current = today.find((b) => b.start <= mins && mins < b.end) || null;
  const next = today.find((b) => b.start > mins) || null;
  return { current, next };
}

/** Plan vs reality rows for a period, sorted by what was planned. */
export function adherence(plan, entries, from, to, now) {
  const planned = plannedByActivity(plan, from, to, now);
  const actual = totalsByActivity(entries, from, to);
  const ids = new Set([...planned.keys()]);
  return [...ids]
    .map((id) => {
      const p = planned.get(id) || 0;
      const a = actual.get(id) || 0;
      return { activityId: id, planned: p, actual: a, pct: p > 0 ? a / p : null };
    })
    .sort((x, y) => y.planned - x.planned);
}

/* ---------------------------------------------------------------- habits */

/** Current and best streak of days that reached the activity's daily goal. */
/** Does the goal apply on this day? An empty `goalDays` means every day. */
export function isGoalDay(activity, dayTs) {
  const days = activity && activity.goalDays;
  return !days || days.length === 0 || days.includes(weekdayIndex(dayTs));
}

/**
 * Streak for an activity's daily goal. Days outside `goalDays` are rest days: they never break a streak,
 * and doing the goal on one still counts. Today never breaks a streak while it is still in progress.
 */
export function goalStreak(entries, activity, now) {
  if (!activity || !activity.goalMin) return { current: 0, best: 0, hitDaysThisWeek: 0, goalDaysThisWeek: 0 };
  const goal = activity.goalMin * MIN;
  const today = startOfDay(now);
  const from = addDays(today, -365);
  const map = bucketByDay(entries, from, addDays(today, 1), (e) => e.activityId === activity.id);
  const hit = (d) => (map.get(d) || 0) >= goal;

  let current = 0;
  for (let d = today; d >= from; d = addDays(d, -1)) {
    if (hit(d)) current++;
    else if (d === today || !isGoalDay(activity, d)) continue;
    else break;
  }

  let best = 0;
  let run = 0;
  for (let day = from; day <= today; day = addDays(day, 1)) {
    if (hit(day)) run++;
    else if (day !== today && isGoalDay(activity, day)) run = 0;
    best = Math.max(best, run);
  }

  let hitDaysThisWeek = 0;
  let goalDaysThisWeek = 0;
  const week = startOfWeek(now);
  for (let k = 0; k < 7; k++) {
    const day = addDays(week, k);
    if (isGoalDay(activity, day)) goalDaysThisWeek++;
    if (day <= today && hit(day)) hitDaysThisWeek++;
  }
  return { current, best, hitDaysThisWeek, goalDaysThisWeek };
}

/** How much of today's waking window (settings.dayStart..dayEnd) has been tracked so far. */
export function accountedToday(entries, settings, now) {
  const day = startOfDay(now);
  const from = atMinutes(day, settings.dayStart);
  const to = atMinutes(day, settings.dayEnd);
  const until = Math.min(now, to);
  const elapsed = Math.max(0, until - from);
  let tracked = 0;
  for (const e of entries) tracked += overlapMs(e, from, until);
  tracked = Math.min(tracked, elapsed);
  return { tracked, elapsed, gap: Math.max(0, elapsed - tracked), windowMs: to - from };
}

/* -------------------------------------------------------------- insights */

/** Short, honest, slightly cat-flavoured observations about your living reality. */
export function buildInsights({ state, now }) {
  const out = [];
  const entries = allEntries(state, now);
  const acts = activityMap(state.activities);
  const name = (id) => {
    const a = acts.get(id);
    return a ? `${a.emoji} ${a.name}` : 'Something';
  };

  const day = periodRange('day', now);
  const today = totalsByActivity(entries, day.from, day.to);
  const todayTotal = [...today.values()].reduce((a, b) => a + b, 0);
  const acc = accountedToday(entries, state.settings, now);

  if (todayTotal === 0) {
    if (acc.elapsed > 30 * MIN) out.push('Nothing tracked yet today. The sunbeam is going to waste.');
  } else {
    const [topId, topMs] = [...today.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push(`${fmtDur(todayTotal)} tracked today, mostly ${name(topId)} (${fmtDur(topMs)}).`);
  }
  if (acc.elapsed > 2 * HOUR && acc.gap > HOUR) {
    out.push(`${fmtDur(acc.gap)} of your waking day so far is unaccounted for. Where did it go?`);
  }

  const week = periodRange('week', now);
  const rows = adherence(state.plan, entries, week.from, week.to, now).filter((r) => r.planned >= 30 * MIN);
  if (rows.length) {
    const worst = [...rows].sort((a, b) => a.pct - b.pct)[0];
    const best = [...rows].sort((a, b) => b.pct - a.pct)[0];
    if (worst.pct < 0.75) {
      out.push(`${name(worst.activityId)} is at ${Math.round(worst.pct * 100)}% of this week's plan so far.`);
    }
    if (best.activityId !== worst.activityId && best.pct >= 1) {
      out.push(`You are ahead of plan on ${name(best.activityId)}. Nice.`);
    }
  }

  for (const a of state.activities.filter((x) => !x.archived)) {
    const s = goalStreak(entries, a, now);
    if (s.current >= 2) out.push(`🔥 ${s.current}-day streak on ${a.name} (best: ${s.best}).`);
  }
  return out.slice(0, 4);
}

/* ----------------------------------------------------- import / migration */

/** Validate and normalise a state loaded from storage or a backup file. Returns null if unusable. */
/* ------------------------------------------------------ the cat, history, reports */

/** Which week's report should be offered right now (its Monday), or null: Sunday from 17:00, and Monday until noon. */
export function reportDue(now) {
  const d = new Date(now);
  const mins = d.getHours() * 60 + d.getMinutes();
  const wd = weekdayIndex(now);
  if (wd === 6 && mins >= 17 * 60) return startOfWeek(now);
  if (wd === 0 && mins < 12 * 60) return addDays(startOfWeek(now), -7);
  return null;
}

/** A week in review. weekStart is any timestamp in that week. */
export function weeklyReport(state, entries, weekStart, now) {
  const from = startOfWeek(weekStart);
  const to = addDays(from, 7);
  const acts = activityMap(state.activities);
  const rows = [...totalsByActivity(entries, from, to)]
    .map(([id, ms]) => ({ activity: acts.get(id) || { id, name: 'Deleted activity', emoji: '❔', color: '#a0a8b8' }, ms }))
    .sort((x, y) => y.ms - x.ms);
  const total = rows.reduce((s, r) => s + r.ms, 0);
  const days = bucketByDay(entries, from, to, () => true);
  let best = null;
  for (const [day, ms] of days) if (ms > 0 && (!best || ms > best.ms)) best = { day, ms };
  const cmp = periodComparison(entries, 'week', from, now);
  const today = startOfDay(now);
  const habits = state.activities
    .filter((a) => a.goalMin > 0 && !a.archived)
    .map((a) => {
      const map = bucketByDay(entries, from, to, (e) => e.activityId === a.id);
      let hit = 0;
      let due = 0;
      for (let k = 0; k < 7; k++) {
        const day = addDays(from, k);
        if (day > today) break;
        const done = (map.get(day) || 0) >= a.goalMin * MIN;
        if (done) hit++;
        if (isGoalDay(a, day) || done) due++;
      }
      return { activity: a, hit, due };
    })
    .filter((h) => h.due > 0);
  const perfect = habits.length > 0 && habits.every((h) => h.hit >= h.due);
  let line;
  if (!total) line = 'A quiet week. The cat napped too.';
  else if (perfect) line = 'Every habit, every day. Purr-fect.';
  else if (cmp.prevTotal > 0 && cmp.diff >= cmp.prevTotal * 0.1) line = 'A bigger week than the one before.';
  else if (cmp.prevTotal > 0 && cmp.diff <= -cmp.prevTotal * 0.1) line = 'A lighter week. Rest counts too.';
  else line = 'A steady week. That adds up.';
  return { from, to, total, rows, top: rows[0] || null, best, cmp, habits, perfect, line, live: now < to };
}

/** What mood is the cat in? 'happy' = every habit due today is done (while nothing is running). */
export function catMood(state, entries, now) {
  const day = periodRange('day', now);
  const by = totalsByActivity(entries, day.from, day.to);
  const met = (a) => (by.get(a.id) || 0) >= a.goalMin * MIN;
  const d = new Date(now);
  const mins = d.getHours() * 60 + d.getMinutes();
  const night = mins < state.settings.dayStart || mins >= state.settings.dayEnd;
  const a = state.active;
  if (a) {
    const act = state.activities.find((x) => x.id === a.activityId);
    return { mode: a.pausedAt ? 'paused' : 'awake', glow: !!(act && act.goalMin > 0 && met(act)), night };
  }
  const due = state.activities.filter((x) => x.goalMin > 0 && !x.archived && isGoalDay(x, now));
  return { mode: due.length > 0 && due.every(met) ? 'happy' : 'sleep', glow: false, night };
}

/** 10, 25, 50, 100, then every 50 to 500, every 100 to 1000, every 250 to 2500, then every 500. */
export const MILESTONE_HOURS = [10, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 3000, 3500, 4000, 4500, 5000];

/** All-time hours per activity with the milestone reached and the next one to aim for. */
export function milestoneProgress(entries, activities) {
  const by = totalsByActivity(entries, -Infinity, Infinity);
  return activities
    .map((activity) => {
      const hours = (by.get(activity.id) || 0) / HOUR;
      const reached = [...MILESTONE_HOURS].reverse().find((h) => hours >= h) || 0;
      const next = MILESTONE_HOURS.find((h) => h > hours) || null;
      const pct = next ? (hours - reached) / (next - reached) : 1;
      return { activity, hours, reached, next, pct };
    })
    .filter((r) => r.hours > 0)
    .sort((x, y) => y.hours - x.hours);
}

/** Milestones reached since `seen` ({ activityId: highest milestone already celebrated }). */
export function newMilestones(rows, seen) {
  return rows.filter((r) => r.reached > (seen[r.activity.id] || 0)).map((r) => ({ activity: r.activity, hours: r.reached }));
}

/* ------------------------------------------------- forgotten timers, overlaps */

/** A running timer this long (or past the end of its day) probably means "I forgot to stop". */
export const STALE_RUNNING_MS = 6 * HOUR;
/** A timer left paused this long probably means the session ended when it was paused. */
export const STALE_PAUSED_MS = 3 * HOUR;

/**
 * Is the active timer probably forgotten? Returns null, or { kind, endAt }, where endAt is a sensible
 * moment to stop it at (when it was paused, or the end of your waking day), or null if there is none.
 */
export function staleTimer(state, now) {
  const a = state.active;
  if (!a) return null;
  if (a.pausedAt) return now - a.pausedAt > STALE_PAUSED_MS ? { kind: 'paused', endAt: a.pausedAt } : null;
  const dayEnd = atMinutes(startOfDay(a.start), state.settings.dayEnd);
  const startedInDay = a.start < dayEnd;
  const pastDay = startedInDay && now > dayEnd + HOUR;
  const tooLong = now - a.start > STALE_RUNNING_MS;
  if (!pastDay && !tooLong) return null;
  return { kind: 'running', endAt: startedInDay && dayEnd < now && dayEnd - a.start >= MIN_ENTRY_MS ? dayEnd : null };
}

/** The first saved entry (or the running timer) that overlaps [start, end) by a minute or more. */
export function findOverlap(state, start, end, ignoreId, now) {
  return allEntries(state, now).find((e) => e.id !== ignoreId && Math.min(e.end, end) - Math.max(e.start, start) >= MIN) || null;
}

/**
 * Compare a period with the one before it. While the period is still running, the previous one is cut at
 * the same point so "this week so far" is compared with "last week at the same point".
 * period: 'day' | 'week' | 'month' | 'year'.
 */
export function periodComparison(entries, period, from, now) {
  const prevFrom = shiftAnchor(period, from, -1);
  const prev = periodRange(period, prevFrom);
  const cur = periodRange(period, from);
  const live = from <= now && now < cur.to;
  const span = live ? now - cur.from : cur.to - cur.from;
  const prevTo = Math.min(prev.to, prev.from + span);
  const sum = (a, b) => entries.reduce((s, e) => s + overlapMs(e, a, b), 0);
  const curTotal = sum(cur.from, live ? now : cur.to);
  const prevTotal = sum(prev.from, prevTo);
  return { diff: curTotal - prevTotal, prevTotal, curTotal, live, prevFrom: prev.from, prevTo: prev.to };
}

export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const base = defaultState();
  const str = (v, d) => (typeof v === 'string' && v ? v : d);
  const num = (v, d) => (Number.isFinite(v) ? v : d);

  const activities = Array.isArray(raw.activities)
    ? raw.activities
        .filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string')
        .map((a) => ({
          id: a.id,
          name: a.name,
          emoji: str(a.emoji, '🐾'),
          color: str(a.color, PALETTE[0]),
          group: typeof a.group === 'string' ? a.group : '',
          goalMin: Math.max(0, num(a.goalMin, 0)),
          // weekdays (0 = Monday) the goal applies to; empty = every day
          goalDays: Array.isArray(a.goalDays) ? [...new Set(a.goalDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] : [],
          archived: a.archived === true,
        }))
    : base.activities;

  const entries = Array.isArray(raw.entries)
    ? raw.entries
        .filter((e) => e && typeof e.activityId === 'string' && Number.isFinite(e.start) && Number.isFinite(e.end) && e.end > e.start)
        .map((e) => ({
          id: str(e.id, uid()),
          activityId: e.activityId,
          start: e.start,
          end: e.end,
          pausedMs: Math.max(0, num(e.pausedMs, 0)),
          note: typeof e.note === 'string' ? e.note : '',
        }))
    : [];

  const plan = Array.isArray(raw.plan)
    ? raw.plan
        .filter((b) => b && typeof b.activityId === 'string' && Array.isArray(b.days))
        .map((b) => ({
          id: str(b.id, uid()),
          activityId: b.activityId,
          days: b.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
          start: num(b.start, 0),
          end: num(b.end, 0),
        }))
        .filter((b) => validateBlock(b) === null)
    : [];

  const a = raw.active;
  const active =
    a && typeof a.activityId === 'string' && Number.isFinite(a.start)
      ? {
          activityId: a.activityId,
          start: a.start,
          pausedAt: Number.isFinite(a.pausedAt) ? a.pausedAt : null,
          pausedMs: Math.max(0, num(a.pausedMs, 0)),
          note: typeof a.note === 'string' ? a.note : '',
        }
      : null;

  const s = raw.settings || {};
  const settings = {
    dayStart: Number.isInteger(s.dayStart) ? s.dayStart : base.settings.dayStart,
    dayEnd: Number.isInteger(s.dayEnd) ? s.dayEnd : base.settings.dayEnd,
  };
  if (settings.dayEnd <= settings.dayStart) Object.assign(settings, { dayStart: base.settings.dayStart, dayEnd: base.settings.dayEnd });

  const lastBackupAt = Number.isFinite(raw.lastBackupAt) && raw.lastBackupAt > 0 ? raw.lastBackupAt : 0;
  return { v: 2, lastBackupAt, activities, entries, plan, active, settings };
}
