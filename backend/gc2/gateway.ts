import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { FastifyInstance } from "fastify";
import type WebSocket from "ws";
import { z } from "zod";
import {
  VoidLanguage,
  VoidMessage,
  type VoidServerMessage,
} from "@expose/shared/gc2";
import { AppError, ensure } from "../src/errors";
import { pcmWav } from "../src/media";
import type { SpeechStream } from "../src/providers";
import { view, activeMilliseconds } from "./state";
import { VoidAuth } from "./auth";
import { VoidService } from "./service";

type Capture = {
  id: string;
  speech: SpeechStream;
  frames: Buffer[];
  bytes: number;
  started: number;
  language: string;
  timer: ReturnType<typeof setTimeout>;
  capped: boolean;
  ending: boolean;
  sendQueue: Buffer[];
  providerReady: boolean;
  pump?: ReturnType<typeof setInterval>;
};
type Connection = {
  id: string;
  accountId: string;
  sessionId?: string;
  socket: WebSocket;
  capture?: Capture;
  token: string;
  queue: Promise<void>;
  requests: number;
  window: number;
  closed: boolean;
};
export function registerVoid(
  app: FastifyInstance,
  service: VoidService,
  auth: VoidAuth,
) {
  const connections = new Map<string, Connection>();
  const send = (c: Connection, message: VoidServerMessage) => {
    if (c.socket.readyState === 1) c.socket.send(JSON.stringify(message));
  };
  const report = (c: Connection, error: unknown) =>
    send(c, {
      type: "error",
      code: error instanceof AppError ? error.code : "VOID_FAILED",
      message:
        error instanceof AppError
          ? error.message
          : "That didn't come through. Please retry.",
    });
  const cancel = async (c: Connection) => {
    const capture = c.capture;
    if (!capture) return;
    c.capture = undefined;
    clearTimeout(capture.timer);
    clearInterval(capture.pump);
    capture.speech.cancel();
    capture.frames = [];
    capture.sendQueue = [];
    if (c.sessionId)
      await service.captureCancel(
        c.sessionId,
        c.accountId,
        c.id,
        capture.id,
        Math.min(60, capture.bytes / 32000),
      );
  };
  const close = (c: Connection) => {
    c.closed = true;
    void cancel(c);
    c.socket.close(4001, "Session ended");
  };
  auth.onLogout = (id) => {
    for (const c of connections.values()) if (c.accountId === id) close(c);
  };
  service.onDeleted = (id) => {
    for (const c of connections.values()) if (c.sessionId === id) close(c);
  };
  service.onChange = async (id) => {
    const row = await service.row(id).catch(() => null);
    if (row)
      for (const c of connections.values())
        if (c.sessionId === id) {
          if (row.owner && row.owner !== c.id) {
            send(c, { type: "ownership.lost" });
            close(c);
          } else send(c, { type: "state", view: view(row), reason: "changed" });
        }
  };
  auth.register(app);
  app.get("/api/gc2/v2/me", async (req) => ({
    protocol: 2,
    account: await auth.identity(req),
    configured: auth.configured,
    guestAvailable: auth.guestAvailable,
    localTesting: auth.localTesting,
    available: service.available,
    voiceAvailable: service.voiceAvailable,
  }));
  app.post("/api/gc2/v2/sessions", async (req) => {
    const account = await auth.require(req);
    const input = z
      .object({ language: VoidLanguage, storageConsent: z.literal(true) })
      .parse(req.body);
    ensure(
      account.onboardingVersion >= 1,
      "VOID_CONSENT_REQUIRED",
      "Review how your stories are saved before starting.",
      409,
    );
    return service.create(account.id, input.language);
  });
  app.get("/api/gc2/v2/history", async (req) => ({
    sessions: await service.history((await auth.require(req)).id),
  }));
  app.get<{ Params: { id: string } }>("/api/gc2/v2/sessions/:id", async (req) =>
    view(
      await service.row(
        z.uuid().parse(req.params.id),
        (await auth.require(req)).id,
      ),
    ),
  );
  app.delete<{ Params: { id: string } }>(
    "/api/gc2/v2/sessions/:id",
    async (req) => {
      await service.remove(
        z.uuid().parse(req.params.id),
        (await auth.require(req)).id,
      );
      return { ok: true };
    },
  );
  app.delete("/api/gc2/v2/data", async (req) => {
    const account = await auth.require(req);
    // Page repeatedly; history is a display limit, never a deletion limit.
    for (;;) {
      const history = await service.history(account.id);
      if (!history.length) break;
      for (const row of history) await service.remove(row.id, account.id);
    }
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>(
    "/api/gc2/v2/sessions/:id/feedback",
    async (req) => {
      const input = z
        .object({ feedback: z.enum(["spot-on", "mostly", "not-me"]) })
        .parse(req.body);
      await service.feedback(
        z.uuid().parse(req.params.id),
        (await auth.require(req)).id,
        input.feedback,
      );
      return { ok: true };
    },
  );
  app.get<{ Params: { id: string; assetId: string } }>(
    "/api/gc2/v2/sessions/:id/audio/:assetId",
    async (req, reply) => {
      const account = await auth.require(req);
      const audio = await service.audio(
        z.uuid().parse(req.params.id),
        z.uuid().parse(req.params.assetId),
        account.id,
      );
      return reply
        .type("audio/wav")
        .header("Cache-Control", "private, no-store")
        .send(audio);
    },
  );
  app.get("/api/gc2/v2/graph", async (req) =>
    service.graph.read((await auth.require(req)).id),
  );
  app.get("/api/gc2/v2/comparisons", async (req) => ({
    summaries: await service.graph.summaries((await auth.require(req)).id),
  }));
  app.put<{ Params: { id: string } }>(
    "/api/gc2/v2/comparisons/:id",
    async (req) => {
      const account = await auth.require(req);
      const input = z
        .object({
          revision: z.number().int().positive(),
          approved: z.boolean(),
          items: z
            .array(
              z.object({
                key: z.string().max(60),
                title: z.string().max(100),
                experience: z.string().max(350),
                response: z.string().max(350),
              }),
            )
            .max(40)
            .optional(),
        })
        .parse(req.body);
      await service.graph.approve(
        account.id,
        z.uuid().parse(req.params.id),
        input.revision,
        input.approved,
        input.items,
      );
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/gc2/v2/sessions/:id/retry-analysis",
    async (req) => {
      await service.retryAnalysis(
        z.uuid().parse(req.params.id),
        (await auth.require(req)).id,
      );
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/gc2/v2/sessions/:id/correction",
    async (req) => {
      const input = z
        .object({ text: z.string().trim().min(1).max(1000) })
        .parse(req.body);
      await service.correctInterpretation(
        z.uuid().parse(req.params.id),
        (await auth.require(req)).id,
        input.text,
      );
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/gc2/v2/sessions/:id/retry-graph",
    async (req) => {
      await service.retryGraph(
        z.uuid().parse(req.params.id),
        (await auth.require(req)).id,
      );
      return { ok: true };
    },
  );
  app.get("/api/gc2/v2/admin/graph", async (req) => {
    const account = await auth.require(req);
    ensure(
      account.role === "admin",
      "ADMIN_REQUIRED",
      "This explorer is private to administrators.",
      403,
    );
    const input = z
      .object({
        provenance: z.enum(["real", "synthetic", "all"]).default("synthetic"),
      })
      .parse(req.query);
    return service.graph.read(undefined, input.provenance);
  });
  // Old read-only routes preserve access to saved history; mutations use the v2 contract.
  app.get("/api/gc2/me", async (req) => ({
    protocol: 2,
    account: await auth.identity(req),
    configured: auth.configured,
    guestAvailable: auth.guestAvailable,
    localTesting: false,
    available: service.available,
    voiceAvailable: service.voiceAvailable,
  }));
  app.get("/api/gc2/history", async (req) => ({
    sessions: await service.history((await auth.require(req)).id),
  }));
  app.get(
    "/api/gc2/v2/socket",
    {
      websocket: true,
      preValidation: async (req) => {
        ensure(
          req.headers.origin &&
            service.config.allowedOrigins.has(req.headers.origin),
          "ORIGIN_DENIED",
          "This origin is not permitted.",
          403,
        );
        await auth.require(req);
      },
    },
    (socket, req) => {
      let connection: Connection | undefined;
      let queue = Promise.resolve();
      const initialized = auth.require(req).then((account) => {
        const c: Connection = {
          id: randomUUID(),
          accountId: account.id,
          token: auth.token(req)!,
          socket,
          queue: Promise.resolve(),
          requests: 0,
          window: Date.now(),
          closed: false,
        };
        connection = c;
        connections.set(c.id, c);
        return c;
      });
      const finish = async (c: Connection, capped: boolean) => {
        const capture = c.capture;
        if (!capture || capture.ending) return;
        capture.ending = true;
        clearTimeout(capture.timer);
        try {
          await service.change(
            c.sessionId!,
            (s) => {
              ensure(
                s.capture?.id === capture.id,
                "VOID_STALE",
                "Recording cancelled.",
                409,
              );
              s.status = "transcribing";
            },
            c.accountId,
            c.id,
          );
          const drainDeadline = performance.now() + 2400;
          while (
            capture.sendQueue.length &&
            c.capture === capture &&
            performance.now() < drainDeadline
          )
            await new Promise((resolve) => setTimeout(resolve, 32));
          ensure(
            c.capture === capture && !capture.sendQueue.length,
            "VOID_AUDIO_BUFFER",
            "Audio couldn't finish sending. Please retry.",
            503,
          );
          const result = await Promise.race([
            capture.speech.finish(),
            new Promise<never>((_, reject) => {
              capture.timer = setTimeout(
                () =>
                  reject(
                    new AppError(
                      "VOID_STT_TIMEOUT",
                      "Speech recognition took too long. Try again or type.",
                      504,
                    ),
                  ),
                8000,
              );
            }),
          ]);
          ensure(
            !c.closed && c.capture === capture,
            "VOID_CANCELLED",
            "Recording cancelled.",
            409,
          );
          await service.captureEnd(
            c.sessionId!,
            c.accountId,
            c.id,
            capture.id,
            result.text,
            pcmWav(Buffer.concat(capture.frames)),
            Math.min(60, capture.bytes / 32000),
            capture.language,
            capped || capture.capped,
          );
          if (c.capture === capture) c.capture = undefined;
        } catch (error) {
          if (c.capture !== capture || c.closed) return;
          if (capture.bytes > 0) {
            await service
              .captureEnd(
                c.sessionId!,
                c.accountId,
                c.id,
                capture.id,
                "",
                pcmWav(Buffer.concat(capture.frames)),
                Math.min(60, capture.bytes / 32000),
                capture.language,
                false,
              )
              .catch(() => {});
          }
          await cancel(c);
          throw error;
        } finally {
          clearTimeout(capture.timer);
          clearInterval(capture.pump);
          capture.frames = [];
          capture.sendQueue = [];
          capture.speech.cancel();
        }
      };
      socket.on("message", (data, binary) => {
        if (binary) {
          const c = connection,
            cap = c?.capture;
          if (!c || !cap || cap.ending || cap.capped || c.closed) return;
          const frame = Buffer.from(data as Buffer);
          if (
            frame.length !== 1024 ||
            cap.sendQueue.length >= 63 ||
            cap.bytes + frame.length >
              (performance.now() - cap.started + 2200) * 32
          ) {
            void cancel(c);
            report(
              c,
              new AppError(
                "VOID_FRAME_RATE",
                "Audio arrived too quickly. Please try again.",
                400,
              ),
            );
            return;
          }
          if (cap.bytes + frame.length > 1920000) {
            cap.capped = true;
            send(c, { type: "capture.cap", id: cap.id });
            void finish(c, true).catch((e) => report(c, e));
            return;
          }
          cap.bytes += frame.length;
          cap.frames.push(frame);
          cap.sendQueue.push(frame);
          return;
        }
        queue = queue
          .then(async () => {
            const c = await initialized;
            if (c.closed) return;
            const m = VoidMessage.parse(JSON.parse(data.toString()));
            if (Date.now() - c.window > 60000) {
              c.window = Date.now();
              c.requests = 0;
            }
            ensure(
              ++c.requests <= 100,
              "VOID_RATE_LIMIT",
              "Please slow down for a moment.",
              429,
            );
            ensure(
              await auth.account(c.token),
              "VOID_AUTH_REQUIRED",
              "Your session expired. Return to The Void to continue.",
              401,
            );
            if (m.type === "claim") {
              for (const other of connections.values())
                if (
                  other !== c &&
                  other.accountId === c.accountId &&
                  other.sessionId
                ) {
                  send(other, { type: "ownership.lost" });
                  await cancel(other);
                  other.sessionId = undefined;
                }
              if (c.sessionId) {
                await cancel(c);
                await service.release(c.sessionId, c.accountId, c.id);
              }
              const snapshot = await service.claim(
                m.sessionId,
                c.accountId,
                c.id,
              );
              c.sessionId = m.sessionId;
              send(c, { type: "state", view: snapshot, reason: "claimed" });
              return;
            }
            ensure(
              c.sessionId,
              "VOID_NO_SESSION",
              "Resume a conversation first.",
              409,
            );
            if (m.type === "pause") {
              await cancel(c);
              await service.release(c.sessionId, c.accountId, c.id);
              c.sessionId = undefined;
              return;
            }
            if (m.type === "heartbeat") {
              await service.heartbeat(c.sessionId, c.accountId, c.id);
              send(c, { type: "heartbeat" });
              return;
            }
            if (m.type === "capture.start") {
              ensure(
                !c.capture,
                "VOID_BUSY",
                "Finish the current recording first.",
                409,
              );
              await service.captureStart(
                c.sessionId,
                c.accountId,
                c.id,
                m.id,
                m.revision,
              );
              let speech: SpeechStream;
              try {
                speech = service.providers.stt([], () => {}, m.language);
              } catch {
                await service.captureCancel(
                  c.sessionId,
                  c.accountId,
                  c.id,
                  m.id,
                  0,
                );
                throw new AppError(
                  "VOID_STT_UNAVAILABLE",
                  "Speech recognition couldn't connect. Try again or type.",
                  503,
                );
              }
              const current = await service.row(c.sessionId, c.accountId);
              const remainingMs =
                current.state.version === 2
                  ? Math.max(
                      1,
                      (current.state.activeLimitMs ?? 1800000) -
                        activeMilliseconds(current.state),
                    )
                  : 64000;
              const cap: Capture = {
                id: m.id,
                speech,
                frames: [],
                sendQueue: [],
                providerReady: false,
                bytes: 0,
                started: performance.now(),
                language: m.language,
                capped: false,
                ending: false,
                timer: setTimeout(
                  () => {
                    if (c.capture) {
                      c.capture.capped = true;
                      send(c, { type: "capture.cap", id: m.id });
                      void finish(c, true).catch((e) => report(c, e));
                    }
                  },
                  Math.min(64000, remainingMs),
                ),
              };
              c.capture = cap;
              cap.pump = setInterval(() => {
                if (c.capture !== cap || !cap.providerReady) return;
                const frame = cap.sendQueue.shift();
                if (frame)
                  try {
                    cap.speech.push(frame);
                  } catch {
                    void cancel(c);
                    report(
                      c,
                      new AppError(
                        "VOID_STT_UNAVAILABLE",
                        "Speech recognition disconnected. Please retry.",
                        503,
                      ),
                    );
                  }
              }, 32);
              send(c, { type: "capture.accepted", id: m.id });
              void speech.ready
                .then(() => {
                  cap.providerReady = true;
                  if (c.capture === cap && !c.closed)
                    send(c, { type: "capture.ready", id: m.id });
                })
                .catch(async () => {
                  if (c.capture !== cap) return;
                  await cancel(c);
                  report(
                    c,
                    new AppError(
                      "VOID_STT_UNAVAILABLE",
                      "Speech recognition couldn't connect. Try again or type.",
                      503,
                    ),
                  );
                });
              return;
            }
            if (m.type === "capture.cancel") {
              if (c.capture?.id === m.id) await cancel(c);
              return;
            }
            if (m.type === "capture.end") {
              if (c.capture?.id === m.id)
                void finish(c, m.capped).catch((e) => report(c, e));
              return;
            }
            if (m.type === "answer")
              await service.respond(
                c.sessionId,
                c.accountId,
                c.id,
                m.id,
                m.revision,
                m.text,
              );
            else if (m.type === "pending.send")
              await service.respond(
                c.sessionId,
                c.accountId,
                c.id,
                m.id,
                m.revision,
              );
            else if (m.type === "correction")
              await service.correct(
                c.sessionId,
                c.accountId,
                c.id,
                m.id,
                m.revision,
                m.turnId,
                m.text,
              );
            else
              await service.action(
                c.sessionId,
                c.accountId,
                c.id,
                m.id,
                m.revision,
                m.type,
              );
          })
          .catch((error) => {
            if (connection) report(connection, error);
          });
      });
      socket.on("close", () => {
        void initialized.then(async (c) => {
          c.closed = true;
          await cancel(c);
          connections.delete(c.id);
          if (c.sessionId)
            await service.release(c.sessionId, c.accountId, c.id);
        });
      });
      socket.on("error", () => {
        if (connection) close(connection);
      });
    },
  );
  app.addHook("onClose", async () => {
    for (const c of connections.values()) close(c);
  });
}
