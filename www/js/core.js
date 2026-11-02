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
  return { from: startOfMonth(now), to: startOfNextMonth(now) };
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
    v: 1,
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
export function goalStreak(entries, activity, now) {
  if (!activity || !activity.goalMin) return { current: 0, best: 0, hitDaysThisWeek: 0 };
  const goal = activity.goalMin * MIN;
  const today = startOfDay(now);
  const from = addDays(today, -365);
  const map = bucketByDay(entries, from, addDays(today, 1), (e) => e.activityId === activity.id);
  const hit = (d) => (map.get(d) || 0) >= goal;

  let current = 0;
  let d = hit(today) ? today : addDays(today, -1);
  while (d >= from && hit(d)) {
    current++;
    d = addDays(d, -1);
  }

  let best = 0;
  let run = 0;
  for (let day = from; day <= today; day = addDays(day, 1)) {
    run = hit(day) ? run + 1 : 0;
    best = Math.max(best, run);
  }

  let hitDaysThisWeek = 0;
  for (let day = startOfWeek(now); day <= today; day = addDays(day, 1)) if (hit(day)) hitDaysThisWeek++;
  return { current, best, hitDaysThisWeek };
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

  for (const a of state.activities) {
    const s = goalStreak(entries, a, now);
    if (s.current >= 2) out.push(`🔥 ${s.current}-day streak on ${a.name} (best: ${s.best}).`);
  }
  return out.slice(0, 4);
}

/* ----------------------------------------------------- import / migration */

/** Validate and normalise a state loaded from storage or a backup file. Returns null if unusable. */
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
  if (settings.dayEnd <= settings.dayStart) Object.assign(settings, base.settings);

  return { v: 1, activities, entries, plan, active, settings };
}
