import * as c from './core.js';
import * as store from './store.js';
import { esc, toast, hideToast } from './util.js';
import { header, nav, nowView, planView, statsView, logView, settingsView, timerHTML } from './views.js';
import { renderSheet, submitSheet } from './sheets.js';

const ui = {
  tab: 'now', // now | plan | stats | log | settings
  period: 'day',
  mode: 'activity',
  planDay: c.weekdayIndex(Date.now()),
  logDays: 14,
  sheet: null,
};

const root = document.getElementById('app');
store.load();

const ctx = () => ({ state: store.get(), now: Date.now(), ui });
const nameOf = (id) => store.get().activities.find((a) => a.id === id)?.name || 'activity';

/* ----------------------------------------------------------------- render */

function render() {
  const x = ctx();
  const views = { now: nowView, plan: planView, stats: statsView, log: logView, settings: settingsView };
  root.innerHTML = `
    ${ui.tab === 'settings' ? '' : header(x)}
    <main id="view">${views[ui.tab](x)}</main>
    <nav class="tabs" aria-label="Main">${nav(ui.tab)}</nav>
    <div id="sheet-root">${ui.sheet ? renderSheet(ui.sheet, x) : ''}</div>`;
  if (ui.sheet) root.querySelector('.sheet input:not([type=hidden]), .sheet select')?.focus({ preventScroll: true });
}

store.subscribe(() => render());

function go(tab) {
  ui.tab = tab;
  ui.sheet = null;
  render();
  window.scrollTo({ top: 0 });
}

function openSheet(sheet) {
  ui.sheet = sheet;
  render();
}

function closeSheet() {
  ui.sheet = null;
  render();
}

/* ------------------------------------------------------------ undo support */

let undoSnapshot = null;
function offerUndo(message) {
  undoSnapshot = store.get();
  toast(`<span>${esc(message)}</span><button class="link" data-action="undo">Undo</button>`, 6000);
}

/* ---------------------------------------------------------------- actions */

