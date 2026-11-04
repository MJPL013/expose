import type { NetworkSession } from "../session/network-session";
import { AudioServerMessageSchema } from "@expose/shared/network";
import type {
  CaptureAdapter,
  RecordedClip,
  CaptureOptions,
} from "./local-audio";

function wav(frames: ArrayBuffer[]) {
  const length = frames.length * 1024,
    buffer = new ArrayBuffer(44 + length),
    view = new DataView(buffer),
    bytes = new Uint8Array(buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, length + 36, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, length, true);
  frames.forEach((frame, i) => bytes.set(new Uint8Array(frame), 44 + i * 1024));
  return new Blob([buffer], { type: "audio/wav" });
}
export class NetworkAudio implements CaptureAdapter {
  private generation = 0;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private socket: WebSocket | null = null;
  private frames: ArrayBuffer[] = [];
  private final: Promise<{ text: string; mediaId?: string }> | null = null;
  private rejectFinal: ((error: Error) => void) | null = null;
  private ownerId = "";
  private stepId = "";
  constructor(private session: NetworkSession) {}
  async start(ownerId: string, stepId: string, options: CaptureOptions = {}) {
    this.cancelCapture();
    const generation = this.generation;
    if (this.session.getSnapshot().liveVoice !== true)
      throw new Error(
        "Live transcription is off for this playtest. You can type your answer.",
      );
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioWorkletNode === "undefined"
    )
      throw new Error(
        "Live voice needs HTTPS and AudioWorklet support. Keep playing by typing.",
      );
    const metadata = {
      ...this.session.audioContext(options.purpose, options.diagnosticConsent),
      language: options.language ?? "en-IN",
      hostBeatId: options.hostBeatId,
      hostTurn: options.hostTurn,
    };
    const segments = new Map<string, string>();
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
      throw new DOMException("Recording cancelled", "AbortError");
    }
    this.stream = stream;
    this.ownerId = ownerId;
    this.stepId = stepId;
    this.frames = [];
    try {
      const context = new AudioContext();
      this.context = context;
      await context.audioWorklet.addModule("/audio/capture-worklet.js");
      await context.resume();
      if (generation !== this.generation)
        throw new DOMException("Recording cancelled", "AbortError");
      const socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/v1/audio`,
      );
      this.socket = socket;
      let resolveFinal: (value: { text: string; mediaId?: string }) => void;
      this.final = new Promise((resolve, reject) => {
        resolveFinal = resolve;
        this.rejectFinal = reject;
      });
      void this.final.catch(() => {});
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error("The speech service did not respond. Type or retry."),
            ),
          15000,
        );
        let ready = false,
          completed = false;
        socket.onopen = () => socket.send(JSON.stringify(metadata));
        socket.onmessage = (event) => {
          let decoded: unknown;
          try {
            decoded = JSON.parse(event.data);
          } catch {
            decoded = null;
          }
          const parsed = AudioServerMessageSchema.safeParse(decoded);
          if (!parsed.success) {
            const error = new Error(
              "The voice service returned an invalid response. Please type or retry.",
            );
            clearTimeout(timeout);
            reject(error);
            this.rejectFinal?.(error);
            this.releaseMicrophone();
            socket.close();
            return;
          }
          const message = parsed.data;
          if (message.type === "segment" && generation === this.generation) {
            segments.set(message.id, message.text);
            options.onSegment?.([...segments.values()].join(" "));
          }
          if (message.type === "ready") {
            ready = true;
            clearTimeout(timeout);
            resolve();
          }
          if (message.type === "transcript") {
            completed = true;
            resolveFinal({
              text: String(message.text ?? ""),
              mediaId: message.mediaId,
            });
            this.releaseMicrophone();
          }
          if (message.type === "error") {
            const error = new Error(
              message.message ?? "Transcription failed. Please type.",
            );
            clearTimeout(timeout);
            reject(error);
            this.rejectFinal?.(error);
            this.releaseMicrophone();
          }
        };
        socket.onerror = () => {
          const error = new Error(
            "Voice connection failed. You can still type.",
          );
          clearTimeout(timeout);
          reject(error);
          this.rejectFinal?.(error);
          this.releaseMicrophone();
        };
        socket.onclose = () => {
          clearTimeout(timeout);
          if (!ready) reject(new Error("Voice connection closed."));
          if (!completed)
            this.rejectFinal?.(
              new Error("Recording was interrupted. Please retry or type."),
            );
          this.releaseMicrophone();
        };
      });
      if (generation !== this.generation)
        throw new DOMException("Recording cancelled", "AbortError");
      const node = new AudioWorkletNode(context, "expose-pcm", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      this.node = node;
      node.port.onmessage = (event) => {
        if (
          generation !== this.generation ||
          socket.readyState !== WebSocket.OPEN
        )
          return;
        if (socket.bufferedAmount > 1024 * 16) {
          this.cancelCapture();
          return;
        }
        const frame = event.data as ArrayBuffer;
        this.frames.push(frame.slice(0));
        socket.send(frame);
      };
      context.createMediaStreamSource(stream).connect(node);
      node.connect(context.destination);
    } catch (error) {
      if (generation === this.generation) this.cancelCapture();
      throw error;
    }
  }
  async stop(): Promise<RecordedClip> {
    this.releaseMicrophone();
    if (!this.final) throw new Error("No recording is available.");
    const generation = this.generation;
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "stop" }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.final,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error("Transcription timed out. Please type your answer."),
              ),
            5500,
          );
        }),
      ]);
      if (generation !== this.generation)
        throw new DOMException("Recording cancelled", "AbortError");
      const blob = wav(this.frames);
      return {
        id: crypto.randomUUID(),
        ownerId: this.ownerId,
        stepId: this.stepId,
        blob,
        url: URL.createObjectURL(blob),
        durationMs: this.frames.length * 32,
        consent: false,
        submitted: false,
        transcript: result.text,
        remoteMediaId: result.mediaId,
      };
    } finally {
      clearTimeout(timer);
      this.socket?.close();
      this.socket = null;
      this.final = null;
      this.rejectFinal = null;
      this.frames = [];
    }
  }
  private releaseMicrophone() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.node?.disconnect();
    this.node = null;
    if (this.context?.state !== "closed") void this.context?.close();
    this.context = null;
  }
  cancelCapture() {
    this.generation++;
    this.releaseMicrophone();
    this.rejectFinal?.(new DOMException("Recording cancelled", "AbortError"));
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "cancel" }));
    this.socket?.close();
    this.socket = null;
    this.final = null;
    this.rejectFinal = null;
    this.frames = [];
  }
}
