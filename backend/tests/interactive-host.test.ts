import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import * as t from "../src/db/schema";
import { loadConfig } from "../src/config";
import { buildServer } from "../src/server";
import { MockProviders, type Providers } from "../src/providers";
import { HostDirector } from "../src/host-director";
import {
  checkpoint,
  directorContext,
  hostFacts,
  usableMemories,
  HOST_PROMPT_V2,
  stagePrompts,
} from "../src/host-context";
import { activeStep, project, reduceIntent } from "@expose/shared/game/engine";
import { SetupSchema } from "@expose/shared/game/contracts";
import type { HostDecision, HostMemory } from "@expose/shared/game/host";
import type { RunState } from "../src/rooms";

const url =
  process.env.TEST_DATABASE_URL ??
  "postgres://expose:expose_local_only@127.0.0.1:5433/expose_test";
if (new URL(url).pathname !== "/expose_test")
  throw new Error("Only the dedicated test database may be used.");
const { db, pool } = createDatabase(url);
const config = loadConfig({
  DATABASE_URL: url,
  AI_ENABLED: "true",
  HOST_LLM_PROVIDER: "gemini",
  GEMINI_API_KEY: "test-placeholder",
  AI_PROFILE: "full-match",
  MEDIA_ROOT: ".data/host-test-media",
  AI_STOP_FILE: ".data/host-test-disabled",
});
const model = vi.fn<Providers["host"]>();
const mock = new MockProviders();
const voice = vi.fn<Providers["tts"]>(() => mock.tts());
const providers: Providers = {
  stt: mock.stt.bind(mock),
  host: model,
  tts: voice,
};
let address = "";
let app: Awaited<ReturnType<typeof buildServer>>,
  now = Date.now();
const wait: HostDecision = {
  decision: "wait",
  text: "",
  evidenceIds: [],
  inviteSeat: null,
  memory: null,
};
function response(decision: HostDecision) {
  return {
    text: JSON.stringify(decision),
    inputTokens: 20,
    outputTokens: 20,
    model: "test",
  };
}
beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
  app = await buildServer(config, db, {
    providers,
    clock: () => now,
    autoDirector: false,
    autoNarration: false,
    rateLimits: false,
  });
  address = await app.app.listen({ port: 0, host: "127.0.0.1" });
});
beforeEach(async () => {
  await db.execute(sql`TRUNCATE players, rooms, rate_cards CASCADE`);
  now = Date.now();
  model.mockReset();
  voice.mockReset();
  voice.mockImplementation(() => mock.tts());
  model.mockImplementation(async () => response(wait));
  providers.stt = mock.stt.bind(mock);
});
afterAll(async () => {
  await app.app.close();
  await pool.end();
});
async function fixture(
  count = 2,
  gameMode: "spotlight" | "bluff" = "spotlight",
) {
  const guests = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      app.rooms.guest({
        name: "Player " + (i + 1),
        avatar: 0,
        color: "#ffb020",
      }),
    ),
  );
  const room = await app.rooms.create(
    guests[0].playerId,
    SetupSchema.parse({
      name: "Player 1",
      avatar: 0,
      color: "#ffb020",
      seatCount: count,
      mode: "remote",
      gameMode,
      spice: "medium",
      hostLanguage: "en",
    }),
  );
  for (const g of guests.slice(1)) await app.rooms.join(g.playerId, room.code);
  const people = [];
  for (const guest of guests) {
    const connectionId = randomUUID();
    const connected = await app.rooms.connect(
      guest.playerId,
      room.roomId,
      connectionId,
      false,
    );
    people.push({ ...guest, connectionId, seatId: connected.seatId });
  }
  return { ...room, people };
}
async function edit(roomId: string, change: (s: RunState) => void) {
  await db.transaction(async (tx) => {
    const data = await app.rooms.load(tx, roomId),
      state = structuredClone(data.state);
    change(state);
    state.revision++;
    await app.rooms.persist(tx, data, state, "test-state");
  });
}
async function state(roomId: string) {
  return db.transaction(async (tx) => (await app.rooms.load(tx, roomId)).state);
}
async function phase(roomId: string, type: string, round?: number) {
  await edit(roomId, (s) => {
    s.stepIndex = s.flow.steps.findIndex(
      (step) =>
        step.type === type && (round == null || step.params.round === round),
    );
    if (s.stepIndex < 0) throw new Error("Missing test phase");
    s.phaseEpoch++;
    s.deadline = now + 20000;
  });
}
function speak(
  inviteSeat: string | null = null,
  memory: string | null = null,
): HostDecision {
  return {
    decision: "speak",
    text: "Everyone voted for the planner. Finally, a plan with witnesses.",
    evidenceIds: ["standings"],
    inviteSeat,
    memory,
  };
}

