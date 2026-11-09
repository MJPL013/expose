import { createHash } from "node:crypto";
import { and, eq, desc, isNull, inArray, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  AccountPreferencesSchema,
  SavedCardSchema,
  VOID_ONBOARDING_VERSION,
} from "@expose/shared/account";
import type { Database, Transaction } from "../db/client";
import * as t from "../db/schema";
import { ensure } from "../errors";
import type { Rooms } from "../rooms";
import type { AccountAuth } from "./auth";
import {
  accounts,
  accountPlayers,
  accountMatches,
  accountCards,
} from "./schema";
export class AccountService {
  constructor(
    readonly db: Database,
    readonly auth: AccountAuth,
    readonly rooms: Rooms,
  ) {}
  async resolvePlayer(req: FastifyRequest) {
    const account = await this.auth.account(this.auth.token(req));
    const guest = await this.rooms.authenticate(
      req.cookies.expose_guest,
      account?.id,
    );
    if (guest) return guest;
    if (!account) return null;
    const links = await this.db
      .select()
      .from(accountPlayers)
      .where(eq(accountPlayers.accountId, account.id))
      .orderBy(desc(accountPlayers.createdAt));
    // A valid seat can be selected explicitly via the recovery endpoint when several devices were linked.
    const chosen = req.cookies.expose_player;
    return (
      links.find((l) => l.playerId === chosen)?.playerId ??
      links[0]?.playerId ??
      null
    );
  }
  async link(accountId: string, guestId: string) {
    await this.db.transaction(async (tx) => {
      // Serialize account and player ownership so parallel claims cannot combine identities.
      await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for("no key update");
      await tx
        .select()
        .from(t.players)
        .where(eq(t.players.id, guestId))
        .for("no key update");
      const [existing] = await tx
        .select()
        .from(accountPlayers)
        .where(eq(accountPlayers.playerId, guestId));
      ensure(
        !existing || existing.accountId === accountId,
        "ACCOUNT_LINK_CONFLICT",
        "This browser's player belongs to another account.",
        409,
      );
      const links = await tx
        .select()
        .from(accountPlayers)
        .where(eq(accountPlayers.accountId, accountId));
      const otherIds = links
        .map((l) => l.playerId)
        .filter((id) => id !== guestId);
      if (otherIds.length) {
        const seats = await tx
          .select()
          .from(t.members)
          .where(
            and(
              inArray(t.members.playerId, [guestId, ...otherIds]),
              isNull(t.members.removedAt),
            ),
          );
        const myRooms = new Set(
          seats.filter((m) => m.playerId === guestId).map((m) => m.roomId),
        );
        const overlapping = seats
          .filter((m) => m.playerId !== guestId && myRooms.has(m.roomId))
          .map((m) => m.roomId);
        if (overlapping.length) {
          const open = await tx
            .select()
            .from(t.rooms)
            .where(
              and(
                inArray(t.rooms.id, overlapping),
                sql`${t.rooms.expiresAt}>now()`,
                sql`${t.rooms.status}<>'ended'`,
              ),
            );
          ensure(
            !open.length,
            "ACCOUNT_SEAT_CONFLICT",
            "This account already has a seat in that room. Finish or leave that room before linking.",
            409,
          );
        }
      }
      await tx
        .insert(accountPlayers)
        .values({ accountId, playerId: guestId })
        .onConflictDoNothing();
      const memberships = await tx
        .select()
        .from(t.members)
        .where(eq(t.members.playerId, guestId));
      for (const member of memberships) {
        const runs = await tx
          .select()
          .from(t.runs)
          .where(
            and(
              eq(t.runs.roomId, member.roomId),
              eq(t.runs.status, "completed"),
            ),
          );
        for (const run of runs) {
          await saveAccountResult(
            tx,
            run.id,
            run.mode,
            run.completedAt ?? run.updatedAt,
            member.id,
            accountId,
          );
          await saveAccountCard(tx, run.id, member.id, accountId);
        }
      }
    });
  }
  register(app: FastifyInstance) {
    app.get("/api/account/v1/me", async (req) => {
      const account = await this.auth.account(this.auth.token(req));
      const [row] = account
        ? await this.db
            .select()
            .from(accounts)
            .where(eq(accounts.id, account.id))
        : [];
      const guest = await this.rooms.authenticate(
        req.cookies.expose_guest,
        account?.id,
      );
      const [link] = guest
        ? await this.db
            .select()
            .from(accountPlayers)
            .where(eq(accountPlayers.playerId, guest))
        : [];
      return {
        protocol: 1,
        configured: this.auth.configured,
        account,
        preferences: row?.preferences ?? null,
        guestLinked: !!link && link.accountId === account?.id,
      };
    });
    app.put("/api/account/v1/preferences", async (req) => {
      const a = await this.auth.require(req),
        input = z
          .object({
            accountId: z.uuid(),
            preferences: AccountPreferencesSchema,
          })
          .parse(req.body);
      ensure(
        input.accountId === a.id,
        "ACCOUNT_CHANGED",
        "Your account changed. Reload before saving preferences.",
        409,
      );
      const preferences = input.preferences;
      await this.db
        .update(accounts)
        .set({ preferences })
        .where(eq(accounts.id, a.id));
      return { ok: true };
    });
    app.post("/api/account/v1/onboarding", async (req) => {
      const a = await this.auth.require(req);
      z.object({
        version: z.literal(VOID_ONBOARDING_VERSION),
        accepted: z.literal(true),
      }).parse(req.body);
      await this.db
        .update(accounts)
        .set({ onboardingVersion: VOID_ONBOARDING_VERSION })
        .where(eq(accounts.id, a.id));
      return { ok: true };
    });
    app.post("/api/account/v1/link-guest", async (req) => {
      const a = await this.auth.require(req),
        guest = await this.rooms.authenticate(req.cookies.expose_guest, a.id);
      ensure(
        guest,
        "GUEST_NOT_FOUND",
        "There is no eligible guest player in this browser.",
        409,
      );
      await this.link(a.id, guest);
      return { ok: true };
    });
    app.get("/api/account/v1/matches", async (req) => {
      const a = await this.auth.require(req);
      return {
        matches: await this.db
          .select({
            runId: accountMatches.runId,
            mode: accountMatches.mode,
            points: accountMatches.points,
            placement: accountMatches.placement,
            completedAt: accountMatches.completedAt,
          })
          .from(accountMatches)
          .where(eq(accountMatches.accountId, a.id))
          .orderBy(desc(accountMatches.completedAt))
          .limit(100),
      };
    });
    app.get("/api/account/v1/rooms", async (req) => {
      const a = await this.auth.require(req),
        links = await this.db
          .select()
          .from(accountPlayers)
          .where(eq(accountPlayers.accountId, a.id));
      const results = await Promise.all(
        links.map(async (l) => ({
          playerId: l.playerId,
          recovery: await this.rooms.recovery(l.playerId),
        })),
      );
      return { players: results };
    });
    app.post("/api/account/v1/player", async (req, reply) => {
      const a = await this.auth.require(req),
        { playerId } = z.object({ playerId: z.uuid() }).parse(req.body);
      const [link] = await this.db
        .select()
        .from(accountPlayers)
        .where(
          and(
            eq(accountPlayers.accountId, a.id),
            eq(accountPlayers.playerId, playerId),
          ),
        );
      ensure(
        link,
        "PLAYER_NOT_FOUND",
        "That player is not linked to your account.",
        404,
      );
      reply.clearCookie("expose_guest", { path: "/" });
      reply.setCookie("expose_player", playerId, {
        httpOnly: true,
        secure: this.auth.config.secureCookie,
        sameSite: "strict",
        path: "/",
        maxAge: 30 * 86400,
      });
      return { ok: true };
    });
    app.get("/api/account/v1/cards", async (req) => {
      const a = await this.auth.require(req);
      return {
        cards: await this.db
          .select({
            id: accountCards.id,
            card: accountCards.payload,
            origin: accountCards.origin,
            savedAt: accountCards.savedAt,
          })
          .from(accountCards)
          .where(eq(accountCards.accountId, a.id))
          .orderBy(desc(accountCards.savedAt))
          .limit(100),
      };
    });
    app.post("/api/account/v1/cards/import", async (req) => {
      const a = await this.auth.require(req),
        input = z
          .object({
            approved: z.literal(true),
            cards: z.array(SavedCardSchema).max(12),
          })
          .parse(req.body);
      await this.db.transaction(async (tx) => {
        await tx
          .select()
          .from(accounts)
          .where(eq(accounts.id, a.id))
          .for("no key update");
        const count = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(accountCards)
          .where(eq(accountCards.accountId, a.id));
        ensure(
          count[0].count + input.cards.length <= 200,
          "CARD_LIMIT",
          "Remove some saved cards before importing more.",
          409,
        );
        for (const payload of input.cards)
          await tx
            .insert(accountCards)
            .values({
              accountId: a.id,
              payload,
              origin: "local-import",
              fingerprint: createHash("sha256")
                .update(JSON.stringify(payload))
                .digest("hex"),
            })
            .onConflictDoNothing();
      });
      return { ok: true };
    });
    app.delete<{ Params: { id: string } }>(
      "/api/account/v1/cards/:id",
      async (req) => {
        const a = await this.auth.require(req);
        await this.db
          .delete(accountCards)
          .where(
            and(
              eq(accountCards.id, z.uuid().parse(req.params.id)),
              eq(accountCards.accountId, a.id),
            ),
          );
        return { ok: true };
      },
    );
  }
}
export async function saveAccountResult(
  tx: Transaction,
  runId: string,
  mode: string,
  completedAt: Date,
  seatId: string,
  accountId: string,
) {
  const [run] = await tx
    .select({ state: t.runs.state })
    .from(t.runs)
    .where(eq(t.runs.id, runId));
  const roster = (run?.state as { players?: { id: string }[] } | null)?.players;
  if (!roster?.some((player) => player.id === seatId)) return;
  const all = await tx
    .select({
      seatId: t.scores.seatId,
      points: sql<number>`sum(${t.scores.points})::int`,
    })
    .from(t.scores)
    .where(eq(t.scores.runId, runId))
    .groupBy(t.scores.seatId);
  const points = all.find((r) => r.seatId === seatId)?.points ?? 0;
  await tx
    .insert(accountMatches)
    .values({
      accountId,
      runId,
      mode,
      completedAt,
      points,
      placement:
        1 +
        roster.filter(
          (player) =>
            (all.find((r) => r.seatId === player.id)?.points ?? 0) > points,
        ).length,
    })
    .onConflictDoNothing();
}
export async function syncAccountMatch(
  tx: Transaction,
  runId: string,
  roomId: string,
  mode: string,
  completedAt: Date,
) {
  const linked = await tx
    .select({ accountId: accountPlayers.accountId, seatId: t.members.id })
    .from(t.members)
    .innerJoin(accountPlayers, eq(accountPlayers.playerId, t.members.playerId))
    .where(eq(t.members.roomId, roomId));
  for (const link of linked) {
    await saveAccountResult(
      tx,
      runId,
      mode,
      completedAt,
      link.seatId,
      link.accountId,
    );
    await saveAccountCard(tx, runId, link.seatId, link.accountId);
  }
}
async function saveAccountCard(
  tx: Transaction,
  runId: string,
  seatId: string,
  accountId: string,
) {
  const [card] = await tx
    .select()
    .from(t.cards)
    .where(
      and(
        eq(t.cards.runId, runId),
        eq(t.cards.subjectId, seatId),
        sql`${t.cards.approvedAt} is not null`,
      ),
    );
  if (card)
    await tx
      .insert(accountCards)
      .values({
        accountId,
        payload: SavedCardSchema.parse(card.payload),
        origin: "verified-match",
        fingerprint: `run:${runId}:${seatId}`,
      })
      .onConflictDoNothing();
}
