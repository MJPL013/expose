import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import type { SessionState } from "./state";

import { accounts as voidAccounts } from "../src/accounts/schema";
export {
  accounts as voidAccounts,
  accountLogins as voidLogins,
  accountOauth as voidOauth,
} from "../src/accounts/schema";
export const voidSessions = pgTable(
  "gc2_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => voidAccounts.id, { onDelete: "cascade" }),
    state: jsonb().$type<SessionState>().notNull(),
    revision: integer().default(0).notNull(),
    owner: text(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("gc2_sessions_account").on(t.accountId, t.createdAt)],
);
export const voidAssets = pgTable("gc2_assets", {
  id: uuid().primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => voidSessions.id, { onDelete: "cascade" }),
  kind: text().notNull(),
  key: text().notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const voidJobs = pgTable(
  "gc2_jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => voidSessions.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    turnId: text("turn_id"),
    parentId: uuid("parent_id"),
    status: text().notNull().default("queued"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    dispatchId: text("dispatch_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("gc2_jobs_pending").on(t.status, t.createdAt)],
);

/** Admission records contain identifiers and outcomes, never prompts or audio. */
export const voidProviderOperations = pgTable(
  "gc2_provider_operations",
  {
    id: text().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => voidAccounts.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => voidSessions.id, { onDelete: "cascade" }),
    operationId: text("operation_id").notNull(),
    parentId: text("parent_id"),
    kind: text().notNull(),
    resourceGroup: text("resource_group").notNull(),
    provider: text().notNull(),
    status: text().notNull(),
    errorKind: text("error_kind"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("gc2_provider_capacity").on(t.resourceGroup, t.status, t.expiresAt),
    index("gc2_provider_usage").on(t.accountId, t.kind, t.createdAt),
    index("gc2_provider_session").on(t.sessionId, t.kind),
  ],
);
export const voidProviderCircuits = pgTable("gc2_provider_circuits", {
  provider: text().primaryKey(),
  failures: integer().notNull().default(0),
  openUntil: timestamp("open_until", { withTimezone: true }),
});
export const voidIngressLimits = pgTable("gc2_ingress_limits", {
  key: text().primaryKey(),
  count: integer().notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