it("claims duplicate jobs across directors once and publishes captions even when TTS fails", async () => {
  const r = await fixture();
  await phase(r.roomId, "callout");
  model.mockResolvedValue(
    response(speak(null, "The group nominated a planner.")),
  );
  voice.mockRejectedValue(new Error("synthetic TTS failure"));
  const second = new HostDirector(app.rooms, app.usage, app.media, providers);
  await Promise.all([
    app.director.run(r.roomId),
    second.run(r.roomId),
    app.director.run(r.roomId),
  ]);
  expect(model).toHaveBeenCalledTimes(1);
  const s = await state(r.roomId);
  expect(s.hostBeat).toMatchObject({ status: "speaking", text: speak().text });
  expect(s.hostBeat?.audioUrl).toBeUndefined();
  expect(s.scores).toEqual([]);
  const operations = await db
    .select()
    .from(t.operations)
    .where(eq(t.operations.runId, r.runId));
  expect(operations.filter((o) => o.task === "director")).toHaveLength(1);
  now += 13000;
  await app.director.run(r.roomId);
  expect(activeStep(await state(r.roomId)).type).not.toBe("callout");
});

it("allows two different optional replies, deduplicates a reply, and rejects a third invitation", async () => {
  const r = await fixture(3);
  await phase(r.roomId, "callout");
  model.mockImplementation(async (_prompt, raw) => {
    const ctx = JSON.parse(raw);
    return response(speak(ctx.eligibleInviteSeats[0] ?? null));
  });
  await app.director.run(r.roomId);
  for (let turn = 0; turn < 2; turn++) {
    now += 12000;
    await app.director.run(r.roomId);
    const beat = (await state(r.roomId)).hostBeat!;
    expect(beat.status).toBe("reply");
    const p = r.people.find((p) => p.seatId === beat.invitedSeat)!;
    const input = {
      cid: randomUUID(),
      beatId: beat.id,
      turn: beat.turn,
      text: "",
      outcome: "pass" as const,
    };
    const ack = await app.director.reply(
      p.playerId,
      r.roomId,
      p.connectionId,
      input,
    );
    expect(
      await app.director.reply(p.playerId, r.roomId, p.connectionId, input),
    ).toEqual(ack);
    await expect
      .poll(async () => (await state(r.roomId)).hostBeat?.status)
      .toBe("speaking");
  }
  const s = await state(r.roomId);
  expect(new Set(s.hostBeat!.invited).size).toBe(2);
  expect(s.hostBeat?.invitedSeat).toBeUndefined();
  expect(s.hostBeat?.replies.map((r) => r.outcome)).toEqual(["pass", "pass"]);
  expect(model).toHaveBeenCalledTimes(3);
  now += 12000;
  await app.director.run(r.roomId);
  expect(activeStep(await state(r.roomId)).type).not.toBe("callout");
});

it("rejects unsupported evidence and out-of-turn replies without altering points", async () => {
  const r = await fixture();
  await phase(r.roomId, "callout");
  model.mockResolvedValue(
    response({ ...speak(), evidenceIds: ["invented-history"] }),
  );
  await app.director.run(r.roomId);
  expect((await state(r.roomId)).hostBeat?.status).toBe("done");
  expect(voice).not.toHaveBeenCalled();
  await expect(
    app.director.reply(
      r.people[0].playerId,
      r.roomId,
      r.people[0].connectionId,
      {
        cid: randomUUID(),
        beatId: randomUUID(),
        turn: 0,
        text: "test",
        outcome: "answer",
      },
    ),
  ).rejects.toMatchObject({ code: "HOST_REPLY_EXPIRED" });
  expect((await state(r.roomId)).scores).toEqual([]);
});

