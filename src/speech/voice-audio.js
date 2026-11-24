/**
 * RoundingOS — microphone capture for the on-device speech engines.
 * Gives 16 kHz mono Float32 blocks (~100 ms each). Nothing is recorded to disk or sent anywhere;
 * the blocks go straight to the engine and are dropped.
 */
const VoiceAudio = (() => {
  'use strict';
  const RATE = 16000;
  const BASE = (document.currentScript && document.currentScript.src) || location.href;
  let ctx = null, stream = null, node = null, source = null;

  /* Linear resample, used when the browser won't open a 16 kHz AudioContext. */
  function resample(input, fromRate, toRate = RATE) {
    if (fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const out = new Float32Array(Math.floor(input.length / ratio));
    for (let i = 0; i < out.length; i++) {
      const x = i * ratio, i0 = Math.floor(x), f = x - i0;
      out[i] = input[i0] * (1 - f) + (input[i0 + 1] ?? input[i0]) * f;
    }
    return out;
  }

  /* Root-mean-square level of a block, for the level meter and simple pause detection. */
  function level(block) {
    let s = 0;
    for (let i = 0; i < block.length; i++) s += block[i] * block[i];
    return Math.sqrt(s / (block.length || 1));
  }

  /** start({ onBlock(Float32Array16k, rms) }) → Promise; asks for the mic the first time. */
  async function start({ onBlock, workletUrl }) {
    await stop();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    try { ctx = new AudioContext({ sampleRate: RATE }); } catch (e) { ctx = new AudioContext(); }
    const url = workletUrl || new URL('voice-capture-worklet.js', BASE).href;
    await ctx.audioWorklet.addModule(url);
    source = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, 'roundingos-capture');
    const rate = ctx.sampleRate;
    node.port.onmessage = (e) => {
      const block = resample(e.data, rate);
      onBlock(block, level(block));
    };
    source.connect(node);
    // Not connected to the speakers: the worklet keeps running because its node is pulled by the graph below.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    node.connect(sink).connect(ctx.destination);
    return { sampleRate: RATE, deviceRate: rate };
  }

  async function stop() {
    try { source && source.disconnect(); } catch (e) { /* already gone */ }
    try { node && node.disconnect(); } catch (e) { /* already gone */ }
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (ctx) { try { await ctx.close(); } catch (e) { /* already closed */ } }
    ctx = stream = node = source = null;
  }

  /** Decodes an audio file (for repeatable tests) into 16 kHz mono. */
  async function decodeFile(file) {
    const buf = await file.arrayBuffer();
    const tmp = new AudioContext();
    const audio = await tmp.decodeAudioData(buf);
    await tmp.close();
    const frames = Math.ceil(audio.duration * RATE);
    const off = new OfflineAudioContext(1, frames, RATE);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start();
    const out = await off.startRendering();
    return out.getChannelData(0);
  }

  function concat(blocks) {
    const n = blocks.reduce((a, b) => a + b.length, 0);
    const out = new Float32Array(n);
    let o = 0;
    for (const b of blocks) { out.set(b, o); o += b.length; }
    return out;
  }

  return { RATE, start, stop, level, resample, decodeFile, concat };
})();
