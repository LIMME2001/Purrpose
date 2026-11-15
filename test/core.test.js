import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../www/js/core.js';

// Local-time helper: t(day, 'HH:MM') where day is a Date-ish [y, m(1-12), d]
const t = ([y, m, d], hm = '00:00') => {
  const [h, mi] = hm.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi).getTime();
};
const MON = [2026, 11, 2]; // Monday
const TUE = [2026, 11, 3];
const SUN = [2026, 11, 8];

test('weekday index is Monday-based and weeks start on Monday', () => {
  assert.equal(c.weekdayIndex(t(MON, '12:00')), 0);
  assert.equal(c.weekdayIndex(t(SUN, '12:00')), 6);
  assert.equal(c.startOfWeek(t(SUN, '23:59')), t(MON));
});

test('periodRange covers day, week and month', () => {
  const now = t([2026, 11, 18], '15:00');
  assert.deepEqual(c.periodRange('day', now), { from: t([2026, 11, 18]), to: t([2026, 11, 19]) });
  assert.deepEqual(c.periodRange('week', now), { from: t([2026, 11, 16]), to: t([2026, 11, 23]) });
  assert.deepEqual(c.periodRange('month', now), { from: t([2026, 11, 1]), to: t([2026, 12, 1]) });
});

test('timer: start, pause, resume, stop subtracts paused time', () => {
  let s = c.defaultState();
  s = c.startActivity(s, 'study', t(MON, '10:00'));
  s = c.pauseActive(s, t(MON, '10:30'));
  // while paused the elapsed time is frozen
  assert.equal(c.activeElapsed(s.active, t(MON, '10:35')), 30 * c.MIN);
  assert.equal(c.activeElapsed(s.active, t(MON, '10:39')), 30 * c.MIN);
  s = c.resumeActive(s, t(MON, '10:40'));
  assert.equal(c.activeElapsed(s.active, t(MON, '10:50')), 40 * c.MIN);
  s = c.stopActive(s, t(MON, '11:10'));
  assert.equal(s.active, null);
  assert.equal(s.entries.length, 1);
  const e = s.entries[0];
  assert.equal(e.pausedMs, 10 * c.MIN);
  assert.equal(c.netMs(e), 60 * c.MIN);
});

test('timer: stopping while paused does not count the paused tail', () => {
  let s = c.startActivity(c.defaultState(), 'walking', t(MON, '08:00'));
  s = c.pauseActive(s, t(MON, '08:20'));
  s = c.stopActive(s, t(MON, '09:00'));
  assert.equal(c.netMs(s.entries[0]), 20 * c.MIN);
});

test('starting a new activity stops the running one', () => {
  let s = c.startActivity(c.defaultState(), 'study', t(MON, '09:00'));
  s = c.startActivity(s, 'walking', t(MON, '09:45'));
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].activityId, 'study');
  assert.equal(c.netMs(s.entries[0]), 45 * c.MIN);
  assert.equal(s.active.activityId, 'walking');
});

test('accidental taps (< 10 s) are discarded', () => {
  let s = c.startActivity(c.defaultState(), 'study', t(MON, '09:00'));
  s = c.stopActive(s, t(MON, '09:00') + 4000);
  assert.equal(s.entries.length, 0);
  assert.equal(s.active, null);
});

test('retroactive start and start-time correction', () => {
  const now = t(MON, '10:10');
  let s = c.startActivity(c.defaultState(), 'study', now, t(MON, '10:00'));
  assert.equal(c.activeElapsed(s.active, now), 10 * c.MIN);
  s = c.setActiveStart(s, t(MON, '09:30'), now);
  assert.equal(c.activeElapsed(s.active, now), 40 * c.MIN);
  // cannot start in the future
  s = c.setActiveStart(s, t(MON, '11:00'), now);
  assert.equal(c.activeElapsed(s.active, now), 0);
});

test('entries spanning midnight are split across days', () => {
  const e = { id: 'x', activityId: 'rest', start: t(MON, '23:00'), end: t(TUE, '01:00'), pausedMs: 0 };
  const map = c.bucketByDay([e], t(MON), t([2026, 11, 5]));
  assert.equal(map.get(t(MON)), c.HOUR);
  assert.equal(map.get(t(TUE)), c.HOUR);
  assert.equal(map.get(t([2026, 11, 4])), 0);
});

