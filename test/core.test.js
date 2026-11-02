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
});
