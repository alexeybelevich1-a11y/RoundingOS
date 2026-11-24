# RoundingOS

Local-first hospitalist rounding workstation: census, checklists, tasks, consults, live progress note,
211 structured workup/management templates and 10 interactive clinical algorithms (Plan Builder),
I-PASS sign-out, alarms and voice dictation.
Plain HTML/CSS/JavaScript with no dependencies and no build step.

> **Test data only for now.** Patient data is saved **unencrypted** in the browser's on-device database.
> Do not enter real patient information until encrypted storage lands (phase 4 of the local-first plan).

## Install (Android first, then laptop and iPhone)
RoundingOS is a Progressive Web App served as static files from GitHub Pages:
**https://alexeybelevich1-a11y.github.io/RoundingOS/**. Once installed it opens and runs with no network.

- **Android (Chrome):** open the address, then RoundingOS's **⋯ → Install app…** (or Chrome's **⋮ → Install app**).
- **Laptop (Chrome / Edge):** the install icon at the right of the address bar, or **⋯ → Install app…**.
- **iPhone (Safari):** **Share → Add to Home Screen**. Safari has no install prompt, so the menu item shows these steps.

A fresh install starts with an **empty census**. ⋯ → **Add 14 test patients** loads the sample patients.

## Where data lives
- Only on the device, in the installed app's on-device database (IndexedDB, one record per patient; see
  `src/core/store.js`). The first start after the update moves older data out of `localStorage` and deletes the
  old copy only after checking the move. The web address serves code only;
  nothing is uploaded. The app's Content-Security-Policy blocks network requests to any other address.
- **Discharged patients:** Actions → *Discharged: move to archive* takes a patient off the census (the census
  filter's *Archive* option still shows them, and *Return to census* brings them back). Archived patients are
  deleted from the device after 30 days, including from saved copies. Both times are in ⋯ → Settings & backup.
  "Discharge today" never archives or deletes anyone.
- **Saved copies:** the app keeps the last 7 copies of all data (daily, and before an import, a restore or clearing
  the census). ⋯ → Settings & backup → *Saved copies…* lists them; you can restore one (with Undo) or delete it.
- Each device keeps its own data. The app asks the browser to keep its storage (`navigator.storage.persist()`).
  On iPhone, use the installed app, not a Safari tab, or Safari may clear the data after 7 days unused.
- **Voice is off by default.** Turning it on (⋯ → Voice input) shows a notice: browser speech recognition
  sends audio to Google/Apple/Microsoft. On-device voice is planned (phase 4).

## Backup and moving between devices
⋯ → **Settings & backup → Export encrypted (.rnos)**, then **Import backup…** on the other device.
Import shows a summary ("2 new, 5 updated, 1 kept local (newer)") and offers **Merge** (the newer copy of each
patient wins, and patients deleted on either device stay deleted) or **Replace everything**. Either one can be
undone from the toast; a copy of the data is kept before every import.
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
  core/       app.js (controller, loads last)  data.js  crypto.js  store.js  retention.js  transfer.js  pwa.js
  clinical/   calc.js (calculators)  algorithms.js  dotphrases.js (templates)
  features/   planbuilder.js  progressnote.js  exambuilder.js  physical-exam-builder.js  reminders.js  signout.js
  speech/     speech.js (dictation clean-up, voice commands)  voice-grammar.js  voice-audio.js  voice-worker.js (on-device voice, beta)
vendor/       dexie/  vosk-browser/  transformers/  VERSIONS.md
labs/         voice-bench.html (on-device voice test page, not part of the app)
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

### On-device voice test (beta)
`labs/voice-bench.html` checks whether on-device speech runs well enough on a device before it goes into the app:
Vosk for commands, Whisper or Moonshine for dictation. It shows load times, the delay for a command, and how long
a 30-second dictation takes, then gives a **Copy results** block. Models download once from Hugging Face
(Vosk's from the vosk-browser demo site) and the browser keeps them. Audio stays on the device. Use made-up phrases only.

- **Laptop:** `pnpm dev`, then open `http://localhost:8000/labs/voice-bench.html` in Chrome or Edge.
- **Android phone:** the mic only works on https or localhost. Either open
  `https://alexeybelevich1-a11y.github.io/RoundingOS/labs/voice-bench.html` once GitHub Pages is on, or plug the
  phone into the laptop with USB debugging on, run `pnpm dev`, open `chrome://inspect/#devices` on the laptop,
  turn on **Port forwarding** for `8000 → localhost:8000`, and open `http://localhost:8000/labs/voice-bench.html` in Chrome on the phone.

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

## Medical disclaimer
RoundingOS is a note-taking and organizing aid for clinicians. It is **not a medical device** and is not
cleared or approved by any regulator. It does not replace clinical judgment. Verify every calculator
result, score and threshold against the original source before acting on it. The software is provided
"as is", without warranty of any kind (see sections 15 and 16 of the license).

Until on-device encryption ships, data is stored unencrypted in the browser: **use test data only.**

## License
Copyright 2026 Alexey Belevich and RoundingOS contributors.

Licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (AGPL-3.0-only).
In short: you may use, change and share RoundingOS, but if you distribute it, or run a changed version
for other people over a network, you must make your source code available under the same license.
See [NOTICE](NOTICE) for attribution. Third-party code in `vendor/` keeps its own license
(Dexie.js is Apache-2.0); see [vendor/VERSIONS.md](vendor/VERSIONS.md).
