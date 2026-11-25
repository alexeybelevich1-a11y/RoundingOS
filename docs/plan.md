# RoundingOS: local-first implementation plan

*Written 2026-11-24 against `main` at `5a939f7`.*
*Revised the same day at Anton's request: PWA first (Android first), then calculators, then the on-device database, then encryption as its own phase, then on-device voice.*
*Status: phases 1 and 2 are merged (PRs #2–#6), apart from the manual checks. Phase 3 is merged (PRs #8, #9). Phase 4 (encryption) is built and in review (2026-11-25), with 12 recovery words pending Anton's confirmation. Phase 5 (on-device voice, Beta) is in progress.*

Individual tasks are tracked separately (planned as GitHub issues). This file is the design and order of work; update it when a decision changes.

## The short version

Five phases. After each one the app works:

| Phase | What you get | Rough size |
|---|---|---|
| **1. Installable PWA, offline (Android first)** | RoundingOS installs from GitHub Pages onto the laptop and an Android phone and runs in airplane mode. iPhone instructions are included, tested after Android. Empty census on first run. Local server retired. Cloud voice off by default. | 2–3 days |
| **2. Tested calculators** | Calculator math moves into pure functions with known-answer tests, plus tests for dictation clean-up and voice commands. | 1–2 days |
| **3. On-device database + device transfer** | Patient data moves from the single `localStorage` blob to an IndexedDB database (Dexie), one record per patient. Export/import between phone and laptop merges changes instead of overwriting. Still unencrypted. | 3–4 days |
| **4. Encryption** | Passphrase unlock, recovery words, every record encrypted (AES-GCM), stronger encrypted export. No new migration: phase 3's database is built for it. | 2–3 days |
| **5. On-device voice** | Voice runs on the device: Vosk for commands, Whisper/Moonshine for dictation. Cloud speech only as an explicit opt-in. | 3–4 days |
| Later, optional | Tauri (desktop) or Capacitor (app stores) wrapper, only if the PWA hits a hard wall. | 3–5 days each |

> ⚠️ **No real patient data until phase 4 ships and passes its checks.** Until then, everything the app stores sits in plain text on each device: in `localStorage` during phases 1–2, and in IndexedDB during phase 3. Phases 1–3 are for test patients only. The README and a small banner in the app say this until phase 4 removes it.
>
> Between phases 4 and 5, real patients are fine, but keep **Voice set to Off**. Cloud voice sends audio to Google/Apple/Microsoft, and on-device voice arrives only in phase 5.

**Ground rules for every phase** (from your decisions):
- Plain JS, `<script>` tags, no React, no runtime npm packages, no build step (pnpm only for dev tooling: local server and headless tests). Libraries are copied into `vendor/`, with their exact versions noted in `vendor/VERSIONS.md`. No CDN at runtime.
- **The UI stays as it is.** The only new screens are the ones named below (the unlock/setup screen, the import summary, the voice setting), built from the existing modal and toast styles.
- The app keeps its in-memory `state` object. Only how `state` is saved and loaded changes, so the ~70 `saveState()` calls across the code stay as they are.
- Every phase ends with a commit and a short manual check on both devices.

This replaces the earlier 5-phase plan doc (2026-11-21, written against the old local folder). Most of its content carries over, regrouped into five phases and checked against what's in the repo now.

---

## Phase 1 · Installable PWA, offline (Android first)

**Goal:** RoundingOS is an installed app on the laptop and an Android phone, served from one https address, and it opens and works in airplane mode. iPhone gets install instructions in the app and is checked after Android works. Storage stays as it is today (`localStorage`), and only test patients go in.

### What changes, file by file

| File | Change |
|---|---|
| GitHub repo settings | Turn on GitHub Pages from `main`. The address serves **code only**. Data never goes there. Because the repo is public, anyone who looks can see your dot-phrase templates. If that matters, use a private repo with Cloudflare Pages + Cloudflare Access. |
| `manifest.json` | **New.** `index.html` already links to it (today that link returns a 404). Name, `start_url: "./"`, `display: "standalone"`, a theme color matching the current header, and icons. |
| `icons/` | **New.** 192 px, 512 px, a maskable 512 px, and a 180 px Apple touch icon. |
| `sw.js` | **New, ~80 lines.** It precaches every app file under a `CACHE_VERSION` string and serves them cache-first. When a new version is found, the existing toast says "Update available, reload when ready". It never reloads on its own mid-shift. |
| `index.html` | Registers `sw.js`. Adds a Content-Security-Policy `<meta>`: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' data:; connect-src 'self'`. With it, the browser itself blocks any request that would leave the device. Also adds the `apple-touch-icon` and `theme-color` tags. |
| `app.js` | Removes the disk-sync code: the `/api/data` calls, `diskSyncAvailable`, and `API_HEADERS`. The storage badge always says "Saved on this device". Calls `navigator.storage.persist()` at startup, so the browser doesn't evict the data. Adds an **"Install app"** item inside the existing menu. On Android Chrome (the first target) and desktop Chrome/Edge it triggers the browser's install prompt (`beforeinstallprompt`). On iPhone, Safari has no install prompt, so the same item opens short instructions instead: Share → Add to Home Screen. When the app is already installed, the item is hidden. The "Load test patients" button (`resetDemoBtn`, ~line 1686) calls `getInitialTestPatients()` directly. |
| `data.js` | `getDefaultAppState()` returns `patients: []` and `selectedPatientId: null`. Today it seeds the 14 test patients (line 593). Test patients load only from the existing Test data menu item. |
| `speech.js` / settings | **Stopgap:** the mic is off by default. The first time it's turned on, a one-time notice says "Voice uses Google/Apple/Microsoft speech servers; audio leaves this device." Phase 5 replaces this with on-device engines. |
| `physical-exam-builder.html` | Loads `exambuilder.js` instead of carrying its own copy, so the cached app has one source of truth. |
| `server.ps1`, `Start-Hospitalist-Tracker.bat` | **Deleted.** The PWA needs no local server. |
| `README.md` | Rewritten: how to install on laptop and phone, where data lives, how to back up, how to release an update (bump `CACHE_VERSION`), and an honest privacy line: data is not encrypted yet, test patients only. |
| `tests/index.html`, `tests/harness.js` | **New.** A test page you open in the browser, with no dependencies. Phase 1 adds only a smoke test (the app loads, an empty census renders). Later phases add their own suites. |

`index.html` has no inline `<script>`, `<style>` or `onclick=` handlers today (checked), so the strict CSP shouldn't need code changes. If any inline `style=""` set from JS stops working, add `style-src 'self' 'unsafe-inline'`.

### Data migration

Browser storage belongs to one web address. The installed app at `https://<you>.github.io/RoundingOS/` starts with **empty** storage and cannot see what the old app saved under `http://localhost:8765` or `file://`. To bring data across:

1. In the old app, use the existing **Export (encrypted)** button. That gives you a `.rnos` file.
2. In the installed app on each device, **Import** that file. The import code already exists and replaces the census after a confirm.
3. Check the patient counts match. Then clear the old browser storage and delete the old `data/` folder (`hospitalist-data.json` and the hourly `backup-*.json` files), since they're plain text.

As of the 2026-11-21 review the old data held only the 14 test patients. If that's still true, skip the import and start empty.

The data now lives in `localStorage['roundingos_hospitalist_v1']` at the GitHub Pages address, in the same format as today. Phase 3 migrates it from there into IndexedDB, and phase 4 encrypts it in place.

**Phone and laptop until phase 3:** each install has its own data. To move it, use encrypted export → import, which replaces the whole census on the receiving device. Merging comes in phase 3.

### Risks

| Risk | Mitigation |
|---|---|
| Plain-text data on two devices now | Test patients only, stated in the README and an in-app banner, until phase 4. |
| Stale cached code after a fix | Bump `CACHE_VERSION` on every release, and show the update banner. The release steps are in the README. |
| Storage being cleared | `persist()` protects it on Android Chrome. On iPhone, installed PWAs are exempt from Safari's 7-day eviction. Use the installed app, not a browser tab. |
| iPhone differences | iPhone is second, so the plan doesn't depend on it. Its install item shows instructions only. Check the offline behavior there once Android passes. |
| CSP breaks something | Click through every screen with the DevTools console open and look for CSP errors. |

### Acceptance checks

- DevTools → Application: the manifest has no errors, the service worker is activated, and Lighthouse marks the app installable.
- On the Android phone, the "Install app" menu item shows Chrome's install prompt, and the installed app opens from the home screen with networking off.
- The same works on the laptop (Chrome/Edge).
- On iPhone (after Android passes), the menu item shows the Add to Home Screen instructions, and the installed app opens offline.
- The DevTools Network panel shows no requests except to the app's own address during a full session.
- A fresh install opens to an empty census, and "Load test patients" still works.
- Publish a trivial change: the banner appears, nothing reloads on its own, and the data survives the reload.
- Every screen looks and behaves as before. Compare against screenshots taken before starting.

**Size:** 2–3 days.

---

## Phase 2 · Tested calculators

**Goal:** the clinical math can't silently break when other code changes.

| File | Change |
|---|---|
| `calc.js` | **New.** One pure function per calculator: numbers in, result out, no DOM. The calculators are corrected Na (+ 24 h correction limit), corrected Ca, anion gap + corrected AG + delta-delta, CURB-65, MELD 3.0, CHA2DS2-VASc, insulin TDD with the basal-prandial split, and steroid-induced NPH. A missing input returns `null`, never `0`. |
| `planbuilder.js` | The calculator wiring (around lines 1130–1410: `computeCurb`, `computeMeld`, and the Na/Ca/AG/insulin/steroid blocks) reads its inputs from the DOM, calls `Calc.*`, and renders exactly the same HTML as today. |
| `index.html` / `sw.js` | Add `calc.js` before `planbuilder.js`, and add it to the cache list. |
| `tests/calc.test.js` | Known-answer cases, 3–5 per calculator, plus a regression case for each calculator bug listed in `CHANGES.md`. |
| `tests/dictation.test.js`, `tests/commands.test.js` | These protect phase 5's voice work. Tests for `formatMedicalDictation` and `parseVoiceCommand`: one case per command type, plus the known traps ("sigmoid colon", "as part of", and "set dispo discharge to SNF", which must set dispo, not priority). |
| `tests/algorithms.test.js` | Optional: a few path-through cases for the 10 branching algorithms in `algorithms.js`. |

**Rule for clinical values:** every expected number in `calc.test.js` carries a comment naming its source, for example an MDCalc result you entered. Whoever writes the tests leaves a `TODO` for each expected value rather than inventing one, and you fill or confirm them.

**Done when:** all tests are green, and each calculator shows the same output as before for a handful of inputs you try by hand.

### Data migration

None. Only code moves.

**Size:** 1–2 days.

---

## Phase 3 · On-device database + device transfer (still unencrypted)

**Goal:** patient data moves out of the single `localStorage` blob into an IndexedDB database with one record per patient, and moving data between devices merges instead of overwriting. The data is **not encrypted yet**, so the "test data only" rule stays.

The database is designed so that phase 4 can add encryption **without another migration**: the tables, keys and indexes stay the same, and only what's inside each record's payload changes.

### What changes, file by file

| File | Change |
|---|---|
| `vendor/dexie.min.js` | **New.** A local copy of Dexie 4.x (~100 KB), pinned in `vendor/VERSIONS.md`. |
| `src/core/store.js` | **New, ~250 lines.** The only code that touches the database. Its API is below. |
| `src/core/app.js` | Replaces the persistence block (`saveState`, `loadInitialState` and the `storage` listener, ~lines 159–230). Import stops writing `roundingos_pre_import_snapshot` to `localStorage` and calls `Store.snapshot()` instead. The Export and Import buttons call `transfer.js`. Their place in the UI doesn't change. |
| `src/core/transfer.js` | **New, ~200 lines.** `exportCensus()`, `importCensus(file)` and `mergeStates(local, incoming)`. Export keeps using the existing encrypted file format from `crypto.js`, as today. |
| `index.html` / `sw.js` | Add the new scripts in order (`vendor/dexie.min.js`, `store.js`, `transfer.js` before `app.js`), and add them to `APP_FILES`. Add one import-summary modal, using the existing modal markup and classes. |
| `tests/store.test.js`, `tests/migration.test.js`, `tests/transfer.test.js` | **New.** |

### How the database looks

Database `roundingos`, Dexie version 1. Every data row has the same shape: a few readable fields used for indexing, plus a `payload` and a `codec` tag that says how the payload is stored.

| Table | Readable fields | `payload` holds |
|---|---|---|
| `meta` | `key` | Schema version, `codec` in use (`"plain"` in phase 3), and in phase 4 the wrapped keys, salt and iterations |
| `patients` | `id`, `updatedAt`, `purgeAfter`, `codec` | The whole patient record |
| `settings` | `key` (one row, `"app"`), `codec` | Everything in `state` except `patients`: provider/service names, theme, UI state, dot phrases, Plan Builder settings, reminders, custom vocab |
| `snapshots` | `id`, `createdAt`, `reason`, `patientCount`, `codec` | A full copy of `state`, taken before an import, a restore, "clear census", and once a day. The last 7 are kept. |
| `tombstones` | `id`, `deletedAt` | None. It records only that a patient id was deleted, for the merge. |

In phase 3, `codec` is `"plain"` and `payload` is the record itself. Names and MRNs are therefore readable in DevTools, exactly as they are in `localStorage` today. In phase 4, `codec` becomes `"aes-gcm-1"` and `payload` becomes `{ iv, ct }`.

### `store.js` API

```js
Store.open()              // opens the database, reads meta
Store.load()              // → full state object, same shape as today
Store.save(state)         // writes only records that changed
Store.snapshot(reason)    // full copy of state
Store.listSnapshots()
Store.restoreSnapshot(id)
Store.deleteSnapshot(id)
Store.scrubSnapshots(patientIds)  // removes deleted patients from every saved copy
// phase 4 adds: status(), setup(), unlock(), unlockWithRecovery(), lock(), sealAll()
```

Internally, every read and write goes through two functions: `encodeRecord(obj) → { codec, payload }` and `decodeRecord(row) → obj`. In phase 3 they just pass the object through. Phase 4 replaces only these two functions and adds the unlock calls. The rest of `store.js` and all of `transfer.js` stay the same, and `app.js` only gains the unlock step before loading.

Inside `app.js`, `saveState()` keeps its name and stays synchronous for its ~70 callers. It updates `lastSavedAt`, then schedules `Store.save(state)` after a ~300 ms pause. It saves immediately on `pagehide` and `visibilitychange`, because phones kill background tabs without warning.

**Detecting what changed:** only one code path sets `patient.updatedAt` today, so `updatedAt` can't be trusted to spot edits. Instead, `Store.save` keeps a hash of each patient's JSON from the last write and rewrites only the patients whose hash changed. It sets `updatedAt` on each one it writes, which the merge needs. Deleted patients are removed and get a tombstone in the same transaction.

**Two tabs:** the `storage` event goes away along with `localStorage`. A `BroadcastChannel('roundingos')` replaces it: after a save, the tab posts "changed", and the other tab reloads its state from the store, as the current code does.

**Discharged patients: archive, then delete** (decided 2026-11-24, replaces the earlier "purge after 3 days"):

- A patient is discharged only when you choose **Actions → Discharged: move to archive**. The "Discharge today" priority and the disposition text never trigger anything.
- **Stage 1, archive.** Archived patients leave the census: the list, header counts, sign-out, new-day rollover and voice commands skip them. The census filter has an **Archive** option that lists them; **Actions → Return to census** brings one back, and the discharge toast has Undo. Setting *Move to archive*: right away (default), after 1 day or after 2 days. Until then the patient stays on the census with a "Discharged" flag.
- **Stage 2, delete.** *Delete from archive after*: 7, 14, **30 (default)**, 60 or 90 days. When due, the patient is removed from the database (with a tombstone, so a merge import keeps them deleted) and from every saved copy (`Store.scrubSnapshots`), so a restore cannot bring them back. Lowering the setting asks first if it would delete anyone right away.
- Rules live in `src/core/retention.js` (pure functions). `app.js` runs them at startup, at the new-day rollover, after Settings → Save, when the app comes back to the foreground, and hourly. The patient fields are `dischargedAt` and `archivedAt`; the dates are worked out from the current settings, so changing a setting applies to everyone already archived. The `purgeAfter` index stays unused (no schema change).

**Saved copies screen:** Settings & backup → **Saved copies…** lists the snapshots (date, reason, patient count; newest first). **Restore** asks first, saves the current data as a new copy ("before restore"), replaces everything, and offers Undo in the toast. **Delete** asks first. Snapshot rows also store `patientCount` (a number only) so the list needs no decoding.

### Data migration (localStorage → database)

Phase 1 moved the data to `localStorage['roundingos_hospitalist_v1']` at the GitHub Pages address. The update runs at that same address, so it can read the data directly. On the first start after the update:

1. `store.js` reads `roundingos_hospitalist_v1` and writes every patient and the settings into the database, in one transaction.
2. It re-reads everything and checks that the patient count and ids match.
3. Only then does it delete `roundingos_hospitalist_v1` and `roundingos_pre_import_snapshot`. If any step fails, `localStorage` is left untouched, the app keeps running from it, and you see an error.

Do this on each device, since each one has its own data.

### Phone ↔ laptop

The two installs have separate databases. There is no server, so data moves only as an encrypted file you carry (AirDrop, a cable, a USB stick, or a file you email yourself).

- **Export:** the whole census plus settings, encrypted with a passphrase you type for this export, in the existing `roundingos-encrypted-v1` format.
- **Import merges instead of replacing:** patients are matched by `id`, and the newer `updatedAt` wins. A patient on only one side is added. A patient deleted on this device after the export was made stays deleted (the `tombstones` table tracks this). Before applying, the app shows a summary such as "3 new, 5 updated, 1 kept local (newer)". It takes a snapshot first, so one tap undoes the import. "Replace everything" stays as a second option.

### Risks

| Risk | Mitigation |
|---|---|
| Losing data during migration | `localStorage` is deleted only after a verified re-read; take an encrypted export first. |
| Async save racing with the phone killing the tab | A ~300 ms debounce, plus an immediate save on `pagehide`/`visibilitychange`. Dexie transactions are atomic, so a record is either old or new, never half-written. |
| Merge brings back a deleted patient or loses an edit | Tombstones, newer-wins, a summary before applying, and a snapshot. Tested below. |
| Clocks differ between devices | The summary shows which side won, and you can undo. Acceptable for one user. |
| Still plain text | Test patients only, the banner stays, until phase 4. |

### Acceptance checks

Automated (`pnpm test`, against a throwaway database `roundingos-test`):
- A save → reload round-trip gives an identical `state`.
- Editing one patient rewrites one row only; deleting one creates a tombstone.
- Every row goes through `encodeRecord`/`decodeRecord` (a test swaps in a fake codec and checks that no row is written without it).
- Migration: counts match, the old keys are deleted only after the verify, and a forced failure leaves `localStorage` untouched.
- Merge: newer wins, tombstones keep deleted patients deleted, and re-importing the same file changes nothing.
- Only patients marked discharged are archived, and only archived patients past their window are deleted, including from saved copies; restoring a snapshot gives back the earlier state, and Undo reverses the restore.

Manual, on both devices:
- Updating a phase-1 install keeps the same census, and `localStorage` no longer holds patient data.
- Edit a patient, close the app mid-edit, and reopen: the edit is there.
- A 40-patient census (load the test data three times) stays responsive while typing.
- Export on the laptop → import on the phone: counts match, no duplicates, and a patient deleted on the phone stays deleted.

**Size:** 3–4 days.

---

## Phase 4 · Encryption (the gate for real patients)

**Goal:** no readable patient data anywhere on the device. A lost laptop or phone, or a copied browser profile, exposes nothing without your passphrase.

### What changes, file by file

| File | Change |
|---|---|
| `src/core/crypto.js` | Keeps the export/import format. New files use 600,000 PBKDF2 iterations instead of 150,000; when opening a file it reads `iterations` from the envelope, so old exports still open. Gains the helpers `store.js` needs: generate a data key, wrap/unwrap it with a passphrase or recovery key, and encrypt/decrypt a record with an existing key. |
| `vendor/bip39/english.js` | **New.** The standard BIP-39 2048-word list for the recovery words, as a JS array. |
| `src/core/lock.js` | **New.** The lock screen (setup, unlock, recovery), UI only; `app.js` passes in the `Store` calls. |
| `src/core/store.js` | `encodeRecord`/`decodeRecord` switch to AES-GCM. Adds `status()`, `setup(passphrase)` → recovery words, `unlock(passphrase)`, `unlockWithRecovery(words)`, `lock()`, and `sealAll()` (the one-time pass that encrypts existing rows). |
| `src/core/app.js` | Shows the unlock/setup modal before loading, adds "Lock now" to the menu, and adds an idle auto-lock (default 15 minutes; 5 or 15 in Settings & backup, capped at 15 by HIPAA task H8). |
| `index.html` | One unlock/setup modal, using the markup pattern and classes of the existing passphrase modal. Remove the "not encrypted, test data only" banner. |
| `README.md` | Privacy and backup sections updated: data is encrypted; keep the recovery words safe. |
| `tests/crypto.test.js`, `tests/harness.js` | **New / extended.** The harness answers the lock screen when it loads the app. |

### Keys, in plain terms

- On first setup the app makes a random 256-bit **data key**. Every record is encrypted with it (AES-GCM, with a fresh random IV on every write).
- The data key is stored twice in `meta`, never in the clear: once locked by your **passphrase** (PBKDF2-SHA256, 600,000 iterations), and once locked by a **recovery key** shown one time as **12 words** (BIP-39: 128 random bits plus a checksum, so a typo is caught) for you to write down. The recovery key is derived with HKDF-SHA256: 128 random bits need no slow key derivation.
- Each record's table and id are bound in as AES-GCM additional data, so encrypted rows can't be swapped between patients.
- When you unlock, the data key lives only in memory as a non-extractable `CryptoKey`. The app locks itself after the idle time and when you choose "Lock now". Locking writes pending edits, drops the key and reloads the page, so nothing readable stays on screen or in memory; it also locks the app's other open tabs.
- **Recovery words can be dropped** with one switch (`RECOVERY_WORDS` in `app.js`): setup then asks only for the passphrase and says that forgetting it loses that device's data. Devices already set up keep their recovery slot.
- If you forget the passphrase and lose the recovery words, the data is gone. That's the trade for real encryption, and the README and the setup screen say so.

### Data migration (plain rows → encrypted rows, no schema change)

This is not a database migration: the tables, keys and indexes from phase 3 stay exactly as they are. On the first start after the update:

1. The app shows **Setup**: offer an encrypted export as a backup (recommended), then the passphrase twice, then the recovery words, then type 3 of them back.
2. `Store.setup()` encrypts every row with `fmt: "plain"` (patients, including archived ones, settings and saved copies) to `fmt: "aes-gcm-1"` with `{ iv, ct }`, checks each by decrypting it, then writes them all and `meta['crypto']` in one transaction. If the rows changed in between, the transaction is abandoned.
3. It re-reads every row with the new key and checks the counts, ids and contents. If anything fails, the original plain rows are put back and the database is not marked encrypted.
4. Any old `localStorage` save is moved into the database first (phase 3's checked move), so it is sealed in the same pass.

`decodeRecord` keeps reading `"plain"` rows, so a row that somehow missed the pass still opens; the next save encrypts it. After a successful seal, the app refuses to write new plain rows.

**Leftovers:** browsers don't promise to wipe the old bytes of overwritten IndexedDB rows straight away. That's why real patients go in only after this phase, so the only plain-text leftovers are test patients.

### Risks

| Risk | Mitigation |
|---|---|
| Forgotten passphrase | Recovery words at setup, with a "confirm you saved them" step. |
| Seal pass fails midway | One transaction: it either encrypts everything or nothing. Verified by re-reading before the plain mode is switched off. |
| Unlock friction on rounds | 600k PBKDF2 takes ~0.3–1 s on a phone, once per unlock, not per save. The idle lock time is configurable. Biometric unlock (WebAuthn PRF) is a possible later addition, not part of this plan. |
| Locked app while a reminder is due | On lock, the due times of open reminders (times only, no text or patient) are kept for that tab in `sessionStorage`; while locked, a due reminder shows a generic "RoundingOS reminder" notification and a note on the lock screen. |
| Encrypted database fails to open | The app never falls back to plain `localStorage` once the data is encrypted; it shows the error instead. The plain fallback (with the "Not encrypted on this device" banner) remains only for browsers where IndexedDB or WebCrypto is missing. |

### Acceptance checks

Automated:
- A wrong passphrase fails, and the recovery words unlock.
- Raw database rows contain no patient name, room or MRN (the test searches the stored bytes for known test names).
- `sealAll()` turns a phase-3 database into an encrypted one with identical `Store.load()` output; a forced failure leaves it unchanged.
- An old 150,000-iteration `.rnos` export still imports; new exports use 600,000.

Manual, on both devices:
- Updating a phase-3 install shows Setup, and after setup the census is the same as before.
- DevTools → Application → IndexedDB shows only ids, timestamps and ciphertext.
- The app locks after the idle time and on "Lock now", and the census stays hidden until you unlock.
- Close the app mid-edit, reopen and unlock: the edit is there.

**Size:** 2–3 days. The key handling is the careful part; the rest of the code is already shaped for it.

---

## Phase 5 · On-device voice

**Goal:** dictation and voice commands work with no audio leaving the device. Cloud speech is only an explicit opt-in.

**Ships as Beta (Anton, 2026-11-24).** The setting reads **On-device (Beta)**, a small Beta badge sits by the mic while on-device voice is active, a one-time note says it is experimental, and a feature flag can hide the option entirely.

**Step 1, the test page (done first):** `labs/voice-bench.html` measures Vosk command delay and Whisper/Moonshine dictation speed on the actual phone and laptop before the app integration starts. Vendored: vosk-browser 0.0.8 (patched so it runs without `'unsafe-eval'`) and transformers.js 3.8.1 with its ONNX runtime files. Shared pieces already live in `src/speech/`: `voice-grammar.js` (command vocabulary + number-word clean-up), `voice-audio.js` (16 kHz mic capture), `voice-worker.js` (Whisper/Moonshine in a module worker).

Note: `parseVoiceCommand` has no "set room 12 dispo to SNF" form today, and rooms must be 3–4 digits to select. `VoiceGrammar.splitRoomPrefix` turns it into "select room 12" + "set dispo SNF"; the app integration (step 2) wires that up.

| File | Change |
|---|---|
| `voice.js` | **New adapter.** `Voice.start({ mode: 'command' \| 'dictation', onPartial, onFinal, onError })`, `Voice.stop()`, `Voice.status()`, `Voice.setEngine(name)`. |
| `voice-webspeech.js` | Holds today's recognition code, moved out of `speech.js` (`createRecognition`, `startCommandMode`, `toggleDictation`, `startFreestyleSession`, `startOneShot`). It's used only after the consent notice. |
| `voice-vosk.js` | The command engine: vosk-browser and a small English model. Its grammar is built from the phrases `parseVoiceCommand` understands, plus room numbers and patient first names from the current census. That makes it fast and accurate for a closed vocabulary. |
| `voice-whisper.js` + `voice-worker.js` | The dictation engine: transformers.js in a Web Worker. It runs Whisper `small.en` (or `base.en`) on the laptop, and Moonshine base on the phone or when `navigator.deviceMemory < 8`. It records until a pause, transcribes, then passes the text through `formatMedicalDictation`. The custom vocab goes in as the prompt. |
| `speech.js` | Keeps the text side: `formatMedicalDictation`, `parseVoiceCommand`, `parsePatientFormDictation`, the medical lexicon and the custom vocab. The `SpeechEngine` global keeps its name and methods and hands the work to `Voice`, so the call sites in `app.js` barely change. |
| Settings | Phase 1's stopgap becomes one setting, **Voice: Off / On-device / Cloud**, in the existing settings panel. Off stays the default, and Cloud shows the consent notice once. |
| `vendor/` | Local copies of vosk-browser and transformers.js. |
| Models | Downloaded once from Hugging Face on first use, with the size shown and a progress bar, then cached on the device. The CSP's `connect-src` gains `https://huggingface.co https://*.hf.co` for this download only. Alternative: host the model files yourself, so the app never talks to a third party. That costs ~100–250 MB of hosting. |
| `tests/voice.test.js` | Tests the adapter with a fake engine: Off never starts an engine, Cloud requires consent, and final text always goes through `formatMedicalDictation`. |

**Risks:** in-browser Whisper is heavy on phones: it uses a lot of memory and battery and adds a second or two of delay per utterance. **Test on your actual phone on the first day of this phase**, before building the full integration. GitHub Pages can't send the headers that multi-threaded WebAssembly needs, so the engines run single-threaded, or on WebGPU where it's available. If dictation on the iPhone is too slow, the fallbacks are Moonshine tiny, commands only on the phone, or the Capacitor wrapper below with native on-device speech.

**Done when:** in airplane mode on both devices, "set room 12 dispo to SNF" works, a 30-second dictation lands in the note, and the network panel shows no audio requests.

### Data migration

None. The voice setting defaults to Off for everyone. The custom vocabulary is read from the encrypted settings row.

**Size:** 3–4 days.

---

## Later, optional: native wrappers

Only if the PWA hits a hard wall.

- **Tauri (desktop):** a small native app around the same files. It gains real files on disk (an encrypted backup you can see in Finder) and native whisper.cpp for faster dictation. It costs a Rust toolchain, and signing/notarization on macOS.
- **Capacitor (iOS/Android):** the same files in an app-store shell. It gains native on-device speech (Apple/Google), Keychain/Keystore for the data key, and Face ID unlock. It costs Xcode/Android Studio, store accounts, and app review.

Both reuse `store.js` and `voice.js` as they are, which is why the plan puts storage and voice behind those two modules.

---

## Final file layout

Files are grouped in folders (2026-11-24). Tables above name files without their folder.

```
index.html  physical-exam-builder.html  manifest.json  sw.js  README.md  CHANGES.md
styles/styles.css
icons/
src/core/       app.js  data.js  pwa.js
                store.js       Dexie, one record per patient (3); encryption (4)
                transfer.js    export / import / merge                           phase 3
                crypto.js      kept; 600k iterations, reads old files            phase 4
src/clinical/   calc.js (phase 2)  algorithms.js  dotphrases.js
src/features/   planbuilder.js  progressnote.js  exambuilder.js  physical-exam-builder.js  reminders.js  signout.js
src/speech/     speech.js      kept: text clean-up + command parsing
                voice.js  voice-webspeech.js  voice-vosk.js  voice-whisper.js  voice-worker.js   phase 5
vendor/         dexie, vosk-browser, transformers.js  (+ VERSIONS.md)
tests/          index.html  harness.js  *.test.js
```

Removed: `server.ps1` and `Start-Hospitalist-Tracker.bat`. On your machine, delete the plain-text `data/` folder once the data has moved into the PWA.

## Release checklist

Run on both devices after phase 4, before any real patient. Re-run the voice items after phase 5.

- [ ] `pnpm test` (tests/index.html) all green
- [ ] Airplane mode: open, unlock, add a patient, print sign-out
- [ ] Voice is Off (until phase 5); after phase 5, dictation and a voice command work in airplane mode
- [ ] Network panel: no requests leave the device during a full session
- [ ] IndexedDB and `localStorage` contain no readable patient text
- [ ] A wrong passphrase fails; the recovery words work
- [ ] Laptop export → phone import: counts match, no duplicates, re-import is a no-op
- [ ] A discharged test patient goes to the Archive, and is gone (also from Saved copies) after the delete window
- [ ] Screens match the screenshots taken before phase 1

## Decisions for you

1. **Recovery words** (phase 4): built in, 12 words written down at setup (recommended), pending your confirmation. Dropping them is one switch, and then a forgotten passphrase loses that device's data.
2. **Public repo** (phase 1): fine for code, but anyone can see the dot phrases. Keep it public, or move to a private repo + Cloudflare Pages/Access.
3. **Model download** (phase 5): from Hugging Face once (simpler), or self-hosted, so the app never contacts a third party.
