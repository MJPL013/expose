import type {
  VoidClientMessage,
  VoidServerMessage,
  VoidView,
  VoiceMode,
} from "@expose/shared/gc2";
import { PreparedMicrophone } from "../src/media/prepared-microphone";

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api/gc2/v2${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await res.json();
  if (!res.ok)
    throw new Error(
      value.error?.message || "The Void couldn't connect. Please retry.",
    );
  return value as T;
}
export type Presence =
  | "preparing"
  | "transcribing"
  | "idle"
  | "listening"
  | "user"
  | "thinking"
  | "speaking"
  | "paused"
  | "reveal"
  | "review";
export type ClientState = {
  view: VoidView | null;
  connected: boolean;
  enabled: boolean;
  muted: boolean;
  mode: VoiceMode;
  presence: Presence;
  error: string;
  speechLanguage: "en-IN" | "hi-IN" | "te-IN";
  audioBlocked: boolean;
  elapsed: number;
  heard: string;
  detectorReady: boolean;
};
type Capture = {
  id: string;
  queue: ArrayBuffer[];
  accepted: boolean;
  ready: boolean;
  stopping: boolean;
  capped: boolean;
  sent: boolean;
  timer: ReturnType<typeof setInterval>;
  capTimer: ReturnType<typeof setTimeout>;
  started: number;
};

