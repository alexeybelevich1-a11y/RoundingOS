# Vendored libraries

Copied as is from the published npm package. Nothing here is loaded from a CDN.
To update one: download the new package, replace the files, update this table, add the
file to `APP_FILES` in `sw.js` if its name changed, and bump `CACHE_VERSION`.

| Library | Version | Files | Source | License | SHA-256 of the main file |
|---|---|---|---|---|---|
| Dexie.js | 4.4.7 | `dexie/dexie.min.js`, `dexie/LICENSE`, `dexie/NOTICE` | npm `dexie@4.4.7`, `dist/dexie.min.js` | Apache-2.0 | `cb8f25adfa9df62e466ab2ce0c1d7c06cfc0dd2651256b2b022ccd923bfc9a1a` |
| vosk-browser (Vosk, commands) | 0.0.8 | `vosk-browser/vosk.js`, `vosk-browser/LICENSE` | npm `vosk-browser@0.0.8`, `dist/vosk.js`, **patched** with `scripts/vendor/patch-vosk.py` (no `new Function`, for the CSP) | Apache-2.0 | `1a0156a1…` see below |
| transformers.js (Whisper / Moonshine) | 3.8.1 | `transformers/transformers.min.js`, `transformers/ort-wasm-simd-threaded.jsep.mjs`, `transformers/ort-wasm-simd-threaded.jsep.wasm`, `transformers/LICENSE` | npm `@huggingface/transformers@3.8.1`, `dist/` (the ONNX runtime files ship in the same folder) | Apache-2.0 | `aa5002b70e789798da263f5f99c62bd3e8fcd0c119258a493c40c180648365fa` |

The source map that `dexie.min.js` names in its last line is not copied, so DevTools may log a
harmless 404 for `dexie.min.js.map` when it is open.

Voice libraries (phase 5) are not in the service worker's install list: they are large (~28 MB) and only
needed once on-device voice is turned on. The speech models themselves are not in the repo; they download
from Hugging Face on first use and the browser keeps them.

SHA-256: `vosk-browser/vosk.js` (patched) `1a0156a10c44edca0dd8b395315d388433fbfa48453d7ec36d305df8eb2f86f2`
(npm original `29504515526e974f4cb053cf08811c4de5fb2a74007c0a5a957db50eaa8d5d0c`);
`ort-wasm-simd-threaded.jsep.wasm` `c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39`;
`ort-wasm-simd-threaded.jsep.mjs` `08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9`.
`transformers.min.js` names a source map that is not copied (harmless 404 in DevTools).
