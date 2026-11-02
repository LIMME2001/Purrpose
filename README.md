# Purrpose

A sleek, cat-themed time tracker for Android. Plan your day, tap to say what you are doing *from now*, and see where your time really goes.

Tracking has a cat face: it sleeps when nothing is running, opens its eyes (in the color of the activity) while you work, and goes half-lidded when you pause.

## What it does

- **Track on the go.** Tap an activity to start from now. Pause, resume or stop. Starting another activity stops the previous one, and every stop or switch has an undo. Forgot to start? Change the start time ("15 min ago").
- **Plan your week.** Build a weekly schedule of blocks (activity, days, start, end), copy a day to other days, and see your plan side by side with what actually happened, with a live "now" line.
- **See your reality.** Stats per day, week and month: time per activity or per group (for example several courses under *Study*), a per-day chart, plan vs reality, the unaccounted part of your waking day, and plain-language insights.
- **Build habits.** Give an activity a daily goal (for example Japanese 30 min) to get streaks.
- **Your data stays on the phone.** Everything is stored locally. Export and import a JSON backup from Settings.

Walking is tracked as time like every other activity. Step counting is not built in yet (see Ideas).

## Run it in a browser

```
npm install
npm run dev        # http://localhost:5173
```

## Tests

```
npm test           # unit tests for the logic in www/js/core.js (timer, pauses, stats, streaks, plan)
npm run test:e2e   # browser smoke test; needs `npm i -D playwright && npx playwright install chromium`
                   # and `npm run dev` running in another terminal
```

## Build the Android app

The app is plain HTML/CSS/JS in `www/`, wrapped as a native Android app with [Capacitor](https://capacitorjs.com). The `android/` folder is the generated Android Studio project.

**With Android Studio** (needs the Android SDK and JDK 21):

```
npm install
npm run sync       # copies www/ into the Android project
npm run android    # opens Android Studio; press Run with your phone connected
```

**Debug APK from the command line:** `npm run build:apk`, then find `android/app/build/outputs/apk/debug/app-debug.apk` and install it on your phone.

**On GitLab:** `.gitlab-ci.yml` runs the tests and builds the debug APK as a pipeline artifact. Note that this pipeline was written without being able to run it, so expect to adjust it if the first run fails.

After changing anything in `www/`, run `npm run sync` again before building.

Things to check on the first real device run: the system bars and safe areas (the CSS uses `env(safe-area-inset-*)`), the launcher icon, and that the timer keeps its time after the app is closed and reopened (it is stored as timestamps, so it should).

## GitLab repository

```
glab auth login
glab repo create purrpose --private
git push -u origin main
```

If `glab repo create` does not add the remote itself, add it with `git remote add origin <url>` first. Install `glab` from https://gitlab.com/gitlab-org/cli.

## Project layout

```
www/                 the app (no build step)
  index.html
  css/app.css        design tokens and styles
  js/core.js         pure logic: timer, aggregation, plan, streaks, insights (unit-tested)
  js/store.js        localStorage persistence, backup import/export
  js/views.js        Now, Plan, Stats, Log and Settings screens
  js/sheets.js       bottom-sheet editors (activity, block, entry, ...)
  js/cat.js          the cat and logo
  js/charts.js       donut and stacked-bar charts (inline SVG)
  js/app.js          wiring: events, rendering, live tick
android/             Capacitor Android project
test/                unit tests and the browser smoke test
```

## Ideas for later

- A persistent notification with Pause/Stop while a timer runs (Capacitor local notifications or a small native plugin).
- Step counting via Health Connect for walking.
- Schedule reminders ("Study starts in 5 minutes").
- A home-screen widget to start your most-used activity.
- A calendar import for fixed lecture times.

## Credits

Typeface: Bricolage Grotesque (SIL Open Font License 1.1, see `www/fonts/`).
