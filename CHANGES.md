# RoundingOS — changes from the review (2026-11-20)

Drop these files over your current ones. `dotphrases.js` is your own file, included unchanged (193 templates, 12 SmartLists).
`Start-Hospitalist-Tracker.bat` and `manifest.json` are unchanged too.

Files: `dotphrases.js` (yours, unchanged), `index.html`, `styles.css`, `app.js`, `data.js`, `progressnote.js`, `planbuilder.js`,
`reminders.js`, `signout.js`, `speech.js`, `server.ps1` (`crypto.js` unchanged, included for completeness).

Saved data migrates automatically: the legacy `weights` checklist key becomes `bm`, and the UI state is reset to the new layout once.

## Safety & data fixes
- **C1** No normal exam or "imaging: none new" is ever inserted unless you click *Insert normal exam*; blanks stay `***`.
- **C2** Unknown allergies show as amber **"Allergies not recorded"** everywhere (banner, note, sign-out); NKDA only when entered. New patients no longer default to 65 M: age, sex and code status are required.
- **C3** Hand edits to the note are kept as a per-patient draft ("Hand-edited — Rebuild from chart"); nothing re-renders over them.
- **C4** Progress Note Studio modal removed (its features are now in the note panel). Plan Builder A&P list is per patient, and the builder shows "Writing for Rm …" in that patient's acuity color.
- **C5** New-day rollover clears subjective, exam, last BM and note drafts, and moves yesterday's vitals, labs, I&O, weight and imaging to placeholder hints ("Yesterday: …"). It warns if you already rolled over today.
- **C6** Calculators only pre-fill from the chart. Missing inputs show "Enter X to calculate" and Apply is disabled.
- **C7** A patient who is done for today (all 12 checks, including Seen and Note) gets a solid green card. The acuity stripe keeps its color and the tag becomes a white chip, so a finished sick patient still reads as sick.

## Functional fixes
- **Alarms:** Esc snoozes 15 min instead of silently killing all later alarms. Clicking the backdrop no longer dismisses. Snoozing one alarm no longer closes another. Alarms that rang before a reload ring again. Alarms re-check when the tab becomes visible. Removing a patient unlinks their alarms.
- **Voice:** acuity commands are anchored and parsed last ("set dispo discharge to SNF" now sets dispo). Name matching is by whole or start of word. Acuity changes show an **Undo** toast.
- **Dictation:** "colon"/"period" after anatomy (sigmoid colon, refractory period) stay as words. "as part of" no longer becomes "aspart". "dig" only becomes digoxin before level/toxicity/number. Number fields keep decimals. "patient is a…" no longer becomes the name "Is".
- **Calculators:** delta-delta labels HAGMA + met alk correctly. The 24 h Na cap uses corrected Na when glucose > 200. CHA2DS2-VASc no longer counts venous VTE as stroke.
- `.GB` trigger expansion honors a custom prefix.
- **Import:** backup import asks before replacing, with counts, and keeps a one-time snapshot (`roundingos_pre_import_snapshot` in localStorage). Plan Builder import merges instead of replacing.
- **Backup:** the passphrase uses a masked dialog with confirmation and at least 10 characters. Unencrypted export warns first.
- **Print / tabs / misc:** dark-mode printing uses the light palette. Sign-out plain-text edits warn before a rebuild. A second open tab reloads instead of overwriting. Duplicate room numbers warn. Downloads no longer revoke too early. Guideline links are https only.

## Server (server.ps1) — not run here (no PowerShell available); please test once
- 403 unless `Host` is localhost/127.0.0.1 on the active port (blocks DNS rebinding).
- `/api/data` requires the `X-RoundingOS: 1` header, a same-origin `Origin`, and `application/json` on POST (blocks cross-site writes).
- POST bodies must parse as JSON with a `patients` field.
- Atomic write (temp file, then move) plus hourly backups `data/backup-YYYYMMDD-HH.json` (last 24 kept).
- Path check uses a trailing separator, and `/data/` is never served as a static file.