test('pauses are pro-rated across a range boundary', () => {
  // 10:00-12:00 with 1h paused => 1h net; 50% of the span lies before 11:00
  const e = { id: 'x', activityId: 'study', start: t(MON, '10:00'), end: t(MON, '12:00'), pausedMs: c.HOUR };
  assert.equal(c.overlapMs(e, t(MON, '00:00'), t(MON, '11:00')), 30 * c.MIN);
});

test('totals by activity and by group', () => {
  const s = c.defaultState();
  const entries = [
    { id: '1', activityId: 'walking', start: t(MON, '08:00'), end: t(MON, '08:30'), pausedMs: 0 },
    { id: '2', activityId: 'workout', start: t(MON, '18:00'), end: t(MON, '19:00'), pausedMs: 0 },
    { id: '3', activityId: 'study', start: t(MON, '10:00'), end: t(MON, '12:00'), pausedMs: 0 },
  ];
  const day = c.periodRange('day', t(MON, '20:00'));
  const byAct = c.totalsByActivity(entries, day.from, day.to);
  assert.equal(byAct.get('walking'), 30 * c.MIN);
  const groups = c.totalsByGroup(entries, s.activities, day.from, day.to);
  assert.equal(groups.get('Movement').ms, 90 * c.MIN); // walking + workout
  assert.equal(groups.get('Movement').color, '#ffb454'); // largest member's color (workout)
  assert.equal(groups.get('Study').ms, 2 * c.HOUR);
});

test('the running timer counts in totals via allEntries', () => {
  let s = c.startActivity(c.defaultState(), 'study', t(MON, '10:00'));
  const now = t(MON, '10:30');
  const day = c.periodRange('day', now);
  const totals = c.totalsByActivity(c.allEntries(s, now), day.from, day.to);
  assert.equal(totals.get('study'), 30 * c.MIN);
});

test('plan: blocks for a day are sorted; planNow finds current and next', () => {
  const plan = [
    { id: 'b', activityId: 'study', days: [0, 2], start: 13 * 60, end: 15 * 60 },
    { id: 'a', activityId: 'japanese', days: [0], start: 9 * 60, end: 9 * 60 + 30 },
  ];
  assert.deepEqual(c.blocksForDay(plan, 0).map((b) => b.id), ['a', 'b']);
  assert.deepEqual(c.blocksForDay(plan, 1), []);
  const n1 = c.planNow(plan, t(MON, '09:10'));
  assert.equal(n1.current.id, 'a');
  assert.equal(n1.next.id, 'b');
  const n2 = c.planNow(plan, t(MON, '12:00'));
  assert.equal(n2.current, null);
  assert.equal(n2.next.id, 'b');
  assert.equal(c.planNow(plan, t(MON, '16:00')).next, null);
});

test('planned time is clipped to "now" so the week is judged fairly', () => {
  const plan = [{ id: 'a', activityId: 'study', days: [0, 1], start: 9 * 60, end: 11 * 60 }];
  const week = c.periodRange('week', t(MON));
  // Monday 10:00: only 1h of Monday's block has happened
  assert.equal(c.plannedByActivity(plan, week.from, week.to, t(MON, '10:00')).get('study'), c.HOUR);
  // Tuesday 12:00: all of Monday + all of Tuesday
  assert.equal(c.plannedByActivity(plan, week.from, week.to, t(TUE, '12:00')).get('study'), 4 * c.HOUR);
});

test('adherence compares planned vs actual', () => {
  const plan = [{ id: 'a', activityId: 'study', days: [0], start: 9 * 60, end: 11 * 60 }];
  const entries = [{ id: '1', activityId: 'study', start: t(MON, '09:00'), end: t(MON, '10:00'), pausedMs: 0 }];
  const week = c.periodRange('week', t(MON));
  const [row] = c.adherence(plan, entries, week.from, week.to, t(MON, '12:00'));
  assert.equal(row.planned, 2 * c.HOUR);
  assert.equal(row.actual, c.HOUR);
  assert.equal(row.pct, 0.5);
});

