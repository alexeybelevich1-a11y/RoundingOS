# Vendored libraries

Copied as is from the published npm package. Nothing here is loaded from a CDN.
To update one: download the new package, replace the files, update this table, add the
file to `APP_FILES` in `sw.js` if its name changed, and bump `CACHE_VERSION`.

| Library | Version | Files | Source | License | SHA-256 of the main file |
|---|---|---|---|---|---|
| Dexie.js | 4.4.7 | `dexie/dexie.min.js`, `dexie/LICENSE`, `dexie/NOTICE` | npm `dexie@4.4.7`, `dist/dexie.min.js` | Apache-2.0 | `cb8f25adfa9df62e466ab2ce0c1d7c06cfc0dd2651256b2b022ccd923bfc9a1a` |

The source map that `dexie.min.js` names in its last line is not copied, so DevTools may log a
harmless 404 for `dexie.min.js.map` when it is open.
