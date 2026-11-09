import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { AccountPreferences } from "@expose/shared/account";
// Physical names deliberately retained: existing Google IDs and Void foreign keys survive.
export const accounts = pgTable("gc2_accounts", {
  id: uuid().primaryKey().defaultRandom(),
  googleSub: text("google_sub").unique().notNull(),
  name: text().notNull(),
  role: text().notNull().default("player"),
  onboardingVersion: integer("onboarding_version").notNull().default(0),
  preferences: jsonb().$type<AccountPreferences>(),
  usageDay: text("usage_day").notNull().default(""),
  sessionsToday: integer("sessions_today").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const accountLogins = pgTable("gc2_logins", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const accountOauth = pgTable("gc2_oauth", {
  stateHash: text("state_hash").primaryKey(),
  nonce: text().notNull(),
  verifier: text().notNull(),
  returnTo: text("return_to").notNull().default("/profile"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const accountPlayers = pgTable("account_players", {
  playerId: uuid("player_id").primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const accountMatches = pgTable(
  "account_matches",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull(),
    mode: text().notNull(),
    points: integer().notNull(),
    placement: integer().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.runId] })],
);
export const accountCards = pgTable("account_cards", {
  id: uuid().primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  fingerprint: text().notNull(),
  origin: text().notNull(),
  payload: jsonb()
    .$type<
      import("zod").infer<
        typeof import("@expose/shared/account").SavedCardSchema
      >
    >()
    .notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow().notNull(),
});