## Layout
- **Header:** menu, name, a census summary (each number filters), clock/alarms, Sign-out and a ⋯ menu (Plan Builder, voice, layout toggles, dark mode, new day, settings, test data).
- **Census:** search + Add, filter and sort dropdowns, 2-line cards (room, name, task count, acuity / diagnosis, S = seen, N = note).
- **Patient:** sticky header with code status (colored only if not Full Code) and allergies. A pre-round meter that expands, 4 encounter toggles, and tabs: Tasks · Consults · Summary · If/then. The If/then tab shows an amber dot when a sick or watcher patient has none.
- **Note panel:** the only place to write the note. Three field groups (Subjective & exam · Objective · Assessment & plan) with status hints, a draft-protected preview, a blanks counter, and Copy note. "Mark note written on copy" is off by default and remembers your choice. Hiding the patient panel gives the note full width. Hiding the census (☰) shows the patient panel on the left and the note panel on the right: a narrow column of note fields plus the live note at full height, updating as you type.
- **Mics:** one floating mic (dictates into the focused field, or listens for commands; Alt+M). Per-field mics appear only on hover or focus.
- **Shortcuts:** Alt+B Plan Builder (Alt+D clashed with the browser's address bar), Alt+P note, Alt+S sign-out, Alt+R alarms, Alt+M voice.
- **CSS:** about 4,375 → 2,300 lines. One token set, 4 type sizes, no 800 weights, dead rules removed.

## Checked against your 193-template library
- All 193 templates load and open in Plan Builder with no errors. All 12 SmartLists render, and every `{SmartList}` reference resolves.
- All workup/management pairs are complete. Every suggestion-rule trigger and every `.GB…` cross-reference inside a template points to an existing template.
- All 9 calculators fill the right `***` in your template text.
- Suggestions now rank templates that match the primary diagnosis first. Before, the syncope and PE test patients were offered ACS templates first because "troponin" appeared in their notes.
- Insulin start: when the template already reads "= *** u", the TDD fills the number only. The basal/prandial split goes on its own "Insulin plan:" line instead of producing "= 33 (…) u".

## Public-release cleanup
- Removed institution-specific references from the template library and Plan Builder (hospital names, state-specific form names, local order-set/panel names, "per local policy" notes). Clinical content unchanged; all 193 templates and 12 SmartLists still validate.

## Interactive clinical algorithms (Plan Builder)
- New `algorithms.js`: 10 branching decision algorithms, from the Dotphrase Generator workbench: hyponatremia (Posm → Uosm → UNa → euvolemic cause, plus severity/ODS modifiers), AKI, hyperkalemia, CAP, AFib with RVR, acute pancreatitis, GI bleed, complicated UTI/pyelonephritis, metabolic acidosis and pleural effusion.
- Pick the branch the patient is on, and the template's assessment, workup, plan and red flags are rewritten for that branch. Later steps appear only when an earlier answer calls for them, e.g. Uosm/UNa only for true hypotonic hyponatremia.
- Branch choices are kept per patient, so one patient's path never carries over to another. Each branch path keeps its own checkboxes and *** fills, and "Fill from chart" works on the branch-specific lines.
- The "Algorithm" switch turns an algorithm off to get the original static template back. "Reset" returns to the default branches.
- New "Algorithms" filter in the catalog. Cards with an algorithm carry an "Algo" tag and open in Combined A&P view.
- Assessment lines show readable branch names, such as "(non-septic, low resistance risk)", not internal codes like "(std)".
- 18 new "Expanded Inpatient" templates (metabolic acidosis, hypernatremia, pleural effusion, HRS-AKI, SBP, endocarditis, S. aureus bacteremia, meningitis, cholecystitis/cholangitis, SBO, diverticulitis, osteomyelitis/septic arthritis, rhabdomyolysis, sickle cell VOC, gout flare, opioid withdrawal and MOUD, refeeding syndrome, nephrolithiasis). The library is now 211 templates.

---

# RoundingOS v1.1 — Physical Exam Quick-Builder (2026-11-22)

New file: `exambuilder.js`. Changed: `index.html`, `styles.css`, `app.js`.
Also added: `physical-exam-builder.html`, a standalone single-file preview of the builder that runs
offline with no other files beside it.

## Physical Exam Quick-Builder
- The exam field was all-or-nothing: *Insert normal exam*, or type every abnormal finding by hand.
  A new **Quick exam** link beside it opens a builder that starts from the normal baseline and
  replaces it as you click.
- 8 systems — General, HEENT/Neck, Cardiovascular, Pulmonary, Abdomen, Extremities, Neurologic,
  Skin/Wounds/Lines — with roughly 150 findings grouped by what you are actually examining
  (rate & rhythm, murmur grade/timing/location, breath sounds, work of breathing, tenderness by
  quadrant, edema grade/side/extent, peritoneal signs, lines and drains).
- **Auto-exclusion.** Clicking an abnormal finding clears the normal text it contradicts, in both
  directions: `2+ pitting edema` clears *no peripheral edema*, and clicking *CTAB* back on clears
  the crackles. Mutually exclusive grades replace each other rather than stacking.
- **Composed phrases.** Murmur and edema parts are assembled into one readable finding —
  `grade 3/6 systolic murmur at the RUSB`, `bilateral 2+ pitting edema to the knees` — instead of
  comma-joined fragments.
- Per-system and global free-text boxes, multi-line or compact output, and the generated exam is
  editable before it is inserted.
- Nothing is written to the chart until **Insert into Physical Exam** is pressed (keeps C1). If the
  note has hand edits you get the same *Rebuild from chart* warning the Plan Builder gives.

## Condition presets
- 31 one-click presets across Cardiac, Pulmonary, GI/Liver, Infectious, Neurologic, Renal/Endo and
  Other: ADHF, ACS/NSTEMI, AFib with RVR, endocarditis, COPD, asthma, CAP, aspiration, PE, pleural
  effusion, cirrhosis/ascites, hepatic encephalopathy, upper GI bleed, pancreatitis, SBO/ileus,
  cholecystitis, sepsis, UTI/pyelonephritis, cellulitis, diabetic foot infection, meningitis,
  delirium, stroke, alcohol withdrawal, post-ictal, AKI/hypovolemia, DKA/HHS, symptomatic anemia,
  comfort care and pressure injury.
- Presets are applied as clicks on top of the normal baseline, so the same auto-exclusion rules run
  and a preset cannot leave a contradictory pair behind.
- **Searchable.** Type to filter by name or alias — `chf` finds ADHF, `etoh` alcohol withdrawal,
  `afib` atrial fibrillation, `ams` delirium. Arrow keys move, Enter applies, "Browse all 31" lists
  everything grouped by category. An *Applied:* label shows which preset is in effect and clears as
  soon as you change a chip by hand.

## Interface
- **The duplicate ⋯ menus are gone.** The note pane and the patient detail pane each had a bare
  three-dot button within a few pixels of the app header's, with nothing to tell them apart. They
  are now labeled **Note options** and **Actions**, and the app header keeps the only ⋯ in the app.
  Labels collapse to icons below 1180px. Plan Builder's ⋯ is unchanged — different context, inside
  a modal.
- Clicking **Quick exam** with `exambuilder.js` missing now says so instead of doing nothing.

---

# RoundingOS v1.1.1 — Sepia mode (2026-11-22)

Changed: `index.html`, `styles.css`, `app.js`.

- New **Sepia mode** in the ⋯ menu, beside Dark mode: a warm, low-glare background for panels and fields.
- The choice is saved with your other settings. Turning Sepia off returns to Light mode.
- Acuity colors and printouts are unchanged. The standalone `physical-exam-builder.html` preview stays in Light mode.

---

# RoundingOS v1.2 — Installable app, works offline (2026-11-24)

New: `manifest.json`, `sw.js`, `pwa.js`, `icons/`. Changed: `index.html`, `physical-exam-builder.html`, `README.md`.

- **Install as an app** on Android, laptop (Chrome/Edge) and iPhone. ⋯ menu → **Install app…** opens Chrome's
  install prompt where the browser offers one; otherwise it shows short steps for Android, laptop and iPhone.
- **Works offline.** A service worker keeps a copy of every app file, so the installed app opens in airplane mode.
- **Updates never interrupt you.** A new version downloads in the background; a toast and a menu item say
  **Update available**, and the app reloads only when you tap Reload.
- **Content-Security-Policy:** the browser blocks scripts from anywhere but the app itself and blocks any
  network request off the app's own address.
- `physical-exam-builder.html` now loads `exambuilder.js` instead of carrying its own copy, so there is one source.
- Storage is unchanged and still **unencrypted**: test patients only until encrypted storage lands.