it("discards a late generation after a phase change and releases the database during a request", async () => {
  const r = await fixture();
  await phase(r.roomId, "callout");
  let release!: (value: Awaited<ReturnType<Providers["host"]>>) => void;
  model.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const job = app.director.run(r.roomId);
  await expect.poll(() => model.mock.calls.length).toBe(1);
  await phase(r.roomId, "catchphrase"); // Would deadlock if the provider held the room transaction.
  release(response(speak()));
  await job;
  expect(
    (await app.rooms.snapshot(r.people[0].playerId, r.roomId)).hostBeat,
  ).toBeUndefined();
  expect(voice).not.toHaveBeenCalled();
});

it("recovers abandoned generation and expires any exchange at 60 seconds", async () => {
  const r = await fixture();
  await phase(r.roomId, "callout");
  model.mockResolvedValue(response(speak(r.people[0].seatId)));
  await app.director.run(r.roomId);
  now += 60001;
  await app.rooms.tick(r.roomId);
  expect(activeStep(await state(r.roomId)).type).not.toBe("callout");
  expect((await state(r.roomId)).hostBeat?.status).toBe("done");
});

it("keeps memory in the same room on rematch and excludes removed friends and other rooms", async () => {
  const r = await fixture();
  await phase(r.roomId, "callout");
  model.mockResolvedValue(
    response(speak(null, "The group backed the planner.")),
  );
  await app.director.run(r.roomId);
  await phase(r.roomId, "summary");
  const s = await state(r.roomId),
    p = r.people[0];
  const ack = await app.rooms.intent(
    r.roomId,
    p.seatId,
    p.connectionId,
    r.runId,
    {
      type: "restart",
      cid: randomUUID(),
      stepId: activeStep(s).id,
      phaseEpoch: s.phaseEpoch,
    },
  );
  expect(ack.accepted).toBe(true);
  const [room] = await db
    .select()
    .from(t.rooms)
    .where(eq(t.rooms.id, r.roomId));
  expect(room.hostMemory).toHaveLength(1);
  const rematch = await state(r.roomId);
  expect(rematch.hostFlowVersion).toBe(2);
  expect(rematch.sessionId).not.toBe(r.runId);
  expect(
    usableMemories(room.hostMemory as HostMemory[], {
      ...rematch,
      players: rematch.players.slice(1),
    }),
  ).toEqual([]);
  const other = await fixture();
  const [otherRoom] = await db
    .select()
    .from(t.rooms)
    .where(eq(t.rooms.id, other.roomId));
  expect(otherRoom.hostMemory).toEqual([]);
  await app.rooms.end(p.playerId, r.roomId);
  expect(
    (await db.select().from(t.rooms).where(eq(t.rooms.id, r.roomId)))[0]
      .hostMemory,
  ).toEqual([]);
});

it("offers the second/third-question cadence and the two-player Bluff exception", async () => {
  const r = await fixture(4);
  const s = await state(r.roomId);
  const at = (round: number) => {
    s.stepIndex = s.flow.steps.findIndex(
      (step) => step.type === "spotlight-reveal" && step.params.round === round,
    );
    s.phaseEpoch++;
    return checkpoint(s);
  };
  expect(at(0)).toBeNull();
  expect(at(1)?.stage).toBe("midgame");
  s.hostDeferred = true;
  expect(at(2)?.stage).toBe("midgame");
  s.hostDeferred = false;
  s.hostLastRound = 3;
  expect(at(3)).toBeNull();
  expect(at(4)?.stage).toBe("midgame");
  expect(at(6)).toBeNull();
  expect(at(7)).toBeNull();
  const bluff = await fixture(2, "bluff");
  await phase(bluff.roomId, "reveal", 0);
  expect(checkpoint(await state(bluff.roomId))?.stage).toBe("midgame");
  await phase(bluff.roomId, "reveal", 1);
  expect(checkpoint(await state(bluff.roomId))).toBeNull();
  const pair = await fixture(2);
  await phase(pair.roomId, "spotlight-reveal", 2);
  const pairState = await state(pair.roomId);
  pairState.hostDeferred = true;
  expect(checkpoint(pairState)?.stage).toBe("midgame");
});

