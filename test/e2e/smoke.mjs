import { chromium } from 'playwright';

const SHOTS = new URL('./shots', import.meta.url).pathname;
const failures = [];
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failures.push(name);
};

import { mkdirSync } from 'node:fs';
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  timezoneId: 'Europe/Stockholm',
  locale: 'en-GB',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));

// Seed a realistic week of data, with a timer already running for 25 minutes.
await page.addInitScript(() => {
  if (localStorage.getItem('purrpose.v1')) return;
  const MIN = 60000;
  const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const now = Date.now();
  const entries = [];
  const mk = (day, act, h1, m1, mins, note = '') => {
    const s = new Date(day); s.setHours(h1, m1, 0, 0);
    entries.push({ id: Math.random().toString(36).slice(2), activityId: act, start: s.getTime(), end: s.getTime() + mins * MIN, pausedMs: 0, note });
  };
  for (let i = 6; i >= 0; i--) {
    const day = sod(now) - i * 86400000 + 3600000;
    const dow = (new Date(day).getDay() + 6) % 7;
    if (dow < 5) mk(day, 'study', 9, 0, 120 + (i % 3) * 30, i === 0 ? 'Linear algebra' : '');
    mk(day, 'japanese', 12, 30, i % 2 ? 25 : 40);
    mk(day, 'walking', 17, 0, 35 + (i % 4) * 5);
    if (dow % 2 === 0) mk(day, 'workout', 18, 0, 55);
  }
  const plan = [];
  const pb = (act, days, s, e) => plan.push({ id: Math.random().toString(36).slice(2), activityId: act, days, start: s, end: e });
  pb('study', [0, 1, 2, 3, 4], 9 * 60, 11 * 60 + 30);
  pb('japanese', [0, 1, 2, 3, 4, 5, 6], 12 * 60 + 30, 13 * 60);
  pb('walking', [0, 1, 2, 3, 4, 5, 6], 17 * 60, 17 * 60 + 45);
  pb('workout', [0, 2, 4], 18 * 60, 19 * 60);
  localStorage.setItem('purrpose.v1', JSON.stringify({ v: 1, entries, plan, active: { activityId: 'study', start: now - 25 * MIN, pausedAt: null, pausedMs: 0, note: '' } }));
});

await page.goto('http://localhost:5173/');
await page.waitForSelector('.hero');
await page.evaluate(() => document.fonts.ready);

// ---- Now screen, running
check('Now: shows running activity', (await page.textContent('.hero-activity')).includes('Study'));
const t1 = await page.textContent('[data-timer]');
check('Now: timer starts near 25 minutes', /^2[45]:\d\d$/.test(t1), t1);
await page.waitForTimeout(2300);
const t2 = await page.textContent('[data-timer]');
check('Now: timer ticks live', t1 !== t2, `${t1} -> ${t2}`);
await page.screenshot({ path: `${SHOTS}/01-now-running.png`, fullPage: true });

// ---- Pause freezes the clock
await page.click('[data-action=pause]');
const p1 = await page.textContent('[data-timer]');
await page.waitForTimeout(2200);
const p2 = await page.textContent('[data-timer]');
check('Pause: timer frozen', p1 === p2, `${p1} / ${p2}`);
check('Pause: cat is resting', (await page.getAttribute('.cat', 'data-mode')) === 'paused');
check('Pause: button turns into Resume', await page.isVisible('[data-action=resume]'));
await page.screenshot({ path: `${SHOTS}/02-now-paused.png` });
await page.click('[data-action=resume]');
check('Resume: cat is awake again', (await page.getAttribute('.cat', 'data-mode')) === 'awake');

// ---- Switching activities saves the previous one and offers undo
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('purrpose.v1')).entries.length);
await page.click('.act[data-id=japanese]');
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('purrpose.v1')).entries.length);
check('Switch: previous activity saved as an entry', after === before + 1, `${before} -> ${after}`);
check('Switch: toast with undo', await page.isVisible('#toast [data-action=undo]'));
check('Switch: now running Japanese', (await page.textContent('.hero-activity')).includes('Japanese'));
await page.click('#toast [data-action=undo]');
check('Undo: restores previous state', (await page.textContent('.hero-activity')).includes('Study'));