test('goal streak: counts consecutive days, forgives a not-yet-finished today', () => {
  const act = { id: 'walking', name: 'Walking', goalMin: 30 };
  const mk = (day, mins) => ({ id: String(day), activityId: 'walking', start: t(day, '08:00'), end: t(day, '08:00') + mins * c.MIN, pausedMs: 0 });
  const d = (n) => [2026, 11, n];
  // Sat 31 Oct... use Nov 1, 2, 3 with "now" = Nov 3 12:00
  const entries = [mk(d(1), 40), mk(d(2), 35), mk(d(3), 31)];
  let s = c.goalStreak(entries, act, t(d(3), '12:00'));
  assert.equal(s.current, 3);
  // today not yet at goal -> streak still shows 2 (yesterday and the day before)
  s = c.goalStreak([mk(d(1), 40), mk(d(2), 35), mk(d(3), 5)], act, t(d(3), '12:00'));
  assert.equal(s.current, 2);
  // a missed day breaks it, best streak remembers the longer run
  s = c.goalStreak([mk(d(1), 40), mk(d(3), 31)], act, t(d(3), '12:00'));
  assert.equal(s.current, 1);
  assert.equal(s.best, 1);
  // activities without a goal never have a streak
  assert.equal(c.goalStreak(entries, { id: 'walking', goalMin: 0 }, t(d(3))).current, 0);
});

test('accountedToday measures the unaccounted gap inside the waking window', () => {
  const settings = { dayStart: 7 * 60, dayEnd: 23 * 60 };
  const entries = [{ id: '1', activityId: 'study', start: t(MON, '08:00'), end: t(MON, '10:00'), pausedMs: 0 }];
  const r = c.accountedToday(entries, settings, t(MON, '12:00'));
  assert.equal(r.elapsed, 5 * c.HOUR);
  assert.equal(r.tracked, 2 * c.HOUR);
  assert.equal(r.gap, 3 * c.HOUR);
  // before the window opens nothing is "missing"
  assert.equal(c.accountedToday([], settings, t(MON, '06:00')).gap, 0);
});

test('insights mention the biggest activity and unaccounted time', () => {
  const s = { ...c.defaultState(), entries: [{ id: '1', activityId: 'study', start: t(MON, '08:00'), end: t(MON, '09:00'), pausedMs: 0 }] };
  const out = c.buildInsights({ state: s, now: t(MON, '13:00') });
  assert.ok(out.some((x) => x.includes('Study')));
  assert.ok(out.some((x) => x.includes('unaccounted')));
});

test('weeks that cross a DST change still have exactly 7 daily buckets', () => {
  // Europe/Stockholm DST ends Sun 25 Oct 2026; the check is meaningful with TZ=Europe/Stockholm
  const from = c.startOfWeek(t([2026, 10, 21]));
  const map = c.bucketByDay([], from, c.addDays(from, 7));
  assert.equal(map.size, 7);
});

test('formatting and parsing helpers', () => {
  assert.equal(c.fmtDur(2 * c.HOUR + 5 * c.MIN), '2h 05m');
  assert.equal(c.fmtDur(45 * c.MIN), '45m');
  assert.equal(c.fmtDur(30 * c.SEC), '30s');
  assert.equal(c.fmtClock(3723 * c.SEC), '1:02:03');
  assert.equal(c.fmtClock(125 * c.SEC), '02:05');
  assert.equal(c.fmtMinutes(570), '09:30');
  assert.equal(c.parseTime('9:30'), 570);
  assert.equal(c.parseTime('24:00'), null);
  assert.equal(c.parseTime('nope'), null);
  assert.equal(c.parseDateTime('2026-11-02', '09:30'), t(MON, '09:30'));
  assert.equal(c.parseDateTime('2026-13-02', '09:30') === null, false); // JS rolls over; UI validates with date input
  assert.equal(c.parseDateTime('', '09:30'), null);
});

test('validateBlock rejects bad schedule blocks', () => {
  assert.ok(c.validateBlock({ activityId: '', days: [0], start: 1, end: 2 }));
  assert.ok(c.validateBlock({ activityId: 'a', days: [], start: 1, end: 2 }));
  assert.ok(c.validateBlock({ activityId: 'a', days: [0], start: 600, end: 600 }));
  assert.equal(c.validateBlock({ activityId: 'a', days: [0], start: 600, end: 660 }), null);
});