it("translation is private, deduplicated, separately metered, and never spends reserved host calls", async () => {
  const r = await fixture();
  await phase(r.roomId, "catchphrase");
  const s = await state(r.roomId),
    p = r.people[0];
  model.mockResolvedValue({
    text: JSON.stringify({ text: "Chai with Ravi" }),
    inputTokens: 10,
    outputTokens: 5,
    model: "test",
  });
  const input = {
    runId: r.runId,
    connectionId: p.connectionId,
    phaseEpoch: s.phaseEpoch,
    original: "रवि के साथ चाय",
    language: "hi-IN" as const,
  };
  expect(
    await app.preparation.translate(p.playerId, r.roomId, input),
  ).toMatchObject({ text: "Chai with Ravi" });
  expect(
    await app.preparation.translate(p.playerId, r.roomId, input),
  ).toMatchObject({ text: "Chai with Ravi" });
  expect(model).toHaveBeenCalledTimes(1);
  expect(
    JSON.stringify(await app.rooms.snapshot(r.people[1].playerId, r.roomId)),
  ).not.toContain(input.original);
  const ops = await db
    .select()
    .from(t.operations)
    .where(eq(t.operations.runId, r.runId));
  expect(ops[0].reservedUnits).toEqual({ translationCalls: 1 });
  expect(JSON.stringify(hostFacts(await state(r.roomId)))).not.toContain(
    input.original,
  );
});

it("grants only one shared 15-second grace and distinguishes timeout from passing", async () => {
  const r = await fixture();
  await phase(r.roomId, "catchphrase");
  const s = await state(r.roomId);
  await edit(r.roomId, (value) => {
    value.voicePending = Object.fromEntries(
      r.people.map((p) => [p.seatId, value.phaseEpoch]),
    );
  });
  now = s.deadline!;
  await app.rooms.tick(r.roomId);
  const grace = await state(r.roomId);
  expect(grace.deadline).toBe(s.deadline! + 15000);
  for (const p of r.people)
    await app.rooms.heartbeat(r.roomId, p.seatId, p.connectionId);
  now += 14999;
  await app.rooms.tick(r.roomId);
  expect((await state(r.roomId)).phaseEpoch).toBe(s.phaseEpoch);
  now++;
  await app.rooms.tick(r.roomId);
  expect((await state(r.roomId)).phaseEpoch).toBeGreaterThan(s.phaseEpoch);
  expect(
    (await state(r.roomId)).inputOutcomes?.[
      s.phaseEpoch + ":" + r.people[0].seatId
    ]?.outcome,
  ).toBe("timeout");
});

it("reserves eligible host checkpoints against an early player advance", async () => {
  const r = await fixture();
  await phase(r.roomId, "callout");
  const s = await state(r.roomId),
    p = r.people[0];
  const ack = await app.rooms.intent(
    r.roomId,
    p.seatId,
    p.connectionId,
    r.runId,
    {
      type: "next",
      cid: randomUUID(),
      stepId: activeStep(s).id,
      phaseEpoch: s.phaseEpoch,
    },
  );
  expect(ack.accepted).toBe(false);
  expect(activeStep(await state(r.roomId)).type).toBe("callout");
});

