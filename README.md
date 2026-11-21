# RoundingOS

Local-first hospitalist rounding workstation: census, checklists, tasks, consults, live progress note,
193 structured workup/management templates (Plan Builder), I-PASS sign-out, alarms and voice dictation.
Plain HTML/CSS/JavaScript with no dependencies.

## Run (Windows)
Double-click `Start-Hospitalist-Tracker.bat`. It starts a small local server (`server.ps1`) and opens
`http://localhost:8765`. Running on localhost enables the microphone and saves to `data/hospitalist-data.json`.

## Privacy
All patient data stays on the device: in browser storage, plus `data/` when started with the launcher.
**`data/` and backup files are git-ignored. Never commit patient data.**
The sample patients in `data.js` are fictional test data.

See `CHANGES.md` for the latest changes.
