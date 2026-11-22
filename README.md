# RoundingOS

Local-first hospitalist rounding workstation: census, checklists, tasks, consults, live progress note,
211 structured workup/management templates and 10 interactive clinical algorithms (Plan Builder),
I-PASS sign-out, alarms and voice dictation.
Plain HTML/CSS/JavaScript with no dependencies.

## Run (Windows)
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
