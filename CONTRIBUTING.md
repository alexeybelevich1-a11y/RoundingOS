# Contributing

RoundingOS is plain HTML/CSS/JavaScript with no build step and no runtime dependencies.
pnpm is used for dev tooling only (a local server and the headless test run).
Read [`docs/architecture.md`](docs/architecture.md) for how the code fits together and
[`docs/plan.md`](docs/plan.md) for where it is going. AI coding agents also follow [`AGENTS.md`](AGENTS.md).

## Run locally

Needs Node 20+ and pnpm (run `corepack enable` once to get the version pinned in `package.json`).

```sh
pnpm install                          # once
pnpm exec playwright install chromium # once: the browser the tests run in
pnpm dev                              # http://localhost:8000/  (pnpm dev --port 9000 for another port)
```

Opening `index.html` directly (`file://`) mostly works, but the microphone and the service worker need http(s).
Use the menu item **Test data → Add 14 test patients** for sample data, or open `http://localhost:8000/?demo=1`, which loads them automatically when the census is empty.

## Tests

```sh
pnpm test    # runs tests/index.html in headless Chromium; exits non-zero if any test fails
```

To watch them in a browser, open `http://localhost:8000/tests/index.html` while `pnpm dev` runs.
A test shown as `○ TODO` is waiting for a clinical value to be filled in from a cited source; it does not fail the run.
All tests must be green before you open a pull request; GitHub Actions runs `pnpm test` on every pull request.
Also click through the screens you changed with the browser console open and check for errors.

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

## License and contributor agreement
RoundingOS is licensed under the [GNU AGPL v3.0 only](LICENSE). The maintainer may later offer it under
other open-source terms (for example Apache 2.0), so contributions need a little more than the AGPL alone.

By opening a pull request or otherwise submitting a contribution, you agree that:

1. The contribution is your own work, or you have the right to submit it, and it contains no patient data.
2. It is licensed to the project under the AGPL-3.0-only.
3. You also grant the project maintainer (currently Alexey Belevich) a perpetual, worldwide, non-exclusive,
   royalty-free, irrevocable license to use, change, sublicense and relicense the contribution under any
   other open-source license approved by the OSI, such as Apache-2.0.
4. You keep the copyright in your contribution.

Add this line to each commit (`git commit -s` does it for you) to confirm the above:

```
Signed-off-by: Your Name <you@example.com>
```

Don't add code you can't license on these terms. When vendoring a library, use one whose license is
compatible with the AGPL (MIT, BSD, Apache-2.0 are fine), keep its LICENSE and NOTICE files next to it,
list it in `vendor/VERSIONS.md`, and add it to `NOTICE`.
