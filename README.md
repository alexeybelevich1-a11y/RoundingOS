# RoundingOS

Local-first hospitalist rounding workstation: census, checklists, tasks, consults, live progress note,
structured workup and management templates, clinical algorithms (Plan Builder), I-PASS sign-out and reminders.
Plain HTML/CSS/JavaScript with no dependencies and no build step. Data stays on the device, encrypted with your passphrase.

> [!WARNING]
> **Hobby research project. Do not use it in hospitals or for patient care.**
> RoundingOS is an experimental hobby research project. It has only ever been used with invented test patients
> and contains **no real patient data**. It is **not HIPAA compliant**. Don't enter real patient information.
> See also the [medical disclaimer](#medical-disclaimer).

## Install
RoundingOS is a Progressive Web App served from GitHub Pages:
**https://alexeybelevich1-a11y.github.io/RoundingOS/**. Once installed it runs with no network.

- **Android (Chrome):** open the address, then **⋯ → Install app…** (or Chrome's **⋮ → Install app**).
- **Laptop (Chrome / Edge):** the install icon at the right of the address bar, or **⋯ → Install app…**.
- **iPhone (Safari):** **Share → Add to Home Screen**.

On first start you choose a passphrase. ⋯ → **Add 14 test patients** loads sample patients.

## Docs
- [User guide](docs/user-guide.md): passphrase and locking, where data lives, archive, backup and moving between devices.
- [Contributing](CONTRIBUTING.md): running locally, tests, pull requests and the contributor agreement.
- [Architecture](docs/architecture.md): how the code is laid out. [Plan](docs/plan.md): the roadmap.
- [CHANGES.md](CHANGES.md): latest changes.

## Develop
```sh
pnpm install && pnpm dev   # http://localhost:8000/
pnpm test                  # headless test run
```
Details are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Medical disclaimer
RoundingOS is a hobby research project for a note-taking and organizing aid for clinicians, and is
not for use in hospitals or patient care (see the notice at the top). It is **not a medical device** and is not
cleared or approved by any regulator. It does not replace clinical judgment. Verify every calculator
result, score and threshold against the original source before acting on it. The software is provided
"as is", without warranty of any kind (see sections 15 and 16 of the license).

## License
Copyright 2026 Alexey Belevich and RoundingOS contributors.

Licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (AGPL-3.0-only).
In short: you may use, change and share RoundingOS, but if you distribute it, or run a changed version
for other people over a network, you must make your source code available under the same license.
See [NOTICE](NOTICE) for attribution. Third-party code in `vendor/` keeps its own license
(Dexie.js is Apache-2.0); see [vendor/VERSIONS.md](vendor/VERSIONS.md).
