# RoundingOS — changes from the review (2026-11-20)

Changed: `index.html`, `styles.css`, `app.js`, `data.js`, `progressnote.js`, `planbuilder.js`,
`reminders.js`, `signout.js`, `speech.js`, `server.ps1`. `dotphrases.js` (193 templates, 12 SmartLists) and `crypto.js` unchanged.

Saved data migrates automatically: the legacy `weights` checklist key becomes `bm`, and the UI state is reset to the new layout once.


## Reminders don't outlive the patient
- When a patient is deleted for good (**Delete now**, or the automatic deletion after the archive period), their reminders are deleted too. **Remove from census** keeps the reminder but shows it as "Removed patient" instead of the room and name. Reminders saved by older versions as "… (removed)" are relabeled the same way (cache v1.7.8).

## Passphrase strength check
- A new passphrase (setup, recovery, or an encrypted .rnos backup) must still be at least 10 characters, and now also can't be a common password (also with numbers or symbols swapped in), a repeated or sequential pattern such as "1234567890" or "abcabcabcabc", or one kind of character only unless it is 20 characters or longer. Checked on the device only. Existing passphrases keep working (cache v1.7.6).

## No unencrypted fallback storage
- The app no longer falls back to plain browser storage (localStorage) when the encrypted database can't be used. In that case nothing is saved, and a banner that can't be hidden says so. The installed app always has the encrypted database, so normal use is unchanged; test patients are saved in the encrypted database like any others. Data an older version left in browser storage still moves into the database the first time the app opens normally (cache v1.7.5).

## Generic reminder notifications
- The system notification for a due reminder now always says only "RoundingOS reminder · A reminder is due. Open the app to see it." The patient and the reminder text show only in the popup inside the app, so they no longer appear on the lock screen, in notification history or on a watch (cache v1.7.4).

## VTE prophylaxis & structured discharge planning
- **Progress note (`DISPOSITION & PROPHYLAXIS`):** added structured **VTE Prophylaxis** (`Enoxaparin (SC)`, `Heparin (SC)`, `Therapeutic AC — DOAC`, `Therapeutic AC — Warfarin`, `Therapeutic AC — Heparin / Enoxaparin`, `Mechanical / SCDs only`, `Ambulatory / none needed`) and **Discharge Plan** with timing (`T (Today)`, `T+1`, `T+2`, `>T+2`, `TBD`), auto-populated planned calendar date, and destination (`Home`, `Home with services`, `STR`, `Acute Rehab (IRF)`, `Assisted Living (ALF)`, `LTACH`, `Hospice`), alongside optional barriers/notes (`cache v1.7.2`).
- **Note & Summary controls:** new **Prophylaxis & discharge** section in the Progress Note panel (with missing-field badge) synced with matching controls in the patient **Summary** tab and Sign-out handoffs.

## Patient tabs: Summary first
- The patient panel's **Summary** and **Tasks** tabs switched places, so the tabs read Summary · Consults · Tasks · If / then.
- A new install opens patients on **Summary**. The app still remembers the last tab you chose (cache v1.7.1).

## Encryption on the device (phase 4)
- **Setup on first start:** choose a passphrase (twice), write down 12 recovery words, and type three of them back. A device that already has patients offers an encrypted backup first, then encrypts everything in one step and checks it.
- Every record is encrypted (AES-256-GCM): patients, the archive, settings and saved copies. The database shows only ids, dates and counts.
- **Lock screen** when the app opens. ⋯ → **Lock now**, and an automatic lock after 15 minutes without use (5, 15, 30 or 60 in Settings & backup). Locking clears the screen and memory; other open tabs lock too.
- **Forgot passphrase?** on the lock screen: the 12 recovery words open the data and set a new passphrase.
- While locked, a due reminder shows only "A reminder is due. Unlock to see it."
- Encrypted backups (.rnos) now use 600,000 PBKDF2 rounds instead of 150,000. Older backups still import.
- The "Not encrypted yet: use test patients only" banner and badge are gone. They come back only on a browser where the encrypted database can't open and the app falls back to plain storage (cache v1.7.0).

## Test data link removed
- The short-lived `?demo=1` link and the "Open with test data" icon shortcut are removed. Use ⋯ → Add 14 test patients, or **Load test patients** on an empty census (cache v1.6.4).