test('normalizeState repairs or rejects imported data', () => {
  assert.equal(c.normalizeState(null), null);
  assert.equal(c.normalizeState('x'), null);
  const s = c.normalizeState({
    activities: [{ id: 'a', name: 'A' }, { nope: true }],
    entries: [
      { activityId: 'a', start: 1000, end: 2000 },
      { activityId: 'a', start: 5000, end: 4000 }, // end before start -> dropped
      { start: 1, end: 2 }, // no activity -> dropped
    ],
    plan: [{ activityId: 'a', days: [0, 9, 'x'], start: 60, end: 120 }, { activityId: 'a', days: [0], start: 90, end: 30 }],
    active: { activityId: 'a', start: 5 },
    settings: { dayStart: 600, dayEnd: 300 }, // invalid window -> defaults
  });
  assert.equal(s.activities.length, 1);
  assert.equal(s.activities[0].emoji, '🐾');
  assert.equal(s.entries.length, 1);
  assert.equal(s.plan.length, 1);
  assert.deepEqual(s.plan[0].days, [0]);
  assert.equal(s.active.pausedAt, null);
  assert.deepEqual(s.settings, { dayStart: 420, dayEnd: 1380 });
  assert.equal(s.activities[0].archived, false);
  assert.equal(c.normalizeState({ activities: [{ id: 'a', name: 'A', archived: true }] }).activities[0].archived, true);
});

/* ------------------------------------------- timespans, navigation, archive */

const NOW = t([2026, 11, 18], '15:00'); // Wednesday
const ent = (act, day, hm, mins) => ({ id: `${act}${day}${hm}`, activityId: act, start: t(day, hm), end: t(day, hm) + mins * c.MIN, pausedMs: 0 });

test('year range and stepping through periods', () => {
  assert.deepEqual(c.periodRange('year', NOW), { from: t([2026, 1, 1]), to: t([2027, 1, 1]) });
  assert.equal(c.startOfDay(c.shiftAnchor('day', NOW, -1)), t([2026, 11, 17]));
  assert.equal(c.startOfWeek(c.shiftAnchor('week', NOW, -1)), t([2026, 11, 9]));
  assert.equal(c.shiftAnchor('month', t([2026, 1, 31], '10:00'), -1) >= t([2025, 12, 1]), true);
  assert.deepEqual(c.periodRange('month', c.shiftAnchor('month', t([2026, 1, 31], '10:00'), -1)), { from: t([2025, 12, 1]), to: t([2026, 1, 1]) });
  assert.deepEqual(c.periodRange('month', c.shiftAnchor('month', t([2026, 3, 31], '10:00'), +1)), { from: t([2026, 4, 1]), to: t([2026, 5, 1]) });
  assert.deepEqual(c.periodRange('year', c.shiftAnchor('year', NOW, -1)), { from: t([2025, 1, 1]), to: t([2026, 1, 1]) });
});

test('resolveRange handles anchors, all time and custom ranges', () => {
  const entries = [ent('study', [2025, 12, 12], '09:00', 60)];
  assert.deepEqual(c.resolveRange({ period: 'week', anchor: null }, entries, NOW), c.periodRange('week', NOW));
  assert.deepEqual(c.resolveRange({ period: 'all' }, entries, NOW), { from: t([2025, 12, 12]), to: t([2026, 11, 19]) });
  // all time with nothing tracked still gives a valid one-day range
  assert.deepEqual(c.resolveRange({ period: 'all' }, [], NOW), { from: t([2026, 11, 18]), to: t([2026, 11, 19]) });
  // custom range is inclusive of the last day
  assert.deepEqual(c.resolveRange({ period: 'range', rangeFrom: '2026-11-01', rangeTo: '2026-11-03' }, [], NOW), { from: t([2026, 11, 1]), to: t([2026, 11, 4]) });
  // reversed or empty dates fall back to the last 30 days
  const fb = c.resolveRange({ period: 'range', rangeFrom: '2026-11-10', rangeTo: '2026-11-01' }, [], NOW);
  assert.equal(fb.to, t([2026, 11, 19]));
  assert.equal(fb.from, t([2026, 10, 20]));
});

