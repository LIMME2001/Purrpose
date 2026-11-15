# Changelog

## 1.2.0 (15 Nov 2026)
- Week in review: time, best day, where it went and habits. Offered on Now from Sunday 17:00 until Monday noon, and
  always available in Stats.
- The cat reacts: smiles when every habit due today is done, gets wider eyes, short turning beams and sparkles while you track a habit you already met, and wears a moon outside your waking day.
- Milestone cards at 10, 25, 50, 100 hours, then every 50 to 500, every 100 to 1000 and so on (not retroactive).

## 1.1.1 (15 Nov 2026)
- Fix: "Save or share file" and the Android Back button did nothing in the installed app, because the page called a
  Capacitor function that only exists with Capacitor's JavaScript library (this app does not load it). They now use the
  Android bridge directly.
- If making the backup file fails, the backup is shared as text instead, and the message says what went wrong.

## 1.1.0 (15 Nov 2026)
- Every build is signed with one permanent key, so updates install over the old app and keep your data.
  Moving from an older build needs one uninstall: export a backup first.
- Backup: Android share sheet writes a real .json file; a reminder appears after a week without one.
- Android Back closes a sheet, then returns to Now, then minimizes the app.
- "Still going?" card for a forgotten timer (stop at the end of the day, or where you paused).
- Overlap warning on manual entries; undo for deleting entries, blocks and activities, erasing, and importing.
- Habit days: rest days never break a streak; "3 of 5 days this week".
- Stats: comparison with the previous period; Year, All time and Range; hours-by-timespan table; archived activities.
- Plan: "Set my day" hours and a 24 h view.
- Readability: lighter secondary text (4.6:1), 44 px tap targets, stacked fields on narrow screens.
- The version number now lives in one place (package.json) and shows at the bottom of Settings.

## 1.0.0 (2 Nov 2026)
- First release: start/pause/stop timer, weekly plan, stats, habits, manual entries, JSON backup.
