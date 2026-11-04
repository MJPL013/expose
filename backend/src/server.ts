import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, gt, desc, ne, isNull } from "drizzle-orm";
import type WebSocket from "ws";
import {
  GuestSchema,
  RoomSchema,
  ClientMessageSchema,
  ConsentSchema,
  ClipUploadSchema,
  PlaybackSchema,
} from "@expose/shared/network";
import type { Config } from "./config";
import { selectedHostLlm } from "./config";
import type { Database } from "./db/client";
import * as t from "./db/schema";
import { Rooms } from "./rooms";
import { AppError, ensure } from "./errors";
import { UsageLedger } from "./usage";
import { MediaService, PrivateFilesystem } from "./media";
import { GnaniProviders, type Providers } from "./providers";
import { HostService } from "./host";
import { HostDirector } from "./host-director";
import { QuestionGuide } from "./question-guide";
import { AnswerPreparation, TranslationSchema } from "./translation";
import { AudioGateway } from "./audio";
import type { BatchService } from "./batch";

type Connection = {
  id: string;
  socket: WebSocket;
  playerId: string;
  roomId?: string;
  seatId?: string;
  queue: Promise<void>;
  mediaEvents?: boolean;
  sent?: { runId: string; revision: number };
};
const uuid = z.string().uuid();
export async function buildServer(
  config: Config,
  db: Database,
  options: {
    providers?: Providers;
    clock?: () => number;
    logger?: boolean;
    rateLimits?: boolean;
    autoNarration?: boolean;
    autoDirector?: boolean;
  } = {},
) {
  const app = Fastify({
    logger: options.logger
      ? {
          level: "info",
          serializers: {
            req: (req) => ({
              method: req.method,
              url: String(req.url).replace(
                /(\/webhooks\/gnani\/batch\/)[^/?]+/,
                "$1[redacted]",
              ),
            }),
            err: (err) => ({
              type: err.name,
              code: err.code,
              message: "Details redacted",
              stack: "",
            }),
          },
          redact: [
            "req.headers.cookie",
            "req.headers.authorization",
            "res.headers.set-cookie",
          ],
        }
      : false,
    bodyLimit: 256 * 1024,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: options.rateLimits !== false,
    max: 120,
    timeWindow: "1 minute",
    keyGenerator: async (req) => {
      const player = await rooms.authenticate(req.cookies.expose_guest);
      if (player) identities.set(req, player);
      return player ? `player:${player}` : `ip:${req.ip}`;
    },
    errorResponseBuilder: () =>
      new AppError(
        "RATE_LIMIT",
        "Too many requests. Wait a moment, then retry.",
        429,
      ),
  });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  const rooms = new Rooms(
      db,
      options.clock,
      config.HOST_DIRECTOR_ENABLED === "true" ? 2 : 1,
    ),
    usage = new UsageLedger(db, config),
    media = new MediaService(db, new PrivateFilesystem(config.mediaRoot));
  const providers = options.providers ?? new GnaniProviders(config),
    host = new HostService(rooms, usage, media, providers),
    director = new HostDirector(rooms, usage, media, providers),
    guide = new QuestionGuide(rooms, usage, media, providers),
    preparation = new AnswerPreparation(rooms, usage, providers),
    audio = new AudioGateway(rooms, usage, media, providers);
  const liveVoice = () => usage.enabled && Boolean(config.GNANI_API_KEY);
  const connections = new Map<string, Connection>();
  const identities = new WeakMap<FastifyRequest, string>();
  let batch: BatchService | undefined;
  const identity = async (req: FastifyRequest) => {
    const player =
      identities.get(req) ??
      (await rooms.authenticate(req.cookies.expose_guest));
    ensure(player, "AUTH_REQUIRED", "Start a guest session first.", 401);
    identities.set(req, player);
    return player;
  };
  const origin = (req: FastifyRequest) => {
    ensure(
      typeof req.headers.origin === "string" &&
        config.allowedOrigins.has(req.headers.origin),
      "ORIGIN_DENIED",
      "This origin is not permitted.",
      403,
    );
  };
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !req.url.startsWith("/api/v1/webhooks/")
    )
      origin(req);
  });
  app.setErrorHandler((error, req, reply) => {
    const known = error instanceof AppError,
      validation = error instanceof z.ZodError;
    const code = known
      ? error.code
      : validation
        ? "INVALID_REQUEST"
        : "INTERNAL_ERROR";
    reply
      .code(
        known
          ? error.status
          : validation
            ? 400
            : ((error as { statusCode?: number }).statusCode ?? 500),
      )
      .send({
        error: {
          code,
          message: known
            ? error.message
            : validation
              ? "Some request fields are invalid."
              : "The request could not be completed.",
          request_id: req.id,
        },
      });
    if (!known && !validation) req.log.error({ err: error }, "Request failed");
  });
  const send = (c: Connection, message: unknown) => {
    if (c.socket.readyState === 1) c.socket.send(JSON.stringify(message));
  };
  const report = (c: Connection, error: unknown) =>
    send(c, {
      type: "error",
      code: error instanceof AppError ? error.code : "REQUEST_FAILED",
      message:
        error instanceof AppError
          ? error.message
          : "The request failed. Reconnect or retry.",
    });
  const broadcasts = new Map<
    string,
    { dirty: boolean; promise: Promise<void> }
  >();
  const sendState = (
    c: Connection,
    snapshot: Awaited<ReturnType<Rooms["snapshot"]>>,
  ) => {
    if (
      c.sent?.runId === snapshot.sessionId &&
      c.sent.revision > snapshot.revision
    )
      return;
    c.sent = { runId: snapshot.sessionId, revision: snapshot.revision };
    send(c, {
      type: "state",
      snapshot: {
        ...snapshot,
        liveVoice: liveVoice(),
        inviteUrl: new URL(`/join/${snapshot.roomCode}`, config.PUBLIC_ORIGIN)
          .href,
      },
    });
  };
  const broadcast = (roomId: string): Promise<void> => {
    const existing = broadcasts.get(roomId);
    if (existing) {
      existing.dirty = true;
      return existing.promise;
    }
    const job = { dirty: true, promise: Promise.resolve() };
    job.promise = (async () => {
      // One microtask coalesces changes in the same turn; one drain preserves order.
      await Promise.resolve();
      try {
        while (job.dirty) {
          job.dirty = false;
          const recipients = [...connections.values()].filter(
            (c) => c.roomId === roomId && c.socket.readyState === 1,
          );
          if (!recipients.length) continue;
          const views = await rooms.snapshots(roomId, recipients);
          for (const { id, snapshot, error } of views) {
            const c = connections.get(id);
            if (!c || c.roomId !== roomId) continue;
            if (snapshot) sendState(c, snapshot);
            else {
              report(c, error);
              if (
                error instanceof AppError &&
                ["NOT_A_MEMBER", "REMOVED_FROM_ROOM", "SEAT_IN_USE"].includes(
                  error.code,
                )
              )
                c.socket.close(4003, "Room control ended");
            }
          }
        }
      } finally {
        broadcasts.delete(roomId);
      }
    })();
    broadcasts.set(roomId, job);
    return job.promise;
  };
  media.onChange = async (runId) => {
    const [run] = await db
      .select({ roomId: t.runs.roomId })
      .from(t.runs)
      .where(eq(t.runs.id, runId));
    if (!run) return;
    for (const c of connections.values())
      if (c.roomId === run.roomId && c.mediaEvents)
        send(c, { type: "media.changed", runId });
  };
  rooms.onChange = (roomId) => {
    void broadcast(roomId).catch((error) =>
      app.log.error({ err: error }, "Snapshot broadcast failed"),
    );
    if (options.autoDirector !== false)
      void director.run(roomId).catch(() => {});
    if (options.autoNarration !== false) void guide.run(roomId).catch(() => {});
    if (options.autoNarration !== false)
      void host.narrate(roomId).catch((error) => {
        if (!(error instanceof AppError))
          app.log.error({ err: error }, "Narration failed");
      });
  };
  rooms.onHostJob = async (roomId) => {
    await Promise.all([
      director.run(roomId),
      options.autoNarration === false ? Promise.resolve() : guide.run(roomId),
    ]);
  };
  rooms.onTick = (roomId) => {
    if (options.autoDirector !== false)
      void rooms.onHostJob(roomId).catch(() => {});
  };
  host.onNarration = (roomId) => {
    void broadcast(roomId).catch((error) =>
      app.log.error({ err: error }, "Narration broadcast failed"),
    );
  };
  app.get("/api/v1/health", async () => ({
    status: "ok",
    protocol_version: 5,
    liveVoice: liveVoice(),
    hostLlmProvider: selectedHostLlm(config).provider,
    hostLlmConfigured: selectedHostLlm(config).configured,
  }));
  app.post(
    "/api/v1/guests",
    {
      config: {
        rateLimit:
          options.rateLimits === false
            ? false
            : {
                max: 20,
                timeWindow: "1 minute",
                keyGenerator: (req: FastifyRequest) => `guests:${req.ip}`,
              },
      },
    },
    async (req, reply) => {
      const profile = GuestSchema.parse(req.body),
        existing = await rooms.authenticate(req.cookies.expose_guest);
      const guest = await rooms.guest(profile, existing ?? undefined);
      if (guest.token)
        reply.setCookie("expose_guest", guest.token, {
          httpOnly: true,
          secure: config.secureCookie,
          sameSite: "strict",
          path: "/",
          maxAge: 30 * 86400,
        });
      return { playerId: guest.playerId };
    },
  );
  app.post("/api/v1/rooms", async (req, reply) => {
    const result = await rooms.create(
      await identity(req),
      RoomSchema.parse(req.body),
    );
    return reply.code(201).send(result);
  });
  app.post<{ Params: { roomId: string } }>(
    "/api/v1/rooms/:roomId/translate",
    async (req) =>
      preparation.translate(
        await identity(req),
        uuid.parse(req.params.roomId),
        TranslationSchema.parse(req.body),
      ),
  );
  app.get<{ Params: { code: string } }>(
    "/api/v1/rooms/:code",
    {
      config: {
        rateLimit:
          options.rateLimits === false
            ? false
            : {
                max: 30,
                timeWindow: "1 minute",
                keyGenerator: (req: FastifyRequest) => `invites:${req.ip}`,
              },
      },
    },
    async (req) => {
      return rooms.summary(
        z
          .string()
          .regex(/^[a-zA-Z0-9]{6}$/)
          .parse(req.params.code),
      );
    },
  );
  app.post<{ Params: { code: string } }>(
    "/api/v1/rooms/:code/join",
    async (req) => {
      z.object({})
        .strict()
        .parse(req.body ?? {});
      return rooms.join(
        await identity(req),
        z
          .string()
          .regex(/^[a-zA-Z0-9]{6}$/)
          .parse(req.params.code),
      );
    },
  );
  app.get("/api/v1/recovery", async (req) =>
    rooms.recovery(await identity(req)),
  );
  app.get("/api/v1/resume", async (req) => {
    const player = await identity(req);
    return db
      .select({
        roomId: t.rooms.id,
        runId: t.rooms.currentRunId,
        code: t.rooms.code,
        status: t.rooms.status,
      })
      .from(t.members)
      .innerJoin(t.rooms, eq(t.members.roomId, t.rooms.id))
      .where(
        and(
          eq(t.members.playerId, player),
          isNull(t.members.removedAt),
          gt(t.rooms.expiresAt, new Date()),
          ne(t.rooms.status, "ended"),
        ),
      )
      .orderBy(desc(t.rooms.updatedAt));
  });
  app.post<{ Params: { roomId: string } }>(
    "/api/v1/rooms/:roomId/resume",
    async (req) =>
      rooms.current(await identity(req), uuid.parse(req.params.roomId)),
  );
  app.post<{ Params: { roomId: string } }>(
    "/api/v1/rooms/:roomId/leave",
    async (req) => {
      await rooms.leave(await identity(req), uuid.parse(req.params.roomId));
      return { left: true };
    },
  );
  app.post<{ Params: { roomId: string } }>(
    "/api/v1/rooms/:roomId/end",
    async (req) => {
      await rooms.end(await identity(req), uuid.parse(req.params.roomId));
      return { ended: true };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/v1/media/:id",
    async (req, reply) => {
      const { asset, bytes } = await media.get(
        await identity(req),
        uuid.parse(req.params.id),
      );
      return reply
        .type(asset.mime)
        .header("Content-Disposition", "inline")
        .send(bytes);
    },
  );
  app.post<{ Params: { roomId: string } }>(
    "/api/v1/rooms/:roomId/media",
    { bodyLimit: 450000 },
    async (req) =>
      media.upload(
        await identity(req),
        uuid.parse(req.params.roomId),
        ClipUploadSchema.parse(req.body),
      ),
  );
  app.get<{ Params: { roomId: string } }>(
    "/api/v1/rooms/:roomId/media",
    async (req) =>
      media.list(await identity(req), uuid.parse(req.params.roomId)),
  );
  app.put<{ Params: { id: string } }>(
    "/api/v1/media/:id/consent",
    async (req) => {
      const input = ConsentSchema.parse(req.body);
      return media.consent(
        await identity(req),
        uuid.parse(req.params.id),
        input.reveal,
        input.diagnostic,
      );
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/v1/media/:id",
    async (req, reply) => {
      await media.delete(await identity(req), uuid.parse(req.params.id));
      return reply.code(204).send();
    },
  );
  app.get<{ Params: { runId: string; seatId: string } }>(
    "/api/v1/cards/:runId/:seatId",
    async (req) => {
      const player = await identity(req),
        runId = uuid.parse(req.params.runId),
        seatId = uuid.parse(req.params.seatId);
      const [run] = await db.select().from(t.runs).where(eq(t.runs.id, runId));
      ensure(run, "NOT_FOUND", "Match unavailable.", 404);
      ensure(
        run.resumeUntil.getTime() > Date.now(),
        "MATCH_EXPIRED",
        "This match has expired.",
        410,
      );
      await rooms.current(player, run.roomId);
      const [card] = await db
        .select()
        .from(t.cards)
        .where(and(eq(t.cards.runId, runId), eq(t.cards.subjectId, seatId)));
      ensure(
        card?.approvedAt,
        "CARD_UNAPPROVED",
        "This player has not approved the card.",
        403,
      );
      return card.payload;
    },
  );
  app.get(
    "/api/v1/realtime",
    {
      websocket: true,
      preValidation: async (req) => {
        origin(req);
        await identity(req);
      },
    },
    (socket, req) => {
      const c: Connection = {
        id: randomUUID(),
        socket,
        playerId: "",
        queue: Promise.resolve(),
      };
      connections.set(c.id, c);
      let messages = 0,
        windowAt = Date.now();
      const connectTimeout = setTimeout(
        () => socket.close(1008, "Connect required"),
        10000,
      );
      socket.on("message", (raw, binary) => {
        c.queue = c.queue
          .then(async () => {
            ensure(!binary, "INVALID_MESSAGE", "Expected a JSON message.");
            if (Date.now() - windowAt > 10000) {
              messages = 0;
              windowAt = Date.now();
            }
            ensure(++messages <= 80, "RATE_LIMIT", "Too many messages.", 429);
            const decoded = JSON.parse(raw.toString());
            ensure(
              !("protocol_version" in decoded) ||
                decoded.protocol_version === 5,
              "CLIENT_UPDATE_REQUIRED",
              "A new game version is ready. Refresh this page before rejoining.",
              409,
            );
            const msg = ClientMessageSchema.parse(decoded);
            c.playerId ||= await identity(req);
            if (msg.type === "connect") {
              ensure(
                !c.roomId,
                "ALREADY_CONNECTED",
                "This connection already joined a room.",
              );
              const result = await rooms.connect(
                c.playerId,
                msg.roomId,
                c.id,
                msg.takeover,
              );
              c.roomId = msg.roomId;
              c.mediaEvents =
                msg.capabilities?.includes("media-events-v1") ?? false;
              c.seatId = result.seatId;
              clearTimeout(connectTimeout);
              const old = result.oldConnectionId
                ? connections.get(result.oldConnectionId)
                : undefined;
              if (old && old.id !== c.id) {
                send(old, {
                  type: "error",
                  code: "SEAT_TAKEN_OVER",
                  message: "Your seat is now controlled by another tab.",
                });
                old.socket.close(4001, "Seat moved");
              }
              send(c, { type: "ownership", connectionId: c.id });
              sendState(c, await rooms.snapshot(c.playerId, c.roomId));
              return;
            }
            ensure(
              c.roomId && c.seatId,
              "CONNECT_FIRST",
              "Join a room before sending actions.",
            );
            if (msg.type === "ping") {
              ensure(
                await rooms.heartbeat(c.roomId, c.seatId, c.id),
                "SEAT_IN_USE",
                "This tab no longer owns the seat.",
                409,
              );
              send(c, { type: "pong", serverTime: Date.now() });
            } else if (msg.type === "intent")
              send(
                c,
                await rooms.intent(
                  c.roomId,
                  c.seatId,
                  c.id,
                  msg.runId,
                  msg.intent,
                ),
              );
            else if (msg.type === "host.reply") {
              try {
                send(c, await director.reply(c.playerId, c.roomId, c.id, msg));
              } catch (error) {
                send(c, {
                  type: "ack",
                  cid: msg.cid,
                  revision: 0,
                  accepted: false,
                  message:
                    error instanceof AppError
                      ? error.message
                      : "The host reply could not be sent.",
                });
              }
            } else if (msg.type === "host.begin")
              await host.begin(c.playerId, c.roomId, c.id);
            else if (msg.type === "host.cancel")
              await host.cancel(c.playerId, c.roomId, c.id, msg.conversationId);
            else if (msg.type === "host.ask") {
              void host
                .ask(c.playerId, c.roomId, c.id, msg.cid, msg.text)
                .catch((error) => report(c, error));
            }
          })
          .catch((error) => report(c, error));
      });
      socket.on("close", () => {
        clearTimeout(connectTimeout);
        connections.delete(c.id);
        void c.queue
          .finally(() => {
            if (c.roomId && c.seatId)
              return rooms.disconnect(c.roomId, c.seatId, c.id);
          })
          .catch((error) => app.log.error({ err: error }, "Disconnect failed"));
      });
    },
  );
  app.get(
    "/api/v1/audio",
    {
      websocket: true,
      preValidation: async (req) => {
        origin(req);
        await identity(req);
      },
    },
    (socket, req) => {
      audio.attach(socket, identities.get(req)!);
    },
  );
  app.post<{ Params: { token: string } }>(
    "/api/v1/webhooks/gnani/batch/:token",
    { bodyLimit: 256 * 1024 },
    async (req, reply) => {
      ensure(
        batch,
        "BATCH_UNAVAILABLE",
        "Batch processing is unavailable.",
        503,
      );
      await batch.receive(req.params.token, req.body);
      return reply.code(202).send({ received: true });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/media/:id/playback",
    async (req) => {
      const playerId = await identity(req),
        asset = await media.authorize(playerId, uuid.parse(req.params.id)),
        value = PlaybackSchema.parse(req.body);
      const [run] = await db
        .select({ roomId: t.runs.roomId })
        .from(t.runs)
        .where(eq(t.runs.id, asset.runId));
      const [member] = await db
        .select({ id: t.members.id })
        .from(t.members)
        .where(
          and(
            eq(t.members.roomId, run.roomId),
            eq(t.members.playerId, playerId),
            isNull(t.members.removedAt),
          ),
        );
      await db
        .insert(t.playbacks)
        .values({
          id: value.id,
          runId: asset.runId,
          mediaId: asset.id,
          seatId: member.id,
          milliseconds: Math.min(value.milliseconds, asset.durationMs),
        })
        .onConflictDoNothing();
      return { recorded: true };
    },
  );
  app.addHook("onClose", async () => {
    host.dispose();
    director.dispose();
    guide.dispose();
    audio.dispose();
    for (const c of connections.values())
      c.socket.close(1001, "Server restarting");
  });
  return {
    app,
    rooms,
    usage,
    media,
    host,
    director,
    preparation,
    audio,
    setBatch: (service: BatchService) => {
      batch = service;
    },
    broadcast,
  };
}
