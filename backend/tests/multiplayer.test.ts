import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import * as t from "../src/db/schema";
import { loadConfig } from "../src/config";
import { buildServer } from "../src/server";
import { MockProviders } from "../src/providers";
import { Rooms, hash } from "../src/rooms";
import { BatchService } from "../src/batch";
import { purge } from "../src/jobs";
import { aggregateReports } from "../src/reports";
import { pcmWav } from "../src/media";
import {
  NetworkSnapshotSchema,
  type NetworkSnapshot,
} from "@expose/shared/network";
import { activeStep, type EngineState } from "@expose/shared/game/engine";
import type { Intent, IntentAction } from "@expose/shared/game/contracts";
import { MAX_AVATAR_ID, avatarColors } from "@expose/shared/game/appearance";

it("persists modular character IDs and publishes them to the room roster", async () => {
  const profile = { name: "Custom suspect", avatar: MAX_AVATAR_ID, color: avatarColors[4] };
  const identity = await services.app.inject({ method: "POST", url: "/api/v1/guests", headers: { origin: config.PUBLIC_ORIGIN }, payload: profile });
  expect(identity.statusCode).toBe(200);
  const cookie = identity.headers["set-cookie"]!.toString().split(";")[0];
  const created = await services.app.inject({ method: "POST", url: "/api/v1/rooms", headers: { origin: config.PUBLIC_ORIGIN, cookie }, payload: { ...profile, mode: "remote", spice: "mild", seatCount: 2 } });
  expect(created.statusCode).toBe(201);
  const playerId = identity.json().playerId;
  const snapshot = await services.rooms.snapshot(playerId, created.json().roomId);
  expect(snapshot.players.find(player => player.id === snapshot.view.viewerId)).toMatchObject(profile);
  const stored = await db.query.players.findFirst({ where: eq(t.players.id, playerId) });
  expect(stored).toMatchObject(profile);
  const friend = await guest("Friend");
  const joined = await services.app.inject({ method: "POST", url: `/api/v1/rooms/${created.json().code}/join`, headers: { origin: config.PUBLIC_ORIGIN, cookie: friend.cookie }, payload: {} });
  expect(joined.statusCode).toBe(200);
  const friendView = await services.rooms.snapshot(friend.playerId, created.json().roomId);
  expect(friendView.players.find(player => player.name === profile.name)).toMatchObject(profile);
});

const url =
  process.env.TEST_DATABASE_URL ??
  "postgres://expose:expose_local_only@127.0.0.1:5433/expose_test";
if (!new URL(url).pathname.endsWith("/expose_test"))
  throw new Error(
    "Integration tests require the dedicated expose_test database.",
  );
const { db, pool } = createDatabase(url),
  config = loadConfig({
    DATABASE_URL: url,
    AI_ENABLED: "true",
    HOST_DIRECTOR_ENABLED: "false",
    MEDIA_ROOT: ".data/test-media",
    PUBLIC_ORIGIN: "http://localhost:3000",
    AI_STOP_FILE: ".data/test-ai-stopped",
  });
let now = Date.now(),
  services: Awaited<ReturnType<typeof buildServer>>,
  base: string;