const actions = {
  tab: (el) => go(el.dataset.v),
  settings: () => go('settings'),
  period: (el) => {
    ui.period = el.dataset.v;
    render();
  },
  mode: (el) => {
    ui.mode = el.dataset.v;
    render();
  },
  'plan-day': (el) => {
    ui.planDay = Number(el.dataset.v);
    render();
  },
  'log-more': () => {
    ui.logDays += 14;
    render();
  },

  /* timer */
  start: (el) => {
    const s = store.get();
    const now = Date.now();
    const prev = s.active;
    const id = el.dataset.id;
    if (prev && prev.activityId === id) return; // already running
    const before = s;
    const next = c.startActivity(s, id, now);
    store.set(next);
    if (prev) {
      undoSnapshot = before;
      const saved = next.entries.length > s.entries.length ? c.fmtDur(c.netMs(next.entries[next.entries.length - 1])) : null;
      toast(
        `<span>${saved ? `Saved ${saved} of ${esc(nameOf(prev.activityId))}. ` : ''}Now on ${esc(nameOf(id))}.</span><button class="link" data-action="undo">Undo</button>`,
        6000
      );
    }
  },
  pause: () => store.update((s) => c.pauseActive(s, Date.now())),
  resume: () => store.update((s) => c.resumeActive(s, Date.now())),
  stop: () => {
    const before = store.get();
    if (!before.active) return;
    const name = nameOf(before.active.activityId);
    const after = c.stopActive(before, Date.now());
    store.set(after);
    if (after.entries.length > before.entries.length) {
      const e = after.entries[after.entries.length - 1];
      offerUndo(`Saved ${c.fmtDur(c.netMs(e))} of ${name}`);
      undoSnapshot = before;
    } else {
      toast('Too short to save, so it was discarded.', 3500);
    }
  },
  undo: () => {
    if (undoSnapshot) store.set(undoSnapshot);
    undoSnapshot = null;
    hideToast();
  },
  'edit-start': () => openSheet({ type: 'start' }),
  'quick-start': (el) => {
    const input = root.querySelector('.sheet [name=start]');
    if (input) input.value = c.fmtHM(Date.now() - Number(el.dataset.min) * c.MIN);
  },

  /* sheets */
  'sheet-close': closeSheet,
  'add-activity': () => openSheet({ type: 'activity' }),
  'edit-activity': (el) => openSheet({ type: 'activity', id: el.dataset.id }),
  'add-block': () => openSheet({ type: 'block' }),
  'edit-block': (el) => openSheet({ type: 'block', id: el.dataset.id }),
  'copy-day': () => openSheet({ type: 'copy-day', from: ui.planDay }),
  'add-entry': () => openSheet({ type: 'entry' }),
  'edit-entry': (el) => openSheet({ type: 'entry', id: el.dataset.id }),
  export: () => openSheet({ type: 'export' }),
  import: () => openSheet({ type: 'import' }),
  'pick-emoji': (el) => {
    const input = root.querySelector('.sheet [name=emoji]');
    if (input) input.value = el.dataset.v;
  },

  /* destructive (two-step confirm handled in the click listener) */
  'delete-activity': (el) => {
    const id = el.dataset.id;
    store.update((s) => ({
      ...s,
      activities: s.activities.filter((a) => a.id !== id),
      entries: s.entries.filter((e) => e.activityId !== id),
      plan: s.plan.filter((b) => b.activityId !== id),
      active: s.active && s.active.activityId === id ? null : s.active,
    }));
    closeSheet();
  },
  'delete-block': (el) => {
    store.update((s) => ({ ...s, plan: s.plan.filter((b) => b.id !== el.dataset.id) }));
    closeSheet();
  },
  'delete-entry': (el) => {
    store.update((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== el.dataset.id) }));
    closeSheet();
  },
  erase: () => {
    store.resetAll();
    toast('All data erased.', 3000);
  },

  /* export helpers */
  'copy-export': async () => {
    const text = store.exportJson();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = root.querySelector('.sheet textarea');
      ta?.select();
      document.execCommand?.('copy');
    }
    toast('Backup copied to the clipboard.', 2500);
  },
  'download-export': () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `purrpose-backup-${c.fmtDateInput(Date.now())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  'share-export': async () => {
    try {
      await navigator.share({ title: 'Purrpose backup', text: store.exportJson() });
    } catch {
      /* user dismissed the share sheet */
    }
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT') return;
  if (el.disabled) return;

  // destructive buttons need a second tap
  if (el.dataset.confirm && el.dataset.armed !== '1') {
    el.dataset.armed = '1';
    el.dataset.label = el.textContent;
    el.textContent = el.dataset.confirm;
    setTimeout(() => {
      if (el.isConnected && el.dataset.armed === '1') {
        el.dataset.armed = '';
        el.textContent = el.dataset.label;
      }
    }, 4000);
    return;
  }
  actions[el.dataset.action]?.(el, e);
});

// Read a chosen backup file into the paste box.
document.addEventListener('change', async (e) => {
  if (e.target.dataset?.action === 'file-picked' && e.target.files?.[0]) {
    const text = await e.target.files[0].text();
    const ta = root.querySelector('.sheet [name=json]');
    if (ta) ta.value = text;
  }
});

// Notes are saved silently while typing so the field keeps focus.
document.addEventListener('input', (e) => {
  if (e.target.matches('[data-note]')) store.update((s) => c.setActiveNote(s, e.target.value), { silent: true });
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const type = form.dataset.form;
  const x = ctx();

  if (type === 'window') {
    const start = c.parseTime(form.start.value);
    const end = c.parseTime(form.end.value);
    const err = form.querySelector('[data-err]');
    if (start === null || end === null || end <= start) {
      err.textContent = 'The end of your day must be after the start.';
      return;
    }
    store.update((s) => ({ ...s, settings: { dayStart: start, dayEnd: end } }));
    toast('Waking day saved.', 2500);
    return;
  }

  const res = submitSheet(ui.sheet, form, x);
  if (res.error) {
    form.querySelector('[data-err]').textContent = res.error;
    return;
  }
  if (res.close && ui.sheet) {
    ui.sheet = null;
    render();
  }
  if (res.toast) toast(res.toast, 3000);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.sheet) closeSheet();
});

/* ------------------------------------------------------------------- tick */

let lastMinute = -1;
setInterval(() => {
  const now = Date.now();
  const s = store.get();

  // live timer text: update in place so nothing re-renders or loses focus
  const timer = root.querySelector('[data-timer]');
  if (timer && s.active && !s.active.pausedAt) timer.innerHTML = timerHTML(c.activeElapsed(s.active, now));

  // refresh totals, plan line and charts once a minute
  const minute = Math.floor(now / c.MIN);
  if (minute !== lastMinute) {
    lastMinute = minute;
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (!ui.sheet && !typing && ['now', 'plan', 'stats'].includes(ui.tab)) render();
  }
}, 1000);

// Coming back to the app (phone unlocked, app switched): redraw immediately.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !ui.sheet) render();
});

render();
