import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import type { Database } from "../src/db/client";
import type { Config } from "../src/config";
import { AppError, ensure } from "../src/errors";

export type ProviderScope = {
  accountId: string;
  sessionId: string;
  operationId: string;
  attemptId?: string;
  parentAttemptId?: string;
  vectors?: Map<string, Promise<number[]>>;
};
export const providerScope = new AsyncLocalStorage<ProviderScope>();
export type Capability =
  "stt" | "live" | "tts" | "analysis" | "review" | "embedding" | "recall";
export function failureKind(error: unknown) {
  if (error instanceof AppError) {
    if (error.code === "VOID_STALE") return "stale";
    if (error.status === 429) return "rate-limited";
    if (error.rejected || error.status < 500) return "rejected";
    if (error.code.includes("OUTPUT") || error.code.includes("UNGROUNDED"))
      return "invalid-output";
  }
  if (
    error instanceof Error &&
    /abort|timeout|deadline/i.test(error.name + error.message)
  )
    return "timed-out";
  return "unavailable";
}
function busy(code: string, message: string, seconds: number): never {
  const error = new AppError(code, message, 429);
  error.retryAfterSeconds = seconds;
  throw error;
}

/** Content-free, durable admission. No transaction remains open during a provider call. */
export class ProviderAdmission {
  constructor(
    readonly db: Database,
    readonly config: Config,
  ) {}
  async ingress(key: string, limit: number, seconds: number) {
    const result = await this.db.execute(
      sql`insert into gc2_ingress_limits(key,count,reset_at) values(${key},1,now()+${seconds}*interval '1 second') on conflict(key) do update set count=case when gc2_ingress_limits.reset_at<=now() then 1 else gc2_ingress_limits.count+1 end, reset_at=case when gc2_ingress_limits.reset_at<=now() then now()+${seconds}*interval '1 second' else gc2_ingress_limits.reset_at end returning count,reset_at`,
    );
    const row = result.rows[0] as { count: number; reset_at: Date };
    if (row.count > limit)
      busy(
        "VOID_RATE_LIMIT",
        "Too many requests. Please wait a moment.",
        Math.max(
          1,
          Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000),
        ),
      );
  }
  async recover() {
    await this.db.execute(
      sql`update gc2_provider_operations set status='unknown',error_kind='timed-out',completed_at=now() where status='running' and expires_at<now()`,
    );
    await this.db.execute(
      sql`delete from gc2_ingress_limits where reset_at<now()-interval '1 day'`,
    );
  }
  async acquire(
    scope: ProviderScope,
    kind: Capability,
    provider: string,
    id: string,
    parent?: string,
  ) {
    const group =
      kind === "review" ? "analysis" : kind === "recall" ? "embedding" : kind;
    const ceiling = {
      stt: this.config.GC2_STT_CONCURRENCY,
      live: this.config.GC2_LIVE_CONCURRENCY,
      tts: this.config.GC2_TTS_CONCURRENCY,
      analysis: this.config.GC2_ANALYSIS_CONCURRENCY,
      embedding: this.config.GC2_EMBEDDING_CONCURRENCY,
    }[group];
    const ttl = { stt: 80, live: 12, tts: 12, analysis: 130, embedding: 20 }[
      group
    ];
    const sessionLimit = {
      stt: 160,
      live: this.config.GC2_HOST_CALLS,
      tts: 160,
      analysis: 3,
      review: 8,
      embedding: 160,
      recall: 28,
    }[kind];
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('gc2-provider-admission'))`,
      );
      const session = await tx.execute(
        sql`select id from gc2_sessions where id=${scope.sessionId}::uuid and account_id=${scope.accountId}::uuid and deleted_at is null`,
      );
      ensure(
        session.rows.length,
        "VOID_STALE",
        "This conversation is no longer available.",
        409,
      );
      const duplicate = await tx.execute(
        sql`select id from gc2_provider_operations where id=${id}`,
      );
      ensure(
        !duplicate.rows.length,
        "VOID_OPERATION_DUPLICATE",
        "This operation was already accepted.",
        409,
      );
      const circuit = await tx.execute(
        sql`select failures, open_until from gc2_provider_circuits where provider=${provider}`,
      );
      const state = circuit.rows[0] as
        { failures: number; open_until: Date | null } | undefined;
      if (
        state?.open_until &&
        new Date(state.open_until).getTime() > Date.now()
      )
        busy(
          "VOID_CIRCUIT_OPEN",
          "The provider is recovering. Your conversation is saved.",
          Math.ceil((new Date(state.open_until).getTime() - Date.now()) / 1000),
        );
      const active = await tx.execute(
        sql`select account_id, provider from gc2_provider_operations where resource_group=${group} and status='running' and expires_at>now()`,
      );
      if (
        active.rows.length >= ceiling ||
        (["stt", "live"].includes(kind) &&
          active.rows.some((r) => r.account_id === scope.accountId))
      )
        busy(
          "VOID_CAPACITY",
          "Voice service is busy. Please try again shortly.",
          3,
        );
      if (
        state &&
        state.failures >= 3 &&
        active.rows.some((r) => r.provider === provider)
      )
        busy(
          "VOID_CIRCUIT_OPEN",
          "The provider is being checked. Please wait a moment.",
          5,
        );
      const usage = await tx.execute(
        sql`select count(*) filter(where session_id=${scope.sessionId}::uuid)::int as total, count(*) filter(where account_id=${scope.accountId}::uuid and created_at>now()-interval '1 minute')::int as recent from gc2_provider_operations where kind=${kind} and (session_id=${scope.sessionId}::uuid or (account_id=${scope.accountId}::uuid and created_at>now()-interval '1 minute'))`,
      );
      const counts = usage.rows[0] as { total: number; recent: number };
      if (counts.total >= sessionLimit)
        busy(
          "VOID_PROVIDER_ALLOWANCE",
          "This conversation has reached its processing allowance.",
          60,
        );
      if (
        ["stt", "live"].includes(kind) &&
        counts.recent >= this.config.GC2_TURNS_PER_MINUTE
      )
        busy(
          "VOID_RATE_LIMIT",
          "Please leave a little time between turns.",
          60,
        );
      await tx.execute(
        sql`insert into gc2_provider_operations(id,account_id,session_id,operation_id,parent_id,kind,resource_group,provider,status,expires_at) values(${id},${scope.accountId}::uuid,${scope.sessionId}::uuid,${scope.operationId},${parent ?? null},${kind},${group},${provider},'running',now()+${ttl}*interval '1 second')`,
      );
    });
    let settled = false;
    return async (error?: unknown) => {
      if (settled) return;
      settled = true;
      const category = error ? failureKind(error) : null;
      const transient =
        error &&
        (category === "timed-out" ||
          category === "unavailable" ||
          category === "rate-limited" ||
          (error instanceof AppError && error.status >= 500));
      await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('gc2-provider-admission'))`,
        );
        await tx.execute(
          sql`update gc2_provider_operations set status=${error ? "failed" : "done"},error_kind=${category},completed_at=now() where id=${id}`,
        );
        if (transient)
          await tx.execute(
            sql`insert into gc2_provider_circuits(provider,failures,open_until) values(${provider},1,null) on conflict(provider) do update set failures=gc2_provider_circuits.failures+1,open_until=case when gc2_provider_circuits.failures+1>=3 then now()+interval '30 seconds' else null end`,
          );
        else if (!error)
          await tx.execute(
            sql`insert into gc2_provider_circuits(provider,failures,open_until) values(${provider},0,null) on conflict(provider) do update set failures=0,open_until=null`,
          );
      });
    };
  }
  async run<T>(
    kind: Capability,
    provider: string,
    key: string,
    deadlineMs: number,
    call: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const scope = providerScope.getStore();
    ensure(
      scope,
      "VOID_OPERATION_SCOPE",
      "Provider operation has no owner.",
      500,
    );
    const until = Date.now() + deadlineMs;
    const base = `${scope.attemptId ?? scope.operationId}:${kind}:${key}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const settle = await this.acquire(
        scope,
        kind,
        provider,
        `${base}:${attempt}`,
        attempt
          ? `${base}:0`
          : scope.parentAttemptId
            ? `${scope.parentAttemptId}:${kind}:${key}:0`
            : undefined,
      );
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (Date.now() >= until)
          throw new AppError(
            "PROVIDER_TIMEOUT",
            "The provider deadline elapsed. Your answer is saved.",
            504,
          );
        const value = await Promise.race([
          call(controller.signal),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => {
                controller.abort();
                reject(
                  new AppError(
                    "PROVIDER_TIMEOUT",
                    "The provider took too long. Your answer is saved.",
                    504,
                  ),
                );
              },
              Math.max(1, until - Date.now()),
            );
          }),
        ]);
        await settle();
        return value;
      } catch (error) {
        await settle(error);
        const delay =
          error instanceof AppError
            ? Math.max(250, (error.retryAfterSeconds ?? 0) * 1000)
            : 0;
        // Only explicit HTTP rejection can be replayed. A timeout may already be billed.
        if (
          attempt ||
          !(error instanceof AppError) ||
          !error.rejected ||
          ![429, 503].includes(error.status) ||
          Date.now() + delay + 1000 >= until
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }
    throw new Error("Provider attempt limit");
  }
}
