# RoundingOS: local-first implementation plan

*Written 2026-11-24 against `main` at `5a939f7`. Phase 1 (PWA) is in progress in PR #2.*
*Revised the same day at Anton's request: PWA first (Android first), then calculators, then encryption, with on-device voice as its own last phase.*

Individual tasks are tracked separately (planned as GitHub issues). This file is the design and order of work; update it when a decision changes.

## The short version

Four phases. After each one the app works:

| Phase | What you get | Rough size |
|---|---|---|
| **1. Installable PWA, offline (Android first)** | RoundingOS installs from GitHub Pages onto the laptop and an Android phone and runs in airplane mode. iPhone instructions are included, tested after Android. Empty census on first run. Local server retired. Cloud voice off by default. | 2–3 days |
| **2. Tested calculators** | Calculator math moves into pure functions with known-answer tests, plus tests for dictation clean-up and voice commands. | 1–2 days |
| **3. Encrypted storage + device transfer** | Patient data moves from the plaintext `localStorage` blob to an encrypted on-device database. Export/import between phone and laptop merges changes instead of overwriting. | 4–5 days |
| **4. On-device voice** | Voice runs on the device: Vosk for commands, Whisper/Moonshine for dictation. Cloud speech only as an explicit opt-in. | 3–4 days |
| Later, optional | Tauri (desktop) or Capacitor (app stores) wrapper, only if the PWA hits a hard wall. | 3–5 days each |

> ⚠️ **No real patient data until phase 3 ships and passes its checks.** Until then, everything the app stores sits in plain text in the browser's `localStorage` on each device. Phases 1 and 2 are for test patients only. The README and a small banner in the app say this until phase 3 removes it.
>
> Between phases 3 and 4, real patients are fine, but keep **Voice set to Off**. Cloud voice sends audio to Google/Apple/Microsoft, and on-device voice arrives only in phase 4.

**Ground rules for every phase** (from your decisions):
- Plain JS, `<script>` tags, no React, no runtime npm packages, no build step (pnpm only for dev tooling: local server and headless tests). Libraries are copied into `vendor/`, with their exact versions noted in `vendor/VERSIONS.md`. No CDN at runtime.
- **The UI stays as it is.** The only new screens are the ones named below (the unlock/setup screen, the import summary, the voice setting), built from the existing modal and toast styles.
- The app keeps its in-memory `state` object. Only how `state` is saved and loaded changes, so the ~70 `saveState()` calls across the code stay as they are.
- Every phase ends with a commit and a short manual check on both devices.

This replaces the earlier 5-phase plan doc (2026-11-21, written against the old local folder). Most of its content carries over, regrouped into four phases and checked against what's in the repo now.

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
| `speech.js` / settings | **Stopgap:** the mic is off by default. The first time it's turned on, a one-time notice says "Voice uses Google/Apple/Microsoft speech servers; audio leaves this device." Phase 4 replaces this with on-device engines. |
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

The data now lives in `localStorage['roundingos_hospitalist_v1']` at the GitHub Pages address, in the same format as today. Phase 3 migrates it from there into the encrypted database.

**Phone and laptop until phase 3:** each install has its own data. To move it, use encrypted export → import, which replaces the whole census on the receiving device. Merging comes in phase 3.

### Risks

| Risk | Mitigation |
|---|---|
| Plain-text data on two devices now | Test patients only, stated in the README and an in-app banner, until phase 3. |
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
| `tests/dictation.test.js`, `tests/commands.test.js` | These protect phase 4's voice work. Tests for `formatMedicalDictation` and `parseVoiceCommand`: one case per command type, plus the known traps ("sigmoid colon", "as part of", and "set dispo discharge to SNF", which must set dispo, not priority). |
| `tests/algorithms.test.js` | Optional: a few path-through cases for the 10 branching algorithms in `algorithms.js`. |

**Rule for clinical values:** every expected number in `calc.test.js` carries a comment naming its source, for example an MDCalc result you entered. Whoever writes the tests leaves a `TODO` for each expected value rather than inventing one, and you fill or confirm them.

**Done when:** all tests are green, and each calculator shows the same output as before for a handful of inputs you try by hand.

### Data migration

None. Only code moves.

**Size:** 1–2 days.

---

## Phase 3 · Encrypted storage + device transfer (the gate for real patients)

**Goal:** no readable patient data anywhere on the device. A lost laptop or phone, or a copied browser profile, exposes nothing without your passphrase. Moving data between devices merges instead of overwriting.

### What changes, file by file

