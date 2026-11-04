import WebSocket from "ws";
import { setTimeout as delay } from "node:timers/promises";
import { selectedHostLlm, type Config } from "./config";
import { AppError, ensure } from "./errors";
import { pcmWav } from "./media";
import type { HostLanguage, SpeechLanguage } from "@expose/shared/game/host";

export type SpeechSegment = {
  id: string;
  text: string;
  audioMs: number;
  latencyMs?: number;
};
export interface SpeechStream {
  configuration?: {
    model?: string;
    format?: string;
    language?: string;
    sampleRate?: number;
  };
  ready: Promise<void>;
  push(frame: Buffer): void;
  finish(): Promise<{
    text: string;
    transmittedSeconds: number;
    speechSeconds: number;
    model: string;
  }>;
  cancel(): void;
}
export interface Providers {
  stt(
    names: string[],
    segment: (value: SpeechSegment) => void,
    language?: SpeechLanguage,
  ): SpeechStream;
  host(
    context: string,
    question: string,
    signal: AbortSignal,
    options?: { json?: boolean; schema?: Record<string, unknown> },
  ): Promise<{
    text: string;
    model: string;
    effectiveModel?: string;
    inputTokens?: number;
    outputTokens?: number;
    requestId?: string;
  }>;
  tts(
    text: string,
    signal: AbortSignal,
    language?: HostLanguage,
  ): Promise<{
    audio: Buffer;
    model: string;
    effectiveModel?: string;
    seconds: number;
    requestId?: string;
  }>;
}
const asciiJson = (value: unknown) =>
  JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
