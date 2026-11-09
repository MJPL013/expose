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
