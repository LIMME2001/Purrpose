import * as c from './core.js';
import * as store from './store.js';
import { esc } from './util.js';

const EMOJIS = ['📚', '🧠', '💻', '🎌', '🗣️', '🚶', '🏃', '💪', '🧘', '🍳', '🛋️', '😴', '🎮', '💼', '🎧', '✍️'];

const wrap = (type, title, body, actions) => `
  <div class="scrim" data-action="sheet-close"></div>
  <form class="sheet" data-form="${type}" role="dialog" aria-modal="true" aria-label="${esc(title)}" novalidate>
    <div class="grab"></div><h2>${esc(title)}</h2>
    ${body}
    <div class="err" data-err role="alert"></div>
    <div class="sheet-actions">${actions}</div>
  </form>`;

const actOptions = (acts, sel) =>
  acts
    .filter((a) => !a.archived || a.id === sel)
    .map((a) => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.emoji)} ${esc(a.name)}</option>`).join('');

const dayChips = (checked) =>
  c.WEEKDAYS.map((w, i) => `<label class="chip"><input type="checkbox" name="day" value="${i}" ${checked.includes(i) ? 'checked' : ''}><span>${w}</span></label>`).join('');

const save = (label = 'Save') => `<button class="btn btn-primary" type="submit">${label}</button>`;
const cancel = `<button class="btn" type="button" data-action="sheet-close">Cancel</button>`;

/* -------------------------------------------------------------- renderers */

export function renderSheet(sheet, { state, now, ui }) {
  switch (sheet.type) {
    case 'activity': {
      const a = state.activities.find((x) => x.id === sheet.id);
      const groups = [...new Set(state.activities.map((x) => x.group).filter(Boolean))];
      const color = a ? a.color : c.PALETTE[state.activities.length % c.PALETTE.length];
      const n = a ? state.entries.filter((e) => e.activityId === a.id).length : 0;
      const body = `
        <div class="field"><label for="f-name">Name</label><input id="f-name" type="text" name="name" maxlength="30" value="${esc(a?.name || '')}" placeholder="e.g. TSBK07 lectures" autocomplete="off" required></div>
        <div class="field"><label for="f-emoji">Emoji</label><input id="f-emoji" type="text" name="emoji" maxlength="8" value="${esc(a?.emoji || '🐾')}">
          <div class="emoji-row">${EMOJIS.map((e) => `<button type="button" data-action="pick-emoji" data-v="${e}" aria-label="Use ${e}">${e}</button>`).join('')}</div></div>
        <div class="field"><label for="f-group">Group (optional)</label><input id="f-group" type="text" name="group" list="groups" maxlength="30" value="${esc(a?.group || '')}" placeholder="e.g. Study" autocomplete="off">
          <datalist id="groups">${groups.map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
          <span class="hint">Put several courses in one group to see their total.</span></div>
        <div class="field"><span class="lab">Color</span><div class="swatches">${c.PALETTE.map((p) => `<label class="swatch" style="--c:${p}"><input type="radio" name="color" value="${p}" ${p === color ? 'checked' : ''} aria-label="${p}"><span></span></label>`).join('')}</div></div>
        <div class="field"><label for="f-goal">Daily goal in minutes</label><input id="f-goal" type="number" name="goal" min="0" max="1440" step="5" inputmode="numeric" value="${a?.goalMin || 0}">
          <span class="hint">Hit it every day to build a streak. Use 0 for no goal.</span></div>`;
      const del = a
        ? `<button class="btn btn-danger" type="button" data-action="delete-activity" data-id="${esc(a.id)}" data-confirm="${n ? `Tap again: deletes ${n} ${n === 1 ? 'entry' : 'entries'}` : 'Tap again to delete'}">Delete</button>`
        : '';
      const arch = a
        ? a.archived
          ? `<button class="btn" type="button" data-action="restore-activity" data-id="${esc(a.id)}">Restore</button>`
          : `<button class="btn" type="button" data-action="archive-activity" data-id="${esc(a.id)}">Archive</button>`
        : '';
      const archHint = a
        ? `<p class="small muted" style="margin-top:4px">${a.archived ? 'Archived: hidden from Start and Plan, but all its stats are kept.' : 'Archive hides it from Start and Plan but keeps all its stats. Its plan blocks are removed.'}</p>`
        : '';
      return wrap('activity', a ? 'Edit activity' : 'New activity', body + archHint, `${del}${arch}${cancel}${save()}`);
    }

    case 'block': {
      const b = state.plan.find((x) => x.id === sheet.id);
      const days = b ? b.days : [ui.planDay];
      const body = `
        <div class="field"><label for="f-act">Activity</label><select id="f-act" name="activity">${actOptions(state.activities, b?.activityId)}</select></div>
        <div class="field"><span class="lab">Repeats on</span><div class="chips">${dayChips(days)}</div></div>
        <div class="two"><div class="field"><label for="f-s">Start</label><input id="f-s" type="time" name="start" value="${c.fmtMinutes(b ? b.start : 9 * 60)}" required></div>
        <div class="field"><label for="f-e">End</label><input id="f-e" type="time" name="end" value="${c.fmtMinutes(b ? b.end : 10 * 60)}" required></div></div>`;
      const del = b ? `<button class="btn btn-danger" type="button" data-action="delete-block" data-id="${esc(b.id)}" data-confirm="Tap again to delete">Delete</button>` : '';
      return wrap('block', b ? 'Edit block' : 'Add block', body, `${del}${cancel}${save()}`);
    }

    case 'entry': {
      const e = state.entries.find((x) => x.id === sheet.id);
      const day = e ? e.start : c.addDays(c.startOfWeek(now), ui.planDay) <= now && ui.tab === 'plan' ? c.addDays(c.startOfWeek(now), ui.planDay) : now;
      const body = `
        <div class="field"><label for="f-act">Activity</label><select id="f-act" name="activity">${actOptions(state.activities, e?.activityId)}</select></div>
        <div class="field"><label for="f-d">Date</label><input id="f-d" type="date" name="date" value="${c.fmtDateInput(day)}" max="${c.fmtDateInput(now)}" required></div>
        <div class="two"><div class="field"><label for="f-s">Start</label><input id="f-s" type="time" name="start" value="${e ? c.fmtHM(e.start) : ''}" required></div>
        <div class="field"><label for="f-e">End</label><input id="f-e" type="time" name="end" value="${e ? c.fmtHM(e.end) : ''}" required></div></div>
        <div class="field"><label for="f-n">Note (optional)</label><input id="f-n" type="text" name="note" maxlength="120" value="${esc(e?.note || '')}"><span class="hint">If the end is earlier than the start, the entry ends the next day.</span></div>`;
      const del = e ? `<button class="btn btn-danger" type="button" data-action="delete-entry" data-id="${esc(e.id)}" data-confirm="Tap again to delete">Delete</button>` : '';
      return wrap('entry', e ? 'Edit entry' : 'Add past entry', body, `${del}${cancel}${save()}`);
    }

    case 'start': {
      const a = state.active;
      const body = `
        <div class="field"><label for="f-s">Started at</label><input id="f-s" type="time" name="start" value="${c.fmtHM(a.start)}" required>
          <div class="chips" style="margin-top:6px">${[5, 15, 30, 60].map((m) => `<button type="button" class="btn btn-small" data-action="quick-start" data-min="${m}">${m} min ago</button>`).join('')}</div></div>`;
      return wrap('start', 'Change start time', body, `${cancel}${save()}`);
    }

    case 'hours': {
      const s = state.settings;
      const body = `<p class="muted small" style="margin-bottom:14px">Your day is the stretch Plan shows and Stats counts as "waking" when it works out what is unaccounted for. Longer days stretch Plan automatically, so nothing you track is ever hidden.</p>
        <div class="two"><div class="field"><label for="f-s">Day starts</label><input id="f-s" type="time" name="start" value="${c.fmtMinutes(s.dayStart)}" required></div>
        <div class="field"><label for="f-e">Day ends</label><input id="f-e" type="time" name="end" value="${c.fmtMinutes(s.dayEnd)}" required></div></div>
        <div class="chips" style="margin-bottom:8px">${[['Early', 360, 1320], ['Standard', 420, 1380], ['Late', 540, 1440], ['All day', 0, 1440]].map(([n, x, y]) => `<button type="button" class="btn btn-small" data-action="preset-hours" data-s="${x}" data-e="${y}">${n}</button>`).join('')}</div>`;
      return wrap('hours', 'Set my day', body, `${cancel}${save()}`);
    }

    case 'habit': {
      const a = state.activities.find((x) => x.id === sheet.id);
      const pool = state.activities.filter((x) => !x.archived && (!x.goalMin || x.id === sheet.id));
      const body = `
        <div class="field"><label for="f-act">Activity</label><select id="f-act" name="activity" ${a ? 'disabled' : ''}>${actOptions(a ? [a] : pool, sheet.id)}</select>
          ${a ? `<input type="hidden" name="activity" value="${esc(a.id)}">` : ''}</div>
        <div class="field"><label for="f-g">Daily goal in minutes</label><input id="f-g" type="number" name="goal" min="5" max="1440" step="5" inputmode="numeric" value="${a?.goalMin || 30}" required>
          <span class="hint">Reach it every day to build a streak.</span></div>`;
      const del = a ? `<button class="btn btn-danger" type="button" data-action="remove-habit" data-id="${esc(a.id)}" data-confirm="Tap again to remove">Remove habit</button>` : '';
      return wrap('habit', a ? 'Edit habit' : 'Add a habit', body, `${del}${cancel}${save()}`);
    }

    case 'copy-day': {
      const name = c.WEEKDAYS[sheet.from];
      const body = `<p class="muted" style="margin-bottom:14px">Copy ${name}'s blocks to these days. Blocks that already exist are skipped.</p>
        <div class="field"><div class="chips">${c.WEEKDAYS.map((w, i) => (i === sheet.from ? '' : `<label class="chip"><input type="checkbox" name="day" value="${i}"><span>${w}</span></label>`)).join('')}</div></div>`;
      return wrap('copy-day', `Copy ${name}`, body, `${cancel}${save('Copy')}`);
    }

    case 'export': {
      const json = store.exportJson();
      const body = `<div class="field"><label for="f-j">Backup</label><textarea id="f-j" readonly>${esc(json)}</textarea>
        <span class="hint">${state.entries.length} entries, ${state.activities.length} activities, ${state.plan.length} plan blocks.</span></div>`;
      const share = typeof navigator !== 'undefined' && navigator.share ? `<button class="btn" type="button" data-action="share-export">Share</button>` : '';
      return wrap('export', 'Export backup', body, `${cancel}${share}<button class="btn btn-primary" type="button" data-action="copy-export">Copy</button><button class="btn btn-primary" type="button" data-action="download-export">Save file</button>`);
    }

    case 'import': {
      const body = `<p class="muted" style="margin-bottom:14px">Importing replaces everything that is in Purrpose right now.</p>
        <div class="field"><label for="f-file">Backup file</label><input id="f-file" type="file" accept=".json,application/json" data-action="file-picked"></div>
        <div class="field"><label for="f-j">Or paste the backup text</label><textarea id="f-j" name="json" placeholder="{ ... }"></textarea></div>`;
      return wrap('import', 'Import backup', body, `${cancel}${save('Import')}`);
    }
    default:
      return '';
  }
}

/* --------------------------------------------------------------- handlers */

/** Returns { error } to keep the sheet open, or { close: true, toast? } on success. */
export function submitSheet(sheet, form, { state, now, ui }) {
  const fd = new FormData(form);
  const val = (k) => String(fd.get(k) ?? '').trim();

  switch (sheet.type) {
    case 'activity': {
      const name = val('name');
      if (!name) return { error: 'Give the activity a name.' };
      const goal = Math.max(0, Math.round(Number(val('goal')) || 0));
      const next = {
        name,
        emoji: val('emoji') || '🐾',
        group: val('group'),
        color: val('color') || c.PALETTE[0],
        goalMin: goal,
      };
      store.update((s) => ({
        ...s,
        activities: sheet.id ? s.activities.map((a) => (a.id === sheet.id ? { ...a, ...next } : a)) : [...s.activities, { id: c.uid(), ...next }],
      }));
      return { close: true, toast: `${name} saved.` };
    }

    case 'block': {
      const block = {
        activityId: val('activity'),
        days: fd.getAll('day').map(Number),
        start: c.parseTime(val('start')),
        end: c.parseTime(val('end')),
      };
      const err = c.validateBlock(block);
      if (err) return { error: err + '.' };
      store.update((s) => ({
        ...s,
        plan: sheet.id ? s.plan.map((b) => (b.id === sheet.id ? { ...b, ...block } : b)) : [...s.plan, { id: c.uid(), ...block }],
      }));
      return { close: true, toast: 'Plan block saved.' };
    }

    case 'entry': {
      const start = c.parseDateTime(val('date'), val('start'));
      let end = c.parseDateTime(val('date'), val('end'));
      if (start === null || end === null) return { error: 'Enter a date, a start time and an end time.' };
      if (end <= start) end = c.addDays(end, 1);
      if (end > now + c.MIN) return { error: "That time hasn't happened yet. Pick an earlier end." };
      if (end - start < c.MIN) return { error: 'An entry must be at least one minute long.' };
      store.update((s) => {
        const old = s.entries.find((x) => x.id === sheet.id);
        const pausedMs = old && old.pausedMs < end - start ? old.pausedMs : 0;
        const entry = { id: sheet.id || c.uid(), activityId: val('activity'), start, end, pausedMs, note: val('note') };
        return { ...s, entries: sheet.id ? s.entries.map((x) => (x.id === sheet.id ? entry : x)) : [...s.entries, entry] };
      });
      return { close: true, toast: 'Entry saved.' };
    }

    case 'start': {
      const mins = c.parseTime(val('start'));
      if (mins === null) return { error: 'Enter a start time.' };
      let ts = c.atMinutes(c.startOfDay(now), mins);
      if (ts > now) ts = c.addDays(ts, -1); // "23:50" typed at 00:10 means yesterday
      store.update((s) => c.setActiveStart(s, ts, now));
      return { close: true, toast: `Start time set to ${c.fmtHM(ts)}.` };
    }

    case 'hours': {
      const a = c.parseTime(val('start'));
      const b = form.end.value === '00:00' ? 1440 : c.parseTime(val('end'));
      if (a === null || b === null || b - a < 120) return { error: 'Your day needs to be at least two hours long.' };
      store.update((s) => ({ ...s, settings: { dayStart: a, dayEnd: b } }));
      return { close: true, toast: `Your day is ${c.fmtMinutes(a)}–${b >= 1440 ? '24:00' : c.fmtMinutes(b)}.` };
    }

    case 'habit': {
      const goal = Math.round(Number(val('goal')));
      if (!(goal >= 5)) return { error: 'Pick a goal of at least 5 minutes.' };
      const id = val('activity');
      if (!id) return { error: 'Choose an activity.' };
      store.update((s) => ({ ...s, activities: s.activities.map((a) => (a.id === id ? { ...a, goalMin: Math.min(goal, 1440) } : a)) }));
      return { close: true, toast: 'Habit saved.' };
    }

    case 'copy-day': {
      const targets = fd.getAll('day').map(Number);
      if (!targets.length) return { error: 'Pick at least one day.' };
      store.update((s) => {
        const src = c.blocksForDay(s.plan, sheet.from);
        const added = [];
        for (const t of targets) {
          for (const b of src) {
            const dup = [...s.plan, ...added].some((x) => x.activityId === b.activityId && x.start === b.start && x.end === b.end && x.days.includes(t));
            if (!dup) added.push({ id: c.uid(), activityId: b.activityId, days: [t], start: b.start, end: b.end });
          }
        }
        return { ...s, plan: [...s.plan, ...added] };
      });
      return { close: true, toast: 'Day copied.' };
    }

    case 'import': {
      const text = val('json');
      if (!text) return { error: 'Choose a backup file or paste its text.' };
      const res = store.importJson(text);
      if (!res.ok) return { error: res.error };
      return { close: true, toast: `Imported ${res.entries} entries` };
    }

    default:
      return { close: true };
  }
}
