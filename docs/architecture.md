# Architecture

RoundingOS is a static web app: plain HTML, CSS and JavaScript, no framework, no runtime dependencies, no build step (pnpm is dev tooling only: `pnpm dev`, `pnpm test`).
Everything runs in the browser and all patient data stays on the device.

## Current structure (`main`)

```
index.html                  the app page (all markup); loads the scripts below in order
physical-exam-builder.html  standalone preview of the exam builder
manifest.json  sw.js        PWA manifest and service worker (must stay at the root)
styles/styles.css           all styles (light, dark, sepia)
icons/                      app icons
src/
  core/       app.js (controller, loads last)  data.js  crypto.js  store.js  transfer.js  pwa.js
  clinical/   calc.js (calculators)  algorithms.js  dotphrases.js (templates)
  features/   planbuilder.js  progressnote.js  exambuilder.js  physical-exam-builder.js  reminders.js  signout.js
  speech/     speech.js (dictation clean-up, voice commands)
vendor/       dexie/ (Dexie 4.4.7)  VERSIONS.md
tests/        index.html  harness.js  *.test.js  ui-baseline/
scripts/      serve.mjs (pnpm dev)  test.mjs (pnpm test)
docs/         architecture.md  plan.md
```

Files are grouped by role: `src/core` runs the app, `src/clinical` holds clinical math and content (no DOM),
`src/features` holds one screen or tool per file, `src/speech` holds voice. Paths in `index.html`, `sw.js`
and `tests/index.html` are relative to the repo root, which GitHub Pages serves as is.

`index.html` holds all markup (no inline scripts or handlers) and loads these plain scripts in this order
(`src/core/pwa.js` first):

| Script | Global | Role |
|---|---|---|
| `vendor/dexie/dexie.min.js` | `Dexie` | IndexedDB wrapper (vendored, see `vendor/VERSIONS.md`) |
| `src/core/data.js` | `CHECKLIST_DEFINITIONS`, `getDefaultAppState()`, `getInitialTestPatients()` | Data schema, defaults, 14 fictional test patients |
| `src/core/crypto.js` | `BackupCrypto` | AES-256-GCM + PBKDF2 for the encrypted export/import file (`.rnos`) |
| `src/core/store.js` | `Store` | The on-device database: the only code that reads or writes saved data |
| `src/core/transfer.js` | `Transfer` | Export payload and the merging import (pure functions) |
| `src/clinical/dotphrases.js` | dot-phrase data | Note templates |
| `src/features/progressnote.js` | `ProgressNoteEngine` | Builds the live progress note |
| `src/features/exambuilder.js` | `ExamBuilder` | Physical Exam Quick-Builder |
| `src/clinical/algorithms.js` | `ClinicalAlgorithms` | 10 branching clinical algorithms (pure data + functions, no DOM) |
| `src/clinical/calc.js` | `Calc` | Bedside calculators as pure functions (numbers in, result out, `null` on missing input, no DOM) |
| `src/features/planbuilder.js` | `PlanBuilder` | Plan Builder templates; draws the calculators and calls `Calc` |
| `src/features/reminders.js` | `ReminderEngine` | Alarms and reminders |
| `src/speech/speech.js` | `SpeechEngine` | Web Speech recognition, dictation clean-up, voice-command parsing |
| `src/features/signout.js` | `SignOutEngine` | I-PASS sign-out text |
| `src/core/app.js` | (none, IIFE) | Main controller; loads last |

`physical-exam-builder.html` is a standalone preview of the exam builder. `styles/styles.css` holds all styles
(light, dark and sepia themes).

### Module pattern

Each feature file is an IIFE that returns one global object:

```js
const PlanBuilder = (() => {
  // private state and helpers
  return { open, renderAll /* public API */ };
})();
```

Load order in `index.html` is the dependency order. A new module goes before the files that use it,
and `app.js` stays last. There are no imports or bundling.

### `app.js` controller

- One in-memory `state` object (from `getDefaultAppState()`) holds the census, settings, UI state,
  dot phrases, reminders and custom vocabulary.
- Every change mutates `state`, then calls `saveState()` (about 70 call sites, synchronous) and re-renders.
- `renderAll()` redraws the census summary, census list, detail pane, right dock, and the Plan Builder if open.
  Rendering builds HTML strings; user text goes through `esc()` (`signout.js` has `escHtml`, `exambuilder.js` has `esc`).
- Persistence: `saveState()` stays synchronous. It stamps `lastSavedAt` and schedules `Store.save(state)`
  300 ms later (at once on `pagehide`/`visibilitychange`). `Store.save` compares each patient with what it last
  wrote and writes only changed rows, setting `updatedAt` on real edits. A `BroadcastChannel` tells other tabs
  to reload. If IndexedDB can't be opened, or the one-time move from `localStorage['roundingos_hospitalist_v1']`
  fails its check, the app keeps saving to `localStorage` as before.
- Database `roundingos` (tests use `roundingos-test` via `index.html?testdb=1`): `meta`, `patients` (id, purgeAfter),
  `settings`, `snapshots`, `tombstones`. Each record sits in a `payload` tagged `{ fmt: 'plain' }`; phase 4
  adds an encrypted format in `encodeRecord`/`decodeRecord` without a schema change.
- Voice: `app.js` calls `SpeechEngine` (`toggleDictation`, `startCommandMode`, `parseVoiceCommand`, ...),
  which uses the browser's cloud Web Speech API today.

## Target design

The full plan is in [`plan.md`](plan.md). In short:

- **PWA (phase 1, PR #2):** `manifest.json`, `sw.js` (cache-first, `CACHE_VERSION`, no auto-reload),
  `src/core/pwa.js` (install item, update toast), a strict Content-Security-Policy that blocks off-device requests.
  Hosted as code only on GitHub Pages. `server.ps1` and the `.bat` launcher go away.
- **Calculators (phase 2, done):** `calc.js` holds each calculator as a pure function; `planbuilder.js` only wires the DOM.
  Tests live in `tests/` (a browser test page, no dependencies): `calc.test.js`, `dictation.test.js`, `commands.test.js`.
- **Encrypted storage (phase 3):** `src/core/store.js` (Dexie/IndexedDB, per-record AES-GCM, passphrase + recovery words)
  is the only code that touches storage or keys. `app.js` keeps its `state` object and `saveState()` callers;
  only load/save changes. `src/core/transfer.js` does export/import with merge.
- **On-device voice (phase 4):** `src/speech/voice.js` adapter over Vosk (commands) and Whisper/Moonshine (dictation).
  `speech.js` keeps the text side (clean-up and command parsing). Cloud speech only as an explicit opt-in.

Third-party libraries are copied into `vendor/` with versions in `vendor/VERSIONS.md`. Nothing loads from a CDN at runtime.
