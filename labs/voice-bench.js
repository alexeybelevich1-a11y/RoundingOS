/* RoundingOS on-device voice test page (labs/voice-bench.html). Not part of the app.
 * Measures load time and delay for Vosk (commands) and Whisper/Moonshine (dictation) on this device.
 * Audio stays in memory and is dropped after each test. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);

  /* Fictional census, only so the parser has rooms and names to match. */
  const FAKE_PATIENTS = [
    { id: 'b1', room: '12', name: 'Testpatient Alpha' },
    { id: 'b2', room: '1204', name: 'Fictional Bravo' },
  ];

  const results = { device: {}, vosk: {}, asr: {}, command: [], dictation: [] };
  const fmtMs = ms => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
  const fmtMB = b => `${(b / 1048576).toFixed(1)} MB`;

  /* ---------- device ---------- */
  async function deviceInfo() {
    const d = results.device;
    d.userAgent = navigator.userAgent;
    d.cores = navigator.hardwareConcurrency || '?';
    d.memoryGB = navigator.deviceMemory || '?';
    d.webgpu = 'no';
    if (navigator.gpu) {
      try { d.webgpu = (await navigator.gpu.requestAdapter()) ? 'yes' : 'no adapter'; } catch (e) { d.webgpu = 'error'; }
    }
    d.crossOriginIsolated = String(self.crossOriginIsolated);
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      d.storageFree = est.quota ? fmtMB(est.quota - (est.usage || 0)) : '?';
    }
    $('deviceInfo').textContent = Object.entries(d).map(([k, v]) => `${k}: ${v}`).join('\n');
    // Sensible defaults: Moonshine on phones / small memory, Whisper base on laptops; GPU if there is one.
    const phone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.deviceMemory && navigator.deviceMemory < 8);
    $('asrModel').value = phone ? 'onnx-community/moonshine-base-ONNX' : 'Xenova/whisper-base.en';
    if (d.webgpu === 'yes' && !phone) { $('asrDevice').value = 'webgpu'; $('asrDtype').value = 'fp32'; }
    report();
  }

  function parsedLabel(text) {
    if (!text) return '–';
    const split = VoiceGrammar.splitRoomPrefix(text);
    const cmd = SpeechEngine.parseVoiceCommand(split ? split.command : text, FAKE_PATIENTS);
    const pre = split ? `select room ${split.room}, then ` : '';
    return `${pre}${cmd.type}${cmd.field ? ` ${cmd.field}` : ''}${cmd.text ? ` "${cmd.text}"` : ''}${cmd.ids ? ` ${cmd.ids.join(',')}` : ''}`;
  }

  /* ---------- 1. Vosk ---------- */
  let voskModel = null, voskRec = null, voskListening = false;
  let lastLoudAt = 0, stopAt = 0;

  async function loadVosk() {
    const file = $('voskFile').files[0];
    const url = file ? URL.createObjectURL(file) : $('voskUrl').value.trim();
    $('voskLoad').disabled = true;
    const t0 = performance.now();
    const tick = setInterval(() => { $('voskStatus').textContent = `Loading… ${fmtMs(performance.now() - t0)}`; }, 250);
    try {
      voskModel = await new Promise((ok, fail) => {
        const model = new Vosk.Model(url);
        const timer = setTimeout(() => fail(new Error('no answer after 5 minutes; check the address and your connection')), 300000);
        model.on('load', m => { clearTimeout(timer); m.result ? ok(model) : fail(new Error('the model file could not be opened')); });
        model.on('error', m => { clearTimeout(timer); fail(new Error(m.error || 'download failed')); });
      });
      const ms = performance.now() - t0;
      results.vosk = { model: file ? file.name : url.split('/').pop(), loadMs: Math.round(ms), grammar: $('voskGrammar').checked };
      $('voskStatus').textContent = `Ready in ${fmtMs(ms)}`;
      $('voskStart').disabled = false;
    } catch (e) {
      $('voskStatus').textContent = `Failed: ${e.message || e}`;
      $('voskStatus').classList.add('error');
      $('voskLoad').disabled = false;
    } finally {
      clearInterval(tick);
      report();
    }
  }

  function newRecognizer() {
    const grammar = $('voskGrammar').checked ? JSON.stringify(VoiceGrammar.buildCommandGrammar(FAKE_PATIENTS)) : undefined;
    const rec = grammar ? new voskModel.KaldiRecognizer(VoiceAudio.RATE, grammar) : new voskModel.KaldiRecognizer(VoiceAudio.RATE);
    rec.on('partialresult', m => { if (m.result.partial) $('voskPartial').textContent = m.result.partial; });
    rec.on('result', m => {
      const text = (m.result.text || '').trim();
      if (!text) return;
      const now = performance.now();
      const ms = stopAt ? now - stopAt : now - lastLoudAt;
      const how = stopAt ? 'after Stop' : 'after you stopped talking';
      const norm = VoiceGrammar.normalizeSpokenCommand(text);
      $('voskFinal').textContent = text;
      $('voskNorm').textContent = norm;
      $('voskParsed').textContent = parsedLabel(norm);
      $('voskLatency').textContent = `${fmtMs(ms)} ${how}`;
      $('voskPartial').textContent = '–';
      results.command.push({ engine: 'vosk', heard: text, parsed: parsedLabel(norm), delayMs: Math.round(ms), measured: how });
      report();
    });
    return rec;
  }

  async function startVosk() {
    stopAt = 0;
    voskRec = newRecognizer();
    try {
      await VoiceAudio.start({
        onBlock: (block, rms) => {
          $('voskLevel').value = rms;
          if (rms > 0.015) lastLoudAt = performance.now();
          if (voskRec) voskRec.acceptWaveformFloat(block, VoiceAudio.RATE);
        },
      });
      voskListening = true;
      $('voskStart').disabled = true; $('voskStart').classList.add('listening');
      $('voskStop').disabled = false;
    } catch (e) {
      $('voskStatus').textContent = `Microphone: ${e.message || e}`;
      $('voskStatus').classList.add('error');
    }
  }

  async function stopVosk() {
    if (!voskListening) return;
    voskListening = false;
    await VoiceAudio.stop();
    stopAt = performance.now();
    if (voskRec) { voskRec.retrieveFinalResult(); const r = voskRec; setTimeout(() => r.remove(), 3000); voskRec = null; }
    $('voskStart').disabled = false; $('voskStart').classList.remove('listening');
    $('voskStop').disabled = true; $('voskLevel').value = 0;
  }

  /* ---------- 2. Whisper / Moonshine ---------- */
  let worker = null, asrReady = false, nextId = 1;
  const pending = new Map();
  const fileSizes = new Map();

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker('../src/speech/voice-worker.js', { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        if (m.total) fileSizes.set(m.file, m.total);
        const total = [...fileSizes.values()].reduce((a, b) => a + b, 0);
        $('asrProgress').classList.remove('hidden');
        if (m.status === 'progress' && m.total) {
          $('asrProgress').value = m.loaded / m.total;
          $('asrStatus').textContent = `Downloading ${m.file} ${fmtMB(m.loaded)} / ${fmtMB(m.total)} (all files so far ${fmtMB(total)})`;
        }
      } else if (m.type === 'ready') {
        loadDone(m);
      } else if (m.type === 'result' || (m.type === 'error' && m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (p) (m.type === 'result' ? p.ok(m) : p.fail(new Error(m.message)));
      } else if (m.type === 'error') {
        $('asrStatus').textContent = `Failed: ${m.message}`;
        $('asrStatus').classList.add('error');
        $('asrLoad').disabled = false;
      }
    };
    worker.onerror = (e) => {
      $('asrStatus').textContent = `Worker failed: ${e.message || 'see the console'}`;
      $('asrStatus').classList.add('error');
      $('asrLoad').disabled = false;
    };
    return worker;
  }

  let asrT0 = 0;
  function loadAsr() {
    asrReady = false;
    fileSizes.clear();
    $('asrStatus').classList.remove('error');
    $('asrStatus').textContent = 'Loading…';
    $('asrLoad').disabled = true;
    asrT0 = performance.now();
    ensureWorker().postMessage({ type: 'load', model: $('asrModel').value, device: $('asrDevice').value, dtype: $('asrDtype').value });
  }

  function loadDone() {
    const ms = performance.now() - asrT0;
    const bytes = [...fileSizes.values()].reduce((a, b) => a + b, 0);
    results.asr = { model: $('asrModel').value, device: $('asrDevice').value, dtype: $('asrDtype').value, loadMs: Math.round(ms), size: bytes ? fmtMB(bytes) : 'from cache' };
    $('asrStatus').textContent = `Ready in ${fmtMs(ms)}${bytes ? ` (${fmtMB(bytes)} downloaded)` : ' (from cache)'}`;
    $('asrProgress').classList.add('hidden');
    $('asrLoad').disabled = false;
    asrReady = true;
    ['cmdRec', 'dicRec', 'dicFile'].forEach(id => { $(id).disabled = false; });
    report();
  }

  function transcribe(audio) {
    const id = nextId++;
    return new Promise((ok, fail) => {
      pending.set(id, { ok, fail });
      worker.postMessage({ type: 'transcribe', id, audio }, [audio.buffer]);
    });
  }

  /* Recorder shared by a) and b). */
  let blocks = [], recording = null, autoStop = null, timerTick = null;
  async function startRecording(kind) {
    if (!asrReady) return;
    blocks = [];
    recording = kind;
    const meter = kind === 'cmd' ? $('cmdLevel') : $('dicLevel');
    try {
      await VoiceAudio.start({ onBlock: (b, rms) => { blocks.push(b); meter.value = rms; } });
    } catch (e) {
      $('asrStatus').textContent = `Microphone: ${e.message || e}`;
      $('asrStatus').classList.add('error');
      recording = null;
      return;
    }
    const rec = kind === 'cmd' ? $('cmdRec') : $('dicRec');
    rec.disabled = true; rec.classList.add('listening');
    (kind === 'cmd' ? $('cmdStop') : $('dicStop')).disabled = false;
    if (kind === 'dic') {
      const t0 = performance.now();
      timerTick = setInterval(() => { $('dicTimer').textContent = `${Math.max(0, 30 - (performance.now() - t0) / 1000).toFixed(0)} s left`; }, 250);
      autoStop = setTimeout(() => stopRecording(), 30000);
    }
  }

  async function stopRecording() {
    const kind = recording;
    if (!kind) return;
    recording = null;
    clearTimeout(autoStop); clearInterval(timerTick);
    await VoiceAudio.stop();
    const stoppedAt = performance.now();
    const audio = VoiceAudio.concat(blocks);
    blocks = [];
    const rec = kind === 'cmd' ? $('cmdRec') : $('dicRec');
    rec.classList.remove('listening');
    (kind === 'cmd' ? $('cmdStop') : $('dicStop')).disabled = true;
    $('dicTimer').textContent = '';
    await runTranscription(kind, audio, stoppedAt);
    rec.disabled = false;
  }

  async function runTranscription(kind, audio, startedAt) {
    const seconds = audio.length / VoiceAudio.RATE;
    const out = kind === 'cmd' ? $('cmdText') : $('dicText');
    const lat = kind === 'cmd' ? $('cmdLatency') : $('dicLatency');
    out.textContent = 'Transcribing…';
    lat.textContent = '…';
    try {
      const r = await transcribe(audio);
      const ms = performance.now() - startedAt;
      if (kind === 'cmd') {
        const norm = VoiceGrammar.normalizeSpokenCommand(r.text.replace(/[.,!?]/g, ''));
        out.textContent = r.text || '(nothing heard)';
        $('cmdParsed').textContent = parsedLabel(norm);
        lat.textContent = `${fmtMs(ms)} after Stop (${seconds.toFixed(1)} s of audio)`;
        results.command.push({ engine: results.asr.model, heard: r.text, parsed: parsedLabel(norm), delayMs: Math.round(ms), audioS: +seconds.toFixed(1) });
      } else {
        const text = SpeechEngine.formatMedicalDictation(r.text);
        out.textContent = text || '(nothing heard)';
        const rtf = ms / 1000 / (seconds || 1);
        lat.textContent = `${fmtMs(ms)} for ${seconds.toFixed(1)} s of audio (${rtf.toFixed(2)}× real time; under 1 is faster than speech)`;
        results.dictation.push({ engine: results.asr.model, device: results.asr.device, audioS: +seconds.toFixed(1), transcribeMs: Math.round(ms), realTime: +rtf.toFixed(2), words: text.split(/\s+/).filter(Boolean).length });
      }
    } catch (e) {
      out.textContent = `Failed: ${e.message}`;
      out.classList.add('error');
      lat.textContent = '–';
    }
    report();
  }

  async function transcribeFile() {
    const f = $('dicFile').files[0];
    if (!f || !asrReady) return;
    try {
      const audio = await VoiceAudio.decodeFile(f);
      await runTranscription('dic', audio, performance.now());
    } catch (e) {
      $('dicText').textContent = `Could not read that file: ${e.message}`;
    }
  }

  /* ---------- report ---------- */
  function report() {
    const d = results.device;
    const lines = [
      `RoundingOS voice test, ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      `Device: ${d.userAgent}`,
      `Cores ${d.cores}, memory ${d.memoryGB} GB, WebGPU ${d.webgpu}, free storage ${d.storageFree || '?'}`,
    ];
    if (results.vosk.loadMs) lines.push(`Vosk: ${results.vosk.model}, loaded in ${fmtMs(results.vosk.loadMs)}, grammar ${results.vosk.grammar ? 'on' : 'off'}`);
    if (results.asr.loadMs) lines.push(`Dictation: ${results.asr.model} on ${results.asr.device} (${results.asr.dtype}), loaded in ${fmtMs(results.asr.loadMs)}, ${results.asr.size}`);
    for (const c of results.command) lines.push(`Command [${c.engine}] "${c.heard}" → ${c.parsed}, ${fmtMs(c.delayMs)}${c.measured ? ` ${c.measured}` : ''}`);
    for (const x of results.dictation) lines.push(`Dictation [${x.engine}, ${x.device}] ${x.audioS} s audio → ${fmtMs(x.transcribeMs)} (${x.realTime}× real time), ${x.words} words`);
    $('report').textContent = lines.join('\n');
  }

  async function copyReport() {
    try { await navigator.clipboard.writeText($('report').textContent); $('copyStatus').textContent = 'Copied'; }
    catch (e) { $('copyStatus').textContent = 'Select the text above and copy it'; }
  }

  $('voskLoad').addEventListener('click', loadVosk);
  $('voskStart').addEventListener('click', startVosk);
  $('voskStop').addEventListener('click', stopVosk);
  $('asrLoad').addEventListener('click', loadAsr);
  $('asrDevice').addEventListener('change', () => { $('asrDtype').value = $('asrDevice').value === 'webgpu' ? 'fp32' : 'q8'; });
  $('cmdRec').addEventListener('click', () => startRecording('cmd'));
  $('cmdStop').addEventListener('click', stopRecording);
  $('dicRec').addEventListener('click', () => startRecording('dic'));
  $('dicStop').addEventListener('click', stopRecording);
  $('dicFile').addEventListener('change', transcribeFile);
  $('copyReport').addEventListener('click', copyReport);
  deviceInfo();
})();