// ---- A tap that is stopped immediately is discarded
await page.click('.act[data-id=walking]');
await page.click('[data-action=stop]');
const afterQuick = await page.evaluate(() => JSON.parse(localStorage.getItem('purrpose.v1')).entries.length);
check('Stop: sub-10s accidental timer is discarded', afterQuick === before + 1, `entries ${afterQuick} (expected ${before + 1}: the switch saved Study, the instant Walking was discarded)`);
check('Stop: cat falls asleep', (await page.getAttribute('.cat', 'data-mode')) === 'sleep');
await page.screenshot({ path: `${SHOTS}/03-now-idle.png`, fullPage: true });

// ---- Persisted across reload
await page.click('.act[data-id=japanese]');
await page.reload();
await page.waitForSelector('.hero');
check('Reload: running timer survives', (await page.textContent('.hero-activity')).includes('Japanese'));
await page.click('[data-action=stop]');

// ---- Plan
await page.click('nav [data-v=plan]');
await page.waitForSelector('.tl');
const nBlocks = await page.locator('.tl-lane').first().locator('.tl-block').count();
check('Plan: shows blocks for the selected day', nBlocks >= 2, `${nBlocks} blocks`);
await page.screenshot({ path: `${SHOTS}/04-plan.png`, fullPage: true });

await page.click('[data-action=add-block]');
await page.waitForSelector('.sheet');
await page.selectOption('[name=activity]', 'workout');
await page.fill('[name=start]', '20:00');
await page.fill('[name=end]', '19:00');
await page.click('.sheet button[type=submit]');
check('Block: rejects end before start', (await page.textContent('.sheet [data-err]')).includes('End must be after start'));
await page.fill('[name=end]', '20:45');
await page.screenshot({ path: `${SHOTS}/05-sheet-block.png` });
await page.click('.sheet button[type=submit]');
await page.waitForSelector('.sheet', { state: 'detached' });
check('Block: saved and rendered', (await page.locator('.tl-lane').first().locator('.tl-block').count()) === nBlocks + 1);

// edit then delete with two-step confirm
await page.locator('.tl-lane').first().locator('.tl-block', { hasText: '20:00' }).click();
await page.waitForSelector('.sheet');
await page.click('[data-action=delete-block]');
check('Delete: first tap only arms the button', await page.isVisible('.sheet'));
await page.click('[data-action=delete-block]');
await page.waitForSelector('.sheet', { state: 'detached' });
check('Delete: second tap removes the block', (await page.locator('.tl-lane').first().locator('.tl-block').count()) === nBlocks);

// copy day
await page.click('[data-action=copy-day]');
await page.waitForSelector('.sheet');
await page.check('.sheet [name=day][value="5"]');
await page.click('.sheet button[type=submit]');
await page.waitForSelector('.sheet', { state: 'detached' });
await page.click('.days button:nth-child(6)');
check('Copy day: Saturday received the blocks', (await page.locator('.tl-lane').first().locator('.tl-block').count()) >= 3);

// ---- Stats
await page.click('nav [data-v=stats]');
await page.waitForSelector('.donut');
check('Stats day: donut rendered', await page.isVisible('.donut svg'));
await page.screenshot({ path: `${SHOTS}/06-stats-day.png`, fullPage: true });
await page.click('[data-action=period][data-v=week]');
check('Stats week: per-day chart appears', await page.isVisible('.chart svg'));
await page.screenshot({ path: `${SHOTS}/07-stats-week.png`, fullPage: true });
await page.click('[data-action=mode][data-v=group]');
const legend = await page.locator('.legend .lg').allTextContents();
check('Stats: group mode merges Walking+Workout into Movement', legend.some((t) => t.includes('Movement')), legend.join(' | '));
await page.click('[data-action=period][data-v=month]');
check('Stats month renders', await page.isVisible('.chart svg'));

