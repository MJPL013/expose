type Vad = import("@ricky0123/vad-web").MicVAD;
export type SpeechCallbacks = {
  start(): void;
  end(): void;
  onset?(): void;
  misfire?(): void;
  error(error: Error): void;
};
export const speechBoundaries = {
  positiveSpeechThreshold: 0.6,
  negativeSpeechThreshold: 0.35,
  minSpeechMs: 250,
  preSpeechPadMs: 400,
  redemptionMs: 1000,
};

/** One foreground microphone and PCM worklet. Idle audio never leaves this object. */
export class PreparedMicrophone {
  constructor(private boundaries = speechBoundaries) {}
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private preparation: Promise<void> | null = null;
  private generation = 0;
  private vad: Vad | null = null;
  private vadLoading: Promise<void> | null = null;
  private vadTransition: Promise<void> = Promise.resolve();
  private callbacks: SpeechCallbacks | null = null;
  private ring: ArrayBuffer[] = [];
  onFrame: ((frame: ArrayBuffer) => void) | null = null;
  get listening() {
    return this.vad?.listening === true && Boolean(this.callbacks);
  }
  get ready() {
    return (
      this.node !== null &&
      this.context?.state !== "closed" &&
      this.stream?.getAudioTracks().some((t) => t.readyState === "live") ===
        true
    );
  }
  prepare() {
    if (this.ready) return this.context?.resume() ?? Promise.resolve();
    if (this.preparation) return this.preparation;
    const generation = this.generation;
    const pending = this.open(generation).finally(() => {
      if (this.preparation === pending) this.preparation = null;
    });
    this.preparation = pending;
    return pending;
  }
  private async open(generation: number) {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioContext === "undefined"
    )
      throw new Error(
        "Use HTTPS and allow microphone access, or type your answer.",
      );
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      throw new DOMException("Microphone cancelled", "AbortError");
    }
    this.stream = stream;
    const context = (this.context = new AudioContext());
    try {
      await context.audioWorklet.addModule("/audio/capture-worklet.js");
      await context.resume();
      if (generation !== this.generation)
        throw new DOMException("Microphone cancelled", "AbortError");
      this.node = new AudioWorkletNode(context, "expose-pcm", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.node.port.onmessage = (event) => {
        const frame = event.data as ArrayBuffer;
        if (this.callbacks) {
          this.ring.push(frame.slice(0));
          if (this.ring.length > 13) this.ring.shift();
        }
        this.onFrame?.(frame);
      };
      this.source = context.createMediaStreamSource(stream);
      this.source.connect(this.node);
      this.node.connect(context.destination);
    } catch (error) {
      if (generation === this.generation) this.release();
      throw error;
    }
  }
  preRoll() {
    return this.ring.map((f) => f.slice(0));
  }
  private syncVad() {
    const vad = this.vad,
      generation = this.generation;
    if (!vad) return Promise.resolve();
    // A pause awaits stream management before resetting the model. Serialize it
    // with rearming so a late pause cannot disable a newly resumed detector.
    this.vadTransition = this.vadTransition
      .then(async () => {
        if (generation !== this.generation || vad !== this.vad) return;
        if (this.callbacks) await vad.start();
        else await vad.pause();
      })
      .catch((error) => {
        if (generation !== this.generation) return;
        const callbacks = this.callbacks;
        this.callbacks = null;
        callbacks?.error(
          error instanceof Error
            ? error
            : new Error("Hands-free unavailable. Use Hold to speak or Type."),
        );
      });
    return this.vadTransition;
  }
  listen(callbacks: SpeechCallbacks | null) {
    this.callbacks = callbacks;
    if (!callbacks) {
      this.ring = [];
      void this.syncVad();
      return;
    }
    if (!this.ready) return;
    if (this.vad) {
      void this.syncVad();
      return;
    }
    if (this.vadLoading) return;
    const generation = this.generation;
    this.vadLoading = (async () => {
      const { MicVAD } = await import("@ricky0123/vad-web");
      if (generation !== this.generation || !this.context || !this.stream)
        return;
      const context = this.context,
        stream = this.stream;
      const vad = await MicVAD.new({
        model: "v5",
        startOnLoad: false,
        audioContext: context,
        ortConfig: (ort) => {
          ort.env.wasm.numThreads = 1;
        },
        baseAssetPath: "/audio/vad/",
        onnxWASMBasePath: "/audio/vad/",
        ...this.boundaries,
        getStream: async () => stream,
        pauseStream: async () => {},
        resumeStream: async () => {
          if (generation !== this.generation || !this.ready)
            throw new Error("Enable microphone first.");
          return stream;
        },
        onSpeechStart: () => this.callbacks?.onset?.(),
        onVADMisfire: () => this.callbacks?.misfire?.(),
        onSpeechRealStart: () => this.callbacks?.start(),
        onSpeechEnd: () => this.callbacks?.end(),
      });
      if (generation !== this.generation) {
        await vad.destroy();
        return;
      }
      this.vad = vad;
      await this.syncVad();
    })()
      .catch((error) => {
        if (generation !== this.generation) return;
        const cb = this.callbacks;
        this.callbacks = null;
        cb?.error(
          error instanceof Error
            ? error
            : new Error(
                "Hands-free could not start. Use Hold to speak or Type.",
              ),
        );
      })
      .finally(() => {
        if (generation === this.generation) this.vadLoading = null;
      });
  }
  release() {
    this.generation++;
    this.preparation = null;
    this.vadLoading = null;
    this.callbacks = null;
    this.onFrame = null;
    this.ring = [];
    const vad = this.vad;
    if (vad) void this.vadTransition.then(() => vad.destroy()).catch(() => {});
    this.vad = null;
    this.source?.disconnect();
    this.node?.disconnect();
    this.source = null;
    this.node = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.context && this.context.state !== "closed")
      void this.context.close().catch(() => {});
    this.context = null;
  }
}
