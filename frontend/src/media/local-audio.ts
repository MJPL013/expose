export type RecordedClip = {
  transcript?: string;
  remoteMediaId?: string;
  sharedMediaId?: string;
  id: string;
  ownerId: string;
  stepId: string;
  blob: Blob;
  url: string;
  durationMs: number;
  consent: boolean;
  submitted: boolean;
};
export type CaptureOptions = {
  purpose?: "answer" | "host";
  diagnosticConsent?: boolean;
  language?: import("@expose/shared/game/host").SpeechLanguage;
  hostBeatId?: string;
  hostTurn?: number;
  onSegment?: (text: string) => void;
};
export interface CaptureAdapter {
  start(
    ownerId: string,
    stepId: string,
    options?: CaptureOptions,
  ): Promise<void>;
  stop(): Promise<RecordedClip>;
  cancelCapture(): void;
}
export interface AudioService {
  start(ownerId: string, stepId: string): Promise<void>;
  stop(): Promise<RecordedClip>;
  cancelCapture(): void;
  commit(id: string, consent: boolean): void;
  remove(id: string): void;
  getClips(): readonly RecordedClip[];
  dispose(): void;
}

/** Local blobs only: this adapter has no transport or storage dependency. */
export class LocalAudioService implements AudioService {
  microphoneReady = false;
  async prepareMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Use HTTPS and allow microphone access, or keep playing by typing.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach(track => track.stop());
    this.microphoneReady = true;
  }
  private captureAdapter: CaptureAdapter | null = null;
  private captureActive = false;
  isCapturing = () => this.captureActive;
  private remoteMedia: {
    consent(id: string, value: boolean): Promise<void>;
    remove(id: string): Promise<void>;
  } | null = null;
  setRemoteMedia(adapter: typeof this.remoteMedia) {
    this.remoteMedia = adapter;
  }
  markShared(id: string, sharedMediaId: string) {
    this.clips = this.clips.map((c) =>
      c.id === id ? { ...c, sharedMediaId } : c,
    );
    this.notify();
  }
  setCaptureAdapter(adapter: CaptureAdapter | null) {
    if (this.captureAdapter === adapter) return;
    this.cancelCapture();
    this.captureAdapter = adapter;
  }
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private generation = 0;
  private startedAt = 0;
  private ownerId = "";
  private stepId = "";
  private error: Error | null = null;
  private clips: RecordedClip[] = [];
  private listeners = new Set<() => void>();
  private highlight: HTMLAudioElement | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  private highlightGeneration = 0;
  getClips = () => this.clips;
  suspend() {
    this.cancelCapture();
    this.discardUnsubmitted();
    this.stopHighlight();
    if (typeof document !== "undefined")
      document.querySelectorAll("audio").forEach((audio) => audio.pause());
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  async start(ownerId: string, stepId: string, options?: CaptureOptions) {
    this.cancelCapture();
    this.stopHighlight();
    if (typeof document !== "undefined")
      document.querySelectorAll("audio").forEach((node) => node.pause());
    this.captureActive = true;
    if (this.captureAdapter) {
      try {
        return await this.captureAdapter.start(ownerId, stepId, options);
      } catch (error) {
        this.captureActive = false;
        throw error;
      }
    }
    const generation = this.generation;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      this.captureActive = false;
      throw new Error(
        "Recording is unavailable here. Use HTTPS or localhost, or keep playing by typing.",
      );
    }
    const stream = await navigator.mediaDevices
      .getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      })
      .catch((error) => {
        this.captureActive = false;
        throw error;
      });
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      throw new DOMException("Recording cancelled", "AbortError");
    }
    this.stream = stream;
    this.ownerId = ownerId;
    this.stepId = stepId;
    this.chunks = [];
    this.error = null;
    try {
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      this.recorder = recorder;
      const chunks = this.chunks;
      recorder.ondataavailable = (event) => {
        if (event.data.size && generation === this.generation)
          chunks.push(event.data);
      };
      recorder.onerror = () => {
        this.error = new Error(
          "Recording was interrupted. Please retry or type your answer.",
        );
        stream.getTracks().forEach((t) => t.stop());
      };
      this.startedAt = Date.now();
      recorder.start();
    } catch (error) {
      this.cancelCapture();
      throw error;
    }
  }
  async stop(): Promise<RecordedClip> {
    this.captureActive = false;
    if (this.captureAdapter) {
      const clip = await this.captureAdapter.stop();
      this.clips = [...this.clips, clip];
      this.notify();
      return clip;
    }
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") {
      this.cancelCapture();
      throw (
        this.error ??
        new Error(
          "No recording is available. Please retry or type your answer.",
        )
      );
    }
    const generation = this.generation;
    const stream = this.stream;
    const chunks = this.chunks;
    return new Promise((resolve, reject) => {
      recorder.addEventListener(
        "stop",
        () => {
          stream?.getTracks().forEach((t) => t.stop());
          if (generation !== this.generation) {
            reject(new DOMException("Recording cancelled", "AbortError"));
            return;
          }
          this.stream = null;
          this.recorder = null;
          if (this.error) {
            reject(this.error);
            return;
          }
          const blob = new Blob(chunks, {
            type: recorder.mimeType || chunks[0]?.type || "audio/webm",
          });
          this.chunks = [];
          if (!blob.size) {
            reject(
              new Error(
                "That recording was empty. Please retry or type your answer.",
              ),
            );
            return;
          }
          const clip: RecordedClip = {
            id: crypto.randomUUID(),
            ownerId: this.ownerId,
            stepId: this.stepId,
            blob,
            url: URL.createObjectURL(blob),
            durationMs: Date.now() - this.startedAt,
            consent: false,
            submitted: false,
          };
          this.clips = [...this.clips, clip];
          this.notify();
          resolve(clip);
        },
        { once: true },
      );
      recorder.stop();
    });
  }
  cancelCapture() {
    this.captureActive = false;
    this.captureAdapter?.cancelCapture();
    this.generation += 1;
    if (this.recorder && this.recorder.state !== "inactive")
      this.recorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
  commit(id: string, consent: boolean) {
    this.clips = this.clips.map((c) =>
      c.id === id ? { ...c, submitted: true, consent } : c,
    );
    this.notify();
  }
  uncommit(id: string) {
    this.clips = this.clips.map((c) =>
      c.id === id ? { ...c, submitted: false, consent: false } : c,
    );
    this.notify();
  }
  setConsent(id: string, consent: boolean) {
    this.stopHighlight();
    const apply = () => {
      this.clips = this.clips.map((c) => (c.id === id ? { ...c, consent } : c));
      this.notify();
    };
    const clip = this.clips.find((c) => c.id === id);
    if (clip?.sharedMediaId && this.remoteMedia)
      void this.remoteMedia
        .consent(clip.sharedMediaId, consent)
        .then(apply)
        .catch(() => {});
    else apply();
  }
  remove(id: string) {
    this.stopHighlight();
    const clip = this.clips.find((c) => c.id === id);
    for (const remoteId of [clip?.sharedMediaId, clip?.remoteMediaId])
      if (remoteId && this.remoteMedia)
        void this.remoteMedia.remove(remoteId).catch(() => {});
    if (clip) URL.revokeObjectURL(clip.url);
    this.clips = this.clips.filter((c) => c.id !== id);
    this.notify();
  }
  discardUnsubmitted() {
    for (const c of [...this.clips]) if (!c.submitted) this.remove(c.id);
  }
  stopHighlight() {
    this.highlightGeneration += 1;
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = null;
    if (this.highlight) {
      this.highlight.pause();
      this.highlight.removeAttribute("src");
      this.highlight.load();
    }
    this.highlight = null;
  }
  async playHighlight(ownerId: string, onEnd: () => void): Promise<void> {
    this.stopHighlight();
    const clips = this.clips.filter(
      (c) => c.ownerId === ownerId && c.submitted && c.consent,
    );
    if (!clips.length)
      throw new Error("Opt in to a recorded clip to preview your highlight.");
    const generation = this.highlightGeneration;
    let index = 0;
    const finish = () => {
      this.stopHighlight();
      onEnd();
    };
    const play = async () => {
      if (generation !== this.highlightGeneration) return;
      if (index >= clips.length) {
        finish();
        return;
      }
      const element = new Audio(clips[index++].url);
      this.highlight = element;
      element.onended = () => {
        void play().catch(finish);
      };
      element.onerror = finish;
      await element.play();
    };
    this.highlightTimer = setTimeout(finish, 20_000);
    try {
      await play();
    } catch (error) {
      finish();
      throw error;
    }
  }
  dispose() {
    this.cancelCapture();
    this.stopHighlight();
    this.clips.forEach((c) => URL.revokeObjectURL(c.url));
    this.clips = [];
    this.notify();
  }
}
