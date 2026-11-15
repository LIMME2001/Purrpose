import * as c from './core.js';
import * as store from './store.js';
import { esc, toast, hideToast, isNative } from './util.js';
import { header, nav, nowView, planView, logView, settingsView, timerHTML } from './views.js';
import { statsView } from './stats.js';
import { renderSheet, submitSheet } from './sheets.js';

const ui = {
  tab: 'now', // now | plan | stats | log | settings
  period: 'day',
  anchor: null, // null = now; otherwise a timestamp inside the viewed day/week/month/year
  rangeFrom: c.fmtDateInput(Date.now() - 29 * c.DAY),
  rangeTo: c.fmtDateInput(Date.now()),
  mode: 'activity',
  planDay: c.weekdayIndex(Date.now()),
  logDays: 14,
  planFull: false,
  sheet: null,
  pawsOpen: {}, // habit id -> paw-print history expanded
};

const SNOOZE_KEY = 'purrpose.backupSnooze';
try {
  ui.backupSnoozeUntil = Number(localStorage.getItem(SNOOZE_KEY)) || 0;
} catch {
  ui.backupSnoozeUntil = 0;
}

const SEEN_KEY = 'purrpose.seen';
function loadSeen() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY)) || null;
  } catch {
    return null;
  }
}
function saveSeen() {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ milestones: ui.milestonesSeen, report: ui.reportSeen }));
  } catch {
    /* the card just shows again next time */
  }
}

const root = document.getElementById('app');
store.load();
{
  // Milestones already reached before this feature existed are not celebrated retroactively.
  const seen = loadSeen();
  ui.reportSeen = seen ? seen.report : null;
  if (seen && seen.milestones) ui.milestonesSeen = seen.milestones;
  else {
    const st = store.get();
    ui.milestonesSeen = Object.fromEntries(c.milestoneProgress(c.allEntries(st, Date.now()), st.activities).map((r) => [r.activity.id, r.reached]));
    saveSeen();
  }
}

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

/**
 * Native Capacitor plugins without a bundler. The page only gets the Android bridge (window.Capacitor with
 * nativePromise / addListener), not Capacitor's JavaScript library, so there is no registerPlugin here.
 */
const native = (plugin, method, options = {}) => window.Capacitor.nativePromise(plugin, method, options);
const errText = (err) => String(err?.message || err?.errorMessage || (typeof err === 'string' ? err : JSON.stringify(err)) || 'unknown error').slice(0, 120);