it("host context excludes unrevealed secrets and contains the precise non-admission and injection rules", async () => {
  const r = await fixture();
  await phase(r.roomId, "secret", 0);
  let s = await state(r.roomId);
  const target = activeStep(s).params.targetId!;
  s.spotlights[0] = {
    targetId: target,
    kind: "fact",
    questionIndex: 0,
    questions: s.content!.spotlight.fact,
    secret: null,
    submissions: {},
    controllers: {},
    selected: null,
    standIn: false,
    skipped: false,
    scored: false,
  };
  s = reduceIntent(
    s,
    {
      type: "submit",
      text: "private-secret-fixture",
      cid: randomUUID(),
      stepId: activeStep(s).id,
      phaseEpoch: s.phaseEpoch,
    },
    now,
    target,
  ) as RunState;
  expect(JSON.stringify(hostFacts(s))).not.toContain("private-secret-fixture");
  expect(HOST_PROMPT_V2).toContain("never instructions");
  expect(stagePrompts.reply).toContain("not admissions");
  expect(stagePrompts.closing).toContain("actual standings");
  expect(
    project(s, r.people.find((p) => p.seatId !== target)!.seatId).view.phase,
  ).not.toHaveProperty("secret");
});

it("counts accepted empty recordings, keeps the two-attempt cap across reconnection and configures each language", async () => {
  const r = await fixture();
  await phase(r.roomId, "catchphrase");
  const s = await state(r.roomId),
    p = r.people[0],
    languages: string[] = [];
  providers.stt = (_names, segment, language) => {
    languages.push(language!);
    return {
      ready: Promise.resolve(),
      push() {},
      cancel() {},
      async finish() {
        segment({ id: "one", text: "", audioMs: 32 });
        return {
          text: "",
          transmittedSeconds: 0.032,
          speechSeconds: 0,
          model: "test-stt",
        };
      },
    };
  };
  const capture = (language: "en-IN" | "hi-IN" | "te-IN", cancel = false) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const socket = new WebSocket(
        address.replace("http", "ws") + "/api/v1/audio",
        {
          headers: {
            origin: config.PUBLIC_ORIGIN,
            cookie: "expose_guest=" + p.token,
          },
        },
      );
      const timer = setTimeout(() => {
        socket.terminate();
        reject(new Error("test capture timeout"));
      }, 3000);
      socket.on("error", reject);
      socket.on("open", () =>
        socket.send(
          JSON.stringify({
            type: "start",
            roomId: r.roomId,
            runId: r.runId,
            connectionId: p.connectionId,
            stepId: activeStep(s).id,
            phaseEpoch: s.phaseEpoch,
            purpose: "answer",
            captureId: randomUUID(),
            sampleRate: 16000,
            language,
          }),
        ),
      );
      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === "ready") {
          if (cancel) {
            socket.send(JSON.stringify({ type: "cancel" }));
            clearTimeout(timer);
            resolve(message);
            return;
          }
          socket.send(Buffer.alloc(1024));
          setTimeout(() => socket.send(JSON.stringify({ type: "stop" })), 120);
        }
        if (message.type === "transcript" || message.type === "error") {
          clearTimeout(timer);
          socket.close();
          resolve(message);
        }
      });
    });
  await capture("en-IN", true);
  expect(
    (await app.rooms.snapshot(p.playerId, r.roomId)).remainingRecordings,
  ).toBe(2);
  expect(await capture("hi-IN")).toMatchObject({
    type: "transcript",
    text: "",
  });
  expect(await capture("te-IN")).toMatchObject({
    type: "transcript",
    text: "",
  });
  await app.rooms.connect(p.playerId, r.roomId, p.connectionId, true);
  expect(await capture("en-IN")).toMatchObject({
    type: "error",
    code: "RECORDING_LIMIT",
  });
  expect(languages).toEqual(["en-IN", "hi-IN", "te-IN"]);
  expect(
    (await app.rooms.snapshot(p.playerId, r.roomId)).remainingRecordings,
  ).toBe(0);
  expect(
    (await state(r.roomId)).inputOutcomes?.[s.phaseEpoch + ":" + p.seatId]
      ?.outcome,
  ).toBe("blank");
});

it("bounds a provider that ignores abort at five seconds and does not publish its later result", async () => {
  const r = await fixture();
  await phase(r.roomId, "callout");
  let complete!: (value: Awaited<ReturnType<Providers["host"]>>) => void;
  model.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const began = Date.now();
  await app.director.run(r.roomId);
  expect(Date.now() - began).toBeLessThan(6500);
  expect((await state(r.roomId)).hostBeat?.status).toBe("done");
  complete(response(speak()));
  expect(voice).not.toHaveBeenCalled();
});
