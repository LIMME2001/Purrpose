import * as c from './core.js';
import { esc, icon } from './util.js';
import { catHead, logoMark } from './cat.js';
import { donut, stackedBars } from './charts.js';

const ghost = (id) => ({ id, name: 'Deleted activity', emoji: '❔', color: '#a0a8b8', group: '', goalMin: 0 });
const actOf = (acts, id) => acts.get(id) || ghost(id);
const cv = (color) => `style="--c:${esc(color)}"`;
const pad = (n) => String(n).padStart(2, '0');

export function timerHTML(ms) {
  return c
    .fmtClock(ms)
    .split('')
    .map((ch) => (ch === ':' ? '<span class="c">:</span>' : `<span class="d">${ch}</span>`))
    .join('');
}

function dayLabel(ts, now) {
  const today = c.startOfDay(now);
  if (ts === today) return 'Today';
  if (ts === c.addDays(today, -1)) return 'Yesterday';
  return new Date(ts).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

export function header({ tab }) {
  return `<header class="top">
    <div class="brand">${logoMark()}<span>Purrpose</span></div>
    <button class="icon-btn" data-action="settings" aria-label="Settings">${icon('sliders')}</button>
  </header>`;
}

export function nav(tab) {
  const items = [
    ['now', 'Now'],
    ['plan', 'Plan'],
    ['stats', 'Stats'],
    ['log', 'Log'],
  ];
  return items
    .map(([id, label]) => `<button data-action="tab" data-v="${id}" ${tab === id ? 'aria-current="page"' : ''}>${icon(id)}<span>${label}</span></button>`)
    .join('');
}

/* ------------------------------------------------------------------- Now */

export function nowView({ state, now }) {
  const acts = c.activityMap(state.activities);
  const a = state.active;
  const act = a ? actOf(acts, a.activityId) : null;
  const mode = !a ? 'sleep' : a.pausedAt ? 'paused' : 'awake';
  const entries = c.allEntries(state, now);
  const day = c.periodRange('day', now);
  const today = c.totalsByActivity(entries, day.from, day.to);
  const todayTotal = [...today.values()].reduce((x, y) => x + y, 0);

  const hero = a
    ? `<h1 class="hero-activity">${esc(act.emoji)} ${esc(act.name)}</h1>
       <div class="timer ${a.pausedAt ? 'is-paused' : ''}" data-timer role="timer" aria-label="Elapsed time">${timerHTML(c.activeElapsed(a, now))}</div>
       <p class="hero-meta">${a.pausedAt ? 'Paused at ' + c.fmtHM(a.pausedAt) : 'Started ' + c.fmtHM(a.start)} <button class="link" data-action="edit-start">Change start</button></p>
       <div class="hero-actions">
         ${
           a.pausedAt
             ? `<button class="btn" data-action="resume">${icon('play')}Resume</button>`
             : `<button class="btn" data-action="pause">${icon('pause')}Pause</button>`
         }
         <button class="btn btn-primary" data-action="stop">${icon('stop')}Stop</button>
       </div>
       <input class="note" data-note type="text" maxlength="120" placeholder="Add a note (optional)" value="${esc(a.note || '')}" aria-label="Note">`
    : `<h1 class="hero-activity">Nothing running</h1>
       <p class="hero-meta">Tap an activity below to start from now.</p>`;

  const status = !a ? 'Napping' : a.pausedAt ? 'Taking a break' : 'Purring along';

  // what the plan says right now
  const { current, next } = c.planNow(state.plan, now);
  let planCard = '';
  if (!state.plan.length) {
    planCard = `<section class="card"><div class="empty"><b>Plan your week</b>Add the blocks you want to hit. Purrpose will show how your plan compares with what you actually do.</div>
      <button class="btn btn-small" style="margin-top:12px" data-action="tab" data-v="plan">Open plan</button></section>`;
  } else if (current || next) {
    const b = current || next;
    const ba = actOf(acts, b.activityId);
    const running = a && a.activityId === b.activityId && current;
    planCard = `<section class="card nowplan">
      <div class="what"><div class="lbl">${current ? 'Planned now' : 'Up next'}</div>
      <div class="ttl">${esc(ba.emoji)} ${esc(ba.name)} <span class="muted small">${c.fmtMinutes(b.start)}–${c.fmtMinutes(b.end)}</span></div></div>
      ${running ? '<span class="ok-pill">On plan</span>' : `<button class="btn btn-small btn-primary" data-action="start" data-id="${esc(b.activityId)}">${current ? 'Start' : 'Start early'}</button>`}
    </section>`;
  }

  const grid =
    state.activities
      .map((x) => {
        const ms = today.get(x.id) || 0;
        const on = a && a.activityId === x.id;
        return `<button class="act ${on ? 'is-on' : ''}" ${cv(x.color)} data-action="start" data-id="${esc(x.id)}" ${on ? 'aria-pressed="true"' : ''}>
          <span class="bar"></span><span class="em">${esc(x.emoji)}</span>
          <span class="nm">${esc(x.name)}<span class="tm">${ms ? c.fmtDur(ms) + ' today' : 'Start'}</span></span>
        </button>`;
      })
      .join('') + `<button class="act new" data-action="add-activity">${icon('plus')}<span class="nm">New activity</span></button>`;

  const acc = c.accountedToday(entries, state.settings, now);
  const sorted = [...today.entries()].sort((x, y) => y[1] - x[1]);
  const denom = Math.max(acc.elapsed, todayTotal, 1);
  const strip = sorted
    .map(([id, ms]) => `<i style="--c:${esc(actOf(acts, id).color)};width:${((ms / denom) * 100).toFixed(2)}%"></i>`)
    .join('');

  return `
  <section class="hero">
    <div class="hero-cat">${catHead({ mode, color: act ? act.color : '#ffc247' })}</div>
    <p class="hero-status">${status}</p>
    ${hero}
  </section>
  ${planCard}
  <section class="card"><h2>Start something</h2><div class="grid">${grid}</div></section>
  <section class="card">
    <div class="row-between"><h2 style="margin:0">Today</h2><span class="muted small">${todayTotal ? c.fmtDur(todayTotal) + ' tracked' : 'Nothing tracked yet'}</span></div>
    <div class="strip" style="margin-top:12px" aria-hidden="true">${strip}</div>
    ${acc.elapsed > 30 * c.MIN ? `<p class="small muted" style="margin-top:10px">${c.fmtDur(acc.gap)} of your waking day so far is unaccounted for.</p>` : ''}
  </section>`;
}

/* ------------------------------------------------------------------ Plan */

export function planView({ state, now, ui }) {
  const acts = c.activityMap(state.activities);
  const weekStart = c.startOfWeek(now);
  const todayStart = c.startOfDay(now);
  const sel = ui.planDay;
  const dayStart = c.addDays(weekStart, sel);
  const dayEnd = c.addDays(dayStart, 1);

  const days = c.WEEKDAYS.map((w, i) => {
    const d = c.addDays(weekStart, i);
    return `<button data-action="plan-day" data-v="${i}" aria-pressed="${sel === i}" class="${d === todayStart ? 'today' : ''}">${w}<b>${new Date(d).getDate()}</b></button>`;
  }).join('');

  const blocks = c.blocksForDay(state.plan, sel);
  const entries = c
    .allEntries(state, now)
    .filter((e) => e.end > dayStart && e.start < dayEnd)
    .map((e) => ({
      ...e,
      s: (Math.max(e.start, dayStart) - dayStart) / c.MIN,
      f: (Math.min(e.end, dayEnd) - dayStart) / c.MIN,
    }));

  let lo = state.settings.dayStart;
  let hi = state.settings.dayEnd;
  for (const b of blocks) {
    lo = Math.min(lo, b.start);
    hi = Math.max(hi, b.end);
  }
  for (const e of entries) {
    lo = Math.min(lo, e.s);
    hi = Math.max(hi, e.f);
  }
  lo = Math.max(0, Math.floor(lo / 60) * 60);
  hi = Math.min(1440, Math.ceil(hi / 60) * 60);
  const HH = 46;
  const px = (min) => ((min - lo) / 60) * HH;
  const H = px(hi);

  const hours = [];
  for (let m = lo; m <= hi; m += 60) hours.push(`<span style="top:${px(m)}px">${pad(Math.floor(m / 60) % 24)}:00</span>`);

  const blockHtml = blocks
    .map((b) => {
      const x = actOf(acts, b.activityId);
      const h = Math.max(22, px(b.end) - px(b.start) - 2);
      const span = `${c.fmtMinutes(b.start)}–${c.fmtMinutes(b.end)}`;
      return `<button class="tl-block ${h < 40 ? 'tight' : ''}" data-action="edit-block" data-id="${esc(b.id)}" style="--c:${esc(x.color)};top:${px(b.start)}px;height:${h}px">
        ${esc(x.emoji)} ${esc(x.name)}<small>${span}</small></button>`;
    })
    .join('');

  const entryHtml = entries
    .map((e) => {
      const x = actOf(acts, e.activityId);
      const h = Math.max(20, px(e.f) - px(e.s) - 2);
      const style = `--c:${esc(x.color)};top:${px(e.s)}px;height:${h}px`;
      const inner = `${esc(x.emoji)} ${esc(x.name)}<small>${c.fmtDur(c.netMs(e))}</small>`;
      const tight = h < 40 ? 'tight' : '';
      return e.live
        ? `<div class="tl-block live ${tight}" style="${style}">${inner}</div>`
        : `<button class="tl-block ${tight}" data-action="edit-entry" data-id="${esc(e.id)}" style="${style}">${inner}</button>`;
    })
    .join('');

  const nowMin = (now - dayStart) / c.MIN;
  const nowLine = dayStart === todayStart && nowMin >= lo && nowMin <= hi ? `<div class="tl-now" style="top:${px(nowMin)}px"></div>` : '';

  const dayName = new Date(dayStart).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return `
  <h1 class="page-title">Plan</h1>
  <div class="days" role="group" aria-label="Choose a day">${days}</div>
  <section class="card">
    <div class="row-between" style="margin-bottom:14px"><h2 style="margin:0">${dayName}</h2></div>
    ${blocks.length ? '' : `<div class="empty" style="margin-bottom:12px"><b>Nothing planned</b>Add what you intend to do this day, or copy the plan from another day.</div>`}
    <div class="tl">
      <div class="tl-head"><span></span><span>Plan</span><span>What happened</span></div>
      <div class="tl-body" style="height:${H}px">
        <div class="tl-hours" style="height:${H}px">${hours.join('')}</div>
        <div class="tl-lane" style="--hh:${HH}px;height:${H}px">${blockHtml}</div>
        <div class="tl-lane" style="--hh:${HH}px;height:${H}px">${entryHtml}</div>
        ${nowLine}
      </div>
    </div>
  </section>
  <div class="two">
    <button class="btn btn-primary" data-action="add-block">${icon('plus')}Add block</button>
    <button class="btn" data-action="copy-day" ${blocks.length ? '' : 'disabled style="opacity:.4"'}>Copy day</button>
  </div>`;
}

/* ----------------------------------------------------------------- Stats */

export function statsView({ state, now, ui }) {
  const acts = c.activityMap(state.activities);
  const entries = c.allEntries(state, now);
  const { from, to } = c.periodRange(ui.period, now);
  const byGroup = ui.mode === 'group';

  let items;
  if (byGroup) {
    items = [...c.totalsByGroup(entries, state.activities, from, to)].map(([g, v]) => ({ key: g, name: g, emoji: '', color: v.color, ms: v.ms }));
  } else {
    items = [...c.totalsByActivity(entries, from, to)].map(([id, ms]) => {
      const a = actOf(acts, id);
      return { key: id, name: a.name, emoji: a.emoji, color: a.color, ms };
    });
  }
  items.sort((x, y) => y.ms - x.ms);
  const total = items.reduce((s, x) => s + x.ms, 0);

  const keyOf = (e) => (byGroup ? c.groupOf(acts.get(e.activityId)) : e.activityId);

  const todayStart = c.startOfDay(now);
  const daysElapsed = Math.max(1, Math.round((c.startOfDay(Math.min(now, to - 1)) - from) / c.DAY) + 1);

  const legend = items
    .map(
      (x) => `<div class="lg" ${cv(x.color)}><i></i><span>${esc(x.emoji)} ${esc(x.name)}</span><span class="val">${c.fmtDur(x.ms)}</span><span class="pct">${total ? Math.round((x.ms / total) * 100) : 0}%</span></div>`
    )
    .join('');

  const periodWord = { day: 'today', week: 'this week', month: 'this month' }[ui.period];

  let chart = '';
  if (ui.period !== 'day') {
    const maps = items.map((it) => ({ it, map: c.bucketByDay(entries, from, to, (e) => keyOf(e) === it.key) }));
    const days = [];
    for (let d = from; d < to; d = c.addDays(d, 1)) {
      const parts = maps.map(({ it, map }) => ({ color: it.color, ms: map.get(d) || 0 }));
      days.push({ start: d, parts, total: parts.reduce((s, p) => s + p.ms, 0) });
    }
    chart = `<section class="card"><h2>Per day</h2>${stackedBars(days, { todayStart, month: ui.period === 'month' })}</section>`;
  }

  const insights = c.buildInsights({ state, now });

  const acc = c.accountedToday(entries, state.settings, now);
  const accCard =
    ui.period === 'day' && acc.elapsed > 0
      ? `<section class="card"><h2>Waking day so far</h2>
          <div class="meter" style="--c:var(--eye)"><i style="width:${Math.min(100, (acc.tracked / acc.elapsed) * 100).toFixed(1)}%"></i></div>
          <p class="small muted" style="margin-top:10px">${c.fmtDur(acc.tracked)} tracked, ${c.fmtDur(acc.gap)} unaccounted (${c.fmtMinutes(state.settings.dayStart)}–${c.fmtMinutes(state.settings.dayEnd)}).</p></section>`
      : '';

  const rows = c.adherence(state.plan, entries, from, to, now);
  const pvr = rows.length
    ? rows
        .map((r) => {
          const a = actOf(acts, r.activityId);
          const pct = r.pct === null ? 0 : r.pct;
          return `<div class="pvr" ${cv(a.color)}>
            <div class="head"><span>${esc(a.emoji)} ${esc(a.name)}</span><span>${Math.round(pct * 100)}%</span></div>
            <div class="meter"><i style="width:${Math.min(100, pct * 100).toFixed(1)}%"></i></div>
            <div class="nums">${c.fmtDur(r.actual)} done of ${c.fmtDur(r.planned)} planned so far</div></div>`;
        })
        .join('')
    : `<div class="empty">${state.plan.length ? 'Nothing planned has happened yet in this period.' : 'Add blocks in Plan to see how your reality compares.'}</div>`;

  const dayAll = c.periodRange('day', now);
  const todayBy = c.totalsByActivity(entries, dayAll.from, dayAll.to);
  const habitActs = state.activities.filter((a) => a.goalMin > 0);
  const habits = habitActs.length
    ? habitActs
        .map((a) => {
          const s = c.goalStreak(entries, a, now);
          const done = (todayBy.get(a.id) || 0) / c.MIN;
          return `<div class="pvr" ${cv(a.color)}>
            <div class="head"><span>${esc(a.emoji)} ${esc(a.name)}</span><span>${s.current ? '🔥 ' + s.current + (s.current === 1 ? ' day' : ' days') : 'No streak'}</span></div>
            <div class="meter"><i style="width:${Math.min(100, (done / a.goalMin) * 100).toFixed(1)}%"></i></div>
            <div class="nums">${Math.round(done)} of ${a.goalMin} min today · best streak ${s.best} · ${s.hitDaysThisWeek} ${s.hitDaysThisWeek === 1 ? 'day' : 'days'} this week</div></div>`;
        })
        .join('')
    : `<div class="empty">Set a daily goal on an activity (Settings, then the activity) to build a streak.</div>`;

  const seg = (id, label, cur, action) => `<button data-action="${action}" data-v="${id}" aria-pressed="${cur === id}">${label}</button>`;

  return `
  <h1 class="page-title">Stats</h1>
  <div class="seg" role="group" aria-label="Period">${seg('day', 'Day', ui.period, 'period')}${seg('week', 'Week', ui.period, 'period')}${seg('month', 'Month', ui.period, 'period')}</div>
  ${insights.length ? `<section class="card">${insights.map((t) => `<div class="insight">${esc(t)}</div>`).join('')}</section>` : ''}
  <section class="card">
    <div class="row-between" style="margin-bottom:6px"><h2 style="margin:0">Time ${periodWord}</h2>
      <div class="seg" style="padding:3px;width:178px" role="group" aria-label="Group by">${seg('activity', 'Activities', ui.mode, 'mode')}${seg('group', 'Groups', ui.mode, 'mode')}</div></div>
    ${total ? donut(items.map((x) => ({ ms: x.ms, color: x.color })), total) : `<div class="empty" style="margin-top:10px"><b>No time tracked ${periodWord}</b>Start an activity on the Now tab and it will show up here.</div>`}
    ${ui.period !== 'day' && total ? `<p class="small muted" style="text-align:center;margin-top:4px">${c.fmtDur(total / daysElapsed)} per day on average</p>` : ''}
    <div class="legend">${legend}</div>
  </section>
  ${chart}
  ${accCard}
  <section class="card"><h2>Plan vs reality<small>${periodWord}</small></h2>${pvr}</section>
  <section class="card"><h2>Habits</h2>${habits}</section>`;
}

/* ------------------------------------------------------------------- Log */

export function logView({ state, now, ui }) {
  const acts = c.activityMap(state.activities);
  const sorted = [...state.entries].sort((x, y) => y.start - x.start);
  const groups = new Map();
  for (const e of sorted) {
    const d = c.startOfDay(e.start);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(e);
  }
  const dayKeys = [...groups.keys()];
  const shown = dayKeys.slice(0, ui.logDays);

  const body = shown.length
    ? shown
        .map((d) => {
          const list = groups.get(d);
          const total = list.reduce((s, e) => s + c.netMs(e), 0);
          const rows = list
            .map((e) => {
              const a = actOf(acts, e.activityId);
              const note = e.note ? ` · ${esc(e.note)}` : '';
              return `<button class="li" ${cv(a.color)} data-action="edit-entry" data-id="${esc(e.id)}">
                <span class="bar"></span>
                <span><div class="t">${esc(a.emoji)} ${esc(a.name)}</div><div class="s">${c.fmtHM(e.start)}–${c.fmtHM(e.end)}${note}</div></span>
                <span class="r">${c.fmtDur(c.netMs(e))}</span></button>`;
            })
            .join('');
          return `<section class="card"><div class="day-h" style="padding:0 0 4px"><h2 style="margin:0">${dayLabel(d, now)}</h2><span>${c.fmtDur(total)}</span></div><div class="list">${rows}</div></section>`;
        })
        .join('')
    : `<section class="card"><div class="empty"><b>No entries yet</b>Entries appear here when you stop a timer. You can also add something you already did.</div></section>`;

  return `
  <h1 class="page-title">Log</h1>
  <button class="btn btn-primary btn-block" data-action="add-entry">${icon('plus')}Add past entry</button>
  ${body}
  ${dayKeys.length > shown.length ? '<button class="btn btn-block" data-action="log-more">Show older days</button>' : ''}`;
}

/* -------------------------------------------------------------- Settings */

export function settingsView({ state }) {
  const rows = state.activities
    .map(
      (a) => `<button class="li" ${cv(a.color)} data-action="edit-activity" data-id="${esc(a.id)}">
        <span class="bar"></span>
        <span><div class="t">${esc(a.emoji)} ${esc(a.name)}</div><div class="s">${esc(a.group || 'No group')}${a.goalMin ? ' · goal ' + a.goalMin + ' min a day' : ''}</div></span>
        <span class="faint">Edit</span></button>`
    )
    .join('');

  return `
  <div class="top" style="padding-bottom:0"><button class="icon-btn" data-action="tab" data-v="now" aria-label="Back">${icon('back')}</button></div>
  <h1 class="page-title">Settings</h1>
  <section class="card"><h2>Activities</h2><div class="list">${rows || '<div class="empty">No activities yet.</div>'}</div>
    <button class="btn btn-block" style="margin-top:12px" data-action="add-activity">${icon('plus')}New activity</button></section>
  <form class="card" data-form="window">
    <h2>Waking day</h2>
    <p class="small muted" style="margin-bottom:12px">Purrpose uses this window to estimate how much of your day is unaccounted for.</p>
    <div class="two"><div class="field"><label for="ws">From</label><input id="ws" type="time" name="start" value="${c.fmtMinutes(state.settings.dayStart)}" required></div>
    <div class="field"><label for="we">To</label><input id="we" type="time" name="end" value="${c.fmtMinutes(state.settings.dayEnd)}" required></div></div>
    <div class="err" data-err></div>
    <button class="btn btn-block" type="submit">Save waking day</button>
  </form>
  <section class="card"><h2>Your data</h2>
    <p class="small muted" style="margin-bottom:12px">Everything stays on this phone. Export a backup before you reinstall or switch devices.</p>
    <div class="two"><button class="btn" data-action="export">Export backup</button><button class="btn" data-action="import">Import backup</button></div>
    <button class="btn btn-danger btn-block" style="margin-top:12px" data-action="erase" data-confirm="Tap again to erase everything">Erase all data</button>
  </section>
  <p class="small faint" style="text-align:center;padding:4px 0 8px">Purrpose 0.1.0</p>`;
}
