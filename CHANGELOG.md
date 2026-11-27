# Quiet Moon — changelog

*Author: Vishal Gangaram*

## v1.6.2

- Android status-bar notification icon now shows the white moon and droplet
  instead of a plain square (Android draws only the shape of this small icon).

## v1.6.1

- **Send test notification** button (Settings → Reminders) shows one
  notification immediately, to check notifications work on your phone.
- **Notification check**: shows the browser, whether the app was opened as the
  installed app, whether notifications are allowed, whether background
  reminders are supported, and whether the daily check is scheduled.
- The notification time can be chosen while phone notifications are off.
- If phone notifications can't turn on, the reason stays visible under the
  switch (e.g. install first, or notifications blocked) instead of vanishing.

## v1.6.0

### Reminders (built, not yet pushed)
- **Reminder cards on Today** when you open the app, each with a quick action
  and a dismiss button:
  - Period coming up (1, 2, 3 or 5 days before; counts down each day)
  - Period due today
  - Period late (after 1, 3 or 7 days; stays until a period is logged)
  - Fertile window (on the day, or the day before)
  - Ovulation day (off by default)
  - PMS heads-up, using the symptom you usually log before your period (off by default)
  - Daily log reminder during a period, at a time you choose; skipped once
    you've logged that day (days pre-filled by "Period started" don't count)
- **Settings → Reminders:** master switch, a switch and timing option for each.
- **Phone notifications (Android, installed app):** optional; the phone checks
  about once a day and shows due reminders. Discreet text by default
  ("Quiet Moon reminder"). Everything runs on the phone — no server, nothing
  written to any calendar or account.
- **iPhone:** phone notifications aren't possible for a private web app; the
  app explains this and shows reminders on Today instead.
- Off switches now look clearly off (neutral grey).

## v1.5.0 (pushed)

### Done in the app (tested, not yet pushed)

**PIN screen**
- The big Quiet Moon silhouette (copper moon, pink droplet) now fills the top
  of the PIN screen, replacing the old drawn droplet.
- "Quiet Moon" is the heading, with "Enter your PIN to unlock" beneath it.
  Wrong-PIN messages appear in that line.
- On short phones the moon and keypad shrink slightly so everything fits.

**When the PIN is asked**
- The PIN is asked when the app is opened, not when the page is refreshed.
- After more than a minute in the background the app locks again. A quick
  switch away and back does not.
- Setting a new PIN does not lock you out of the session you are in.

**Calendar legend**
- Grouped and ordered: **Flow** (Heavy, Medium, Light, Spotting),
  **Predictions** (Predicted period, Fertile window, Ovulation),
  **Logged** (Symptoms, Mood).
- "Notes" removed from the legend. The purple dot now means symptoms only;
  a day with only a note shows no dot (the note is still there when you tap
  the day or open the cycle in Insights).

**Insights: day by day**
- Each logged day in a cycle shows coloured tags on its top line: flow (red),
  each symptom (purple) and the mood (yellow), matching the calendar dots.
- The day's note appears underneath, in full.
- The separate Notes section is removed; each note now shows only under its day.
- Mood tags read as yellow in dark mode too.

**Today → Calendar**
- The Period, Fertile and Ovulation tiles (now with a small arrow) open the
  calendar on that month and briefly highlight the day(s).
- Tapping the cycle ring opens the calendar on today.

**Calendar legend explanations**
- Tap the "Flow" or "Predictions" heading (ⓘ) to show a short explanation of
  what it means; tap again to hide it.

**Insights: cycle length chart**
- Tap the **Cycle avg.** tile to see your last 12 cycles as a line, a dashed
  line at your average, the shortest and longest labelled, and a one-line
  summary of how regular you are.
- Tap any point for that cycle's dates and length. "Show as a list" gives the
  numbers as a table.
- Period-length and symptom/mood charts were mocked up and set aside for later.

**Other**
- Offline cache bumped to v1.5.0 so installed phones pick up the update.

### Approved design, not yet built into the app

**Warm Spring colour palette**
- Light mode: **white page**, white cards with a soft Oat Milk edge, Warm Navy
  text, Cinnamon buttons and active tab.
- Flow: Cherise (heavy), Cantaloupe (medium), pale Papaya (light), dashed ring
  (spotting). Medium changed from Papaya to Cantaloupe so heavy and medium are
  easy to tell apart, including for colour-blind readers.
- Fertility: Seaglass tint (fertile window), Teal (ovulation).
- Dots: Orchid (symptoms), Sunflower (mood).
- PIN screen moon: Honey, with a Papaya droplet.
- Dark mode: warm navy background, Cream text, Cantaloupe buttons;
  Coral / Cinnamon / deep tint for heavy / medium / light flow;
  Seaglass, Lilac and Sunshine accents; Camel moon.
- Open question: whether the app icon should change to match
  (e.g. Warm Navy tile, Honey moon, Papaya droplet).

## v1.4.0 — redesign

- Warm terracotta and alabaster look, bordered cards, matching dark mode.
- Bundled Plus Jakarta Sans and Inter fonts (no outside requests).
- Today: cycle ring, quick chips (+ Flow, + Mood, + Symptoms),
  "+" logs another day from a tap-to-pick calendar.
- Three tabs (Today, Calendar, Insights); Settings from the gear button.
- Calendar: separate colours for heavy, medium and light flow; larger
  symptom (purple) and mood (yellow) dots.
- Insights: tap a cycle for its flow chart, symptom and mood counts, notes and
  day-by-day log.
- New app icon "The Nest" (copper crescent and pink droplet on plum).

## v1.3.0 and earlier

- Renamed the app to Quiet Moon.
- Appearance setting: Auto, Light or Dark.
- UI polish: cycle map ring, phase colours, history bars.
- First release: private, offline period tracker with predictions, calendar,
  daily log, history, PIN lock, backup and delete-all.
