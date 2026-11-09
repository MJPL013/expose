import { createHash, randomBytes } from "node:crypto";
import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { and, eq, gt, lt } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database } from "../db/client";
import type { Config } from "../config";
import { ensure } from "../errors";
import {
  accounts as voidAccounts,
  accountLogins as voidLogins,
  accountOauth as voidOauth,
} from "./schema";

export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
export class AccountAuth {
  onLogout: (accountId: string) => void = () => {};
  constructor(
    readonly db: Database,
    readonly config: Config,
  ) {}
  get configured() {
    return Boolean(
      this.config.GOOGLE_CLIENT_ID && this.config.GOOGLE_CLIENT_SECRET,
    );
  }
  get localTesting() {
    return false;
  }
  token(req: FastifyRequest) {
    return req.cookies.expose_account || req.cookies.expose_void;
  }
  async account(token?: string) {
    if (!token || token.length > 128) return null;
    const [entry] = await this.db
      .select({
        id: voidAccounts.id,
        name: voidAccounts.name,
        subject: voidAccounts.googleSub,
        role: voidAccounts.role,
        onboardingVersion: voidAccounts.onboardingVersion,
      })
      .from(voidLogins)
      .innerJoin(voidAccounts, eq(voidAccounts.id, voidLogins.accountId))
      .where(
        and(
          eq(voidLogins.tokenHash, hash(token)),
          gt(voidLogins.expiresAt, new Date()),
        ),
      );
    if (!entry || /^(local-test|synthetic|guest):/.test(entry.subject))
      return null;
    return {
      id: entry.id,
      name: entry.name,
      role: entry.role === "admin" ? ("admin" as const) : ("player" as const),
      onboardingVersion: entry.onboardingVersion,
    };
  }
  async require(req: FastifyRequest) {
    const account = await this.account(this.token(req));
    ensure(
      account,
      "VOID_AUTH_REQUIRED",
      "Sign in with Google to continue.",
      401,
    );
    return account;
  }
  register(app: FastifyInstance) {
    const cookie = {
      httpOnly: true,
      secure: this.config.secureCookie,
      sameSite: "lax" as const,
      path: "/",
    };
    const redirect = new URL(
      "/api/account/v1/auth/google/callback",
      this.config.PUBLIC_ORIGIN,
    ).href;
    const client = () =>
      new OAuth2Client(
        this.config.GOOGLE_CLIENT_ID,
        this.config.GOOGLE_CLIENT_SECRET,
        redirect,
      );
    app.post("/api/gc2/auth/local", async () => {
      ensure(
        false,
        "VOID_LOCAL_DISABLED",
        "Sign in with Google to use The Void.",
        403,
      );
    });
    app.get(
      "/api/account/v1/auth/google",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      async (req, reply) => {
        ensure(
          this.configured,
          "VOID_AUTH_UNAVAILABLE",
          "Google sign-in has not been configured yet.",
          503,
        );
        const requested = (req.query as { returnTo?: string }).returnTo;
        const returnTo =
          requested &&
          [
            "/",
            "/profile",
            "/profile/cards",
            "/void",
            "/void/explorer",
          ].includes(requested)
            ? requested
            : "/profile";
        const state = random(),
          nonce = random(),
          verifier = random();
        await this.db
          .delete(voidOauth)
          .where(lt(voidOauth.expiresAt, new Date()));
        await this.db.insert(voidOauth).values({
          stateHash: hash(state),
          returnTo,
          nonce,
          verifier,
          expiresAt: new Date(Date.now() + 600000),
        });
        reply.setCookie("expose_void_oauth", state, { ...cookie, maxAge: 600 });
        const url = client().generateAuthUrl({
          scope: ["openid", "email", "profile"],
          state,
          nonce,
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
          code_challenge_method: CodeChallengeMethod.S256,
        });
        return reply.redirect(url);
      },
    );
    app.get<{ Querystring: { state?: string; code?: string; error?: string } }>(
      "/api/account/v1/auth/google/callback",
      async (req, reply) => {
        const { state, code, error } = req.query;
        const validState =
          typeof state === "string" &&
          state.length < 128 &&
          state === req.cookies.expose_void_oauth;
        reply.clearCookie("expose_void_oauth", cookie);
        ensure(
          validState,
          "VOID_LOGIN_EXPIRED",
          "Sign-in expired. Please start again.",
          400,
        );
        const [attempt] = await this.db
          .delete(voidOauth)
          .where(
            and(
              eq(voidOauth.stateHash, hash(state!)),
              gt(voidOauth.expiresAt, new Date()),
            ),
          )
          .returning();
        ensure(
          attempt,
          "VOID_LOGIN_EXPIRED",
          "Sign-in expired. Please start again.",
          400,
        );
        if (error || !code) return reply.redirect("/void?signin=cancelled");
        const oauth = client();
        const { tokens } = await oauth.getToken({
          code,
          codeVerifier: attempt.verifier,
        });
        ensure(
          tokens.id_token,
          "VOID_LOGIN_FAILED",
          "Google sign-in could not be verified.",
          401,
        );
        const ticket = await oauth.verifyIdToken({
          idToken: tokens.id_token,
          audience: this.config.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload() as ReturnType<
          typeof ticket.getPayload
        > & { nonce?: string };
        ensure(
          payload?.sub &&
            payload.nonce === attempt.nonce &&
            payload.email_verified,
          "VOID_LOGIN_FAILED",
          "Google sign-in could not be verified.",
          401,
        );
        const [account] = await this.db
          .insert(voidAccounts)
          .values({
            googleSub: payload.sub,
            name: (payload.given_name || "Friend").slice(0, 80),
          })
          .onConflictDoUpdate({
            target: voidAccounts.googleSub,
            set: { name: (payload.given_name || "Friend").slice(0, 80) },
          })
          .returning();
        const token = random();
        await this.db.insert(voidLogins).values({
          tokenHash: hash(token),
          accountId: account.id,
          expiresAt: new Date(Date.now() + 30 * 86400000),
        });
        reply.setCookie("expose_account", token, {
          ...cookie,
          maxAge: 30 * 86400,
        });
        return reply.redirect(attempt.returnTo);
      },
    );
    app.get("/api/gc2/auth/google", async (_req, reply) =>
      reply.redirect("/api/account/v1/auth/google?returnTo=/void"),
    );
    app.post("/api/account/v1/auth/logout", async (req, reply) => {
      const account = await this.require(req);
      await this.db
        .delete(voidLogins)
        .where(eq(voidLogins.tokenHash, hash(this.token(req)!)));
      this.onLogout(account.id);
      reply.clearCookie("expose_account", cookie);
      reply.clearCookie("expose_void", cookie);
      return { ok: true };
    });
  }
}
