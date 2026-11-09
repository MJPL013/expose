import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { accounts } from "../src/accounts/schema";
import { voidSessions } from "./schema";
import type { GraphView, StoryAnalysisSchema } from "@expose/shared/gc2-graph";
import type { z } from "zod";
export const transcriptTurns = pgTable(
  "gc2_transcript_turns",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => voidSessions.id, { onDelete: "cascade" }),
    id: text().notNull(),
    sequence: integer().notNull(),
    role: text().notNull(),
    original: text().notNull(),
    text: text().notNull(),
    language: text().notNull(),
    audioIds: jsonb("audio_ids").$type<string[]>().notNull().default([]),
    status: text().notNull().default("accepted"),
    correction: text(),
    at: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.id] })],
);
export const analysisRuns = pgTable("gc2_analysis_runs", {
  id: uuid().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => voidSessions.id, { onDelete: "cascade" }),
  version: integer().notNull(),
  inputHash: text("input_hash").notNull(),
  status: text().notNull(),
  model: text().notNull(),
  result: jsonb().$type<z.infer<typeof StoryAnalysisSchema>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const comparisonSummaries = pgTable("gc2_comparison_summaries", {
  id: uuid().primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => voidSessions.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  analysisId: uuid("analysis_id")
    .notNull()
    .references(() => analysisRuns.id, { onDelete: "cascade" }),
  revision: integer().notNull().default(1),
  approved: boolean().notNull().default(false),
  items: jsonb()
    .$type<
      { key: string; title: string; experience: string; response: string }[]
    >()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const graphNodes = pgTable(
  "gc2_graph_nodes",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => voidSessions.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "cascade" }),
    summaryId: uuid("summary_id").references(() => comparisonSummaries.id, {
      onDelete: "cascade",
    }),
    scope: text().notNull().default("private"),
    provenance: text().notNull().default("real"),
    kind: text().notNull(),
    title: text().notNull(),
    summary: text().notNull(),
    experience: text().notNull(),
    response: text().notNull(),
    source: text().notNull(),
    turnIds: jsonb("turn_ids").$type<string[]>().notNull(),
  },
  (t) => [index("gc2_graph_owner").on(t.accountId, t.scope)],
);
export const graphEdges = pgTable("gc2_graph_edges", {
  id: uuid().primaryKey().defaultRandom(),
  from: uuid("from_node")
    .notNull()
    .references(() => graphNodes.id, { onDelete: "cascade" }),
  to: uuid("to_node")
    .notNull()
    .references(() => graphNodes.id, { onDelete: "cascade" }),
  kind: text().notNull(),
  reason: text().notNull(),
  inferred: boolean().notNull().default(true),
});
export const graphEmbeddings = pgTable(
  "gc2_graph_embeddings",
  {
    nodeId: uuid("node_id")
      .notNull()
      .references(() => graphNodes.id, { onDelete: "cascade" }),
    view: text().notNull(),
    model: text().notNull(),
    dimensions: integer().notNull(),
    version: integer().notNull().default(1),
    values: real().array().notNull(),
  },
  (t) => [primaryKey({ columns: [t.nodeId, t.view] })],
);
export const clusterSnapshots = pgTable("gc2_cluster_snapshots", {
  scope: text().primaryKey(),
  version: integer().notNull().default(1),
  clusters: jsonb().$type<GraphView["clusters"]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