// ---- Log
await page.click('nav [data-v=log]');
await page.waitForSelector('.card .li');
await page.screenshot({ path: `${SHOTS}/08-log.png`, fullPage: true });
await page.click('[data-action=add-entry]');
await page.waitForSelector('.sheet');
await page.selectOption('[name=activity]', 'rest');
await page.fill('[name=start]', '00:05');
await page.fill('[name=end]', '00:35');
const todayCountBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('purrpose.v1')).entries.length);
await page.click('.sheet button[type=submit]');
await page.waitForSelector('.sheet', { state: 'detached' });
const todayCountAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('purrpose.v1')).entries.length);
check('Log: past entry added', todayCountAfter === todayCountBefore + 1);
check('Log: future end time is rejected', await (async () => {
  await page.click('[data-action=add-entry]');
  await page.waitForSelector('.sheet');
  await page.fill('[name=start]', '10:00');
  await page.fill('[name=end]', '10:00');
  // same start and end becomes a 24h entry that ends in the future/tomorrow -> must error
  await page.click('.sheet button[type=submit]');
  const msg = await page.textContent('.sheet [data-err]');
  await page.click('.sheet [data-action=sheet-close]');
  return msg.length > 0;
})());

// ---- Settings: new activity, backup roundtrip, erase
await page.click('[data-action=settings]');
await page.waitForSelector('text=Waking day');
await page.screenshot({ path: `${SHOTS}/09-settings.png`, fullPage: true });
await page.click('.card [data-action=add-activity]');
await page.waitForSelector('.sheet');
await page.fill('[name=name]', 'TSBK07 lectures');
await page.click('.emoji-row button:first-child');
await page.fill('[name=group]', 'Study');
await page.fill('[name=goal]', '45');
await page.screenshot({ path: `${SHOTS}/10-sheet-activity.png` });
await page.click('.sheet button[type=submit]');
await page.waitForSelector('.sheet', { state: 'detached' });
const names = await page.evaluate(() => JSON.parse(localStorage.getItem('purrpose.v1')).activities.map((a) => a.name));
check('Settings: new activity saved', names.includes('TSBK07 lectures'));

await page.click('[data-action=export]');
await page.waitForSelector('.sheet textarea');
const backup = await page.inputValue('.sheet textarea');
check('Export: valid JSON backup', (() => { try { return JSON.parse(backup).entries.length > 10; } catch { return false; } })());
await page.click('.sheet [data-action=sheet-close]');

// erase everything, then import the backup back
await page.click('[data-action=erase]');
await page.click('[data-action=erase]');
const erased = await page.evaluate(() => JSON.parse(localStorage.getItem('purrpose.v1')).entries.length);
check('Erase: data cleared', erased === 0);
await page.click('[data-action=import]');
await page.waitForSelector('.sheet textarea');
await page.fill('.sheet textarea', 'not json');
await page.click('.sheet button[type=submit]');
check('Import: bad text shows a clear error', (await page.textContent('.sheet [data-err]')).includes('not valid JSON'));
await page.fill('.sheet textarea', backup);
await page.click('.sheet button[type=submit]');
await page.waitForSelector('.sheet', { state: 'detached' });
const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('purrpose.v1')).activities.map((a) => a.name));
check('Import: backup restored', restored.includes('TSBK07 lectures'));

// ---- Layout sanity on a very small phone and desktop width
for (const [w, h, name] of [[320, 640, 'small'], [1100, 800, 'desktop']]) {
  await page.setViewportSize({ width: w, height: h });
  await page.click('nav [data-v=now]').catch(() => page.click('[data-action=tab][data-v=now]'));
  await page.waitForSelector('.hero');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check(`Layout ${name}: no horizontal scroll`, !overflow);
}
await page.setViewportSize({ width: 390, height: 844 });

check('No console or page errors', errors.length === 0, errors.join(' || '));
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join('; ')}` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
