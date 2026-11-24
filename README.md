# RoundingOS

Local-first hospitalist rounding workstation: census, checklists, tasks, consults, live progress note,
211 structured workup/management templates and 10 interactive clinical algorithms (Plan Builder),
I-PASS sign-out, alarms and voice dictation.
Plain HTML/CSS/JavaScript with no dependencies.

> **Test data only for now.** Patient data is still saved unencrypted in browser storage.
> Do not enter real patient information until encrypted storage (phase 1 of the local-first plan) lands.

## Install as an app (Android, laptop, iPhone)
RoundingOS is a Progressive Web App. It is served as static files from GitHub Pages
(`https://alexeybelevich1-a11y.github.io/RoundingOS/`), and once installed it opens and runs with no network.
The web address only serves the code. Patient data stays in each device's own browser storage and is never uploaded.

- **Android (Chrome):** open the address, then menu **⋮ → Install app** (or the app's own menu **⋯ → Install app…**).
- **Laptop (Chrome / Edge):** the install icon at the right of the address bar, or **⋯ → Install app…** in RoundingOS.
- **iPhone (Safari):** **Share → Add to Home Screen**. Safari has no install prompt, so the menu item shows these steps.

Each device keeps its own data. Use **Settings & backup → Export encrypted** to move a census between devices
(import currently replaces the census; a merging import is planned).

### Releasing a change
Bump `CACHE_VERSION` in `sw.js` with every release, and add any new app file to `APP_FILES` there.
Installed copies download the new version in the background and show **Update available**; they reload only when you tap it.

## Run (Windows, old local launcher)
Double-click `Start-Hospitalist-Tracker.bat`. It starts a small local server (`server.ps1`) and opens
`http://localhost:8765`. Running on localhost enables the microphone and saves to `data/hospitalist-data.json`.

## Privacy
All patient data stays on the device: in browser storage, plus `data/` when started with the launcher.
**`data/` and backup files are git-ignored. Never commit patient data.**
The sample patients in `data.js` are fictional test data.

Fast abnormal physical exam documentation: **Quick exam** beside the exam field opens the Physical Exam
Quick-Builder — 8 systems, ~150 findings, 31 condition presets with search. `physical-exam-builder.html`
is a standalone preview that runs on its own.

See `CHANGES.md` for the latest changes.
