# RoundingOS

Local-first hospitalist rounding workstation: census, checklists, tasks, consults, live progress note,
211 structured workup/management templates and 10 interactive clinical algorithms (Plan Builder),
I-PASS sign-out, alarms and voice dictation.
Plain HTML/CSS/JavaScript with no dependencies and no build step.

> **Test data only for now.** Patient data is saved **unencrypted** in browser storage.
> Do not enter real patient information until encrypted storage lands (phase 3 of the local-first plan).

## Install (Android first, then laptop and iPhone)
RoundingOS is a Progressive Web App served as static files from GitHub Pages:
**https://alexeybelevich1-a11y.github.io/RoundingOS/**. Once installed it opens and runs with no network.

- **Android (Chrome):** open the address, then RoundingOS's **⋯ → Install app…** (or Chrome's **⋮ → Install app**).
- **Laptop (Chrome / Edge):** the install icon at the right of the address bar, or **⋯ → Install app…**.
- **iPhone (Safari):** **Share → Add to Home Screen**. Safari has no install prompt, so the menu item shows these steps.

A fresh install starts with an **empty census**. ⋯ → **Add 14 test patients** loads the sample patients.

## Where data lives
- Only on the device, in the installed app's browser storage (`localStorage`). The web address serves code only;
  nothing is uploaded. The app's Content-Security-Policy blocks network requests to any other address.
- Each device keeps its own data. The app asks the browser to keep its storage (`navigator.storage.persist()`).
  On iPhone, use the installed app, not a Safari tab, or Safari may clear the data after 7 days unused.
- **Voice is off by default.** Turning it on (⋯ → Voice input) shows a notice: browser speech recognition
  sends audio to Google/Apple/Microsoft. On-device voice is planned (phase 4).

## Backup and moving between devices
⋯ → **Settings & backup → Export encrypted (.rnos)**, then **Import backup…** on the other device.
Import replaces the whole census after a confirm (a merging import comes with encrypted storage).
Moving from the old `localhost`/`file://` app works the same way: export there, import in the installed app.
Afterwards delete any old plain-text `data/` folder and `backup-*.json` files.

## Where things are

```
index.html                  the app page (all markup); loads the scripts below in order
physical-exam-builder.html  standalone preview of the exam builder
manifest.json  sw.js        PWA manifest and service worker (must stay at the root)
styles/styles.css           all styles (light, dark, sepia)
icons/                      app icons
src/
  core/       app.js (controller, loads last)  data.js  crypto.js  pwa.js
  clinical/   calc.js (calculators)  algorithms.js  dotphrases.js (templates)
  features/   planbuilder.js  progressnote.js  exambuilder.js  physical-exam-builder.js  reminders.js  signout.js
  speech/     speech.js (dictation clean-up, voice commands)
tests/        index.html  harness.js  *.test.js  ui-baseline/
scripts/      serve.mjs (pnpm dev)  test.mjs (pnpm test)
docs/         architecture.md  plan.md
```

## Develop
Needs Node 20+ and pnpm (`corepack enable` sets up the pinned pnpm version). pnpm is dev tooling only:
the app has no build step and no runtime npm packages, and GitHub Pages serves the files as they are.

```sh
pnpm install   # once: installs Playwright for the tests
pnpm dev       # serves the repo at http://localhost:8000/ (another port: pnpm dev --port 9000)
pnpm test      # runs tests/index.html in headless Chromium; fails if any test fails
```

The first time, `pnpm exec playwright install chromium` downloads the test browser.
(A `file://` page can't use the service worker, encryption or the mic, so use `pnpm dev`.)
With `pnpm dev` running you can also open `http://localhost:8000/tests/index.html` to see the tests in a browser.

### Releasing a change
Bump `CACHE_VERSION` in `sw.js` with every release, and add any new app file to `APP_FILES` there.
Installed copies download the new version in the background and show **Update available**; they reload only when you tap it.

## Privacy
**`data/` and backup files are git-ignored. Never commit patient data.**
The sample patients in `src/core/data.js` are fictional test data.

Fast abnormal physical exam documentation: **Quick exam** beside the exam field opens the Physical Exam
Quick-Builder — 8 systems, ~150 findings, 31 condition presets with search. `physical-exam-builder.html`
is a standalone preview of it.

See `CHANGES.md` for the latest changes.