const actions = {
  tab: (el) => go(el.dataset.v),
  settings: () => go('settings'),
  period: (el) => {
    ui.period = el.dataset.v;
    ui.anchor = null;
    render();
  },
  'stats-prev': () => {
    ui.anchor = c.shiftAnchor(ui.period, ui.anchor ?? Date.now(), -1);
    render();
  },
  'stats-next': () => {
    ui.anchor = c.shiftAnchor(ui.period, ui.anchor ?? Date.now(), 1);
    render();
  },
  'stats-now': () => {
    ui.anchor = null;
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
  'edit-hours': () => openSheet({ type: 'hours' }),
  'plan-full': () => {
    ui.planFull = !ui.planFull;
    render();
  },
  'preset-hours': (el) => {
    const f = root.querySelector('.sheet');
    f.querySelector('[name=start]').value = c.fmtMinutes(Number(el.dataset.s));
    f.querySelector('[name=end]').value = c.fmtMinutes(Number(el.dataset.e));
  },
  'add-habit': () => openSheet({ type: 'habit' }),
  'edit-habit': (el) => openSheet({ type: 'habit', id: el.dataset.id }),
  'remove-habit': (el) => {
    store.update((s) => ({ ...s, activities: s.activities.map((a) => (a.id === el.dataset.id ? { ...a, goalMin: 0 } : a)) }));
    closeSheet();
    toast('Habit removed. Its history is kept.', 3000);
  },
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
    offerUndo(`${nameOf(id)} deleted`);
    store.update((s) => ({
      ...s,
      activities: s.activities.filter((a) => a.id !== id),
      entries: s.entries.filter((e) => e.activityId !== id),
      plan: s.plan.filter((b) => b.activityId !== id),
      active: s.active && s.active.activityId === id ? null : s.active,
    }));
    closeSheet();
  },
  'archive-activity': (el) => {
    const id = el.dataset.id;
    const name = nameOf(id);
    const before = store.get();
    store.set(c.archiveActivity(before, id, Date.now()));
    undoSnapshot = before;
    closeSheet();
    toast(`<span>${esc(name)} archived. Its stats are kept.</span><button class="link" data-action="undo">Undo</button>`, 6000);
  },
  'restore-activity': (el) => {
    store.set(c.restoreActivity(store.get(), el.dataset.id));
    closeSheet();
    toast(`${esc(nameOf(el.dataset.id))} is back.`, 3000);
  },
  'delete-block': (el) => {
    offerUndo('Block deleted');
    store.update((s) => ({ ...s, plan: s.plan.filter((b) => b.id !== el.dataset.id) }));
    closeSheet();
  },
  'delete-entry': (el) => {
    offerUndo('Entry deleted');
    store.update((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== el.dataset.id) }));
    closeSheet();
  },
  erase: () => {
    offerUndo('All data erased');
    store.resetAll();
  },

  /* a timer that was probably forgotten */
  'stale-stop': (el) => {
    const before = store.get();
    if (!before.active) return;
    const name = nameOf(before.active.activityId);
    const endAt = Number(el.dataset.end) || Date.now();
    const after = c.stopActive(before, Math.max(endAt, before.active.start));
    store.set(after);
    if (after.entries.length > before.entries.length) {
      offerUndo(`Saved ${c.fmtDur(c.netMs(after.entries[after.entries.length - 1]))} of ${name}`);
      undoSnapshot = before;
    }
  },
  'stale-keep': () => {
    ui.staleUntil = Date.now() + 3 * c.HOUR;
    render();
  },
  'milestone-ok': () => {
    const st = store.get();
    for (const r of c.milestoneProgress(c.allEntries(st, Date.now()), st.activities)) ui.milestonesSeen[r.activity.id] = r.reached;
    saveSeen();
    render();
  },
  'open-report': (el) => openSheet({ type: 'report', week: Number(el.dataset.week) }),
  'report-later': (el) => {
    ui.reportSeen = Number(el.dataset.week);
    saveSeen();
    render();
  },
  'toggle-paws': (el) => {
    ui.pawsOpen[el.dataset.id] = !ui.pawsOpen[el.dataset.id];
    render();
  },
  'backup-later': () => {
    ui.backupSnoozeUntil = Date.now() + 3 * c.DAY;
    try {
      localStorage.setItem(SNOOZE_KEY, String(ui.backupSnoozeUntil));
    } catch {
      /* the reminder just comes back next time */
    }
    render();
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
    store.markBackedUp();
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
    store.markBackedUp();
  },
  'share-export': async () => {
    const text = store.exportJson();
    if (isNative()) {
      // 1) write a real .json file to the app cache and hand it to Android's share sheet (Drive, email, Files...)
      let step = 'making the file';
      try {
        const name = `purrpose-backup-${c.fmtDateInput(Date.now())}.json`;
        const { uri } = await native('Filesystem', 'writeFile', { path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
        step = 'sharing the file';
        await native('Share', 'share', { title: 'Purrpose backup', dialogTitle: 'Save your backup', files: [uri] });
        store.markBackedUp();
        toast('Backup shared. Keep that file somewhere safe.', 4000);
        return;
      } catch (err) {
        if (/cancel/i.test(errText(err))) return; // the person closed the share sheet
        // 2) fall back to sharing the text itself (works for notes, mail, chat)
        try {
          await native('Share', 'share', { title: 'Purrpose backup', dialogTitle: 'Save your backup', text });
          store.markBackedUp();
          toast(`Couldn't make a file (${errText(err)}), so the backup was shared as text.`, 6000);
          return;
        } catch (err2) {
          if (/cancel/i.test(errText(err2))) return;
          // 3) last resort: the clipboard
          await actions['copy-export']();
          toast(`Problem ${step}: ${errText(err)}. The backup text was copied instead.`, 8000);
          return;
        }
      }
    }
    try {
      await navigator.share({ title: 'Purrpose backup', text });
      store.markBackedUp();
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
  const r = e.target.dataset?.range;
  if (r && e.target.value) {
    if (r === 'from') ui.rangeFrom = e.target.value;
    else ui.rangeTo = e.target.value;
    render();
    return;
  }
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
    store.update((s) => ({ ...s, settings: { ...s.settings, dayStart: start, dayEnd: end } }));
    toast('Waking day saved.', 2500);
    return;
  }

  const before = store.get();
  const res = submitSheet(ui.sheet, form, x);
  if (res.error) {
    form.querySelector('[data-err]').textContent = res.error;
    return;
  }
  if (res.close && ui.sheet) {
    ui.sheet = null;
    render();
  }
  if (res.undo) {
    undoSnapshot = before;
    toast(`<span>${esc(res.toast)}</span><button class="link" data-action="undo">Undo</button>`, 10000);
  } else if (res.toast) toast(res.toast, 3000);
});

// Android's Back button: close a sheet first, then go back to Now, and only then leave the app.
if (isNative()) {
  try {
    window.Capacitor.addListener('App', 'backButton', () => {
      if (ui.sheet) closeSheet();
      else if (ui.tab !== 'now') go('now');
      else native('App', 'minimizeApp').catch(() => {});
    });
  } catch {
    /* without the listener Android just closes the app, as before */
  }
}

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
