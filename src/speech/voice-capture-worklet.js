/* RoundingOS — AudioWorklet that hands raw microphone samples to the page in ~100 ms blocks.
 * Loaded by src/speech/voice-audio.js. Audio stays in memory on this device. */
class RoundingOSCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(Math.round(sampleRate / 10));
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf.slice(0));
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('roundingos-capture', RoundingOSCapture);
