import type { NetworkSession } from "../session/network-session";
import { AudioServerMessageSchema } from "@expose/shared/network";
import type {
  CaptureAdapter,
  RecordedClip,
  CaptureOptions,
} from "./local-audio";
import {
  PreparedMicrophone,
  type SpeechCallbacks,
} from "./prepared-microphone";

/** Prepared local capture; provider transport is scoped to one accepted utterance. */
export class NetworkAudio implements CaptureAdapter {
  private mic = new PreparedMicrophone();
  private socket: WebSocket | null = null;
  private transport: Promise<WebSocket> | null = null;
  private transportScope = "";
  private generation = 0;
  private queue: ArrayBuffer[] = [];
  private pumping: ReturnType<typeof setInterval> | undefined;
  private capture = false;
  private ready = false;
  private stopping = false;
  private stopSent = false;
  private frames = 0;
  private final: Promise<{ text: string; mediaId?: string }> | null = null;
  private rejectFinal: ((error: Error) => void) | null = null;
  private failure: ((error: Error) => void) | undefined;
  private ownerId = "";
  private stepId = "";
  constructor(private session: NetworkSession) {}
  get handsfreeReady() {
    return this.mic.listening;
  }
  get microphoneReady() {
    return this.mic.ready;
  }
  async prepare() {
    await this.mic.prepare();
    await this.prepareTransport();
  }
  listen(callbacks: SpeechCallbacks | null) {
    this.mic.listen(callbacks);
  }
  private prepareTransport(): Promise<WebSocket> {
    const metadata = this.session.audioContext();
    const scope = `${metadata.runId}:${metadata.connectionId}`;
    if (
      this.transport &&
      scope === this.transportScope &&
      this.socket &&
      this.socket.readyState <= WebSocket.OPEN
    )
      return this.transport;
    this.socket?.close();
    this.transportScope = scope;
    const socket = (this.socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/v1/audio`,
    ));
    this.transport = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Voice connection unavailable. Retry or type."));
        socket.close();
      }, 8000);
      socket.onopen = () =>
        socket.send(
          JSON.stringify({
            type: "prepare",
            protocol_version: 6,
            roomId: metadata.roomId,
            runId: metadata.runId,
            connectionId: metadata.connectionId,
          }),
        );
      socket.onmessage = (event) => {
        try {
          const message = AudioServerMessageSchema.parse(
            JSON.parse(event.data),
          );
          if (message.type === "prepared") {
            clearTimeout(timer);
            resolve(socket);
          } else if (message.type === "error") {
            clearTimeout(timer);
            reject(new Error(message.message));
            socket.close();
          }
        } catch {
          clearTimeout(timer);
          reject(new Error("Voice protocol mismatch. Refresh the game."));
          socket.close();
        }
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Voice connection failed. Retry or type."));
      };
      socket.onclose = () => {
        clearTimeout(timer);
        reject(new Error("Voice connection closed. Retry or type."));
        if (this.socket === socket) {
          this.socket = null;
          this.transport = null;
        }
      };
    });
    return this.transport;
  }
  async start(ownerId: string, stepId: string, options: CaptureOptions = {}) {
    if (this.final) this.cancelCapture();
    const generation = ++this.generation;
    if (this.session.getSnapshot().liveVoice !== true)
      throw new Error("Live transcription is off. You can type.");
    await this.mic.prepare();
    if (generation !== this.generation)
      throw new DOMException("Recording cancelled", "AbortError");
    const metadata = {
      ...this.session.audioContext(options.purpose, options.diagnosticConsent),
      language: options.language ?? "en-IN",
      hostBeatId: options.hostBeatId,
      hostTurn: options.hostTurn,
    };
    this.ownerId = ownerId;
    this.stepId = stepId;
    this.ready = false;
    this.stopping = false;
    this.stopSent = false;
    this.capture = true;
    this.queue = options.preRoll ? this.mic.preRoll() : [];
    this.frames = this.queue.length;
    this.failure = options.onError;
    const maxFrames = Math.ceil((options.maxSeconds ?? 8) / 0.032);
    let resolveFinal!: (value: { text: string; mediaId?: string }) => void;
    this.final = new Promise((resolve, reject) => {
      resolveFinal = resolve;
      this.rejectFinal = reject;
    });
    void this.final.catch(() => {});
    const fail = (error: Error) => {
      if (generation !== this.generation) return;
      this.capture = false;
      this.mic.onFrame = null;
      clearInterval(this.pumping);
      this.queue = [];
      this.rejectFinal?.(error);
      this.failure?.(error);
      this.socket?.close();
    };
    this.mic.onFrame = (frame) => {
      if (!this.capture) return;
      if (this.frames >= maxFrames) {
        this.capture = false;
        this.mic.onFrame = null;
        options.onLimit?.();
        return;
      }
      this.queue.push(frame);
      this.frames++;
      if (this.queue.length > 62)
        fail(
          new Error(
            "Speech connection was too slow. Nothing was sent as an answer; retry or type.",
          ),
        );
    };
    this.pumping = setInterval(() => {
      if (
        !this.ready ||
        !this.socket ||
        this.socket.readyState !== WebSocket.OPEN
      )
        return;
      if (this.socket.bufferedAmount > 16384) {
        fail(new Error("Voice network is too slow. Retry or type."));
        return;
      }
      const frame = this.queue.shift();
      if (frame) this.socket.send(frame);
      else if (this.stopping && !this.stopSent) {
        this.stopSent = true;
        this.socket.send(JSON.stringify({ type: "stop" }));
      }
    }, 32);
    void this.prepareTransport()
      .then((socket) => {
        if (generation !== this.generation) return;
        const segments = new Map<string, string>();
        let complete = false;
        socket.onmessage = (event) => {
          if (generation !== this.generation) return;
          try {
            const m = AudioServerMessageSchema.parse(JSON.parse(event.data));
            if (m.type === "ready") this.ready = true;
            if (m.type === "accepted" && m.captureId === metadata.captureId)
              options.onAccepted?.(m.remainingRecordings);
            if (m.type === "segment") {
              segments.set(m.id, m.text);
              options.onSegment?.([...segments.values()].join(" "));
            }
            if (m.type === "transcript" && m.captureId === metadata.captureId) {
              complete = true;
              this.capture = false;
              this.mic.onFrame = null;
              resolveFinal({ text: m.text, mediaId: m.mediaId });
            }
            if (m.type === "error") fail(new Error(m.message));
          } catch {
            fail(new Error("Invalid speech response. Refresh or type."));
          }
        };
        socket.onerror = () =>
          fail(new Error("Voice connection failed. Retry or type."));
        socket.onclose = () => {
          if (!complete)
            fail(new Error("Recording interrupted. Retry or type."));
          if (this.socket === socket) {
            this.socket = null;
            this.transport = null;
          }
        };
        socket.send(JSON.stringify(metadata));
      })
      .catch((error) =>
        fail(
          error instanceof Error
            ? error
            : new Error("Voice preparation failed."),
        ),
      );
  }
  async stop(): Promise<RecordedClip> {
    this.capture = false;
    this.mic.onFrame = null;
    this.stopping = true;
    if (!this.final) throw new Error("No recording is available.");
    const generation = this.generation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.final,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Transcription timed out. Retry or type.")),
            10500,
          );
        }),
      ]);
      if (generation !== this.generation)
        throw new DOMException("Recording cancelled", "AbortError");
      return {
        id: crypto.randomUUID(),
        ownerId: this.ownerId,
        stepId: this.stepId,
        blob: new Blob([]),
        url: "",
        durationMs: this.frames * 32,
        consent: false,
        submitted: false,
        transcript: result.text,
        remoteMediaId: result.mediaId,
      };
    } finally {
      clearTimeout(timer);
      if (generation === this.generation) this.cancelCapture();
    }
  }
  cancelCapture() {
    this.generation++;
    this.capture = false;
    this.mic.onFrame = null;
    clearInterval(this.pumping);
    this.queue = [];
    this.rejectFinal?.(new DOMException("Recording cancelled", "AbortError"));
    this.rejectFinal = null;
    this.final = null;
    this.failure = undefined;
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "cancel" }));
    this.socket?.close();
    this.socket = null;
    this.transport = null;
  }
  releaseMicrophone() {
    this.cancelCapture();
    this.mic.release();
  }
}
