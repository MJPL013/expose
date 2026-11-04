import { z } from "zod";
import {
  FlowDefinitionSchema,
  SetupSchema,
} from "@expose/shared/game/contracts";
import { engineRegistry, type EngineState } from "@expose/shared/game/engine";
import { validateFlow } from "@expose/shared/game/definitions";
import { ContentSnapshotSchema } from "@expose/shared/game/content-snapshot";
import { SpotlightQuestionSchema } from "@expose/shared/game/spotlight";
import { MAX_AVATAR_ID } from "@expose/shared/game/appearance";

export const CHECKPOINT_KEY = "gnani.session.v2";
export const SESSION_TTL = 2 * 60 * 60 * 1000;
const controller = z.enum(["human", "simulated", "ai"]);
const strings = z.record(z.string(), z.string());
const callout = z.object({
  trait: z.string(),
  self: z.number(),
  peers: z.number(),
  gap: z.number(),
});
const stateSchema = z.object({
  content: ContentSnapshotSchema.optional(),
  questionHistory: z.array(z.string()).optional(),
  runQuestionHistory: z.array(z.string()).optional(),
  sessionId: z.string(),
  phaseEpoch: z.number().int().nonnegative(),
  startedAt: z.number(),
  completed: z.record(z.string(), z.array(z.string())),
  controllers: z.record(z.string(), z.record(z.string(), controller)),
  flow: FlowDefinitionSchema,
  rules: z.object({
    id: z.string(),
    mindReader: z.number(),
    bamboozle: z.number(),
    aiDecoy: z.number(),
    calloutThreshold: z.number(),
    maxCallouts: z.number(),
    factMatch: z.number(),
    favourite: z.number(),
  }),
  setup: SetupSchema,
  players: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(24),
        initials: z.string(),
        color: z.string(),
        avatar: z.number().int().min(0).max(MAX_AVATAR_ID),
        adultConfirmed: z.boolean().optional(),
        score: z.number(),
        ready: z.boolean(),
        host: z.boolean(),
        controller,
        connected: z.boolean(),
        disconnectedAt: z.number().nullable(),
        returnAfterRound: z.number().nullable(),
        aiPoints: z.number(),
      }),
    )
    .min(2)
    .max(7),
  roomCode: z.string(),
  stepIndex: z.number().int().nonnegative(),
  revision: z.number().int(),
  deadline: z.number().nullable(),
  seen: z.array(z.string()).max(1200),
  self: z.array(z.number().min(0).max(10)).length(3),
  friend: z.array(z.number().min(0).max(10)).length(3),
  callout: callout.nullable(),
  callouts: z.number(),
  catchphrases: strings,
  rounds: z.record(
    z.string(),
    z.object({
      targetId: z.string(),
      prompt: z.string(),
      questionId: z.string().optional(),
      answers: z.array(
        z.object({
          id: z.string(),
          text: z.string().max(240),
          authorId: z.string().nullable(),
          isTruth: z.boolean(),
          isAI: z.boolean(),
        }),
      ),
      votes: strings,
      scored: z.boolean(),
      skipped: z.boolean().optional(),
    }),
  ),
  spotlights: z.record(
    z.string(),
    z.object({
      targetId: z.string(),
      kind: z.enum(["fact", "favourite"]),
      questions: z.array(SpotlightQuestionSchema).optional(),
      questionIndex: z.number().int().nonnegative(),
      secret: z.string().max(80).nullable(),
      submissions: z.record(z.string(), z.string().max(80)),
      controllers: z.record(z.string(), controller),
      selected: z.string().nullable(),
      standIn: z.boolean(),
      skipped: z.boolean(),
      scored: z.boolean(),
    }),
  ),
  scores: z.array(
    z.object({
      playerId: z.string(),
      rule: z.enum([
        "mindReader",
        "bamboozle",
        "aiDecoy",
        "factMatch",
        "favourite",
      ]),
      points: z.number(),
      round: z.number().int(),
      controller: controller.optional(),
    }),
  ),
  nominations: strings,
  prediction: strings,
  predictionRevealed: z.boolean(),
  approved: z.array(z.string()),
  vetoes: z.array(z.string()),
  notice: z.string().nullable(),
  defenses: strings,
});
const checkpointSchema = z.object({
  version: z.literal(2),
  createdAt: z.number(),
  savedAt: z.number(),
  seatId: z.string(),
  seatToken: z.string().min(16),
  state: stateSchema,
});
export type Checkpoint = Omit<z.infer<typeof checkpointSchema>, "state"> & {
  state: EngineState;
};

