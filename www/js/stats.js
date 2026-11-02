import * as c from './core.js';
import { esc, icon } from './util.js';
import { donut, stackedBars } from './charts.js';

const ghost = (id) => ({ id, name: 'Deleted activity', emoji: '❔', color: '#a0a8b8', group: '', goalMin: 0 });
const actOf = (acts, id) => acts.get(id) || ghost(id);
const cv = (color) => `style="--c:${esc(color)}"`;

const NAVIGABLE = ['day', 'week', 'month', 'year'];
const PERIODS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['year', 'Year'],
  ['all', 'All'],
  ['range', 'Range'],
];

const segButtons = (list, cur, action) =>
  list.map(([id, label]) => `<button data-action="${action}" data-v="${id}" aria-pressed="${cur === id}">${label}</button>`).join('');

/** Stacked-bar buckets (days, or months for long ranges) with axis labels. */
function buildBuckets({ entries, items, keyOf, from, to, period, now }) {
  const spanDays = Math.round((to - from) / c.DAY);
  const byMonth = period === 'year' || ((period === 'all' || period === 'range') && spanDays > 62);
  const sum = (parts) => parts.reduce((s, p) => s + p.ms, 0);

  if (byMonth) {
    const maps = items.map((it) => ({ it, map: c.bucketByMonth(entries, from, to, (e) => keyOf(e) === it.key) }));
    const months = [...c.bucketByMonth([], from, to).keys()];
    const curMonth = c.startOfMonth(now);
    const buckets = months.map((m) => {
      const parts = maps.map(({ it, map }) => ({ color: it.color, ms: map.get(m) || 0 }));
      const d = new Date(m);
      const label = months.length > 12 ? (d.getMonth() === 0 ? String(d.getFullYear()) : '') : d.toLocaleDateString('en-GB', { month: 'short' });
      return { total: sum(parts), label, hot: m === curMonth, parts };
    });
    return { buckets, title: 'Per month' };
  }

  const maps = items.map((it) => ({ it, map: c.bucketByDay(entries, from, to, (e) => keyOf(e) === it.key) }));
  const today = c.startOfDay(now);
  const buckets = [];
  for (let d = from; d < to; d = c.addDays(d, 1)) {
    const parts = maps.map(({ it, map }) => ({ color: it.color, ms: map.get(d) || 0 }));
    const dt = new Date(d);
    const dom = dt.getDate();
    let label = '';
    if (spanDays <= 7) label = c.WEEKDAYS[c.weekdayIndex(d)];
    else if (spanDays <= 31) label = dom === 1 || dom % 5 === 0 ? String(dom) : '';
    else label = dom === 1 ? dt.toLocaleDateString('en-GB', { month: 'short' }) : '';
    buckets.push({ total: sum(parts), label, hot: d === today, parts });
  }
  return { buckets, title: 'Per day' };
}

