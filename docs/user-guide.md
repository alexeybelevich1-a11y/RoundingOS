# RoundingOS user guide

How the app keeps, locks and moves data. RoundingOS is a hobby research project for test data only:
see the notice and medical disclaimer in the [README](../README.md).

## First start
A fresh install first asks you to **choose a passphrase** and shows **12 recovery words** to write down (you type
three of them back to check). Then it starts with an **empty census**. ⋯ → **Add 14 test patients** loads the sample patients.

## Passphrase, recovery words and locking
- Every record (patients, the archive, settings and saved copies) is encrypted with AES-256-GCM using a random key.
  That key is stored only locked by your passphrase (PBKDF2-SHA256, 600,000 rounds) and by your recovery words.
- The app opens locked and **locks itself** after 15 minutes without use (5, 15, 30 or 60 in ⋯ → Settings & backup),
  and when you choose ⋯ → **Lock now**. Locking reloads the page, so no patient data stays on screen or in memory.
- **Forgot the passphrase?** On the lock screen, *Forgot passphrase?* takes your 12 recovery words and a new passphrase.
- **Keep the recovery words safe and away from the device.** Without the passphrase and the words, the data on that
  device cannot be opened by anyone, including you. Export an encrypted backup regularly.
- Each device has its own passphrase and words. Backups (.rnos) have their own passphrase, typed at export.

## Where data lives
- Only on the device, in the installed app's on-device database (IndexedDB, one encrypted record per patient; see
  `src/core/store.js`). Only ids, dates and counts are readable there. The first start after the update moves older data out of `localStorage` and deletes the
  old copy only after checking the move. The web address serves code only;
  nothing is uploaded. The app's Content-Security-Policy blocks network requests to any other address.
- **Discharged patients:** Actions → *Discharged: move to archive* takes a patient off the census (the census
  filter's *Archive* option still shows them, and *Return to census* brings them back). Archived patients are
  deleted from the device after 30 days, including from saved copies. Both times are in ⋯ → Settings & backup.
  "Discharge today" never archives or deletes anyone.
- **Saved copies:** the app keeps the last 7 copies of all data (daily, and before an import, a restore or clearing
  the census). ⋯ → Settings & backup → *Saved copies…* lists them; you can restore one (with Undo) or delete it.
- Each device keeps its own data. The app asks the browser to keep its storage (`navigator.storage.persist()`).
  On iPhone, use the installed app, not a Safari tab, or Safari may clear the data after 7 days unused.
- **Voice is off by default.** Turning it on (⋯ → Voice input) shows a notice: browser speech recognition
  sends audio to Google/Apple/Microsoft. On-device voice is planned (phase 4).

## Backup and moving between devices
⋯ → **Settings & backup → Export encrypted (.rnos)**, then **Import backup…** on the other device.
Import shows a summary ("2 new, 5 updated, 1 kept local (newer)") and offers **Merge** (the newer copy of each
patient wins, and patients deleted on either device stay deleted) or **Replace everything**. Either one can be
undone from the toast; a copy of the data is kept before every import.
Moving from the old `localhost`/`file://` app works the same way: export there, import in the installed app.
Afterwards delete any old plain-text `data/` folder and `backup-*.json` files.

## If encryption can't open
If the encrypted database can't open on a browser (the app then shows "Not encrypted on this device"), it falls
back to plain browser storage: **use test data only** there.

## Quick exam
**Quick exam** beside the exam field opens the Physical Exam Quick-Builder: 8 systems, about 150 findings and
31 condition presets with search. `physical-exam-builder.html` is a standalone preview of it.