test('period labels read naturally', () => {
  const r = (p, anchor) => { const x = c.periodRange(p, anchor); return c.periodLabel(p, x.from, x.to, NOW); };
  assert.equal(r('day', NOW), 'Today');
  assert.equal(r('day', c.shiftAnchor('day', NOW, -1)), 'Yesterday');
  assert.equal(r('week', NOW), 'This week');
  assert.equal(r('week', c.shiftAnchor('week', NOW, -1)), 'Last week');
  assert.equal(r('month', NOW), 'This month');
  assert.equal(r('month', c.shiftAnchor('month', NOW, -2)), 'September 2026');
  assert.equal(r('year', NOW), 'This year');
  assert.equal(r('year', c.shiftAnchor('year', NOW, -1)), '2025');
  assert.equal(c.periodLabel('all', 0, 1, NOW), 'All time');
  assert.match(r('week', c.shiftAnchor('week', NOW, -3)), /26 Oct – 1 Nov/);
});

test('timespanTotals: hours per activity for week, month, year and all time', () => {
  const s = c.defaultState();
  const entries = [
    ent('study', [2026, 11, 17], '09:00', 60), // this week
    ent('study', [2026, 11, 3], '09:00', 120), // this month, not this week
    ent('study', [2026, 3, 10], '09:00', 180), // this year, not this month
    ent('study', [2025, 12, 12], '09:00', 240), // before this year
    ent('walking', [2026, 11, 18], '08:00', 30),
  ];
  const { rows, totals } = c.timespanTotals(entries, s.activities, NOW);
  const study = rows.find((r) => r.activity.id === 'study');
  assert.deepEqual([study.week, study.month, study.year, study.all].map((ms) => ms / c.HOUR), [1, 3, 6, 10]);
  assert.equal(rows.length, 2); // activities with no time are left out
  assert.equal(rows[0].activity.id, 'study'); // sorted by all-time total
  assert.equal(totals.all, 10.5 * c.HOUR);
  assert.equal(totals.week, 1.5 * c.HOUR);
});

test('bucketByMonth splits an entry that crosses a month boundary', () => {
  const e = { id: 'x', activityId: 'study', start: t([2026, 10, 31], '23:00'), end: t([2026, 11, 1], '02:00'), pausedMs: 0 };
  const map = c.bucketByMonth([e], t([2026, 10, 1]), t([2026, 12, 1]));
  assert.equal(map.get(t([2026, 10, 1])), c.HOUR);
  assert.equal(map.get(t([2026, 11, 1])), 2 * c.HOUR);
  assert.equal(map.size, 2);
});

test('archiving keeps all history, removes plan blocks and saves a running timer', () => {
  let s = c.defaultState();
  s = { ...s, entries: [ent('walking', [2026, 11, 17], '08:00', 45)], plan: [{ id: 'p', activityId: 'walking', days: [0], start: 480, end: 540 }, { id: 'q', activityId: 'study', days: [0], start: 600, end: 660 }] };
  s = c.startActivity(s, 'walking', t([2026, 11, 18], '14:00'));
  s = c.archiveActivity(s, 'walking', NOW);
  assert.equal(s.active, null);
  assert.equal(s.entries.length, 2); // the running timer was saved
  assert.equal(s.activities.find((a) => a.id === 'walking').archived, true);
  assert.deepEqual(s.plan.map((b) => b.id), ['q']);
  // stats still count the archived activity
  const { rows } = c.timespanTotals(s.entries, s.activities, NOW);
  assert.ok(rows.some((r) => r.activity.id === 'walking' && r.all >= 45 * c.MIN));
  // restoring brings it back (plan blocks are not restored)
  s = c.restoreActivity(s, 'walking');
  assert.equal(s.activities.find((a) => a.id === 'walking').archived, false);
  assert.equal(s.plan.length, 1);
});

test('archiving a different activity leaves a running timer alone', () => {
  let s = c.startActivity(c.defaultState(), 'study', NOW - 10 * c.MIN);
  s = c.archiveActivity(s, 'workout', NOW);
  assert.equal(s.active.activityId, 'study');
});