export function statsView({ state, now, ui }) {
  const acts = c.activityMap(state.activities);
  const entries = c.allEntries(state, now);
  const { from, to } = c.resolveRange(ui, entries, now);
  const label = c.periodLabel(ui.period, from, to, now);
  const navigable = NAVIGABLE.includes(ui.period);
  const isCurrent = navigable && from <= now && now < to;
  const byGroup = ui.mode === 'group';
  const keyOf = (e) => (byGroup ? c.groupOf(acts.get(e.activityId)) : e.activityId);

  /* ---- what the period contains */
  let items;
  if (byGroup) {
    items = [...c.totalsByGroup(entries, state.activities, from, to)].map(([g, v]) => ({ key: g, name: g, emoji: '', color: v.color, ms: v.ms, archived: false }));
  } else {
    items = [...c.totalsByActivity(entries, from, to)].map(([id, ms]) => {
      const a = actOf(acts, id);
      return { key: id, name: a.name, emoji: a.emoji, color: a.color, ms, archived: c.isArchived(a) };
    });
  }
  items.sort((x, y) => y.ms - x.ms);
  const total = items.reduce((s, x) => s + x.ms, 0);
  const dayCount = Math.max(1, Math.round((Math.min(to, c.addDays(c.startOfDay(now), 1)) - from) / c.DAY));

  const legend = items
    .map(
      (x) => `<div class="lg" ${cv(x.color)}><i></i><span>${esc(x.emoji)} ${esc(x.name)}${x.archived ? ' <small class="tag">archived</small>' : ''}</span><span class="val">${c.fmtDur(x.ms)}</span><span class="pct">${total ? Math.round((x.ms / total) * 100) : 0}%</span></div>`
    )
    .join('');

  /* ---- navigator */
  let navRow;
  if (navigable) {
    navRow = `<div class="nav-row">
      <button class="icon-btn" data-action="stats-prev" aria-label="Previous ${ui.period}">${icon('back')}</button>
      <div class="nav-label" aria-live="polite"><b>${esc(label)}</b>${isCurrent ? '' : '<button class="link" data-action="stats-now">Back to now</button>'}</div>
      <button class="icon-btn" data-action="stats-next" aria-label="Next ${ui.period}" ${isCurrent ? 'disabled' : ''}>${icon('next')}</button>
    </div>`;
  } else if (ui.period === 'range') {
    const today = c.fmtDateInput(now);
    navRow = `<div class="two">
      <div class="field" style="margin:0"><label for="rf">From</label><input id="rf" type="date" data-range="from" value="${esc(ui.rangeFrom)}" max="${today}"></div>
      <div class="field" style="margin:0"><label for="rt">To</label><input id="rt" type="date" data-range="to" value="${esc(ui.rangeTo)}" max="${today}"></div>
    </div>`;
  } else {
    navRow = `<div class="nav-row"><div class="nav-label"><b>${esc(label)}</b></div></div>`;
  }

  /* ---- insights, waking day */
  const insights = isCurrent && (ui.period === 'day' || ui.period === 'week') ? c.buildInsights({ state, now }) : [];
  const acc = c.accountedToday(entries, state.settings, now);
  const accCard =
    ui.period === 'day' && isCurrent && acc.elapsed > 0
      ? `<section class="card"><h2>Waking day so far</h2>
          <div class="meter" style="--c:var(--eye)"><i style="width:${Math.min(100, (acc.tracked / acc.elapsed) * 100).toFixed(1)}%"></i></div>
          <p class="small muted" style="margin-top:10px">${c.fmtDur(acc.tracked)} tracked, ${c.fmtDur(acc.gap)} unaccounted (${c.fmtMinutes(state.settings.dayStart)}–${state.settings.dayEnd >= 1440 ? '24:00' : c.fmtMinutes(state.settings.dayEnd)}).</p></section>`
      : '';

  /* ---- chart */
  let chart = '';
  if (ui.period !== 'day') {
    const { buckets, title } = buildBuckets({ entries, items, keyOf, from, to, period: ui.period, now });
    chart = `<section class="card"><h2>${title}</h2>${stackedBars(buckets, { title })}</section>`;
  }

  /* ---- hours by timespan (this week / month / year / all time) */
  const { rows: spanRows, totals: spanTotals } = c.timespanTotals(entries, state.activities, now);
  const tableRows = spanRows
    .map(
      (r) => `<div class="tr ${r.activity.archived ? 'arch' : ''}" ${cv(r.activity.color)}>
        <span class="nm"><i></i><span><b>${esc(r.activity.emoji)} ${esc(r.activity.name)}</b>${r.activity.archived ? '<small>archived</small>' : ''}</span></span>
        <span>${c.fmtHours(r.week)}</span><span>${c.fmtHours(r.month)}</span><span>${c.fmtHours(r.year)}</span><span>${c.fmtHours(r.all)}</span></div>`
    )
    .join('');
  const table = spanRows.length
    ? `<section class="card"><h2>Hours by timespan</h2>
        <div class="ttable" role="table" aria-label="Hours per activity by timespan">
          <div class="tr th" role="row"><span></span><span>Week</span><span>Month</span><span>Year</span><span>All</span></div>
          ${tableRows}
          <div class="tr tot"><span class="nm"><b>Total</b></span><span>${c.fmtHours(spanTotals.week)}</span><span>${c.fmtHours(spanTotals.month)}</span><span>${c.fmtHours(spanTotals.year)}</span><span>${c.fmtHours(spanTotals.all)}</span></div>
        </div>
        <p class="small faint" style="margin-top:10px">Week, month and year are the current ones. Archived activities are included.</p></section>`
    : '';

  /* ---- plan vs reality (only meaningful for day/week/month) */
  let pvrCard = '';
  if (['day', 'week', 'month'].includes(ui.period)) {
    const rows = c.adherence(state.plan, entries, from, to, now);
    const body = rows.length
      ? rows
          .map((r) => {
            const a = actOf(acts, r.activityId);
            const pct = r.pct === null ? 0 : r.pct;
            return `<div class="pvr" ${cv(a.color)}>
              <div class="head"><span>${esc(a.emoji)} ${esc(a.name)}</span><span>${Math.round(pct * 100)}%</span></div>
              <div class="meter"><i style="width:${Math.min(100, pct * 100).toFixed(1)}%"></i></div>
              <div class="nums">${c.fmtDur(r.actual)} done of ${c.fmtDur(r.planned)} planned${isCurrent ? ' so far' : ''}</div></div>`;
          })
          .join('')
      : `<div class="empty">${state.plan.length ? 'Nothing planned has happened in this period.' : 'Add blocks in Plan to see how your reality compares.'}</div>`;
    pvrCard = `<section class="card"><h2>Plan vs reality<small>${esc(label)}</small></h2>${body}</section>`;
  }

  /* ---- habits (today) */
  const dayAll = c.periodRange('day', now);
  const todayBy = c.totalsByActivity(entries, dayAll.from, dayAll.to);
  const habitActs = state.activities.filter((a) => a.goalMin > 0 && !a.archived);
  const habits = habitActs.length
    ? habitActs
        .map((a) => {
          const s = c.goalStreak(entries, a, now);
          const done = (todayBy.get(a.id) || 0) / c.MIN;
          return `<div class="pvr" ${cv(a.color)}>
            <div class="head"><span>${esc(a.emoji)} ${esc(a.name)}</span><span>${s.current ? '🔥 ' + s.current + (s.current === 1 ? ' day' : ' days') : 'No streak'} · <button class="link" data-action="edit-habit" data-id="${esc(a.id)}">Edit</button></span></div>
            <div class="meter"><i style="width:${Math.min(100, (done / a.goalMin) * 100).toFixed(1)}%"></i></div>
            <div class="nums">${Math.round(done)} of ${a.goalMin} min today · best streak ${s.best} · ${s.hitDaysThisWeek} ${s.hitDaysThisWeek === 1 ? 'day' : 'days'} this week</div></div>`;
        })
        .join('')
    : `<div class="empty"><b>No habits yet</b>A habit is a daily minimum for an activity, for example 30 minutes of Japanese. Reach it every day to build a streak.</div>`;

  return `
  <h1 class="page-title">Stats</h1>
  <div class="seg six" role="group" aria-label="Timespan">${segButtons(PERIODS, ui.period, 'period')}</div>
  ${navRow}
  ${insights.length ? `<section class="card">${insights.map((t) => `<div class="insight">${esc(t)}</div>`).join('')}</section>` : ''}
  <section class="card">
    <div class="row-between" style="margin-bottom:6px"><h2 style="margin:0">Time spent<small>${esc(label)}</small></h2>
      <div class="seg" style="padding:3px;width:178px;flex:none" role="group" aria-label="Group by">${segButtons([['activity', 'Activities'], ['group', 'Groups']], ui.mode, 'mode')}</div></div>
    ${byGroup ? `<p class="small muted" style="margin:0 0 4px">Groups add up activities that share a Group name, like several courses under Study. Set it in an activity's settings.</p>` : ''}
    ${
      total
        ? donut(items.map((x) => ({ ms: x.ms, color: x.color })), total)
        : `<div class="empty" style="margin-top:10px"><b>Nothing tracked here</b>Start an activity on the Now tab, or pick another timespan.</div>`
    }
    ${ui.period !== 'day' && total ? `<p class="small muted" style="text-align:center;margin-top:4px">${c.fmtDur(total / dayCount)} per day on average</p>` : ''}
    <div class="legend">${legend}</div>
  </section>
  ${chart}
  ${table}
  ${accCard}
  ${pvrCard}
  <section class="card"><h2>Habits</h2>${habits}
    ${state.activities.some((a) => !a.archived && !a.goalMin) ? `<button class="btn btn-block" style="margin-top:12px" data-action="add-habit">${icon('plus')}Add a habit</button>` : ''}</section>`;
}
