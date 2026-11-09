import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  numeric,
} from "drizzle-orm/pg-core";
export * from "../../gc2/schema";
export * from "../accounts/schema";
export * from "../../gc2/graph-schema";
const dates = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const players = pgTable("players", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  avatar: integer().notNull(),
  color: text().notNull(),
  ...dates(),
});
export const deviceSessions = pgTable("device_sessions", {
  id: uuid().defaultRandom().primaryKey(),
  playerId: uuid("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...dates(),
});
export const rooms = pgTable("rooms", {
  id: uuid().defaultRandom().primaryKey(),
  code: text().notNull().unique(),
  setup: jsonb().notNull(),
  status: text().default("lobby").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  currentRunId: uuid("current_run_id"),
  hostMemory: jsonb("host_memory").notNull().default([]),
  questionHistory: jsonb("question_history").notNull().default([]),
  ...dates(),
});
export const members = pgTable(
  "room_members",
  {
    id: uuid().defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    profile: jsonb().notNull(),
    connectionId: uuid("connection_id"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    ...dates(),
  },
  (t) => [uniqueIndex("member_identity").on(t.roomId, t.playerId)],
);
export const runs = pgTable("game_runs", {
  id: uuid().defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  state: jsonb(),
  revision: integer().default(0).notNull(),
  status: text().default("lobby").notNull(),
  mode: text().notNull(),
  seatCount: integer("seat_count").notNull(),
  departurePhase: text("departure_phase"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  versions: jsonb().notNull(),
  deadline: timestamp({ withTimezone: true }),
  resumeUntil: timestamp("resume_until", { withTimezone: true }).notNull(),
  contentExpiresAt: timestamp("content_expires_at", {
    withTimezone: true,
  }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...dates(),
});
export const rounds = pgTable(
  "rounds",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    roundIndex: integer("round_index").notNull(),
    kind: text().notNull(),
    payload: jsonb().notNull(),
    ...dates(),
  },
  (t) => [uniqueIndex("round_identity").on(t.runId, t.roundIndex)],
);
export const submissions = pgTable(
  "submissions",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id").notNull(),
    stepId: text("step_id").notNull(),
    epoch: integer().notNull(),
    kind: text().notNull(),
    payload: jsonb().notNull(),
    ...dates(),
  },
  (t) => [
    uniqueIndex("submission_identity").on(t.runId, t.seatId, t.stepId, t.epoch),
  ],
);
export const votes = pgTable(
  "votes",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id").notNull(),
    stepId: text("step_id").notNull(),
    epoch: integer().notNull(),
    optionId: text("option_id").notNull(),
    ...dates(),
  },
  (t) => [
    uniqueIndex("vote_identity").on(t.runId, t.seatId, t.stepId, t.epoch),
  ],
);
export const ratings = pgTable(
  "ratings",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    raterId: uuid("rater_id").notNull(),
    targetId: uuid("target_id").notNull(),
    values: jsonb().notNull(),
    ...dates(),
  },
  (t) => [uniqueIndex("rating_identity").on(t.runId, t.raterId, t.targetId)],
);
export const scores = pgTable(
  "score_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    seatId: uuid("seat_id").notNull(),
    roundIndex: integer("round_index").notNull(),
    rule: text().notNull(),
    points: integer().notNull(),
    controller: text().notNull(),
    ...dates(),
  },
  (t) => [uniqueIndex("score_identity").on(t.runId, t.eventKey)],
);
export const events = pgTable(
  "game_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer().notNull(),
    type: text().notNull(),
    payload: jsonb(),
    ...dates(),
  },
  (t) => [uniqueIndex("event_sequence").on(t.runId, t.seq)],
);
export const receipts = pgTable(
  "intent_receipts",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id").notNull(),
    cid: text().notNull(),
    bodyHash: text("body_hash").notNull(),
    ack: jsonb().notNull(),
    ...dates(),
  },
  (t) => [uniqueIndex("intent_identity").on(t.runId, t.seatId, t.cid)],
);
export const cards = pgTable(
  "cards",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").notNull(),
    payload: jsonb().notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...dates(),
  },
  (t) => [uniqueIndex("card_identity").on(t.runId, t.subjectId)],
);
export const media = pgTable("media_assets", {
  id: uuid().defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id"),
  stepId: text("step_id").notNull(),
  epoch: integer().notNull(),
  kind: text().notNull(),
  storageKey: text("storage_key").notNull(),
  mime: text().notNull(),
  bytes: bigint({ mode: "number" }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  revealConsent: boolean("reveal_consent").default(false).notNull(),
  diagnosticConsent: boolean("diagnostic_consent").default(false).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...dates(),
});
export const consents = pgTable("consents", {
  id: uuid().defaultRandom().primaryKey(),
  playerId: uuid("player_id").notNull(),
  mediaId: uuid("media_id").references(() => media.id, { onDelete: "cascade" }),
  scope: text().notNull(),
  granted: boolean().notNull(),
  ...dates(),
});
export const playbacks = pgTable("media_playbacks", {
  id: uuid().primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  mediaId: uuid("media_id").notNull(),
  seatId: uuid("seat_id").notNull(),
  milliseconds: integer().notNull(),
  ...dates(),
});
export const operations = pgTable(
  "ai_operations",
  {
    id: uuid().defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    epoch: integer().notNull(),
    task: text().notNull(),
    operationKey: text("operation_key").notNull(),
    status: text().notNull(),
    reservedUnits: jsonb("reserved_units").notNull(),
    ...dates(),
  },
  (t) => [uniqueIndex("operation_identity").on(t.runId, t.operationKey)],
);
export const rates = pgTable("rate_cards", {
  id: uuid().defaultRandom().primaryKey(),
  provider: text().notNull(),
  model: text().notNull(),
  unit: text().notNull(),
  price: numeric({ precision: 20, scale: 10 }).notNull(),
  currency: text().notNull(),
  version: text().notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
  ...dates(),
});
export const attempts = pgTable(
  "provider_attempts",
  {
    id: uuid().defaultRandom().primaryKey(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id, { onDelete: "cascade" }),
    attempt: integer().notNull(),
    provider: text().notNull(),
    model: text().notNull(),
    effectiveModel: text("effective_model"),
    requestId: text("request_id"),
    status: text().notNull(),
    latencyMs: integer("latency_ms"),
    usage: jsonb().notNull(),
    usageSource: text("usage_source").notNull(),
    rateSnapshot: jsonb("rate_snapshot"),
    estimatedCost: numeric("estimated_cost", { precision: 20, scale: 10 }),
    reconciledCost: numeric("reconciled_cost", { precision: 20, scale: 10 }),
    currency: text(),
    errorCode: text("error_code"),
    ...dates(),
  },
  (t) => [uniqueIndex("attempt_identity").on(t.operationId, t.attempt)],
);
export const evaluations = pgTable("evaluation_runs", {
  id: uuid().defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  mediaId: uuid("media_id").references(() => media.id, { onDelete: "cascade" }),
  providerJobId: text("provider_job_id").unique(),
  callbackHash: text("callback_hash").notNull(),
  status: text().notNull(),
  denoise: boolean().notNull(),
  result: jsonb(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...dates(),
});
export const inbox = pgTable(
  "webhook_inbox",
  {
    id: uuid().defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull().unique(),
    event: text().notNull(),
    status: text().default("pending").notNull(),
    ...dates(),
  },
  (t) => [index("inbox_pending").on(t.status)],
);
