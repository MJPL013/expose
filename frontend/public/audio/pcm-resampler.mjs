/** Area-weighted resampling preserves duration across 44.1/48 kHz microphones. */
export class PCM16Resampler {
  constructor(inputRate, onFrame) {
    this.ratio = inputRate / 16000;
    this.remaining = this.ratio;
    this.sum = 0;
    this.frame = new Int16Array(512);
    this.index = 0;
    this.onFrame = onFrame;
  }
  push(input) {
    for (const sample of input) {
      let available = 1;
      while (available > 1e-8) {
        const weight = Math.min(available, this.remaining);
        this.sum += sample * weight;
        available -= weight;
        this.remaining -= weight;
        if (this.remaining < 1e-8) {
          const value = Math.max(-1, Math.min(1, this.sum / this.ratio));
          this.frame[this.index++] = Math.round(value * (value < 0 ? 32768 : 32767));
          this.sum = 0;
          this.remaining = this.ratio;
          if (this.index === 512) {
            // Explicit little endian, independent of the platform's typed-array representation.
            const bytes = new ArrayBuffer(1024), view = new DataView(bytes);
            this.frame.forEach((value, i) => view.setInt16(i * 2, value, true));
            this.onFrame(bytes);
            this.index = 0;
          }
        }
      }
    }
  }
}
