import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, like } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { VOID_ONBOARDING_VERSION } from "@expose/shared/account";
import type { VoidIdentity } from "@expose/shared/gc2";
import { AccountAuth, hash } from "../src/accounts/auth";
import { accounts, accountLogins } from "../src/accounts/schema";
import type { Config } from "../src/config";
import type { Database } from "../src/db/client";
import { ensure } from "../src/errors";

export { hash } from "../src/accounts/auth";
const guestCookie = "expose_void_guest";
const guestDays = 180;
const consent = z
  .object({
    version: z.literal(VOID_ONBOARDING_VERSION),
    accepted: z.literal(true),
  })
  .strict();

/** Browser-owned Void profiles never authenticate as shared Google accounts. */
export class VoidAuth {
  onLogout: (accountId: string) => void = () => {};
  private selectedTokens = new WeakMap<FastifyRequest, string>();
  constructor(
    readonly db: Database,
    readonly config: Config,
    readonly shared: AccountAuth,
  ) {}
  get configured() {
    return this.shared.configured;
  }
  get localTesting() {
    return false;
  }
  get guestAvailable() {
    return (
      this.config.GC2_ENABLED === "true" &&
      this.config.GC2_GUEST_ENABLED === "true"
    );
  }
  token(req: FastifyRequest) {
    return (
      this.selectedTokens.get(req) ||
      (this.guestAvailable ? req.cookies[guestCookie] : undefined) ||
      this.shared.token(req)
    );
  }
  async account(token?: string): Promise<VoidIdentity | null> {
    if (!token || token.length > 128) return null;
    if (!token.startsWith("vg_")) {
      const google = await this.shared.account(token);
      return google ? { ...google, kind: "google" } : null;
    }
    if (!this.guestAvailable) return null;
    const [guest] = await this.db
      .select({
        id: accounts.id,
        name: accounts.name,
        onboardingVersion: accounts.onboardingVersion,
      })
      .from(accountLogins)
      .innerJoin(accounts, eq(accounts.id, accountLogins.accountId))
      .where(
        and(
          eq(accountLogins.tokenHash, hash(token)),
          gt(accountLogins.expiresAt, new Date()),
          like(accounts.googleSub, "guest:%"),
        ),
      );
    // Guest privileges are fixed even if the database role was accidentally changed.
    return guest ? { ...guest, role: "player", kind: "guest" } : null;
  }
  async identity(req: FastifyRequest) {
    for (const token of [
      this.guestAvailable ? req.cookies[guestCookie] : undefined,
      this.shared.token(req),
    ]) {
      const identity = await this.account(token);
      if (identity && token) {
        this.selectedTokens.set(req, token);
        return identity;
      }
    }
    return null;
  }
  async require(req: FastifyRequest) {
    const identity = await this.identity(req);
    ensure(
      identity,
      "VOID_AUTH_REQUIRED",
      "Continue as a guest or sign in to enter The Void.",
      401,
    );
    return identity;
  }
  register(app: FastifyInstance) {
    const cookie = {
      httpOnly: true,
      secure: this.config.secureCookie,
      sameSite: "lax" as const,
      path: "/",
    };
    app.post(
      "/api/gc2/v2/auth/guest",
      {
        config: {
          rateLimit: {
            max: 12,
            timeWindow: "1 hour",
            keyGenerator: (req: FastifyRequest) => req.ip,
          },
        },
      },
      async (req, reply) => {
        ensure(
          this.guestAvailable,
          "VOID_GUEST_DISABLED",
          "Guest access is unavailable right now.",
          403,
        );
        consent.parse(req.body);
        const existing = await this.identity(req);
        // This action cannot silently replace an authenticated Google identity.
        if (existing?.kind === "google") return { account: existing };
        const token = existing
          ? this.token(req)!
          : `vg_${randomBytes(32).toString("base64url")}`;
        const expiresAt = new Date(Date.now() + guestDays * 86400000);
        const account = await this.db.transaction(async (tx) => {
          const [guest] = existing
            ? await tx
                .update(accounts)
                .set({ onboardingVersion: VOID_ONBOARDING_VERSION })
                .where(eq(accounts.id, existing.id))
                .returning()
            : await tx
                .insert(accounts)
                .values({
                  googleSub: `guest:${randomUUID()}`,
                  name: "Guest",
                  onboardingVersion: VOID_ONBOARDING_VERSION,
                })
                .returning();
          if (existing) {
            const updated = await tx
              .update(accountLogins)
              .set({ expiresAt })
              .where(
                and(
                  eq(accountLogins.tokenHash, hash(token)),
                  eq(accountLogins.accountId, guest.id),
                ),
              )
              .returning({ id: accountLogins.accountId });
            ensure(
              updated.length,
              "VOID_AUTH_REQUIRED",
              "Guest access expired. Please try again.",
              401,
            );
          } else {
            await tx.insert(accountLogins).values({
              tokenHash: hash(token),
              accountId: guest.id,
              expiresAt,
            });
          }
          return {
            id: guest.id,
            name: guest.name,
            onboardingVersion: guest.onboardingVersion,
            role: "player" as const,
            kind: "guest" as const,
          };
        });
        reply.setCookie(guestCookie, token, {
          ...cookie,
          maxAge: guestDays * 86400,
        });
        return { account };
      },
    );
    app.post("/api/gc2/v2/onboarding", async (req) => {
      const identity = await this.require(req);
      consent.parse(req.body);
      await this.db
        .update(accounts)
        .set({ onboardingVersion: VOID_ONBOARDING_VERSION })
        .where(eq(accounts.id, identity.id));
      return { ok: true };
    });
    app.post("/api/gc2/v2/auth/guest/logout", async (req, reply) => {
      const token = req.cookies[guestCookie];
      const identity = await this.account(token);
      if (identity?.kind === "guest" && token) {
        await this.db
          .delete(accountLogins)
          .where(eq(accountLogins.tokenHash, hash(token)));
        this.onLogout(identity.id);
      }
      reply.clearCookie(guestCookie, cookie);
      return { ok: true };
    });
  }
}