const sockets: WebSocket[] = [];
beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
  services = await buildServer(config, db, {
    providers: new MockProviders(),
    clock: () => now,
    rateLimits: false,
    autoNarration: false,
  });
  base = await services.app.listen({ port: 0, host: "127.0.0.1" });
});
afterAll(async () => {
  sockets.forEach((socket) => socket.terminate());
  await services.app.close();
  await pool.end();
});
beforeEach(async () => {
  sockets.splice(0).forEach((socket) => socket.terminate());
  await delay(20);
  await db.execute(sql`TRUNCATE players, rooms, rate_cards CASCADE`);
  now = Date.now();
});
async function eventually(check: () => boolean, timeout = 3000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw new Error("Timed out waiting for socket state");
    await delay(10);
  }
}
class Client {
  socket!: WebSocket;
  state!: NetworkSnapshot;
  connectionId = "";
  messages: Record<string, unknown>[] = [];
  constructor(
    readonly playerId: string,
    readonly cookie: string,
    readonly roomId: string,
  ) {}
  async connect(takeover = false, mediaEvents = false) {
    this.socket = new WebSocket(
      base.replace("http", "ws") + "/api/v1/realtime",
      { headers: { Cookie: this.cookie, Origin: config.PUBLIC_ORIGIN } },
    );
    sockets.push(this.socket);
    this.socket.on("message", (raw) => {
      const value = JSON.parse(raw.toString());
      this.messages.push(value);
      if (value.type === "state")
        this.state = NetworkSnapshotSchema.parse(value.snapshot);
      if (value.type === "ownership") this.connectionId = value.connectionId;
    });
    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
    this.socket.send(
      JSON.stringify({
        type: "connect",
        protocol_version: 4,
        roomId: this.roomId,
        takeover,
        ...(mediaEvents ? { capabilities: ["media-events-v1"] } : {}),
      }),
    );
    await eventually(
      () =>
        Boolean(this.state) || this.messages.some((m) => m.type === "error"),
    );
  }
  async send(action: IntentAction, cid = randomUUID(), previous = this.state) {
    const intent = {
      ...action,
      cid,
      stepId: previous.step.id,
      phaseEpoch: previous.phaseEpoch,
    } as Intent;
    this.socket.send(
      JSON.stringify({
        protocol_version: 4,
        type: "intent",
        runId: previous.sessionId,
        intent,
      }),
    );
    await eventually(() =>
      this.messages.some((m) => m.type === "ack" && m.cid === cid),
    );
    const ack = this.messages.find((m) => m.type === "ack" && m.cid === cid)!;
    if (ack.accepted)
      await eventually(() => this.state.revision >= Number(ack.revision));
    return ack;
  }
  close() {
    this.socket.terminate();
  }
}
async function guest(name: string) {
  const response = await services.app.inject({
    method: "POST",
    url: "/api/v1/guests",
    headers: { origin: config.PUBLIC_ORIGIN },
    payload: { name },
  });
  expect(response.statusCode).toBe(200);
  return {
    playerId: response.json().playerId,
    cookie: response.headers["set-cookie"]!.toString().split(";")[0],
  };
}
async function room(
  count: number,
  mode: "bluff" | "spotlight" = "spotlight",
  packId: "hostel-2am" | "goa-trip" = "hostel-2am",
  mediaEvents = false,
  names?: string[],
) {
  const identities = await Promise.all(
    Array.from({ length: count }, (_, i) => guest(names?.[i] ?? `Player ${i + 1}`)),
  );
  const result = await services.app.inject({
    method: "POST",
    url: "/api/v1/rooms",
    headers: { origin: config.PUBLIC_ORIGIN, cookie: identities[0].cookie },
    payload: {
      name: "Player 1",
      mode: "remote",
      spice: "mild",
      adult: false,
      seatCount: count,
      gameMode: mode,
      packId,
    },
  });
  expect(result.statusCode).toBe(201);
  const created = result.json();
  const clients: Client[] = [];
  for (const [i, identity] of identities.entries()) {
    if (i) {
      const join = await services.app.inject({
        method: "POST",
        url: `/api/v1/rooms/${created.code}/join`,
        headers: { origin: config.PUBLIC_ORIGIN, cookie: identity.cookie },
        payload: {},
      });
      expect(join.statusCode).toBe(200);
    }
    const client = new Client(
      identity.playerId,
      identity.cookie,
      created.roomId,
    );
    await client.connect(false, mediaEvents && i < 2);
    clients.push(client);
  }
  await eventually(() =>
    clients.every((c) => c.state.players.length === count),
  );
  return { clients, ...created } as {
    clients: Client[];
    roomId: string;
    runId: string;
    code: string;
  };
}
it("does not advertise live transcription without a configured Gnani key", async () => {
  const health = await services.app.inject({ method: "GET", url: "/api/v1/health" });
  expect(health.json().liveVoice).toBe(false);
  const { clients } = await room(2);
  expect(clients.every((client) => client.state.liveVoice === false)).toBe(true);
});
it("keeps duplicate labels and room chat through completion, reload and rematch", async () => {
  const { clients, roomId } = await room(2, "spotlight", "hostel-2am", false, ["Alex", "Alex"]);
  expect(clients[0].state.players.map(p => p.name)).toEqual(["Alex 1", "Alex 2"]);
  expect((await clients[0].send({ type: "chat", text: "Meet after the game" })).accepted).toBe(true);
  await start(clients);
  await complete(clients);
  await refresh(clients);
  expect(clients[1].state.lobbyChat?.[0]).toMatchObject({ name: "Alex 1", text: "Meet after the game" });
  expect((await clients[1].send({ type: "chat", text: "Back already!" })).accepted).toBe(true);
  expect((await clients[1].send({ type: "restart" })).accepted).toBe(false);
  const restarted = new Rooms(db, () => now);
  expect((await restarted.snapshot(clients[1].playerId, roomId)).lobbyChat).toHaveLength(2);
  await refresh(clients);
  const oldRun = clients[0].state.sessionId;
  expect((await clients[0].send({ type: "restart" })).accepted).toBe(true);
  await refresh(clients);
  expect(clients[0].state.sessionId).not.toBe(oldRun);
  expect(clients[0].state.step.type).toBe("lobby");
  expect(clients[0].state.lobbyChat).toHaveLength(2);
  expect(clients[0].state.players.every(p => !p.ready && p.score === 0)).toBe(true);
});
async function start(clients: Client[]) {
  await Promise.all(clients.map((c) => c.send({ type: "ready", ready: true })));
  const host = clients.find(
    (c) => c.state.players.find((p) => p.id === c.state.view.viewerId)?.host,
  )!;
  expect((await host.send({ type: "start" })).accepted).toBe(true);
  await eventually(() => clients.every((c) => c.state.step.type === "traits"));
}
async function refresh(clients: Client[]) {
  for (const c of clients)
    c.state = await services.rooms.snapshot(c.playerId, c.roomId);
}
function action(state: NetworkSnapshot): IntentAction | null {
  const phase = state.view.phase;
  if (phase.type === "card")
    return state.view.submitted ? null : { type: "approve" };
  if (!state.view.actionPending) return null;
  switch (phase.type) {
    case "traits":
      return { type: "traits", self: [5, 5, 5], friend: [5, 5, 5] };
    case "nomination":
      return { type: "nominate", playerId: state.players[0].id };
    case "sync":
      return { type: "predict", playerId: state.players[0].id };
    case "vote":
      return {
        type: "vote",
        optionId:
          phase.options.find((o) => o.text.startsWith("truth") && !o.isOwn)
            ?.id ?? phase.options.find((o) => !o.isOwn)!.id,
      };
    case "judge":
      return {
        type: "vote",
        optionId: phase.options.find((o) => o.text === "Blue")!.id,
      };
    case "answer":
      return {
        type: "submit",
        text: phase.isTarget
          ? `truth ${phase.round}`
          : `bluff ${state.view.viewerId}`,
      };
    default:
      return { type: "submit", text: "Blue" };
  }
}
async function complete(clients: Client[]) {
  let loops = 0;
  const rotations = new Map<string, Set<string>>();
  while (++loops < 150) {
    await refresh(clients);
    const state = clients[0].state;
    if (state.step.type === "summary") break;
    const target = state.step.params.targetId;
    if (target) {
      const phases = rotations.get(target) ?? new Set<string>();
      phases.add(`${state.step.params.round}`);
      rotations.set(target, phases);
    }
    const actions = clients.flatMap((client) => {
      const value = action(client.state);
      return value ? [{ client, value }] : [];
    });
    if (actions.length) {
      const results = await Promise.all(
        actions.map(({ client, value }) => client.send(value)),
      );
      results.forEach((result) => expect(result.accepted).toBe(true));
    } else {
      const host = clients.find(
        (c) =>
          c.state.players.find((p) => p.id === c.state.view.viewerId)?.host,
      )!;
      expect((await host.send({ type: "next" })).accepted).toBe(true);
    }
  }
  expect(loops).toBeLessThan(150);
  await refresh(clients);
  return rotations;
}

