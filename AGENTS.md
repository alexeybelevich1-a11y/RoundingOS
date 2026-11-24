# Instructions for AI coding agents

Read [`docs/architecture.md`](docs/architecture.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md) first.
The roadmap is [`docs/plan.md`](docs/plan.md). These rules apply to every change.

## Stack

- Plain JavaScript loaded with `<script>` tags, following the existing IIFE-global module pattern.
- No React, Vue, Tailwind, TypeScript, npm packages, bundlers or any build step.
- New libraries only when the plan calls for them, copied into `vendor/` with the version in `vendor/VERSIONS.md`. Never load from a CDN.
- Keep `app.js`'s in-memory `state` and the synchronous `saveState()` contract; do not rewrite the controller.

## UI

- Keep the current UI unchanged: layout, wording, styles and behavior. Add new UI only where the task requires it,
  reusing existing markup patterns and CSS classes.
- No inline `<script>`, `<style>` or `on*=` handlers in HTML (the Content-Security-Policy blocks them).

## Patient data and privacy

- Escape all patient and user text before inserting it as HTML (use the existing `esc()` helpers). Prefer `textContent`.
- No network requests that send data off the device: no analytics, telemetry, remote logging, fonts or CDNs.
  The only allowed fetches are the app's own files (and, in phase 4, the speech model download named in the plan).
- No real patient data (PHI) anywhere in the repo: code, tests, fixtures, comments, commit messages or PR text.
  Use obviously fictional patients.
- Do not weaken encryption, add plaintext copies of patient data, or log patient data to the console.

## Clinical content

- Calculator formulas, thresholds, doses and expected test values must cite a source in a comment
  (guideline, paper, or a named reference calculator).
- Never invent a clinical value. If you cannot verify it, leave a `TODO(clinical): needs source` and say so in the PR.

## Before opening a PR

- Run `tests/index.html` (once it exists) and confirm all tests pass; report the result in the PR.
- Load the app, click through the screens you touched with the console open, and fix any errors.
- If you added or renamed an app file, update `index.html` and `APP_FILES` in `sw.js`, and bump `CACHE_VERSION`.
- Keep the change small and focused on one task. Note user-visible changes in `CHANGES.md`.