## On-device voice, beta (phase 5, step 1)
- New test page `labs/voice-bench.html` (not part of the app): measures Vosk commands and Whisper/Moonshine dictation on this device. The app itself is unchanged.
- Vendored vosk-browser 0.0.8 (patched to run under the app's Content-Security-Policy) and transformers.js 3.8.1.
- Fix: with the app installed, opening `labs/voice-bench.html` showed an unstyled copy of the app. The service worker now loads pages it has not cached from the network and uses the app only as the offline fallback (cache v1.6.1).

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

New: `manifest.json`, `sw.js`, `pwa.js`, `icons/`, `physical-exam-builder.js`, `tests/`.
Changed: `index.html`, `styles.css`, `app.js`, `data.js`, `speech.js`, `crypto.js`, `physical-exam-builder.html`, `README.md`.
Removed: `server.ps1`, `Start-Hospitalist-Tracker.bat` (the app needs no local server).

- **Install as an app** on Android (first), laptop (Chrome/Edge) and iPhone. ⋯ menu → **Install app…** opens Chrome's
  install prompt where the browser offers one; otherwise it shows short steps for Android, laptop and iPhone.
  Hidden once the app runs installed.
- **Works offline.** A service worker keeps a copy of every app file, so the installed app opens in airplane mode.
- **Updates never interrupt you.** A new version downloads in the background; a toast and a menu item say
  **Update available**, and the app reloads only when you tap Reload.
- **Empty census on first run.** Test patients load only from ⋯ → Add 14 test patients (or Load test patients).
- **Voice is off by default.** The first mic tap (or ⋯ → Voice input) shows that audio goes to Google/Apple/Microsoft
  speech servers; voice starts only after you turn it on. Turn it off again from the same menu item.
- **"Not encrypted yet" banner** on every launch (× hides it until the next launch), plus the same note in the menu.
- **Disk sync removed:** no `/api/data` calls; the badge says "Saved on this device". The app asks the browser to keep
  its storage (`navigator.storage.persist()`) and says so in the menu if the browser refuses.
- **Content-Security-Policy** on both pages: scripts only from the app itself, no network requests off the app's address.
- `physical-exam-builder.html` loads `exambuilder.js` instead of carrying its own copy.
- `tests/index.html`: smoke tests (empty first run, test patients, voice gate, manifest, precache list).
  `tests/ui-baseline/`: screenshots of every main screen from before this change, laptop and phone.
- Storage is unchanged and still **unencrypted**: test patients only until encrypted storage lands.

# RoundingOS v1.3 — Tested calculators (2026-11-24)

New: `calc.js`, `tests/calc.test.js`, `tests/dictation.test.js`, `tests/commands.test.js`.
Changed: `planbuilder.js`, `index.html`, `sw.js`, `tests/harness.js`, `tests/index.html`, `scripts/test.mjs`.

- No visible change. The math behind the 8 Plan Builder calculators (corrected Na + 24 h limit, corrected Ca,
  anion gap / delta-delta, CURB-65, MELD 3.0 + SAAG, CHA2DS2-VASc, insulin TDD, steroid NPH) moved into `calc.js`
  as pure functions. The screens, results, Apply text and toasts are the same as before.
- Each formula names its source in `calc.js`. Values the app already used without a known source are marked
  `TODO(clinical)`.
- Tests: missing inputs return nothing (never 0), the MELD 3.0 bounds, the Na-cap and delta-delta fixes,
  dictation clean-up ("sigmoid colon", "as part of", "dig level"), and one case per voice command.
- Known-answer calculator cases show as `○ TODO` until their expected values are filled in from MDCalc.

# RoundingOS v1.4 — Files grouped into folders (2026-11-24)

No visible change. The scripts moved into `src/core`, `src/clinical`, `src/features` and `src/speech`, and the
stylesheet into `styles/`. `index.html`, `physical-exam-builder.html`, `sw.js` (`CACHE_VERSION` v1.4.0) and
`tests/index.html` load them from there. The layout is in `README.md` and `docs/architecture.md`.

# RoundingOS v1.5 — On-device database (2026-11-24)

New: `src/core/store.js`, `src/core/transfer.js`, `vendor/dexie/` (Dexie 4.4.7, see `vendor/VERSIONS.md`),
`tests/store.test.js`, `tests/migration.test.js`, `tests/transfer.test.js`.
Changed: `src/core/app.js` (save/load only), `index.html`, `sw.js` (`CACHE_VERSION` v1.5.0), `tests/harness.js`,
`tests/index.html`, `tests/smoke.test.js`, `README.md`, `docs/architecture.md`.

- Data moves from one `localStorage` text blob to IndexedDB: one row per patient, plus settings, snapshots and
  deleted-patient records. Saves write only the patients that changed, 300 ms after the last edit, and right away
  when the app is hidden or closed.
- First start after the update: the old `localStorage` save is copied in, read back and compared, and only then
  deleted (with the old pre-import snapshot). If anything fails, the old copy stays and the app keeps using it.
- **Import merges:** a summary dialog offers Merge or Replace everything. Undo from the toast restores the copy
  taken before the import. Exports now list deleted patient ids so a deletion carries over to the other device.
- A copy of the data is also kept before "Clear census", before loading test patients, and once a day (last 7).
- Two open tabs still stay in step (BroadcastChannel instead of the `storage` event).
- Still **not encrypted**: the "test data only" banner and badge stay until phase 4.

# RoundingOS v1.6 — Discharge archive and saved copies (2026-11-24)

New: `src/core/retention.js`, `tests/retention.test.js`, `tests/snapshots.test.js`.
Changed: `src/core/app.js`, `src/core/store.js`, `src/features/signout.js`, `index.html`, `styles/styles.css`,
`sw.js` (`CACHE_VERSION` v1.6.0), `tests/index.html`, `README.md`, `docs/plan.md`, `docs/architecture.md`.

- **Discharged → archive → deleted.** Patient Actions menu: *Discharged: move to archive* (with Undo). Archived
  patients leave the census list, counts, sign-out, new-day rollover and voice commands. The census filter gains
  *Archive*; *Return to census* brings a patient back. After the set time in the archive they are deleted for good,
  from the database and from saved copies. Settings & backup → *Discharged patients*: move to archive right away
  (default) / after 1 or 2 days; delete after 7 / 14 / 30 (default) / 60 / 90 days. "Discharge today" never
  archives or deletes anyone.
- **Saved copies screen.** Settings & backup → *Saved copies…*: date, reason and patient count for each copy.
  Restore asks first, saves the current data as a copy, and offers Undo. Delete asks first.