describe("real socket journeys", () => {
  it("isolates authenticated rate limits behind one proxy and shares the anonymous limit", async () => {
    const limited = await buildServer(config, db, {
      providers: new MockProviders(),
      autoNarration: false,
    });
    const [a, b] = await Promise.all([guest("Rate A"), guest("Rate B")]);
    try {
      for (let i = 0; i < 120; i++)
        expect(
          (
            await limited.app.inject({
              method: "GET",
              url: "/api/v1/resume",
              headers: { cookie: a.cookie },
            })
          ).statusCode,
        ).toBe(200);
      const blocked = await limited.app.inject({
        method: "GET",
        url: "/api/v1/resume",
        headers: { cookie: a.cookie },
      });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error.code).toBe("RATE_LIMIT");
      expect(
        (
          await limited.app.inject({
            method: "GET",
            url: "/api/v1/resume",
            headers: { cookie: b.cookie },
          })
        ).statusCode,
      ).toBe(200);
      for (let i = 0; i < 120; i++)
        expect(
          (
            await limited.app.inject({
              method: "GET",
              url: "/api/v1/resume",
              headers: { cookie: `expose_guest=untrusted-${i}` },
            })
          ).statusCode,
        ).toBe(401);
      expect(
        (
          await limited.app.inject({
            method: "GET",
            url: "/api/v1/resume",
            headers: { cookie: "expose_guest=another-untrusted-value" },
          })
        ).statusCode,
      ).toBe(429);
      expect(
        (
          await limited.app.inject({
            method: "GET",
            url: "/api/v1/resume",
            headers: { cookie: b.cookie },
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      await limited.app.close();
    }
  });
  it("allows only the host to remove lobby seats and revokes removed access durably", async () => {
    const { clients, roomId } = await room(3);
    const [owner, guestPlayer, removed] = clients;
    const target = removed.state.view.viewerId;
    expect(
      (await guestPlayer.send({ type: "kick", playerId: target })).accepted,
    ).toBe(false);
    expect(
      (await owner.send({ type: "kick", playerId: owner.state.view.viewerId }))
        .accepted,
    ).toBe(false);
    await services.host.begin(removed.playerId, roomId, removed.connectionId);
    const cid = randomUUID();
    expect(
      (await owner.send({ type: "kick", playerId: target }, cid)).accepted,
    ).toBe(true);
    const revision = owner.state.revision;
    expect(
      (await owner.send({ type: "kick", playerId: target }, cid)).accepted,
    ).toBe(true);
    expect(owner.state.revision).toBe(revision);
    expect(owner.state.players).toHaveLength(2);
    expect(owner.state.setup.seatCount).toBe(3);
    expect(owner.state.host?.deadline).toBeUndefined();
    await eventually(() =>
      removed.messages.some((m) => m.code === "NOT_A_MEMBER"),
    );
    await expect(
      new Rooms(db, () => now).current(removed.playerId, roomId),
    ).rejects.toThrow("no longer have a seat");
    const resume = await services.app.inject({
      method: "GET",
      url: "/api/v1/resume",
      headers: { cookie: removed.cookie },
    });
    expect(
      resume.json().some((r: { roomId: string }) => r.roomId === roomId),
    ).toBe(false);
    const rejoin = await services.app.inject({
      method: "POST",
      url: `/api/v1/rooms/${owner.state.roomCode}/join`,
      headers: { cookie: removed.cookie, origin: config.PUBLIC_ORIGIN },
      payload: {},
    });
    expect(rejoin.statusCode).toBe(403);
    expect(rejoin.json().error.code).toBe("REMOVED_FROM_ROOM");
    await expect(
      services.media.list(removed.playerId, roomId),
    ).rejects.toThrow();
    for (const client of [owner, guestPlayer])
      await client.send({ type: "ready", ready: true });
    expect((await owner.send({ type: "start" })).accepted).toBe(false);
    const replacement = await guest("Replacement");
    await services.rooms.join(replacement.playerId, owner.state.roomCode);
    const newClient = new Client(
      replacement.playerId,
      replacement.cookie,
      roomId,
    );
    await newClient.connect();
    await newClient.send({ type: "ready", ready: true });
    expect((await owner.send({ type: "start" })).accepted).toBe(true);
    expect(owner.state.step.type).toBe("traits");
    expect(
      (
        await owner.send({
          type: "kick",
          playerId: guestPlayer.state.view.viewerId,
        })
      ).accepted,
    ).toBe(false);
  });

  it("cancels Ask immediately without consuming an unsent exchange or permitting another seat to cancel", async () => {
    const { clients, roomId } = await room(2);
    const [owner, friend] = clients;
    await services.host.begin(friend.playerId, roomId, friend.connectionId);
    const current = await services.rooms.snapshot(friend.playerId, roomId);
    const id = current.host!.id;
    await expect(
      services.host.cancel(owner.playerId, roomId, owner.connectionId, id),
    ).rejects.toThrow("Only the person asking");
    for (const client of clients)
      expect((await client.send({ type: "ready", ready: true })).accepted).toBe(
        true,
      );
    expect((await owner.send({ type: "start" })).accepted).toBe(false);
    friend.socket.send(
      JSON.stringify({ type: "host.cancel", conversationId: id }),
    );
    await eventually(() => !friend.state.host?.deadline);
    expect(friend.state.canAskHost).toBe(true);
    await services.host.begin(friend.playerId, roomId, friend.connectionId);
    const nextId = (await services.rooms.snapshot(friend.playerId, roomId))
      .host!.id;
    await services.host.cancel(
      friend.playerId,
      roomId,
      friend.connectionId,
      id,
    );
    expect(
      (await services.rooms.snapshot(friend.playerId, roomId)).host?.id,
    ).toBe(nextId);
    await services.host.cancel(
      friend.playerId,
      roomId,
      friend.connectionId,
      nextId,
    );
    expect((await owner.send({ type: "start" })).accepted).toBe(true);
    expect(owner.state.step.type).toBe("traits");
  });

  it("aborts an in-flight host reply on dismissal and never restores a cancelled pause", async () => {
    const { clients, roomId } = await room(2);
    const owner = clients[0];
    let invoked = false,
      aborted = false;
    const tts = vi
      .spyOn(services.host.providers, "tts")
      .mockImplementation(async (_text, signal) => {
        invoked = true;
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("cancelled"));
            },
            { once: true },
          );
        });
      });
    try {
      await services.host.begin(owner.playerId, roomId, owner.connectionId);
      const id = (await services.rooms.snapshot(owner.playerId, roomId)).host!
        .id;
      const request = services.host.ask(
        owner.playerId,
        roomId,
        owner.connectionId,
        randomUUID(),
        "How do scores work?",
      );
      await eventually(() => invoked);
      await services.host.cancel(
        owner.playerId,
        roomId,
        owner.connectionId,
        id,
      );
      await request;
      expect(aborted).toBe(true);
      const state = await services.rooms.snapshot(owner.playerId, roomId);
      expect(state.host).toBeUndefined();
      expect(state.deadline).toBeNull();
      expect(state.canAskHost).toBe(false);
    } finally {
      tts.mockRestore();
    }
  });
  it("persists the selected Gemini host attempt and publishes only its completed reply", async () => {
    config.HOST_LLM_PROVIDER = "gemini";
    config.GEMINI_API_KEY = "integration-test-key";
    const hostCall = vi.spyOn(services.host.providers, "host").mockImplementation(async (context, question) => {
      expect(context).toContain('"phase":"lobby"');
      expect(context).toContain('"name":"Player 1"');
      expect(question).toBe("Who is winning?");
      return { text: "Everyone is tied, but Player 1 looks confident.", model: "gemini-3.5-flash-lite", inputTokens: 42, outputTokens: 14 };
    });
    try {
      const { clients, roomId } = await room(2);
      await services.host.begin(clients[0].playerId, roomId, clients[0].connectionId);
      await services.host.ask(clients[0].playerId, roomId, clients[0].connectionId, randomUUID(), "Who is winning?");
      expect(hostCall).toHaveBeenCalledOnce();
      const attempts = await db.select().from(t.attempts);
      expect(attempts).toEqual(expect.arrayContaining([
        expect.objectContaining({ provider: "gemini", model: "gemini-3.5-flash-lite", status: "completed", usage: expect.objectContaining({ inputTokens: 42, outputTokens: 14, llmCalls: 1 }) }),
      ]));
      const snapshot = await services.rooms.snapshot(clients[0].playerId, roomId);
      expect(snapshot.host?.text).toBe("Everyone is tied, but Player 1 looks confident.");
    } finally {
      hostCall.mockRestore();
      config.HOST_LLM_PROVIDER = "scripted";
      config.GEMINI_API_KEY = "";
    }
  });
  for (const mode of ["spotlight", "bluff"] as const)
    for (const count of [2, 3, 4, 5, 6, 7])
      it(`${mode}: ${count} independent players finish with private views and correct rotation`, async () => {
        const { clients, runId } = await room(
          count,
          mode,
          count % 2 ? "hostel-2am" : "goa-trip",
        );
        await start(clients);
        const rotations = await complete(clients);
        expect(rotations.size).toBe(count);
        for (const targets of rotations.values())
          expect(targets.size).toBe(mode === "spotlight" ? 2 : 1);
        for (const client of clients) {
          expect(client.state.step.type).toBe("summary");
          expect(JSON.stringify(client.state)).not.toContain("undefined");
          expect(
            client.state.view.phase.type === "summary" &&
              client.state.view.phase.approved,
          ).toBe(true);
          for (const message of client.messages) {
            if (message.type !== "state") continue;
            const snap = message.snapshot as NetworkSnapshot;
            if (snap.view.phase.type === "vote") {
              expect(JSON.stringify(snap.view.phase)).not.toContain("authorId");
              expect(JSON.stringify(snap.view.phase)).not.toContain("isTruth");
              for (const option of snap.view.phase.options)
                expect(option.id).toMatch(/^[a-f0-9-]{36}$/);
            }
            if (snap.view.phase.type === "guess")
              expect(JSON.stringify(snap)).not.toContain('"secret":');
          }
        }
        const scores = await db
          .select()
          .from(t.scores)
          .where(eq(t.scores.runId, runId));
        expect(scores.reduce((sum, s) => sum + s.points, 0)).toBe(
          clients[0].state.players.reduce((sum, p) => sum + p.score, 0),
        );
        expect(new Set(scores.map((s) => s.eventKey)).size).toBe(scores.length);
      });
  it("ten rooms progress concurrently without cross-room views", async () => {
    const rooms = await Promise.all(Array.from({ length: 10 }, () => room(3)));
    await Promise.all(rooms.map((r) => start(r.clients)));
    await Promise.all(rooms.map((r) => complete(r.clients)));
    for (const r of rooms)
      expect(r.clients.every((c) => c.state.sessionId === r.runId)).toBe(true);
  }, 120000);
});

