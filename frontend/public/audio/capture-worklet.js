import { PCM16Resampler } from "./pcm-resampler.mjs";
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.resampler = new PCM16Resampler(sampleRate, frame => this.port.postMessage(frame, [frame]));
  }
  process(inputs) {
    const channels = inputs[0];
    if (channels?.length) {
      if (channels.length === 1) this.resampler.push(channels[0]);
      else {
        const mono = new Float32Array(channels[0].length);
        for (const channel of channels) for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length;
        this.resampler.push(mono);
      }
    }
    return true;
  }
}
registerProcessor("expose-pcm", CaptureProcessor);
