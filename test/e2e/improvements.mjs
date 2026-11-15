// Browser checks for the November 2026 improvements: forgotten timer, backup reminder and native
// backup/Back button (with a mocked Capacitor), overlap warning, rest days, undo, comparison line.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SHOTS = new URL('./shots', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const failures = [];
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failures.push(name);
};

const H = 3600e3;
const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0)).getTime();
const browser = await chromium.launch();
const errors = [];

/** A fresh page with a seeded state; `native` installs a fake Capacitor that records every call. */
async function open({ native = false, active = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Stockholm', locale: 'en-GB' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  await page.addInitScript(
    ({ native, active }) => {
      if (localStorage.getItem('purrpose.v1')) return; // keep state across reloads inside one test
      const day0 = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
      const H = 3600e3;
      const acts = [
        { id: 'study', name: 'Study', emoji: '📚', color: '#8b9cff', group: 'Study', goalMin: 0 },
        { id: 'japanese', name: 'Japanese', emoji: '🗣️', color: '#ff8fb1', group: 'Language', goalMin: 30 },
        { id: 'walking', name: 'Walking', emoji: '🚶', color: '#5ee0a0', group: 'Movement', goalMin: 0 },
      ];
      const entries = [];
      // last week: 3 h on Wednesday; this week so far: 1 h today minus a day -> keeps a comparison alive
      for (let d = 1; d <= 9; d++) {
        const s = day0 - d * 24 * H + 9 * H;
        entries.push({ id: 'e' + d, activityId: d % 2 ? 'study' : 'japanese', start: s, end: s + H, pausedMs: 0, note: '' });
      }
      const state = {
        v: 2,
        lastBackupAt: 0,
        activities: acts,
        entries,
        plan: [],
        active: active ? { activityId: 'study', start: day0 - 3 * H, pausedAt: null, pausedMs: 0, note: '' } : null, // yesterday 21:00
        settings: { dayStart: 420, dayEnd: 1380 },
      };
      localStorage.setItem('purrpose.v1', JSON.stringify(state));
      if (native) {
        // Mirrors the REAL Android bridge: isNativePlatform, nativePromise and addListener only.
        // (There is no registerPlugin: that lives in Capacitor's JS library, which this app does not load.)
        window.__calls = [];
        window.__handlers = {};
        const results = { Filesystem: { writeFile: { uri: 'file:///cache/backup.json' } } };
        window.__failShare = false;
        window.Capacitor = {
          isNativePlatform: () => true,
          nativePromise: (plugin, method, args) => {
            window.__calls.push({ plugin, method, args });
            if (plugin === 'Share' && window.__failShare && args.files) return Promise.reject({ message: 'FileProvider exploded' });
            return Promise.resolve(results[plugin]?.[method] ?? {});
          },
          addListener: (plugin, ev, cb) => {
            window.__handlers[ev] = cb;
            return { remove: async () => {} };
          },
        };
      }
    },
    { native, active }
  );
  await page.goto('http://localhost:5173/');
  await page.waitForSelector('.hero');
  return { page, ctx };
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('purrpose.v1')));

