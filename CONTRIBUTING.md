# Contributing

RoundingOS is plain HTML/CSS/JavaScript with no build step and no dependencies.
Read [`docs/architecture.md`](docs/architecture.md) for how the code fits together and
[`docs/plan.md`](docs/plan.md) for where it is going. AI coding agents also follow [`AGENTS.md`](AGENTS.md).

## Run locally

Serve the folder over http from any static server, then open the printed address:

```sh
python3 -m http.server 8000      # or: npx serve .
```

Opening `index.html` directly (`file://`) mostly works, but the microphone and the service worker need http(s).
On Windows, `Start-Hospitalist-Tracker.bat` still works until the PWA work retires it.
Use the menu item **Test data → Add 14 test patients** for sample data.

## Tests

Once `tests/index.html` exists (added with the PWA and calculator work), open it from the local server.
All tests must be green before you open a pull request. Until then, click through the screens you changed
with the browser console open and check for errors.

## Branches and pull requests

1. Branch from `main`; keep one change per branch.
2. Keep pull requests small and describe what changed and how you checked it.
3. Releasing a change to the PWA: bump `CACHE_VERSION` in `sw.js` and add any new file to `APP_FILES`.
4. Add a line to `CHANGES.md` for user-visible changes.
5. Get a review before merging to `main` (GitHub Pages serves `main`).

## Rules

- **Never commit real patient data**, including in tests, fixtures, screenshots or issue text. Use invented patients only.
  `data/` and backup files are git-ignored; keep it that way.
- Keep the existing UI as it is unless a change is agreed first.
- Escape all user and patient text before inserting it as HTML.
- No network calls that send data off the device.
- Clinical values (calculator formulas, thresholds, expected test results) must cite a source.