test('archived activities do not produce streak insights', () => {
  const base = c.defaultState();
  const days = [15, 16, 17, 18].map((d) => ent('walking', [2026, 11, d], '08:00', 40));
  const live = c.buildInsights({ state: { ...base, entries: days }, now: NOW });
  assert.ok(live.some((x) => x.includes('streak on Walking')));
  const gone = c.buildInsights({ state: c.archiveActivity({ ...base, entries: days }, 'walking', NOW), now: NOW });
  assert.ok(!gone.some((x) => x.includes('streak on Walking')));
});

test('fmtHours is compact and honest about tiny amounts', () => {
  assert.equal(c.fmtHours(0), '–');
  assert.equal(c.fmtHours(2 * c.MIN), '<0.1 h');
  assert.equal(c.fmtHours(90 * c.MIN), '1.5 h');
  assert.equal(c.fmtHours(123.4 * c.HOUR), '123 h');
});

/* ---------------------------------------- forgotten timers, overlaps, rest days */

test('staleTimer: flags a timer left running past the end of its day', () => {
  let s = c.startActivity(c.defaultState(), 'study', t(MON, '21:00')); // day ends 23:00
  assert.equal(c.staleTimer(s, t(MON, '22:30')), null);
  assert.equal(c.staleTimer(s, t(MON, '23:30')), null); // within an hour of the end is still fine
  const r = c.staleTimer(s, t(TUE, '09:00'));
  assert.equal(r.kind, 'running');
  assert.equal(r.endAt, t(MON, '23:00'));
});

test('staleTimer: a long session inside the day is flagged after 6 h, with no end suggestion', () => {
  const s = c.startActivity(c.defaultState(), 'study', t(MON, '07:30'));
  assert.equal(c.staleTimer(s, t(MON, '13:00')), null);
  const r = c.staleTimer(s, t(MON, '13:45'));
  assert.equal(r.kind, 'running');
  assert.equal(r.endAt, null); // dayEnd (23:00) has not happened yet
});

test('staleTimer: a night session that began after the day ended only goes stale after 6 h', () => {
  const s = c.startActivity(c.defaultState(), 'study', t(MON, '23:30'));
  assert.equal(c.staleTimer(s, t(TUE, '02:00')), null);
  const r = c.staleTimer(s, t(TUE, '06:00'));
  assert.equal(r.kind, 'running');
  assert.equal(r.endAt, null);
});

test('staleTimer: a long pause suggests stopping where it was paused', () => {
  let s = c.startActivity(c.defaultState(), 'study', t(MON, '10:00'));
  s = c.pauseActive(s, t(MON, '11:00'));
  assert.equal(c.staleTimer(s, t(MON, '13:00')), null);
  const r = c.staleTimer(s, t(MON, '14:30'));
  assert.deepEqual(r, { kind: 'paused', endAt: t(MON, '11:00') });
  // stopping at that moment saves exactly the first hour
  const stopped = c.stopActive(s, r.endAt);
  assert.equal(stopped.entries.length, 1);
  assert.equal(c.netMs(stopped.entries[0]), 60 * c.MIN);
  assert.equal(c.staleTimer(c.defaultState(), t(MON)), null);
});

test('stopping a forgotten timer at the end of the day saves only that much', () => {
  const s = c.startActivity(c.defaultState(), 'study', t(MON, '21:00'));
  const r = c.staleTimer(s, t(TUE, '09:00'));
  const stopped = c.stopActive(s, r.endAt);
  assert.equal(c.netMs(stopped.entries[0]), 120 * c.MIN);
});

test('findOverlap: finds clashes with saved entries and the running timer, ignores touching ones', () => {
  let s = c.defaultState();
  s.entries = [{ id: 'a', activityId: 'study', start: t(MON, '09:00'), end: t(MON, '10:30'), pausedMs: 0, note: '' }];
  assert.equal(c.findOverlap(s, t(MON, '10:00'), t(MON, '11:00'), null, t(MON, '12:00')).id, 'a');
  assert.equal(c.findOverlap(s, t(MON, '10:30'), t(MON, '11:00'), null, t(MON, '12:00')), null); // touching is fine
  assert.equal(c.findOverlap(s, t(MON, '09:30'), t(MON, '10:00'), 'a', t(MON, '12:00')), null); // editing itself
  s = c.startActivity(s, 'walking', t(MON, '11:30'));
  assert.equal(c.findOverlap(s, t(MON, '11:00'), t(MON, '12:00'), null, t(MON, '12:00')).live, true);
});