export class GnaniProviders implements Providers {
  constructor(readonly config: Config) {}
  stt(
    names: string[],
    onSegment: (segment: SpeechSegment) => void,
    language?: SpeechLanguage,
  ): SpeechStream {
    ensure(
      this.config.aiEnabled && this.config.GNANI_API_KEY,
      "VOICE_UNAVAILABLE",
      "Live transcription is not enabled. You can still type.",
      503,
    );
    const socket = new WebSocket(this.config.GNANI_STT_URL, {
      handshakeTimeout: 8000,
      maxPayload: 1024 * 1024,
      headers: {
        "x-api-key-id": this.config.GNANI_API_KEY,
        model: this.config.GNANI_STT_MODEL,
        "x-model": this.config.GNANI_STT_MODEL,
        language_code: language ?? this.config.GNANI_STT_LANGUAGES,
        lang_code: language ?? this.config.GNANI_STT_LANGUAGES,
        format: language ? "transcribe" : "transliterate",
        "x-format": language ? "transcribe" : "transliterate",
        "x-sample-rate": "16000",
        "x-vad-threshold": "0.6",
        "x-min-speech-ms": "100",
        "x-min-silence-ms": "700",
        keyterms: asciiJson(names),
      },
    });
    const segments = new Map<string, SpeechSegment>();
    let configuration: SpeechStream["configuration"];
    let bytes = 0,
      model = this.config.GNANI_STT_MODEL,
      failed: Error | undefined,
      ended = false;
    let resolveReady: () => void, rejectReady: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const readyTimer = setTimeout(() => {
      failed = new AppError(
        "STT_TIMEOUT",
        "Transcription took too long to connect.",
        504,
      );
      rejectReady(failed);
      socket.terminate();
    }, 10000);
    const stop = () => {
      ended = true;
      clearTimeout(readyTimer);
      socket.close();
    };
    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "connected") {
          configuration = {
            model: msg.config?.model,
            format: msg.config?.format,
            language: msg.config?.language_code ?? msg.config?.lang_code,
            sampleRate: msg.config?.sample_rate,
          };
          model = msg.config?.model ?? model;
          clearTimeout(readyTimer);
          resolveReady();
        }
        if (msg.type === "transcript") {
          const value: SpeechSegment = {
            id: String(msg.segment_id ?? msg.segment_index ?? segments.size),
            text: String(msg.text ?? msg.transcript ?? ""),
            audioMs: Number(msg.audio_duration_ms ?? 0),
            latencyMs: msg.latency ?? msg.latency_ms,
          };
          segments.set(value.id, value);
          onSegment(value);
        }
        if (msg.type === "error") {
          failed = new AppError(
            "STT_FAILED",
            "Transcription is unavailable. Please type or retry.",
            502,
          );
          (failed as AppError).providerReason = String(
            msg.message ??
              msg.error ??
              msg.code ??
              "Unspecified provider error",
          )
            .replaceAll(this.config.GNANI_API_KEY, "[redacted]")
            .slice(0, 240);
          rejectReady(failed);
          stop();
        }
      } catch {
        failed = new AppError(
          "STT_PROTOCOL",
          "The speech service returned an invalid response.",
          502,
        );
        rejectReady(failed);
        stop();
      }
    });
    socket.on("error", () => {
      failed = new AppError(
        "STT_CONNECTION",
        "Could not reach the speech service. Please type.",
        502,
      );
      clearTimeout(readyTimer);
      rejectReady(failed);
    });
    socket.on("close", () => {
      if (!ended) {
        failed ??= new AppError(
          "STT_CLOSED",
          "The speech connection was interrupted.",
          502,
        );
        rejectReady(failed);
      }
      clearTimeout(readyTimer);
    });
    const push = (frame: Buffer) => {
      ensure(
        frame.length === 1024,
        "INVALID_AUDIO",
        "Audio frames must contain 1,024 PCM bytes.",
      );
      if (failed) throw failed;
      ensure(
        !ended && socket.readyState === WebSocket.OPEN,
        "STT_CLOSED",
        "The speech connection is closed.",
      );
      socket.send(frame);
      bytes += frame.length;
    };
    return {
      get configuration() {
        return configuration;
      },
      ready,
      push,
      cancel: stop,
      finish: async () => {
        await ready;
        try {
          if (this.config.GNANI_STT_COMMIT === "true") {
            const before = segments.size;
            socket.send(JSON.stringify({ type: "commit" }));
            const until = Date.now() + 4000;
            while (Date.now() < until && segments.size === before && !failed)
              await delay(50);
          } else {
            for (let i = 0; i < 32; i++) {
              push(Buffer.alloc(1024));
              await delay(32);
            }
            await delay(1800);
          }
          if (failed) throw failed;
          return {
            text: [...segments.values()].map((s) => s.text).join(" "),
            transmittedSeconds: bytes / 32000,
            speechSeconds:
              [...segments.values()].reduce((sum, s) => sum + s.audioMs, 0) /
              1000,
            model,
          };
        } finally {
          stop();
        }
      },
    };
  }
  async host(
    context: string,
    question: string,
    signal: AbortSignal,
    options?: { json?: boolean; schema?: Record<string, unknown> },
  ) {
    const c = this.config;
    const selection = selectedHostLlm(c);
    ensure(
      c.aiEnabled && selection.configured,
      "HOST_LLM_UNCONFIGURED",
      "The AI host is not configured.",
      503,
    );
    const gemini = selection.provider === "gemini";
    const response = await fetch(
      gemini
        ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selection.model)}:generateContent`
        : "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          ...(gemini
            ? { "x-goog-api-key": c.GEMINI_API_KEY }
            : { Authorization: `Bearer ${c.DEEPSEEK_API_KEY}` }),
        },
        body: JSON.stringify(
          gemini
            ? {
                systemInstruction: { parts: [{ text: context }] },
                contents: [{ role: "user", parts: [{ text: question }] }],
                generationConfig: {
                  maxOutputTokens: options?.json ? 1024 : 512,
                  ...(options?.json
                    ? { responseMimeType: "application/json" }
                    : {}),
                  ...(options?.schema
                    ? { responseJsonSchema: options.schema }
                    : {}),
                  ...(selection.model === "gemini-3.5-flash-lite"
                    ? { thinkingConfig: { thinkingLevel: "MINIMAL" } }
                    : {}),
                },
              }
            : {
                model: selection.model,
                messages: [
                  { role: "system", content: context },
                  { role: "user", content: question },
                ],
                thinking: { type: "disabled" },
                max_tokens: options?.json ? 1024 : 160,
                ...(options?.json
                  ? { response_format: { type: "json_object" } }
                  : {}),
                stream: false,
              },
        ),
      },
    );
    ensure(
      response.ok,
      "HOST_LLM_FAILED",
      "The host is unavailable right now.",
      502,
    );
    const body = await response.json();
    const text = gemini
      ? body.candidates?.[0]?.content?.parts
          ?.filter(
            (part: { text?: string; thought?: boolean }) =>
              !part.thought && typeof part.text === "string",
          )
          .map((part: { text: string }) => part.text)
          .join("")
      : body.choices?.[0]?.message?.content;
    ensure(
      typeof text === "string" && text.trim(),
      "HOST_LLM_PROTOCOL",
      "The host returned no response.",
      502,
    );
    const usage = gemini ? body.usageMetadata : body.usage;
    return {
      text: options?.json ? text : text.slice(0, 400),
      model: selection.model,
      effectiveModel: gemini
        ? typeof body.modelVersion === "string"
          ? body.modelVersion
          : undefined
        : typeof body.model === "string"
          ? body.model
          : undefined,
      inputTokens: gemini ? usage?.promptTokenCount : usage?.prompt_tokens,
      outputTokens: gemini
        ? typeof usage?.candidatesTokenCount === "number"
          ? usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0)
          : undefined
        : usage?.completion_tokens,
      requestId: body.id ?? response.headers.get("x-request-id") ?? undefined,
    };
  }
  async tts(
    text: string,
    signal: AbortSignal,
    language: HostLanguage = "hinglish",
  ): Promise<{
    audio: Buffer;
    model: string;
    effectiveModel?: string;
    seconds: number;
    requestId?: string;
  }> {
    const c = this.config;
    ensure(
      c.aiEnabled && c.GNANI_API_KEY,
      "TTS_UNAVAILABLE",
      "Host audio is disabled.",
      503,
    );
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(c.GNANI_TTS_URL, {
        handshakeTimeout: 8000,
        maxPayload: 2 * 1024 * 1024,
        headers: { "X-API-Key-ID": c.GNANI_API_KEY },
      });
      const chunks: Buffer[] = [];
      let settled = false,
        total = 0;
      let effectiveModel: string | undefined;
      const complete = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        socket.close();
        if (error) reject(error);
        else {
          const pcm = Buffer.concat(chunks);
          resolve({
            audio: pcmWav(pcm, 24000),
            seconds: pcm.length / 48000,
            model: c.GNANI_TTS_MODEL,
            effectiveModel,
          });
        }
      };
      const abort = () =>
        complete(
          new AppError("TTS_CANCELLED", "Host audio was cancelled.", 499),
        );
      const timer = setTimeout(
        () =>
          complete(new AppError("TTS_TIMEOUT", "Host audio timed out.", 504)),
        12000,
      );
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      socket.on("open", () =>
        socket.send(
          JSON.stringify({
            text,
            voice: c.GNANI_TTS_VOICE,
            model: c.GNANI_TTS_MODEL,
            language:
              language === "en"
                ? "en-IN"
                : language === "hi"
                  ? "hi-IN"
                  : "hi-en",
            audio_config: {
              sample_rate: 24000,
              num_channels: 1,
              sample_width: 2,
              encoding: "linear_pcm",
              container: "raw",
            },
          }),
        ),
      );
      socket.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.error || msg.type === "error") throw new Error();
          const data = msg.data ?? msg;
          if (typeof data.model === "string") effectiveModel = data.model;
          if (data.audio) {
            const chunk = Buffer.from(data.audio, "base64");
            total += chunk.length;
            if (total > 2 * 1024 * 1024) throw new Error();
            chunks.push(chunk);
          }
          if (data.is_final) complete();
        } catch {
          complete(
            new AppError(
              "TTS_PROTOCOL",
              "Host audio could not be generated.",
              502,
            ),
          );
        }
      });
      socket.on("error", () =>
        complete(
          new AppError("TTS_CONNECTION", "Host audio could not connect.", 502),
        ),
      );
      socket.on("close", () => {
        if (!settled)
          complete(
            new AppError("TTS_CLOSED", "Host audio ended unexpectedly.", 502),
          );
      });
    });
  }
}

/** Deterministic provider used only by integration tests and explicitly labelled previews. */
export class MockProviders implements Providers {
  stt(_names: string[], segment: (value: SpeechSegment) => void): SpeechStream {
    let bytes = 0;
    return {
      ready: Promise.resolve(),
      push(frame) {
        bytes += frame.length;
      },
      cancel() {},
      async finish() {
        const text = "Blue";
        segment({ id: "fixture", text, audioMs: 500 });
        return {
          text,
          transmittedSeconds: bytes / 32000,
          speechSeconds: 0.5,
          model: "mock-stt",
        };
      },
    };
  }
  async host() {
    return {
      text: "Sab ready? Pick what fits your friend. Scores follow the rules!",
      model: "mock-host",
      inputTokens: 25,
      outputTokens: 15,
    };
  }
  async tts() {
    return {
      audio: pcmWav(Buffer.alloc(3200)),
      model: "mock-tts",
      seconds: 0.1,
    };
  }
}
