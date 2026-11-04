import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { and, eq, lte, desc } from "drizzle-orm";
import type { Database } from "./db/client";
import * as t from "./db/schema";
import type { Config } from "./config";
import { ensure } from "./errors";

export type Units = {
  narrationCharacters?: number;
  sttSeconds?: number;
  ttsCharacters?: number;
  llmCalls?: number;
  hostCalls?: number;
  translationCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
  captureSeconds?: number;
  transmittedSeconds?: number;
  speechSeconds?: number;
  generatedAudioSeconds?: number;
  playbackSeconds?: number;
  cacheHits?: number;
  billedUnits?: number;
  diagnosticSeconds?: number;
};
export type AttemptResult = {
  status: "completed" | "failed" | "cancelled" | "uncertain";
  usage: Units;
  usageSource: "measured" | "provider" | "unknown";
  requestId?: string;
  errorCode?: string;
  effectiveModel?: string;
};
export class UsageLedger {
  constructor(
    readonly db: Database,
    readonly config: Config,
  ) {}
  get enabled() {
    return this.config.aiEnabled && !existsSync(this.config.aiStopFile);
  }
  async reserve(
    runId: string,
    stepId: string,
    epoch: number,
    task: string,
    key: string,
    units: Units,
  ) {
    ensure(
      this.enabled,
      "AI_DISABLED",
      "Live AI is paused. Typing remains available.",
      503,
    );
    return this.db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(t.runs)
        .where(eq(t.runs.id, runId))
        .for("update");
      ensure(
        run && run.resumeUntil.getTime() > Date.now(),
        "MATCH_EXPIRED",
        "This match has expired.",
        410,
      );
      const existing = await tx
        .select()
        .from(t.operations)
        .where(eq(t.operations.runId, runId));
      ensure(
        !existing.some((o) => o.operationKey === key),
        "OPERATION_EXISTS",
        "This request has already been processed.",
        409,
      );
      const limits: Partial<Record<keyof Units, number>> = {
        narrationCharacters: this.config.MAX_TTS_CHARACTERS,
        sttSeconds: this.config.MAX_AUDIO_SECONDS,
        ttsCharacters: this.config.MAX_TTS_CHARACTERS,
        llmCalls: this.config.MAX_LLM_CALLS,
        hostCalls: this.config.MAX_LLM_CALLS,
        translationCalls: this.config.MAX_TRANSLATION_CALLS,
        diagnosticSeconds: this.config.MAX_DIAGNOSTIC_SECONDS,
      };
      if (this.config.AI_PROFILE === "full-match") {
        const seats = run.seatCount;
        const rounds = run.mode === "bluff" ? seats : seats * 2;
        const beats = 2 + Math.max(1, Math.ceil(rounds / 2));
        const answers = seats * (rounds * 2 + 5) + beats * 2;
        limits.sttSeconds = answers * 2 * 9.024;
        limits.ttsCharacters = beats * 3 * 500 + 2000;
        limits.narrationCharacters = (rounds * 3 + 6) * 2 * 2400;
        limits.hostCalls = beats * 3;
        limits.translationCalls = answers * 3;
      }
      for (const [unit, limit] of Object.entries(limits)) {
        const used = existing.reduce(
          (sum, o) =>
            sum + ((o.reservedUnits as Units)[unit as keyof Units] ?? 0),
          0,
        );
        ensure(
          used + (units[unit as keyof Units] ?? 0) <= limit,
          "AI_LIMIT",
          "This match’s voice allowance is used up. Typing is still available.",
          429,
        );
      }
      const id = randomUUID();
      await tx.insert(t.operations).values({
        id,
        runId,
        stepId,
        epoch,
        task,
        operationKey: key,
        status: "reserved",
        reservedUnits: units,
      });
      return id;
    });
  }
  async begin(
    operationId: string,
    provider: string,
    model: string,
    attempt = 1,
  ) {
    const id = randomUUID(),
      started = Date.now();
    await this.db.insert(t.attempts).values({
      id,
      operationId,
      attempt,
      provider,
      model,
      status: "pending",
      usage: {},
      usageSource: "unknown",
    });
    let finished = false;
    let inFlight: Promise<void> | undefined;
    const record = async (result: AttemptResult) => {
      if (finished) return;
      const effectiveModel = result.effectiveModel ?? model;
      const rates = await this.db
        .select()
        .from(t.rates)
        .where(
          and(
            eq(t.rates.provider, provider),
            eq(t.rates.model, effectiveModel),
            lte(t.rates.effectiveAt, new Date(started)),
          ),
        )
        .orderBy(desc(t.rates.effectiveAt));
      const unique = [
        ...new Map(
          rates
            .map((r) => r.unit)
            .map((unit) => [unit, rates.find((r) => r.unit === unit)!]),
        ).values(),
      ];
      const priced = unique.filter(
        (r) => result.usage[r.unit as keyof Units] !== undefined,
      );
      const currencies = new Set(priced.map((r) => r.currency));
      const estimated =
        provider === "local-cache"
          ? 0
          : priced.length &&
              priced.length === unique.length &&
              currencies.size === 1
            ? priced.reduce(
                (sum, r) =>
                  sum +
                  Number(r.price) * (result.usage[r.unit as keyof Units] ?? 0),
                0,
              )
            : null;
      await this.db.transaction(async (tx) => {
        await tx
          .update(t.attempts)
          .set({
            status: result.status,
            effectiveModel: result.effectiveModel ?? null,
            usage: result.usage,
            usageSource: result.usageSource,
            requestId: result.requestId,
            errorCode: result.errorCode,
            latencyMs: Date.now() - started,
            rateSnapshot: priced.length ? priced : null,
            estimatedCost: estimated == null ? null : String(estimated),
            reconciledCost: provider === "local-cache" ? "0" : null,
            currency: priced[0]?.currency,
            updatedAt: new Date(),
          })
          .where(eq(t.attempts.id, id));
        await tx
          .update(t.operations)
          .set({ status: result.status, updatedAt: new Date() })
          .where(eq(t.operations.id, operationId));
      });
      finished = true;
    };
    return (result: AttemptResult) => {
      if (finished) return Promise.resolve();
      inFlight ??= record(result).finally(() => {
        inFlight = undefined;
      });
      return inFlight;
    };
  }
  async runReport(runId: string) {
    const [run] = await this.db
      .select({
        id: t.runs.id,
        status: t.runs.status,
        mode: t.runs.mode,
        seatCount: t.runs.seatCount,
        createdAt: t.runs.createdAt,
        startedAt: t.runs.startedAt,
        completedAt: t.runs.completedAt,
        departurePhase: t.runs.departurePhase,
      })
      .from(t.runs)
      .where(eq(t.runs.id, runId));
    ensure(run, "NOT_FOUND", "Match not found.", 404);
    const rows = await this.db
      .select({
        task: t.operations.task,
        operationId: t.operations.id,
        attempt: t.attempts,
      })
      .from(t.operations)
      .leftJoin(t.attempts, eq(t.operations.id, t.attempts.operationId))
      .where(eq(t.operations.runId, runId));
    const attempts = rows.map(({ task, operationId, attempt }) => ({
      task,
      operationId,
      ...attempt,
    }));
    const sums: Units = {},
      diagnosticUnits: Units = {};
    const playback = await this.db
      .select({ milliseconds: t.playbacks.milliseconds })
      .from(t.playbacks)
      .where(eq(t.playbacks.runId, runId));
    for (const { task, attempt } of rows)
      if (attempt)
        for (const [key, value] of Object.entries(attempt.usage as Units)) {
          const target = task === "diagnostic-batch" ? diagnosticUnits : sums;
          target[key as keyof Units] =
            (target[key as keyof Units] ?? 0) + value;
        }
    const totals = (items: typeof rows) => {
      const currencies = new Set(
        items.flatMap((r) => (r.attempt?.currency ? [r.attempt.currency] : [])),
      );
      const amount = (field: "estimatedCost" | "reconciledCost") => {
        if (!items.length) return 0;
        if (
          currencies.size > 1 ||
          items.some((r) => !r.attempt || r.attempt[field] === null)
        )
          return null;
        return items.reduce((sum, r) => sum + Number(r.attempt![field]), 0);
      };
      return {
        estimatedCost: amount("estimatedCost"),
        providerReconciledCost: amount("reconciledCost"),
        currency: currencies.size === 1 ? [...currencies][0] : null,
        unknownBillingAttempts: items.filter(
          (r) => !r.attempt || r.attempt.reconciledCost === null,
        ).length,
      };
    };
    return {
      run,
      measuredUnits: sums,
      diagnosticUnits,
      clientReportedPlaybackSeconds: playback.reduce(
        (s, p) => s + p.milliseconds / 1000,
        0,
      ),
      modelNote:
        "model is requested; effectiveModel is populated only when the provider confirms it. Null means unconfirmed.",
      ...totals(rows.filter((r) => r.task !== "diagnostic-batch")),
      diagnostics: totals(rows.filter((r) => r.task === "diagnostic-batch")),
      scriptedReplacementLlmCalls: 0,
      attempts,
    };
  }
}