test('goal streak: rest days never break a streak and do not count against it', () => {
  // weekdays only (Mon-Fri = 0-4), goal 30 min. Fri 6 Nov, Thu 5, Wed 4 done; "now" = Mon 9 Nov afternoon.
  const act = { id: 'walking', goalMin: 30, goalDays: [0, 1, 2, 3, 4] };
  const mk = (day) => ({ id: String(day), activityId: 'walking', start: t([2026, 11, day], '08:00'), end: t([2026, 11, day], '08:00') + 30 * c.MIN, pausedMs: 0 });
  const entries = [mk(4), mk(5), mk(6)];
  const s = c.goalStreak(entries, act, t([2026, 11, 9], '12:00'));
  assert.equal(s.current, 3); // Sat 7, Sun 8 skipped, Mon 9 still in progress
  // the same history with a goal on every day: the weekend breaks it
  assert.equal(c.goalStreak(entries, { ...act, goalDays: [] }, t([2026, 11, 9], '12:00')).current, 0);
  // doing it on a rest day still counts
  assert.equal(c.goalStreak([...entries, mk(7)], act, t([2026, 11, 9], '12:00')).current, 4);
  // this week (Mon 9): 5 goal days
  assert.equal(c.goalStreak(entries, act, t([2026, 11, 9], '12:00')).goalDaysThisWeek, 5);
  assert.equal(c.goalStreak(entries, { ...act, goalDays: [] }, t([2026, 11, 9], '12:00')).goalDaysThisWeek, 7);
});

test('periodComparison: compares with the previous period at the same point', () => {
  const mk = (id, from, hm, mins) => ({ id, activityId: 'study', start: t(from, hm), end: t(from, hm) + mins * c.MIN, pausedMs: 0 });
  // now = Wed 18 Nov 15:00. last week: Mon 9 (60), Wed 11 (120), Fri 13 (60). this week: Mon 16 (90)
  const entries = [mk('a', [2026, 11, 9], '09:00', 60), mk('b', [2026, 11, 11], '09:00', 120), mk('c', [2026, 11, 13], '09:00', 60), mk('d', [2026, 11, 16], '09:00', 90)];
  const now = t([2026, 11, 18], '15:00');
  const wk = c.periodRange('week', now);
  const r = c.periodComparison(entries, 'week', wk.from, now);
  assert.equal(r.live, true);
  assert.equal(r.curTotal, 90 * c.MIN);
  assert.equal(r.prevTotal, 60 * c.MIN + 120 * c.MIN); // Fri 13 is after the same point (Wed 15:00)
  assert.equal(r.diff, -90 * c.MIN);
  // a finished week is compared with the whole previous week
  const last = c.periodRange('week', t([2026, 11, 11]));
  const done = c.periodComparison(entries, 'week', last.from, now);
  assert.equal(done.live, false);
  assert.equal(done.diff, 240 * c.MIN);
  assert.equal(done.prevTotal, 0);
});

test('state keeps goalDays and lastBackupAt, and old v1 data still loads', () => {
  const old = { v: 1, activities: [{ id: 'x', name: 'X', goalMin: 20 }], entries: [], plan: [], active: null, settings: { dayStart: 420, dayEnd: 1380 } };
  const n = c.normalizeState(old);
  assert.equal(n.v, 2);
  assert.equal(n.lastBackupAt, 0);
  assert.deepEqual(n.activities[0].goalDays, []);
  const n2 = c.normalizeState({ ...old, lastBackupAt: 123456, activities: [{ id: 'x', name: 'X', goalMin: 20, goalDays: [0, 0, 3, 9, 'a'] }] });
  assert.equal(n2.lastBackupAt, 123456);
  assert.deepEqual(n2.activities[0].goalDays, [0, 3]);
});

test('the version is the same in package.json and the app (Android reads package.json directly)', async () => {
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const { VERSION } = await import('../www/js/version.js');
  assert.equal(VERSION, pkg.version);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.match(readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8'), /pkgVersion[^\n]*package\.json[\s\S]*versionName pkgVersion/);
});