/** GC2 owns its microphone and transport; no Game 1 seat/attempt state is reused. */
export class VoidClient {
  private state: ClientState = {
    view: null,
    connected: false,
    enabled: false,
    muted: true,
    mode: "handsfree",
    presence: "idle",
    error: "",
    speechLanguage: "en-IN",
    audioBlocked: false,
    elapsed: 0,
    heard: "",
    detectorReady: false,
  };
  private listeners = new Set<() => void>();
  private mic = new PreparedMicrophone();
  private socket: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private capture: Capture | null = null;
  private finalising: string | null = null;
  private firstFrameAt = 0;
  private speechPreference = false;
  private playback: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private playbackGeneration = 0;
  private played = new Set<string>();
  private fresh = false;
  private endedAt = 0;
  private arming: ReturnType<typeof setTimeout> | undefined;
  private enabling = 0;
  private playbackBusy = false;
  private playbackRequest = "";
  readonly amplitude = { current: 0 };
  readonly metrics: {
    captureStartupMs?: number;
    transcriptMs?: number;
    captionMs?: number;
    audioMs?: number;
  } = {};
  private speechEndedAt = 0;
  private progressTimer: ReturnType<typeof setTimeout> | undefined;
  private playbackTimer: ReturnType<typeof setTimeout> | undefined;
  private operationId = "";
  private segments = new Map<string, string>();
  private audioWaitingId = "";
  private audioPendingTimer: ReturnType<typeof setTimeout> | undefined;
  private expiredAudio = new Set<string>();
  private armGeneration = 0;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  get canAnswer() {
    const s = this.state,
      v = s.view;
    return Boolean(
      v &&
      s.connected &&
      !this.playbackBusy &&
      !s.audioBlocked &&
      this.played.has(v.caption.id) &&
      ["ready", "review", "error"].includes(v.status),
    );
  }
  private set(patch: Partial<ClientState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private send(message: VoidClientMessage) {
    if (this.socket?.readyState !== 1) {
      this.set({ error: "Connection paused. Resume to continue." });
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }
  loadPreference() {
    try {
      const mode = localStorage.getItem("gc2.voiceMode");
      if (mode === "handsfree" || mode === "tap" || mode === "type")
        this.set({ mode });
      const speechLanguage = localStorage.getItem("gc2.speechLanguage");
      if (
        speechLanguage === "en-IN" ||
        speechLanguage === "hi-IN" ||
        speechLanguage === "te-IN"
      ) {
        this.speechPreference = true;
        this.set({ speechLanguage });
      }
    } catch {}
  }
  setMode(mode: VoiceMode) {
    this.cancelCapture();
    this.mic.listen(null);
    this.set({ mode, error: "" });
    try {
      localStorage.setItem("gc2.voiceMode", mode);
    } catch {}
    if (mode === "type") this.mute();
    else this.sync();
  }
  setSpeechLanguage(language: ClientState["speechLanguage"]) {
    this.cancelCapture();
    this.speechPreference = true;
    try {
      localStorage.setItem("gc2.speechLanguage", language);
    } catch {}
    this.set({ speechLanguage: language });
    this.sync();
  }
  defaultSpeechLanguage(language: "en" | "hi" | "hinglish") {
    if (!this.speechPreference)
      this.set({ speechLanguage: language === "en" ? "en-IN" : "hi-IN" });
  }
  async unlockAudio() {
    if (!this.playback || this.playback.state === "closed")
      this.playback = new AudioContext();
    await this.playback.resume();
  }
  async enable() {
    const generation = ++this.enabling;
    this.set({ presence: "preparing", error: "" });
    try {
      await this.unlockAudio();
      await this.mic.prepare();
      if (generation !== this.enabling || document.hidden) {
        this.mic.release();
        return false;
      }
      this.mic.onFrame = (frame) => {
        const samples = new Int16Array(frame);
        let sum = 0;
        for (const sample of samples) sum += (sample / 32768) ** 2;
        if (!this.playbackBusy)
          this.amplitude.current = Math.min(
            1,
            Math.sqrt(sum / samples.length) * 7,
          );
        const c = this.capture;
        if (c && !c.stopping) {
          if (!this.firstFrameAt) {
            this.firstFrameAt = performance.now();
            this.metrics.captureStartupMs = this.firstFrameAt - c.started;
          }
          if (c.queue.length >= 63) {
            this.failCapture(
              "Speech couldn't connect quickly enough. Please try again; your beginning wasn't sent incomplete.",
            );
            return;
          }
          c.queue.push(frame.slice(0));
        }
      };
      this.mic.onUnavailable = (message) => {
        this.mute();
        this.set({ error: message });
      };
      this.set({ enabled: true, muted: false, error: "" });
      // Prepare locally while entry/the greeting completes. Never open STT here.
      void this.mic
        .warmup()
        .then(() => {
          if (generation !== this.enabling) return;
          this.set({ detectorReady: true });
          this.sync();
        })
        .catch(() => {
          if (generation !== this.enabling) return;
          this.setMode("tap");
          this.set({
            detectorReady: false,
            error: "Hands-free couldn't start. Tap to speak or type instead.",
          });
        });
      this.sync();
      return true;
    } catch (error) {
      this.mic.release();
      this.set({
        error:
          error instanceof Error
            ? error.message
            : "Allow microphone access, or type instead.",
        enabled: false,
        muted: true,
      });
      return false;
    }
  }
  async connect(sessionId: string, fresh = false) {
    this.disconnect(false);
    this.fresh = fresh;
    const ws = (this.socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/gc2/v3/socket`,
    ));
    ws.onopen = () => {
      if (this.socket !== ws) return;
      this.send({ type: "claim", protocol: 3, sessionId });
    };
    ws.onmessage = (event) => {
      if (this.socket !== ws) return;
      let m: VoidServerMessage;
      try {
        m = JSON.parse(event.data) as VoidServerMessage;
      } catch {
        return;
      }
      if (m.type === "state") {
        if (m.view.protocol !== 3) {
          this.pause();
          this.set({ error: "The Void has updated. Refresh to continue." });
          return;
        }
        const old = this.state.view;
        if (old?.id === m.view.id && old.revision > m.view.revision) return;
        if (
          m.view.lastTurn &&
          (!this.operationId ||
            m.view.lastTurn.id === this.operationId ||
            m.reason === "claimed")
        )
          this.set({ heard: m.view.lastTurn.text });
        if (old?.caption.id !== m.view.caption.id || m.view.error)
          clearTimeout(this.progressTimer);
        if (old?.caption.id !== m.view.caption.id) this.set({ error: "" });
        if (m.reason === "claimed") {
          this.defaultSpeechLanguage(m.view.language);
          if (!this.fresh) this.played.add(m.view.caption.id);
          this.set({ connected: true, error: "" });
          clearInterval(this.heartbeat);
          this.heartbeat = setInterval(
            () => this.send({ type: "heartbeat" }),
            15000,
          );
        }
        if (
          this.speechEndedAt &&
          m.view.status === "thinking" &&
          old?.status !== "thinking"
        )
          this.metrics.transcriptMs = performance.now() - this.speechEndedAt;
        if (this.speechEndedAt && old?.caption.id !== m.view.caption.id)
          this.metrics.captionMs = performance.now() - this.speechEndedAt;
        if (!["capturing", "transcribing"].includes(m.view.status))
          this.finalising = null;
        this.set({ view: m.view });
        this.sync();
      } else if (m.type === "capture.progress" && this.operationId === m.id) {
        if (m.text) {
          if (m.segmentId) {
            this.segments.set(m.segmentId, m.text);
            this.set({ heard: [...this.segments.values()].join(" ") });
          } else this.set({ heard: m.text });
        }
        if (m.stage === "accepted")
          this.metrics.transcriptMs = performance.now() - this.speechEndedAt;
        if (m.stage === "replying")
          this.watchProgress(
            20000,
            "Your answer is saved. The reply is delayed; resume or retry when available.",
          );
      } else if (m.type === "capture.accepted" && this.capture?.id === m.id)
        this.capture.accepted = true;
      else if (m.type === "capture.ready" && this.capture?.id === m.id)
        this.capture.ready = true;
      else if (m.type === "capture.cap" && this.capture?.id === m.id)
        this.stopCapture(true);
      else if (m.type === "ownership.lost") {
        this.pause();
        this.set({
          error:
            "This conversation moved to another device. Resume to take it back.",
        });
      } else if (m.type === "error") {
        clearTimeout(this.progressTimer);
        this.cancelCapture();
        this.set({
          error:
            m.message +
            (m.retryAfterSeconds
              ? ` Try again in ${m.retryAfterSeconds} seconds.`
              : ""),
          presence: "paused",
        });
        this.mic.listen(null);
      }
    };
    ws.onclose = () => {
      if (this.socket === ws) {
        this.pause();
        this.set({
          connected: false,
          error: "Connection paused. Your completed turns are saved.",
        });
      }
    };
    ws.onerror = () => {
      if (this.socket === ws)
        this.set({
          error: "The Void couldn't connect. Please resume to try again.",
        });
    };
  }
  private sync() {
    const armGeneration = ++this.armGeneration;
    const s = this.state,
      v = s.view;
    clearTimeout(this.arming);
    if (!v || !s.connected || document.hidden) {
      this.mic.listen(null);
      return;
    }
    if (this.capture) return;
    if (this.playbackBusy) {
      this.mic.listen(null);
      return;
    }
    if (v.processing && v.processing !== "ready") {
      this.mic.listen(null);
      this.set({
        presence: v.processing === "failed" ? "paused" : "thinking",
        audioBlocked: false,
      });
      return;
    }
    if (v.flowVersion === 2 && v.status === "complete") {
      this.mic.listen(null);
      this.set({ presence: "reveal", audioBlocked: false });
      return;
    }
    const caption = v.caption;
    if (this.expiredAudio.has(caption.id) && !this.played.has(caption.id)) {
      this.mic.listen(null);
      this.set({ audioBlocked: true, presence: "paused" });
      return;
    }
    if (!this.played.has(caption.id) && caption.audioId) {
      this.mic.listen(null);
      if (this.playbackRequest !== caption.id)
        void this.play(caption.id, caption.audioId);
      return;
    }
    if (!this.played.has(caption.id) && caption.audioPending) {
      if (this.audioWaitingId !== caption.id) {
        clearTimeout(this.audioPendingTimer);
        this.audioWaitingId = caption.id;
        this.audioPendingTimer = setTimeout(() => {
          if (
            this.state.view?.caption.id !== caption.id ||
            !this.state.view.caption.audioPending
          )
            return;
          this.expiredAudio.add(caption.id);
          this.sync();
        }, 15000);
      }
      this.mic.listen(null);
      this.set({
        presence: v.status === "transcribing" ? "transcribing" : "thinking",
      });
      return;
    }
    // Captions-only continuation is explicit; do not record over someone reading a failed audio turn.
    if (!this.played.has(caption.id)) {
      this.mic.listen(null);
      this.set({ audioBlocked: true, presence: "paused" });
      return;
    }
    if (v.status === "complete") {
      this.mic.listen(null);
      this.set({ presence: "reveal" });
      return;
    }
    if (
      ["thinking", "revealing", "processing", "transcribing"].includes(v.status)
    ) {
      this.mic.listen(null);
      this.set({
        presence: v.status === "transcribing" ? "transcribing" : "thinking",
      });
      return;
    }
    if (v.status === "review") {
      this.mic.listen(null);
      this.set({ presence: "review" });
      return;
    }
    if (
      v.status === "error" ||
      s.error ||
      !s.enabled ||
      s.muted ||
      s.mode === "type"
    ) {
      this.mic.listen(null);
      this.set({ presence: "paused" });
      return;
    }
    if (!this.mic.ready) {
      this.mute();
      this.set({
        error: "Microphone paused. Resume microphone or type instead.",
      });
      return;
    }
    this.set({ presence: s.mode === "handsfree" ? "preparing" : "listening" });
    if (s.mode === "handsfree" && !s.detectorReady) return;
    if (s.mode === "handsfree")
      this.arming = setTimeout(
        () => {
          if (!this.state.muted && this.state.connected && !document.hidden)
            this.mic.listen({
              ready: () => {
                if (armGeneration === this.armGeneration && !this.capture)
                  this.set({ presence: "listening" });
              },
              start: () => this.startCapture(),
              end: () => this.stopCapture(false),
              error: () => {
                this.setMode("tap");
                this.set({
                  error:
                    "Hands-free couldn't start. Tap to talk or type instead.",
                });
              },
            });
        },
        Math.max(0, this.endedAt + 300 - performance.now()),
      );
  }
  startCapture(force = false) {
    const s = this.state;
    if (
      !s.view ||
      !s.connected ||
      !s.enabled ||
      !this.mic.ready ||
      s.muted ||
      this.capture ||
      this.playbackBusy ||
      !this.played.has(s.view.caption.id) ||
      !["ready", ...(force ? ["review"] : [])].includes(s.view.status)
    )
      return;
    const started = performance.now(),
      id = crypto.randomUUID(),
      preRoll = this.mic.preRoll();
    const c: Capture = {
      id,
      queue: preRoll,
      ready: false,
      accepted: false,
      stopping: false,
      capped: false,
      sent: false,
      started,
      timer: setInterval(() => this.drain(), 32),
      capTimer: setTimeout(
        () => this.stopCapture(true),
        60000 - preRoll.length * 32,
      ),
    };
    this.capture = c;
    this.operationId = id;
    this.segments.clear();
    this.set({ heard: "" });
    this.watchProgress(
      10000,
      "Speech recognition didn't connect. Try again or type.",
    );
    this.firstFrameAt = preRoll.length ? performance.now() : 0;
    if (this.firstFrameAt)
      this.metrics.captureStartupMs = this.firstFrameAt - started;
    this.send({
      type: "capture.start",
      id,
      revision: s.view.revision,
      language: s.speechLanguage,
    });
    this.set({ presence: "user", elapsed: 0, error: "" });
  }
  private drain() {
    const c = this.capture;
    if (!c) return;
    const elapsed = Math.floor((performance.now() - c.started) / 1000);
    if (elapsed !== this.state.elapsed) this.set({ elapsed });
    if (!c.ready || !c.accepted) return;
    if (!c.stopping) clearTimeout(this.progressTimer);
    if (c.queue.length) {
      if ((this.socket?.bufferedAmount ?? 0) > 64000) {
        this.failCapture(
          "The connection is too slow for voice. Please retry or type.",
        );
        return;
      }
      this.socket?.send(c.queue.shift()!);
    } else if (c.stopping && !c.sent) {
      c.sent = true;
      clearInterval(c.timer);
      this.send({ type: "capture.end", id: c.id, capped: c.capped });
      this.finalising = c.id;
      this.capture = null;
      this.set({ presence: "transcribing" });
      this.watchProgress(
        20000,
        "Transcription is delayed. Resume the connection to recover your saved turns.",
      );
    }
  }
  stopCapture(capped: boolean) {
    const c = this.capture;
    if (!c || c.stopping) return;
    c.stopping = true;
    c.capped = capped;
    clearTimeout(c.capTimer);
    this.mic.listen(null);
    this.speechEndedAt = performance.now();
    this.amplitude.current = 0;
    this.set({ presence: "transcribing" });
  }
  cancelCapture() {
    clearTimeout(this.progressTimer);
    this.armGeneration++;
    const c = this.capture;
    if (c) {
      clearInterval(c.timer);
      clearTimeout(c.capTimer);
      c.queue = [];
      this.send({ type: "capture.cancel", id: c.id });
      this.capture = null;
    }
    if (this.finalising) {
      this.send({ type: "capture.cancel", id: this.finalising });
      this.finalising = null;
    }
    this.mic.listen(null);
    this.amplitude.current = 0;
  }
  private failCapture(message: string) {
    this.cancelCapture();
    this.set({ error: message, presence: "paused" });
  }
  private watchProgress(ms: number, message: string) {
    clearTimeout(this.progressTimer);
    this.progressTimer = setTimeout(() => {
      if (this.capture) this.failCapture(message);
      else {
        this.mic.listen(null);
        this.set({ error: message, presence: "paused" });
      }
    }, ms);
  }
  continueCapture() {
    if (this.state.mode === "handsfree") {
      this.mic.listen({
        ready: () => this.set({ presence: "listening" }),
        start: () => this.startCapture(true),
        end: () => this.stopCapture(false),
        error: () => this.setMode("tap"),
      });
      this.set({ presence: "preparing" });
    } else this.startCapture(true);
  }
  action(type: "skip" | "finish" | "retry" | "pending.send") {
    if (!this.state.view) return;
    this.cancelCapture();
    this.stopPlayback();
    this.set({ error: "", audioBlocked: false });
    this.send({
      type,
      id: crypto.randomUUID(),
      revision: this.state.view.revision,
    });
  }
  answer(text: string) {
    if (!this.state.view || !text.trim()) return;
    this.cancelCapture();
    this.set({ error: "" });
    this.send({
      type: "answer",
      id: crypto.randomUUID(),
      revision: this.state.view.revision,
      text: text.trim(),
    });
  }
  correct(turnId: string, text: string) {
    if (!this.state.view) return;
    this.cancelCapture();
    this.send({
      type: "correction",
      id: crypto.randomUUID(),
      revision: this.state.view.revision,
      turnId,
      text,
    });
  }
  mute() {
    ++this.enabling;
    this.cancelCapture();
    this.mic.release();
    this.set({
      muted: true,
      enabled: false,
      detectorReady: false,
      presence: this.playbackBusy ? "speaking" : "paused",
    });
  }
  private async play(id: string, audioId: string) {
    if (!this.state.view) return;
    const generation = ++this.playbackGeneration;
    this.playbackRequest = id;
    this.playbackBusy = true;
    this.mic.listen(null);
    this.set({ presence: "thinking", audioBlocked: false });
    try {
      let unlockTimer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        this.unlockAudio(),
        new Promise<never>((_, reject) => {
          unlockTimer = setTimeout(
            () => reject(new Error("Playback needs a tap")),
            4000,
          );
        }),
      ]).finally(() => clearTimeout(unlockTimer));
      const res = await fetch(
        `/api/gc2/v2/sessions/${this.state.view.id}/audio/${audioId}`,
        { cache: "no-store", signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) throw new Error("audio unavailable");
      const bytes = await res.arrayBuffer();
      let decodeTimer: ReturnType<typeof setTimeout> | undefined;
      const buffer = await Promise.race([
        this.playback!.decodeAudioData(bytes),
        new Promise<never>((_, reject) => {
          decodeTimer = setTimeout(
            () => reject(new Error("Audio decoding timed out")),
            8000,
          );
        }),
      ]).finally(() => clearTimeout(decodeTimer));
      if (generation !== this.playbackGeneration || document.hidden) return;
      const source = (this.source = this.playback!.createBufferSource());
      source.buffer = buffer;
      this.analyser = this.playback!.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      this.analyser.connect(this.playback!.destination);
      source.onended = () => {
        clearTimeout(this.playbackTimer);
        if (generation !== this.playbackGeneration) return;
        this.played.add(id);
        this.playbackBusy = false;
        this.source = null;
        this.analyser = null;
        this.amplitude.current = 0;
        this.endedAt = performance.now();
        this.sync();
      };
      if (this.speechEndedAt)
        this.metrics.audioMs = performance.now() - this.speechEndedAt;
      source.start();
      this.playbackTimer = setTimeout(
        () => {
          if (generation !== this.playbackGeneration) return;
          this.stopPlayback();
          this.set({ presence: "paused", audioBlocked: true });
        },
        Math.min(buffer.duration * 1000 + 3000, 90000),
      );
      this.set({ presence: "speaking" });
    } catch {
      if (generation !== this.playbackGeneration) return;
      this.playbackBusy = false;
      this.set({ presence: "paused", audioBlocked: true });
    }
  }
  sampleAmplitude() {
    if (this.analyser) {
      const data = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const n of data) sum += n * n;
      this.amplitude.current = Math.min(1, Math.sqrt(sum / data.length) * 6);
    }
    return this.amplitude.current;
  }
  continueWithoutAudio() {
    if (this.state.view) this.played.add(this.state.view.caption.id);
    this.stopPlayback();
    this.set({ audioBlocked: false, error: "" });
    this.endedAt = performance.now();
    this.sync();
  }
  replay() {
    const c = this.state.view?.caption;
    if (c?.audioId) {
      this.cancelCapture();
      this.expiredAudio.delete(c.id);
      this.stopPlayback();
      void this.play(c.id, c.audioId);
    }
  }
  private stopPlayback() {
    clearTimeout(this.playbackTimer);
    ++this.playbackGeneration;
    this.source?.stop();
    this.source?.disconnect();
    this.source = null;
    this.analyser = null;
    this.playbackBusy = false;
    this.playbackRequest = "";
    this.amplitude.current = 0;
  }
  pause() {
    if (this.socket?.readyState === 1) this.send({ type: "pause" });
    this.mute();
    this.stopPlayback();
    this.disconnect(false);
    this.set({ presence: "paused", error: "" });
  }
  private disconnect(dispose: boolean) {
    clearInterval(this.heartbeat);
    clearTimeout(this.arming);
    clearTimeout(this.audioPendingTimer);
    this.audioWaitingId = "";
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.set({ connected: false });
    if (dispose) this.mic.release();
  }
  dispose() {
    this.pause();
    if (this.playback) void this.playback.close().catch(() => {});
    this.playback = null;
  }
}