export function parseCheckpoint(raw: string, now: number): Checkpoint {
  const value = checkpointSchema.parse(JSON.parse(raw));
  if (now - value.createdAt >= SESSION_TTL || value.createdAt > now + 5000)
    throw new Error("This saved match has expired. Start a new room.");
  validateFlow(value.state.flow, engineRegistry);
  if (
    value.state.stepIndex >= value.state.flow.steps.length ||
    !value.state.players.some((p) => p.id === value.seatId) ||
    ![2, 4].includes(value.state.flow.version)
  )
    throw new Error("Invalid match state");
  const state = value.state;
  const ids = new Set(state.players.map((p) => p.id));
  const step = state.flow.steps[state.stepIndex];
  if (
    ids.size !== state.players.length ||
    state.rules.id !== state.flow.rulesetId ||
    state.flow.steps.some(
      (step) => step.params.targetId && !ids.has(step.params.targetId),
    )
  )
    throw new Error("Invalid roster or rules");
  if (
    ["secret", "guess", "judge", "spotlight-reveal"].includes(step.type) &&
    !state.spotlights[step.params.round!]
  )
    throw new Error("Missing question state");
  if (
    ["answer", "waiting", "vote", "reveal"].includes(step.type) &&
    !state.rounds[step.params.round!]
  )
    throw new Error("Missing Bluff state");
  if (
    Object.values(state.rounds).some((r) => !ids.has(r.targetId)) ||
    Object.values(state.spotlights).some((r) => !ids.has(r.targetId))
  )
    throw new Error("Invalid question target");
  if (
    state.players.some(
      (p) =>
        p.score !==
        state.scores
          .filter((e) => e.playerId === p.id)
          .reduce((sum, e) => sum + e.points, 0),
    )
  )
    throw new Error("Invalid score ledger");
  return value;
}

/** Stores only validated game data. Blobs, playback URLs, and recording drafts have no fields here. */
export class CheckpointStore {
  private releaseLock: (() => void) | null = null;
  private owner = "";
  private leaseTimer: ReturnType<typeof setInterval> | null = null;
  private acquired = false;
  private generation = 0;
  private lockRequest: Promise<void> | null = null;
  notice: string | null = null;
  private leaseKey = `${CHECKPOINT_KEY}.lease`;
  async acquire(): Promise<boolean> {
    if (this.owns()) return true;
    const generation = ++this.generation;
    // React development remounts can release and reacquire within one microtask.
    // Wait for our previous callback to release its lock before requesting another.
    if (this.lockRequest) await this.lockRequest;
    if (generation !== this.generation) return false;
    this.owner = crypto.randomUUID();
    if (navigator.locks) {
      return new Promise<boolean>((resolve) => {
        this.lockRequest = navigator.locks
          .request(
            "gnani-player-session",
            { ifAvailable: true },
            async (lock) => {
              if (!lock || generation !== this.generation) {
                resolve(false);
                return;
              }
              this.acquired = true;
              await new Promise<void>((release) => {
                this.releaseLock = release;
                resolve(true);
              });
            },
          )
          .then(() => undefined)
          .catch(() => {
            resolve(false);
          });
      });
    }
    try {
      const raw = localStorage.getItem(this.leaseKey);
      const lease = raw ? JSON.parse(raw) : null;
      if (lease && lease.until > Date.now() && lease.owner !== this.owner)
        return false;
      this.renewLease();
      this.leaseTimer = setInterval(() => {
        if (this.owns()) this.renewLease();
      }, 2000);
      return this.owns();
    } catch {
      this.notice =
        "This browser cannot protect a seat across tabs. Use a supported browser to play.";
      return false;
    }
  }
  private renewLease() {
    localStorage.setItem(
      this.leaseKey,
      JSON.stringify({ owner: this.owner, until: Date.now() + 6000 }),
    );
  }
  owns() {
    if (this.acquired) return true;
    if (!this.owner || typeof localStorage === "undefined") return false;
    try {
      const lease = JSON.parse(localStorage.getItem(this.leaseKey) ?? "null");
      return lease?.owner === this.owner && lease.until > Date.now();
    } catch {
      return false;
    }
  }
  read(now: number): Checkpoint | null {
    try {
      const raw = localStorage.getItem(CHECKPOINT_KEY);
      if (!raw) return null;
      try {
        return parseCheckpoint(raw, now);
      } catch (error) {
        this.notice =
          error instanceof Error && error.message.includes("expired")
            ? error.message
            : "Saved match could not be restored. Your profile and saved cards are safe.";
        this.clear();
        return null;
      }
    } catch {
      this.notice =
        "Storage is unavailable. This match will work here, but refresh/reopen cannot restore it.";
      return null;
    }
  }
  write(value: Checkpoint) {
    if (!this.owns()) return false;
    try {
      localStorage.setItem(
        CHECKPOINT_KEY,
        JSON.stringify(checkpointSchema.parse(value)),
      );
      return true;
    } catch {
      this.notice =
        "Match could not be saved. Keep this tab open; refreshing may lose this match.";
      return false;
    }
  }
  clear() {
    if (this.owns()) {
      try {
        localStorage.removeItem(CHECKPOINT_KEY);
      } catch {
        /* in-memory ending remains available */
      }
    }
  }
  release() {
    this.generation++;
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    this.leaseTimer = null;
    if (!this.acquired && this.owns()) {
      try {
        localStorage.removeItem(this.leaseKey);
      } catch {}
    }
    this.acquired = false;
    this.releaseLock?.();
    this.releaseLock = null;
    this.owner = "";
  }
}