/* ---------- 1. a forgotten timer ---------- */
{
  const { page, ctx } = await open();
  const card = page.locator('.nudge', { hasText: 'Still going?' });
  check('Forgotten timer: "Still going?" card is shown', await card.isVisible());
  const txt = await card.textContent();
  check('Forgotten timer: offers to stop at the end of that day (23:00)', /Stop at 23:00/.test(txt) && /would save 2h/.test(txt), txt.replace(/\s+/g, ' ').slice(0, 150));
  check('Forgotten timer: backup reminder waits while this is showing', (await page.locator('.nudge', { hasText: 'Back up' }).count()) === 0);
  await page.screenshot({ path: `${SHOTS}/10-still-going.png`, fullPage: true });

  await page.click('[data-action=stale-keep]');
  check('Keep going hides the card', (await page.locator('.nudge', { hasText: 'Still going?' }).count()) === 0);
  const timerStillRunning = (await stored(page)).active !== null;
  check('Keep going leaves the timer running', timerStillRunning);

  // the backup reminder now shows, and "Later" is remembered across a reload
  check('Backup reminder appears (never backed up, has data)', await page.locator('.nudge', { hasText: 'Back up your data' }).isVisible());
  await page.screenshot({ path: `${SHOTS}/11-backup-reminder.png`, fullPage: true });
  await page.click('[data-action=backup-later]');
  await page.reload();
  await page.waitForSelector('.hero');
  await page.click('[data-action=stale-keep]');
  check('Backup "Later" is remembered after a reload', (await page.locator('.nudge', { hasText: 'Back up your data' }).count()) === 0);

  // stopping at the suggested time saves exactly 2 h, ending at 23:00 yesterday
  await page.reload();
  await page.waitForSelector('.hero');
  await page.click('[data-action=stale-stop][data-end]');
  const s = await stored(page);
  const last = s.entries[s.entries.length - 1];
  check('Stop at 23:00 saves 2 h ending at 23:00', s.active === null && last.end === startOfToday() - 1 * H && last.end - last.start === 2 * H, `${(last.end - last.start) / H} h`);
  check('Stopping offers Undo', await page.locator('#toast [data-action=undo]').isVisible());
  await page.click('#toast [data-action=undo]');
  check('Undo puts the running timer back', (await stored(page)).active !== null);
  await ctx.close();
}