| File | Change |
|---|---|
| `vendor/dexie.min.js` | **New.** A local copy of Dexie 4.x (~100 KB). |
| `store.js` | **New, ~300 lines.** The only code that touches the database or the encryption keys. Its API is below. |
| `crypto.js` | Keeps the export/import format. New files use 600,000 PBKDF2 iterations instead of 150,000. When opening a file, it reads `iterations` from the envelope, so old exports still open. It also gains two helpers that `store.js` needs: one wraps and unwraps a data key, the other encrypts and decrypts with an existing key. |
| `app.js` | Replaces the persistence block (`saveState`, `loadInitialState` and the `storage` listener, lines ~163–260). Import stops writing `roundingos_pre_import_snapshot` to `localStorage` and calls `Store.snapshot()` instead. The Export and Import buttons call `transfer.js`. Their place in the UI doesn't change. |
| `transfer.js` | **New, ~200 lines.** `exportCensus()`, `importCensus(file)` and `mergeStates(local, incoming)`. |
| `index.html` / `sw.js` | Add the new scripts, and add them to the cache list. Add one unlock/setup modal, using the same markup pattern and classes as the existing passphrase modal. Remove the "not encrypted, test data only" banner. |
| `tests/store.test.js`, `tests/migration.test.js`, `tests/transfer.test.js` | **New.** |

### How the database looks

Database `roundingos`, Dexie version 1:

| Table | Readable fields | Encrypted payload |
|---|---|---|
| `meta` | `key` | The data key wrapped by the passphrase, the data key wrapped by the recovery key, salt, iterations, schema version |
| `patients` | `id`, `purgeAfter` | The whole patient record |
| `settings` | `key` (one row, `"app"`) | Everything in `state` except `patients`: provider/service names, theme, UI state, dot phrases, Plan Builder settings, reminders, custom vocab |
| `snapshots` | `id`, `createdAt`, `reason` | A full copy of `state`, taken before an import, before "clear census", and once a day. The last 7 are kept. |
| `tombstones` | `id`, `deletedAt` | None. It records only that a patient id was deleted, for the merge. |

Names, rooms, MRNs, notes and plans exist only inside the encrypted payload. Looking at the database in DevTools shows ids and timestamps only.

### Keys, in plain terms

- On first setup the app makes a random 256-bit **data key**. Every record is encrypted with it (AES-GCM, with a fresh random IV on every write).
- The data key is stored twice, never in the clear: once locked by your **passphrase** (PBKDF2-SHA256, 600,000 iterations), and once locked by a **recovery key**. The recovery key is shown one time, as words for you to write down or print.
- When you unlock, the data key lives only in memory, as a non-extractable `CryptoKey`. The app locks itself after a chosen idle time (default 15 minutes, set in settings) and when you choose "Lock now".
- If you forget the passphrase and lose the recovery words, the data is gone. That's the trade for real encryption, and the README and the setup screen say so.

### `store.js` API

```js
Store.status()            // 'new' | 'locked' | 'unlocked'
Store.setup(passphrase)   // first run → returns recovery words
Store.unlock(passphrase)  // or Store.unlockWithRecovery(words)
Store.lock()
Store.load()              // → full state object, same shape as today
Store.save(state)         // writes only records that changed
Store.snapshot(reason)    // full encrypted copy
Store.restoreSnapshot(id)
Store.purgeDischarged(days)
```

Inside `app.js`, `saveState()` keeps its name and stays synchronous for its ~70 callers. It updates `lastSavedAt`, then schedules `Store.save(state)` after a ~300 ms pause. It saves immediately on `pagehide` and `visibilitychange`, because phones kill background tabs without warning.

**Detecting what changed:** today only one code path sets `patient.updatedAt` (`app.js:755`), so `updatedAt` can't be trusted to spot edits. Instead, `Store.save` keeps a hash of each patient's JSON from the last write, and re-encrypts only the patients whose hash changed. Deleted patients are removed and get a tombstone in the same transaction. `Store.save` also sets `updatedAt` on every patient it writes, which the merge needs.

**Two tabs:** the `storage` event goes away along with `localStorage`. A `BroadcastChannel('roundingos')` replaces it: after a save, the tab posts "changed", and the other tab reloads its state from the store, as the current code does.

**Discharge purge:** when a patient's dispo becomes discharged, `purgeAfter` is set to now + N days (default 3, changeable in settings). `Store.purgeDischarged` runs at unlock and at the new-day rollover.

### Data migration (localStorage → encrypted database)

By now the data lives in `localStorage['roundingos_hospitalist_v1']` at the GitHub Pages address (phase 1 moved it there). The update runs at that same address, so it can read that data directly:

1. After the update installs, the app shows **Setup**: a passphrase, entered twice, then the recovery words.
2. `store.js` reads `roundingos_hospitalist_v1` and writes every patient and the settings into the encrypted database.
3. It re-reads everything from the database and checks that the patient count and ids match.
4. Only then does it delete `roundingos_hospitalist_v1` and `roundingos_pre_import_snapshot` from `localStorage`. If any step fails, `localStorage` is left untouched and you see an error.
5. Before step 2, the setup screen offers an encrypted export of the current data as a backup, and recommends taking it.

Do this on each device, since each one has its own data. Afterwards, `localStorage` holds no patient data, and the "test data only" warning comes down.

### Phone ↔ laptop

