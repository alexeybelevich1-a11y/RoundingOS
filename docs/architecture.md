# Architecture

RoundingOS is a static web app: plain HTML, CSS and JavaScript, no framework, no runtime dependencies, no build step (pnpm is dev tooling only: `pnpm dev`, `pnpm test`).
Everything runs in the browser and all patient data stays on the device.

## Current structure (`main`)

`index.html` holds all markup (no inline scripts or handlers) and loads 11 plain scripts in this order:

| Script | Global | Role |
|---|---|---|
| `data.js` | `CHECKLIST_DEFINITIONS`, `getDefaultAppState()`, `getInitialTestPatients()` | Data schema, defaults, 14 fictional test patients |
| `crypto.js` | `BackupCrypto` | AES-256-GCM + PBKDF2 for the encrypted export/import file (`.rnos`) |
| `dotphrases.js` | dot-phrase data | Note templates |
| `progressnote.js` | `ProgressNoteEngine` | Builds the live progress note |
| `exambuilder.js` | `ExamBuilder` | Physical Exam Quick-Builder |
| `algorithms.js` | `ClinicalAlgorithms` | 10 branching clinical algorithms (pure data + functions, no DOM) |
| `calc.js` | `Calc` | Bedside calculators as pure functions (numbers in, result out, `null` on missing input, no DOM) |
| `planbuilder.js` | `PlanBuilder` | Plan Builder templates; draws the calculators and calls `Calc` |
| `reminders.js` | `ReminderEngine` | Alarms and reminders |
| `speech.js` | `SpeechEngine` | Web Speech recognition, dictation clean-up, voice-command parsing |
| `signout.js` | `SignOutEngine` | I-PASS sign-out text |
| `app.js` | (none, IIFE) | Main controller; loads last |

`physical-exam-builder.html` is a standalone preview of the exam builder. `styles.css` holds all styles
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
- Persistence: `saveState()` writes JSON to `localStorage['roundingos_hospitalist_v1']` (plain text) and,
  when started through `server.ps1`, also POSTs to `/api/data`. A `storage` event listener syncs other tabs.
- Voice: `app.js` calls `SpeechEngine` (`toggleDictation`, `startCommandMode`, `parseVoiceCommand`, ...),
  which uses the browser's cloud Web Speech API today.

## Target design

The full plan is in [`plan.md`](plan.md). In short:

- **PWA (phase 1, PR #2):** `manifest.json`, `sw.js` (cache-first, `CACHE_VERSION`, no auto-reload),
  `pwa.js` (install item, update toast), a strict Content-Security-Policy that blocks off-device requests.
  Hosted as code only on GitHub Pages. `server.ps1` and the `.bat` launcher go away.
- **Calculators (phase 2, done):** `calc.js` holds each calculator as a pure function; `planbuilder.js` only wires the DOM.
  Tests live in `tests/` (a browser test page, no dependencies): `calc.test.js`, `dictation.test.js`, `commands.test.js`.
- **Encrypted storage (phase 3):** `store.js` (Dexie/IndexedDB, per-record AES-GCM, passphrase + recovery words)
  is the only code that touches storage or keys. `app.js` keeps its `state` object and `saveState()` callers;
  only load/save changes. `transfer.js` does export/import with merge.
- **On-device voice (phase 4):** `voice.js` adapter over Vosk (commands) and Whisper/Moonshine (dictation).
  `speech.js` keeps the text side (clean-up and command parsing). Cloud speech only as an explicit opt-in.

Third-party libraries are copied into `vendor/` with versions in `vendor/VERSIONS.md`. Nothing loads from a CDN at runtime.