/* ---------- 2. overlap warning, rest days, comparison, undo ---------- */
{
  const { page, ctx } = await open({ active: false });
  await page.click('nav [data-v=log]');
  await page.click('[data-action=add-entry]');
  const dayStr = await page.evaluate(() => {
    const d = new Date(Date.now() - 24 * 3600e3);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  await page.fill('.sheet [name=date]', dayStr);
  await page.fill('.sheet [name=start]', '09:30'); // yesterday already has 09:00-10:00
  await page.fill('.sheet [name=end]', '10:30');
  const before = (await stored(page)).entries.length;
  await page.click('.sheet button[type=submit]');
  const err = await page.textContent('.sheet [data-err]');
  check('Overlap: first Save warns and keeps the sheet open', /overlaps/.test(err) && (await page.isVisible('.sheet')) && (await stored(page)).entries.length === before, err.slice(0, 90));
  await page.screenshot({ path: `${SHOTS}/12-overlap.png` });
  await page.click('.sheet button[type=submit]');
  check('Overlap: Save again keeps both', (await stored(page)).entries.length === before + 1 && (await page.locator('.sheet').count()) === 0);

  // non-overlapping time saves straight away
  await page.click('[data-action=add-entry]');
  await page.fill('.sheet [name=date]', dayStr);
  await page.fill('.sheet [name=start]', '14:00');
  await page.fill('.sheet [name=end]', '14:30');
  await page.click('.sheet button[type=submit]');
  check('No overlap: saves on the first tap', (await stored(page)).entries.length === before + 2);

  // delete an entry, then undo
  await page.locator('[data-action=edit-entry]').first().click();
  await page.click('.sheet [data-action=delete-entry]');
  await page.click('.sheet [data-action=delete-entry]'); // second tap confirms
  const afterDelete = (await stored(page)).entries.length;
  check('Delete entry removes it', afterDelete === before + 1);
  await page.click('#toast [data-action=undo]');
  check('Delete entry can be undone', (await stored(page)).entries.length === before + 2);

  // rest days: Japanese habit on weekdays only
  await page.click('nav [data-v=stats]');
  await page.click('[data-action=edit-habit]');
  for (const v of ['5', '6']) await page.click(`.sheet .chip:has(input[value="${v}"])`);
  await page.click('.sheet button[type=submit]');
  const jp = (await stored(page)).activities.find((a) => a.id === 'japanese');
  check('Habit days are saved (Mon-Fri)', JSON.stringify(jp.goalDays) === '[0,1,2,3,4]', JSON.stringify(jp.goalDays));
  const habits = await page.locator('.card:has(h2:text-is("Habits"))').textContent();
  check('Habits show "of 5 days this week"', /of 5 days this week/.test(habits));

  // comparison with the previous period
  await page.click('[data-action=period][data-v=week]');
  const cmp = await page.locator('.compare').first().textContent();
  check('Stats week shows a comparison with last week', /vs last week at this point/.test(cmp), cmp.trim());
  await page.click('[data-action=period][data-v=month]');
  check('Stats month shows a comparison with last month', /vs last month/.test(await page.locator('.compare').first().textContent()));
  await page.screenshot({ path: `${SHOTS}/13-compare.png`, fullPage: true });

  // import is undoable
  await page.click('[data-action=settings]');
  await page.click('[data-action=import]');
  await page.fill('.sheet [name=json]', '{"activities":[{"id":"z","name":"Zed"}],"entries":[]}');
  const entriesBefore = (await stored(page)).entries.length;
  await page.click('.sheet button[type=submit]');
  check('Import replaced the data', (await stored(page)).entries.length === 0);
  await page.click('#toast [data-action=undo]');
  check('Import can be undone', (await stored(page)).entries.length === entriesBefore);
  await ctx.close();
}

/* ---------- 3. inside the Android app (mocked Capacitor) ---------- */
{
  const { page, ctx } = await open({ native: true, active: false });
  check('Native: Back handler was registered', await page.evaluate(() => typeof window.__handlers.backButton === 'function'));
  const back = () => page.evaluate(() => window.__handlers.backButton());

  await page.click('nav [data-v=stats]');
  await back();
  check('Back on Stats goes to Now', await page.isVisible('.hero'));
  await page.click('[data-action=settings]');
  await page.click('[data-action=export]');
  check('Native: export offers a file, not a browser download', (await page.locator('[data-action=download-export]').count()) === 0 && (await page.locator('[data-action=share-export]').count()) === 1);
  await back();
  check('Back closes an open sheet first', (await page.locator('.sheet').count()) === 0 && !(await page.isVisible('.hero')), 'still on settings');
  await back();
  check('Back from Settings goes to Now', await page.isVisible('.hero'));
  await back();
  check('Back on Now minimizes the app', await page.evaluate(() => window.__calls.some((c) => c.plugin === 'App' && c.method === 'minimizeApp')));

  await page.click('[data-action=settings]');
  await page.click('[data-action=export]');
  await page.click('[data-action=share-export]');
  await page.waitForTimeout(200);
  const calls = await page.evaluate(() => window.__calls);
  const w = calls.find((c) => c.method === 'writeFile');
  const sh = calls.find((c) => c.method === 'share');
  check('Native: backup is written as a .json file in the cache', !!w && w.plugin === 'Filesystem' && /^purrpose-backup-\d{4}-\d{2}-\d{2}\.json$/.test(w.args.path) && w.args.directory === 'CACHE' && JSON.parse(w.args.data).app === 'purrpose');
  check('Native: the file is handed to the share sheet', !!sh && sh.plugin === 'Share' && sh.args.files?.[0] === 'file:///cache/backup.json');
  check('Native: backup time is remembered', (await stored(page)).lastBackupAt > Date.now() - 10000);

  // if making/sharing the file fails, the text is shared instead and the reason is shown
  await page.evaluate(() => { window.__failShare = true; window.__calls.length = 0; });
  await page.click('[data-action=share-export]');
  await page.waitForTimeout(250);
  const calls2 = await page.evaluate(() => window.__calls.filter((c) => c.plugin === 'Share'));
  const toastTxt = await page.textContent('#toast');
  check('Native: a failed file share falls back to sharing the text', calls2.length === 2 && !!calls2[1].args.text && !calls2[1].args.files, JSON.stringify(calls2.map((c) => Object.keys(c.args))));
  check('Native: the toast says what went wrong', /FileProvider exploded/.test(toastTxt), toastTxt.slice(0, 100));
  await ctx.close();
}

await browser.close();
const bad = errors.filter((e) => !/favicon/.test(e));
check('No console errors', bad.length === 0, bad.join(' | ').slice(0, 200));
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join('; ')}` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