The two installs have separate databases. There is no server, so data moves only as an encrypted file you carry (AirDrop, a cable, a USB stick, or a file you email yourself, since it's encrypted).

- **Export:** the whole census plus settings, encrypted with a passphrase you type for this export, in the existing `roundingos-encrypted-v1` format (now at 600k iterations).
- **Import merges instead of replacing:** patients are matched by `id`, and the newer `updatedAt` wins. A patient that exists on only one side is added. A patient deleted on this device after the export was made stays deleted (the `tombstones` table tracks this). Before applying, the app shows a summary such as "3 new, 5 updated, 1 kept local (newer)". It takes a snapshot first, so one tap undoes the import. "Replace everything" stays as a second option.
- QR hand-off for a single patient or the sign-out list is a nice-to-have. Leave it out unless the file route proves too clumsy.

### Risks

| Risk | Mitigation |
|---|---|
| Losing data during migration | Old data is deleted only after a verified re-read, and the setup screen offers an export first. |
| Forgotten passphrase | Recovery words at setup, with a "confirm you saved them" step: type 3 of the words back. |
| Unlock friction on rounds | 600k PBKDF2 takes ~0.3–1 s on a phone, once per unlock, not per save. The idle lock time is configurable. Biometric unlock (WebAuthn PRF) is a possible later addition, not part of this plan. |
| Async save racing with the phone killing the tab | The save waits ~300 ms after an edit, and saves immediately on `pagehide`/`visibilitychange`. Dexie transactions are atomic, so a record is either old or new, never half-written. |
| Merge brings back a deleted patient or loses an edit | Tombstones, newer-wins, a summary before applying, and a snapshot. Tested below. |
| Clocks differ between devices | If they differ by minutes, the summary shows which side won, and you can undo. Acceptable for one user. |

### Acceptance checks

Automated (`tests/index.html`, against a throwaway database `roundingos-test`):
- A save → reload round-trip gives an identical `state`.
- A wrong passphrase fails, and the recovery words unlock.
- Raw database rows contain no patient name, room or MRN. The test searches the stored bytes for known test names.
- Editing one patient rewrites one row only.
- Migration: counts match, the old keys are deleted only after the verify, and a forced failure leaves `localStorage` untouched.
- Merge: newer wins, tombstones block deleted patients from coming back, and re-importing the same file changes nothing.
- An old 150,000-iteration `.rnos` export still imports.
- Purge removes only discharged patients past their window.

Manual, on both devices:
- Updating an existing phase-1 install shows Setup. After setup, the census is the same as before, and `localStorage` has no patient data.
- DevTools → Application → IndexedDB shows only ids and ciphertext.
- Edit a patient, close the app mid-edit, reopen and unlock: the edit is there.
- A 40-patient census (load the test data three times) stays responsive while typing.
- Export on the laptop → import on the phone: counts match, there are no duplicates, and a patient deleted on the phone stays deleted.

**Size:** 4–5 days. `store.js` and the key handling are the careful part. The change to `app.js` is ~100 lines.

---

## Phase 4 · On-device voice

**Goal:** dictation and voice commands work with no audio leaving the device. Cloud speech is only an explicit opt-in.

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

None. The voice setting defaults to Off for everyone. The custom vocabulary is read from the encrypted settings that phase 3 set up.

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
                crypto.js      kept; 600k iterations, reads old files            phase 3
                store.js       Dexie + per-record encryption                     phase 3
                transfer.js    export / import / merge                           phase 3
src/clinical/   calc.js (phase 2)  algorithms.js  dotphrases.js
src/features/   planbuilder.js  progressnote.js  exambuilder.js  physical-exam-builder.js  reminders.js  signout.js
src/speech/     speech.js      kept: text clean-up + command parsing
                voice.js  voice-webspeech.js  voice-vosk.js  voice-whisper.js  voice-worker.js   phase 4
vendor/         dexie, vosk-browser, transformers.js  (+ VERSIONS.md)
tests/          index.html  harness.js  *.test.js
```

Removed: `server.ps1` and `Start-Hospitalist-Tracker.bat`. On your machine, delete the plain-text `data/` folder once the data has moved into the PWA.

## Release checklist

Run on both devices after phase 3, before any real patient. Re-run the voice items after phase 4.

- [ ] `pnpm test` (tests/index.html) all green
- [ ] Airplane mode: open, unlock, add a patient, print sign-out
- [ ] Voice is Off (until phase 4); after phase 4, dictation and a voice command work in airplane mode
- [ ] Network panel: no requests leave the device during a full session
- [ ] IndexedDB and `localStorage` contain no readable patient text
- [ ] A wrong passphrase fails; the recovery words work
- [ ] Laptop export → phone import: counts match, no duplicates, re-import is a no-op
- [ ] A discharged test patient is gone after the purge window
- [ ] Screens match the screenshots taken before phase 1

## Decisions for you

1. **Recovery words** (phase 3): print or write them down (recommended), or skip them and accept that a forgotten passphrase loses the data.
2. **Public repo** (phase 1): fine for code, but anyone can see the dot phrases. Keep it public, or move to a private repo + Cloudflare Pages/Access.
3. **Model download** (phase 4): from Hugging Face once (simpler), or self-hosted, so the app never contacts a third party.
