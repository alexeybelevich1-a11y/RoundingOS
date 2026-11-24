/**
 * RoundingOS — dictation worker: runs Whisper or Moonshine with transformers.js, off the main thread.
 * Started as a module worker: new Worker('src/speech/voice-worker.js', { type: 'module' }).
 *
 * Messages in:  { type: 'load', model, device: 'wasm'|'webgpu', dtype }
 *               { type: 'transcribe', id, audio: Float32Array (16 kHz mono), prompt? }
 * Messages out: { type: 'progress', file, loaded, total, status }
 *               { type: 'ready', ms, device, dtype }
 *               { type: 'result', id, text, ms }
 *               { type: 'error', id?, message }
 *
 * Model files come from Hugging Face the first time and are kept in the browser's cache
 * (Cache Storage "transformers-cache"), so later loads work offline. Audio never leaves the device.
 */
import { pipeline, env } from '../../vendor/transformers/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
// The ONNX runtime's WebAssembly comes from vendor/, never from a CDN.
env.backends.onnx.wasm.wasmPaths = new URL('../../vendor/transformers/', import.meta.url).href;
// GitHub Pages can't send the headers multi-threaded WebAssembly needs.
env.backends.onnx.wasm.numThreads = 1;

let asr = null;
let loadedKey = '';

async function load({ model, device = 'wasm', dtype = 'q8' }) {
  const key = `${model}|${device}|${JSON.stringify(dtype)}`;
  if (asr && loadedKey === key) return { cached: true };
  if (asr && asr.dispose) { try { await asr.dispose(); } catch (e) { /* ignore */ } }
  asr = null;
  const t0 = performance.now();
  asr = await pipeline('automatic-speech-recognition', model, {
    device,
    dtype,
    progress_callback: (p) => {
      if (p.status === 'progress' || p.status === 'done' || p.status === 'initiate') {
        self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded || 0, total: p.total || 0, status: p.status });
      }
    },
  });
  loadedKey = key;
  return { ms: Math.round(performance.now() - t0) };
}

async function transcribe({ audio }) {
  if (!asr) throw new Error('Speech model is not loaded yet.');
  const t0 = performance.now();
  const isWhisper = /whisper/i.test(loadedKey);
  const opts = isWhisper ? { chunk_length_s: 30, stride_length_s: 5 } : {};
  // Moonshine needs a token budget that fits the clip (~6.5 tokens per second of speech is plenty).
  if (!isWhisper) opts.max_new_tokens = Math.max(16, Math.ceil((audio.length / 16000) * 6.5));
  const out = await asr(audio, opts);
  const text = (Array.isArray(out) ? out.map(o => o.text).join(' ') : out.text || '').trim();
  return { text, ms: Math.round(performance.now() - t0) };
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'load') {
      const r = await load(msg);
      self.postMessage({ type: 'ready', ms: r.ms || 0, cached: Boolean(r.cached), device: msg.device, dtype: msg.dtype });
    } else if (msg.type === 'transcribe') {
      const r = await transcribe(msg);
      self.postMessage({ type: 'result', id: msg.id, text: r.text, ms: r.ms });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String((err && err.message) || err) });
  }
};