describe("ownership, idempotency and recovery", () => {
  it("keeps lobby chat private to the room, deduplicated and host settings authoritative", async () => {
    const { clients, roomId, code } = await room(2, "spotlight", "goa-trip");
    const cid = randomUUID();
    expect(
      (await clients[0].send({ type: "chat", text: "Beach squad ready?" }, cid))
        .accepted,
    ).toBe(true);
    await eventually(() => clients[1].state.lobbyChat?.length === 1);
    expect(clients[1].state.lobbyChat![0]).toMatchObject({
      name: "Player 1",
      text: "Beach squad ready?",
    });
    await clients[0].send({ type: "chat", text: "Beach squad ready?" }, cid);
    const restored = await new Rooms(db, () => now).snapshot(
      clients[0].playerId,
      roomId,
    );
    expect(restored.lobbyChat).toHaveLength(1);
    const stranger = await guest("Outside");
    await expect(
      services.rooms.snapshot(stranger.playerId, roomId),
    ).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    const tamper = await services.app.inject({
      method: "POST",
      url: `/api/v1/rooms/${code}/join`,
      headers: { origin: config.PUBLIC_ORIGIN, cookie: clients[1].cookie },
      payload: { seatCount: 7, packId: "hostel-2am" },
    });
    expect(tamper.statusCode).toBe(400);
    expect((await clients[1].send({ type: "start" })).accepted).toBe(false);
    for (let i = 0; i < 4; i++)
      expect(
        (await clients[0].send({ type: "chat", text: `Message ${i}` }))
          .accepted,
      ).toBe(true);
    expect(
      (await clients[0].send({ type: "chat", text: "Too fast" })).accepted,
    ).toBe(false);
    await start(clients);
    expect(
      (await clients[1].send({ type: "chat", text: "Too late" })).accepted,
    ).toBe(false);
    expect(clients[0].state.lobbyChat).toEqual([]);
    expect(clients[0].state.setup.packId).toBe("goa-trip");
  });
  it("rejects cross-origin writes and sockets; room codes cannot reclaim a seat", async () => {
    const bad = await services.app.inject({
      method: "POST",
      url: "/api/v1/guests",
      headers: { origin: "https://evil.example" },
      payload: { name: "Bad" },
    });
    expect(bad.statusCode).toBe(403);
    const { clients, roomId, code } = await room(3);
    const stranger = await guest("Stranger");
    expect(
      (
        await services.app.inject({
          method: "POST",
          url: `/api/v1/rooms/${roomId}/resume`,
          headers: { origin: config.PUBLIC_ORIGIN, cookie: stranger.cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    await start(clients);
    expect(
      (
        await services.app.inject({
          method: "POST",
          url: `/api/v1/rooms/${code}/join`,
          headers: { origin: config.PUBLIC_ORIGIN, cookie: stranger.cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(409);
  });
  it("deduplicates accepted actions across a service restart and rejects changed payloads", async () => {
    const { clients, roomId, runId } = await room(3);
    await start(clients);
    const client = clients[0],
      cid = randomUUID(),
      state = client.state;
    const intent = {
      type: "traits" as const,
      self: [5, 5, 5],
      friend: [5, 5, 5],
      cid,
      stepId: state.step.id,
      phaseEpoch: state.phaseEpoch,
    };
    const ack = await services.rooms.intent(
      roomId,
      state.view.viewerId,
      client.connectionId,
      runId,
      intent,
    );
    const restarted = new Rooms(db, () => now);
    expect(
      await restarted.intent(
        roomId,
        state.view.viewerId,
        client.connectionId,
        runId,
        intent,
      ),
    ).toEqual(ack);
    await expect(
      restarted.intent(
        roomId,
        state.view.viewerId,
        client.connectionId,
        runId,
        { ...intent, self: [1, 1, 1] },
      ),
    ).rejects.toMatchObject({ code: "ID_REUSED" });
    expect(
      (
        await db
          .select()
          .from(t.submissions)
          .where(eq(t.submissions.runId, runId))
      ).length,
    ).toBe(1);
  });
  it("requires explicit tab takeover and revokes the old writer", async () => {
    const { clients } = await room(3);
    const first = clients[0],
      second = new Client(first.playerId, first.cookie, first.roomId);
    await second.connect();
    expect(second.messages.some((m) => m.code === "SEAT_IN_USE")).toBe(true);
    second.close();
    await second.connect(true);
    await eventually(() =>
      first.messages.some((m) => m.code === "SEAT_TAKEN_OVER"),
    );
    await expect(
      services.rooms.intent(
        first.roomId,
        first.state.view.viewerId,
        first.connectionId,
        first.state.sessionId,
        {
          type: "ready",
          ready: true,
          cid: randomUUID(),
          stepId: first.state.step.id,
          phaseEpoch: first.state.phaseEpoch,
        },
      ),
    ).rejects.toMatchObject({ code: "SEAT_IN_USE" });
  });
  it("coalesces room broadcasts into one committed load with distinct authorized views", async () => {
    const { clients, roomId } = await room(5);
    await services.broadcast(roomId);
    const transaction = vi.spyOn(db, "transaction");
    try {
      await Promise.all(Array.from({ length: 8 }, () => services.broadcast(roomId)));
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(new Set(clients.map(c => c.state.view.viewerId)).size).toBe(5);
    } finally { transaction.mockRestore(); }
  });
  it("preserves human submissions, transfers host and reserves disconnected seats", async () => {
    const { clients, roomId } = await room(3);
    await start(clients);
    const oldHost = clients[0],
      seat = oldHost.state.view.viewerId;
    await oldHost.send({ type: "traits", self: [2, 3, 4], friend: [5, 6, 7] });
    await services.rooms.disconnect(roomId, seat, oldHost.connectionId);
    now += 15001;
    await services.rooms.tick(roomId);
    const state = await services.rooms.snapshot(clients[1].playerId, roomId);
    expect(state.players.find((p) => p.id === seat)?.controller).toBe("ai");
    expect(
      state.players.find((p) => p.id === clients[1].state.view.viewerId)?.host,
    ).toBe(true);
    const [run] = await db
      .select()
      .from(t.runs)
      .where(eq(t.runs.id, state.sessionId));
    expect((run.state as EngineState).ratingsByPlayer?.[seat].self).toEqual([
      2, 3, 4,
    ]);
    await services.rooms.connect(oldHost.playerId, roomId, randomUUID(), true);
    expect(
      (await services.rooms.snapshot(oldHost.playerId, roomId)).players.find(
        (p) => p.id === seat,
      )?.controller,
    ).toBe("human");
  });
  it("takes over at the deadline, catches up once and never approves human cards", async () => {
    const { clients, roomId, runId } = await room(3);
    await start(clients);
    for (const c of clients)
      await services.rooms.disconnect(
        roomId,
        c.state.view.viewerId,
        c.connectionId,
      );
    now += 25 * 60 * 1000;
    await services.rooms.tick(roomId);
    const [run] = await db.select().from(t.runs).where(eq(t.runs.id, runId)),
      state = run.state as EngineState;
    expect(activeStep(state).type).toBe("summary");
    expect(state.approved).toEqual([]);
    const before = state.scores;
    await services.rooms.tick(roomId);
    const [again] = await db.select().from(t.runs).where(eq(t.runs.id, runId));
    expect((again.state as EngineState).scores).toEqual(before);
  });
  it("accepts one replacement, clears the question and skips a second veto", async () => {
    const { clients, roomId } = await room(3);
    await start(clients);
    for (let i = 0; i < 8; i++) {
      await refresh(clients);
      if (clients[0].state.step.type === "secret") break;
      const work = clients.flatMap((c) => {
        const a = action(c.state);
        return a ? [c.send(a)] : [];
      });
      await Promise.all(work);
    }
    await refresh(clients);
    const target = clients.find((c) => c.state.view.actionPending)!;
    expect(target.state.step.type).toBe("secret");
    expect((await target.send({ type: "veto" })).accepted).toBe(true);
    await refresh(clients);
    expect((await target.send({ type: "veto" })).accepted).toBe(true);
    expect(
      (await services.rooms.snapshot(target.playerId, roomId)).step.type,
    ).toBe("spotlight-reveal");
  });
});

describe("media, callbacks and retention", () => {
  it("stops new and active audio when the local AI stop switch is set", async () => {
    const { clients, runId } = await room(3);
    await start(clients);
    await toPhase(clients, "catchphrase");
    const { messages } = await capture(clients[0]);
    await mkdir(path.dirname(config.aiStopFile), { recursive: true });
    try {
      await writeFile(config.aiStopFile, "test");
      await eventually(() => messages.some((m) => m.code === "AI_DISABLED"));
      await expect(
        services.usage.reserve(runId, "catchphrase", 1, "stt", "stopped", {
          sttSeconds: 1,
        }),
      ).rejects.toMatchObject({ code: "AI_DISABLED" });
      expect(
        (await clients[0].send({ type: "submit", text: "Typed fallback" }))
          .accepted,
      ).toBe(true);
    } finally {
      await unlink(config.aiStopFile);
    }
  });
  it("verifies callback completion against authenticated polling and retries cancellation", async () => {
    const { clients, runId } = await room(3);
    const mediaId = await services.media.save({
      runId,
      ownerId: clients[0].state.view.viewerId,
      stepId: "lobby",
      epoch: 0,
      kind: "diagnostic",
      bytes: pcmWav(Buffer.alloc(1024)),
      mime: "audio/wav",
      durationMs: 32,
      expiresAt: new Date(Date.now() + 86400000),
      diagnosticConsent: true,
    });
    const id = randomUUID(),
      token = randomBytes(32).toString("base64url");
    await db.insert(t.evaluations).values({
      id,
      runId,
      mediaId,
      providerJobId: "verified-job",
      callbackHash: hash(token),
      status: "pending",
      denoise: true,
      expiresAt: new Date(Date.now() + 86400000),
    });
    let ready = false;
    const request = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/cancel"))
        return Response.json({ status: "cancelled" });
      if (url.endsWith("/files"))
        return Response.json({
          files: [{ transcript_url: "https://api.vachana.ai/test-result" }],
        });
      if (url.endsWith("/test-result"))
        return Response.json({ full_transcript: "Verified result" });
      return Response.json({ status: ready ? "completed" : "processing" });
    });
    const batch = new BatchService(
      db,
      config,
      services.media,
      services.usage,
      request,
    );
    await batch.receive(token, {
      job_id: "verified-job",
      event: "job.completed",
      transcript: "forged",
    });
    await batch.reconcile();
    expect((await db.select().from(t.evaluations))[0].status).toBe("pending");
    ready = true;
    await batch.reconcile();
    expect((await db.select().from(t.evaluations))[0].result).toMatchObject({
      transcript: "Verified result",
    });
    expect(request.mock.calls[0][1]?.headers).toHaveProperty("X-API-Key-ID");
    await services.media.consent(clients[0].playerId, mediaId, false, false);
    await batch.reconcile();
    expect((await db.select().from(t.evaluations))[0].status).toBe("cancelled");
    expect(
      request.mock.calls.some(([url]) => String(url).endsWith("/cancel")),
    ).toBe(true);
  });
  async function toPhase(clients: Client[], type: string) {
    for (let i = 0; i < 30; i++) {
      await refresh(clients);
      if (clients[0].state.step.type === type) return;
      const actions = clients.flatMap((client) => {
        const value = action(client.state);
        return value ? [{ client, value }] : [];
      });
      if (actions.length)
        await Promise.all(
          actions.map(({ client, value }) => client.send(value)),
        );
      else await clients[0].send({ type: "next" });
    }
    throw new Error(`Did not reach ${type}`);
  }
  async function capture(client: Client, consent = false) {
    const socket = new WebSocket(base.replace("http", "ws") + "/api/v1/audio", {
      headers: { Cookie: client.cookie, Origin: config.PUBLIC_ORIGIN },
    });
    sockets.push(socket);
    const messages: Record<string, unknown>[] = [];
    socket.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    socket.send(
      JSON.stringify({
        type: "start",
        roomId: client.roomId,
        runId: client.state.sessionId,
        stepId: client.state.step.id,
        phaseEpoch: client.state.phaseEpoch,
        connectionId: client.connectionId,
        purpose: "answer",
        diagnosticConsent: consent,
        sampleRate: 16000,
        captureId: randomUUID(),
      }),
    );
    await eventually(() =>
      messages.some((m) => m.type === "ready" || m.type === "error"),
    );
    return { socket, messages };
  }
  it("delivers a private editable transcript without saving audio by default", async () => {
    const { clients } = await room(3);
    await start(clients);
    await toPhase(clients, "catchphrase");
    const { socket, messages } = await capture(clients[0]);
    expect(messages[0].type).toBe("ready");
    socket.send(Buffer.alloc(1024));
    socket.send(JSON.stringify({ type: "stop" }));
    await eventually(() => messages.some((m) => m.type === "transcript"));
    expect(messages.find((m) => m.type === "transcript")?.text).toBe("Blue");
    expect(await db.select().from(t.media)).toEqual([]);
    expect(clients[1].messages.some((m) => m.type === "transcript")).toBe(
      false,
    );
    expect(
      (await services.rooms.snapshot(clients[0].playerId, clients[0].roomId))
        .view.actionPending,
    ).toBe(true);
  });
  it("cancels active recording when another tab takes the seat", async () => {
    const { clients } = await room(3);
    await start(clients);
    await toPhase(clients, "catchphrase");
    const { messages } = await capture(clients[0]);
    const second = new Client(
      clients[0].playerId,
      clients[0].cookie,
      clients[0].roomId,
    );
    await second.connect(true);
    await eventually(() => messages.some((m) => m.code === "SEAT_IN_USE"));
    expect(messages.some((m) => m.type === "transcript")).toBe(false);
  });
  it("keeps consented answer audio private until reveal and revokes it immediately", async () => {
    const { clients, roomId, runId } = await room(3, "spotlight", "hostel-2am", true);
    await start(clients);
    await toPhase(clients, "secret");
    const target = clients.find((c) => c.state.view.actionPending)!,
      before = target.state;
    await target.send({ type: "submit", text: "Blue" });
    const shared = await services.media.upload(target.playerId, roomId, {
      runId,
      stepId: before.step.id,
      phaseEpoch: before.phaseEpoch,
      audio: pcmWav(Buffer.alloc(1024)).toString("base64"),
      reveal: true,
    });
    const peer = clients.find((c) => c !== target)!;
    await eventually(() => clients.slice(0, 2).every(c => c.messages.some(m => m.type === "media.changed" && m.runId === runId)));
    expect(clients[2].messages.some(m => m.type === "media.changed")).toBe(false);
    for (const c of clients.slice(0, 2)) {
      const event = c.messages.find(m => m.type === "media.changed")!;
      expect(Object.keys(event).sort()).toEqual(["runId", "type"]);
      c.messages = c.messages.filter(m => m.type !== "media.changed");
    }
    await expect(
      services.media.get(peer.playerId, shared.id),
    ).rejects.toMatchObject({ code: "MEDIA_PRIVATE" });
    await toPhase(clients, "spotlight-reveal");
    expect(
      (await services.media.get(peer.playerId, shared.id)).bytes.length,
    ).toBe(1068);
    await services.media.consent(target.playerId, shared.id, false, false);
    await eventually(() => clients.slice(0, 2).every(c => c.messages.some(m => m.type === "media.changed")));
    await expect(
      services.media.get(peer.playerId, shared.id),
    ).rejects.toMatchObject({ code: "MEDIA_PRIVATE" });
  });
  it("keeps narration usable during provider outage and reuses successful static speech", async () => {
    const { clients, roomId, runId } = await room(3);
    await start(clients);
    const speech = vi
      .spyOn(services.host.providers, "tts")
      .mockRejectedValueOnce(new Error("test outage"));
    await services.host.narrate(roomId);
    expect(
      (await services.rooms.snapshot(clients[0].playerId, roomId)).host?.text,
    ).toContain("Case khul");
    expect((await services.usage.runReport(runId)).attempts[0].status).toBe(
      "failed",
    );
    await toPhase(clients, "spotlight-reveal");
    await services.host.narrate(roomId);
    const calls = speech.mock.calls.length;
    await clients[0].send({ type: "next" });
    await toPhase(clients, "spotlight-reveal");
    await services.host.narrate(roomId);
    expect(speech.mock.calls.length).toBe(calls);
    expect(
      (await services.usage.runReport(runId)).measuredUnits.cacheHits,
    ).toBe(1);
    speech.mockRestore();
  });
  it("rejects expired resume and reserves bounded provider usage under concurrency", async () => {
    const { clients, roomId, runId } = await room(3);
    const reservations = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        services.usage.reserve(runId, "lobby", 0, "stt", `limit-${i}`, {
          sttSeconds: 20,
        }),
      ),
    );
    expect(reservations.filter((r) => r.status === "fulfilled")).toHaveLength(
      3,
    );
    await db
      .update(t.runs)
      .set({ resumeUntil: new Date(now - 1) })
      .where(eq(t.runs.id, runId));
    await expect(
      services.rooms.snapshot(clients[0].playerId, roomId),
    ).rejects.toMatchObject({ code: "ROOM_EXPIRED" });
  });
  it("requires diagnostic consent and never trusts callback transcript content", async () => {
    const { clients, runId } = await room(3);
    const mediaId = await services.media.save({
      runId,
      ownerId: clients[0].state.view.viewerId,
      stepId: "lobby",
      epoch: 0,
      kind: "diagnostic",
      bytes: pcmWav(Buffer.alloc(1024)),
      mime: "audio/wav",
      durationMs: 32,
      expiresAt: new Date(now + 86400000),
      diagnosticConsent: true,
    });
    const token = randomBytes(32).toString("base64url"),
      id = randomUUID();
    await db.insert(t.evaluations).values({
      id,
      runId,
      mediaId,
      providerJobId: "job-1",
      callbackHash: hash(token),
      status: "pending",
      denoise: true,
      expiresAt: new Date(now + 86400000),
    });
    const batch = new BatchService(db, config, services.media, services.usage);
    services.setBatch(batch);
    const payload = {
      event: "job.completed",
      job_id: "job-1",
      transcripts: [{ full_transcript: "forged private speech" }],
    };
    await batch.receive(token, payload);
    await batch.receive(token, payload);
    expect((await db.select().from(t.inbox)).length).toBe(1);
    expect(JSON.stringify(await db.select().from(t.inbox))).not.toContain(
      "forged",
    );
    await expect(
      batch.receive(token, { ...payload, job_id: "other" }),
    ).rejects.toMatchObject({ code: "CALLBACK_NOT_FOUND" });
    await expect(
      services.media.get(clients[1].playerId, mediaId),
    ).rejects.toMatchObject({ code: "MEDIA_PRIVATE" });
    await services.media.consent(clients[0].playerId, mediaId, false, false);
    expect((await db.select().from(t.evaluations))[0].status).toBe(
      "cancel-requested",
    );
  });
  it("purges snapshot, action/event content, clips and evaluation results together", async () => {
    const { clients, runId } = await room(3);
    await start(clients);
    await clients[0].send({
      type: "traits",
      self: [1, 2, 3],
      friend: [4, 5, 6],
    });
    const mediaId = await services.media.save({
      runId,
      ownerId: clients[0].state.view.viewerId,
      stepId: "traits",
      epoch: 1,
      kind: "diagnostic",
      bytes: pcmWav(Buffer.alloc(1024)),
      mime: "audio/wav",
      durationMs: 32,
      expiresAt: new Date(now - 1),
    });
    await db
      .update(t.runs)
      .set({ contentExpiresAt: new Date(now - 1) })
      .where(eq(t.runs.id, runId));
    const batch = new BatchService(db, config, services.media, services.usage);
    await purge(db, services.media, batch, new Date(now));
    expect(
      (await db.select().from(t.runs).where(eq(t.runs.id, runId)))[0].state,
    ).toBeNull();
    expect(await db.select().from(t.submissions)).toEqual([]);
    expect(await db.select().from(t.events)).toEqual([]);
    expect(
      await db.select().from(t.media).where(eq(t.media.id, mediaId)),
    ).toEqual([]);
  });
  it("keeps missing price and billed usage unknown while measuring consumed units", async () => {
    const { runId, clients } = await room(3);
    expect(
      aggregateReports([await services.usage.runReport(runId)]).groups,
    ).toHaveLength(0);
    await start(clients);
    const op = await services.usage.reserve(
      runId,
      "lobby",
      0,
      "host",
      "cost-check",
      { llmCalls: 1 },
    );
    const finish = await services.usage.begin(
      op,
      "gnani",
      "evon-account-model",
    );
    const accepted = finish({
      status: "completed",
      usage: { inputTokens: 20, outputTokens: 10, llmCalls: 1 },
      usageSource: "provider",
    });
    const duplicate = finish({
      status: "completed",
      usage: { llmCalls: 999 },
      usageSource: "provider",
    });
    await Promise.all([accepted, duplicate]);
    const report = await services.usage.runReport(runId);
    expect(report.estimatedCost).toBeNull();
    expect(report.providerReconciledCost).toBeNull();
    expect(report.measuredUnits.llmCalls).toBe(1);
    expect(report.attempts).toHaveLength(1);
    expect(report.run.startedAt).not.toBeNull();
    expect(aggregateReports([report]).groups).toHaveLength(1);
  });
});
