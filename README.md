# Quiet Moon — a private period tracker

*Author: Vishal Gangaram*

An installable web app (PWA) for tracking periods on iPhone and Android.
Plain HTML, CSS and JavaScript with no build step, no dependencies, no accounts,
no server and no analytics.

## Privacy

- **Everything stays on your phone.** Entries are stored in IndexedDB, with
  localStorage as a fallback. The app has no code that sends data anywhere.
- **The browser enforces this.** A strict Content-Security-Policy
  (`default-src 'self'; connect-src 'self'`, no external origins) blocks any
  request to another site, even one added by mistake.
- **Nothing third-party.** No CDNs, web fonts, trackers or external scripts. The
  app uses your phone's own system font.
- **Optional 4-digit PIN.** Only a salted SHA-256 hash is stored, never the PIN.
  A 4-digit PIN keeps casual snoopers out, but it is not strong encryption.
  The app is also hidden from the app-switcher preview while a PIN is set, and
  it locks again after a minute in the background.
- **Delete all data** (Settings) erases every entry, setting and the PIN.

> Predictions are estimates, not medical advice. Do not use this app as
> contraception.

## Features

- **Today:** cycle day, current phase, and "next period in X days" (or "X days late").
- **Calendar** (weeks start on Monday): logged period, predicted period, fertile
  window and estimated ovulation. Tap any day to log it; swipe to change month.
- **Daily log:** flow (none, spotting, light, medium, heavy), 10 symptoms, mood and a note.
- **Period started** button that fills in your typical period length, plus
  **Period ended today** when it stops early.
- **Predictions:** the average of your last 6 cycles. Cycles shorter than 15 or
  longer than 60 days are ignored. Your default cycle and period lengths (28 and 5
  days unless you change them) are used until 2 cycles are logged.
  Ovulation is estimated at next period start − 14 days, and the fertile window
  runs from 5 days before ovulation to 1 day after.
- **History:** every period with its length and cycle length, plus averages.
- **Backup:** export to a `.json` file and import it again, choosing either
  *merge* (where a day is in both, the most recently edited version wins) or
  *replace*.
- Works fully offline after the first load. Supports light and dark mode.

## Files

```
index.html             app markup and CSP
css/styles.css         styles
js/app.js              UI and app logic
js/cycle.js            cycle maths (pure functions)
js/db.js               on-device storage (IndexedDB, localStorage fallback)
sw.js                  service worker (offline cache)
manifest.webmanifest   install metadata
icons/                 app icons, including apple-touch-icon
_headers               extra security headers (Netlify only)
```

## Run locally

PWAs need `https://` or `localhost`:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Deploy (free, HTTPS)

### Option A: GitHub Pages

1. Push these files to a GitHub repository, with `index.html` at the repository root.
2. Open the repository on GitHub and go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*,
   choose your branch (e.g. `main`) and the `/ (root)` folder, then click **Save**.
4. After a minute or so, the app is live at `https://<your-username>.github.io/<repo-name>/`.

All paths are relative, so the app works from a sub-folder like this.

### Option B: Netlify

1. Sign in at https://app.netlify.com and choose **Add new site → Deploy manually**.
2. Drag the project folder onto the page.
   Alternatively, use **Import from Git**, pick the repository, leave the build
   command empty and set the publish directory to `/`.
3. Netlify gives you an `https://….netlify.app` address. The `_headers` file adds
   the CSP as a real HTTP header there too.

### Publishing updates

Change `CACHE_VERSION` in `sw.js` (for example `cycle-v1.0.1`) whenever you
change any file. Phones download the new version the next time the app is
opened online, and use it from the launch after that.

## Add to Home Screen

**iPhone (Safari):**
1. Open the app's URL in **Safari**. Other browsers on older iOS versions cannot install web apps.
2. Tap the **Share** button (the square with an up arrow).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open Quiet Moon from the new home-screen icon. It runs full-screen and offline.

**Android (Chrome):**
1. Open the app's URL in **Chrome**.
2. Tap **Install app** if the prompt appears. Otherwise open the **⋮** menu and choose
   **Install app** (or **Add to Home screen**).
3. Confirm. Quiet Moon then appears in your app drawer and on your home screen.

> Data stored by the home-screen app is separate from data in a normal browser tab.
> Log your entries in the installed app.

## Moving to a new phone

1. Old phone: **Settings → Export**. On a phone this opens the share sheet, so you
   can save the file to Files, iCloud Drive or Google Drive, or AirDrop it.
2. New phone: install the app, then go to **Settings → Import**, pick the file and
   choose **Replace**.

The backup is a plain, unencrypted JSON file, so store it somewhere you trust.
It does not include your PIN.
