import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db/client";
import * as t from "./db/schema";
import type { Config } from "./config";
import { MediaService } from "./media";
import { UsageLedger } from "./usage";
import { hash } from "./rooms";
import { AppError, ensure } from "./errors";

const callback = z.object({
  job_id: z.string().min(1).max(200),
  event: z.enum([
    "job.completed",
    "job.partial_failure",
    "job.failed",
    "job.cancelled",
  ]),
});
export function wordErrorRate(reference: string, actual: string) {
  const words = (s: string) =>
    s
      .toLocaleLowerCase()
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  const a = words(reference),
    b = words(actual);
  let row = b.map((_, i) => i + 1);
  row.unshift(0);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return {
    referenceWords: a.length,
    edits: row[b.length],
    rate: a.length ? row[b.length] / a.length : null,
  };
}
export class BatchService {
  constructor(
    readonly db: Database,
    readonly config: Config,
    readonly media: MediaService,
    readonly usage: UsageLedger,
    private request: typeof fetch = fetch,
  ) {}
  private async api(path: string, init: RequestInit = {}) {
    const response = await this.request(
      `${this.config.GNANI_BATCH_URL}${path}`,
      {
        ...init,
        headers: { "X-API-Key-ID": this.config.GNANI_API_KEY, ...init.headers },
        signal: AbortSignal.timeout(15000),
      },
    );
    ensure(
      response.ok,
      "BATCH_PROVIDER",
      "The diagnostic provider request failed.",
      502,
    );
    return response.json();
  }
  async create(mediaId: string, denoise: boolean, reference?: string) {
    ensure(
      this.usage.enabled && this.config.GNANI_API_KEY,
      "AI_DISABLED",
      "Enable AI before running a paid diagnostic.",
      503,
    );
    ensure(
      this.config.PUBLIC_ORIGIN.startsWith("https://"),
      "HTTPS_REQUIRED",
      "A public HTTPS callback origin is required.",
    );
    const [asset] = await this.db
      .select()
      .from(t.media)
      .where(eq(t.media.id, mediaId));
    ensure(
      asset?.diagnosticConsent && asset.expiresAt.getTime() > Date.now(),
      "CONSENT_REQUIRED",
      "An unexpired diagnostic recording with explicit consent is required.",
      403,
    );
    const id = randomUUID(),
      token = randomBytes(32).toString("base64url");
    await this.db.insert(t.evaluations).values({
      id,
      runId: asset.runId,
      mediaId,
      status: "creating",
      denoise,
      callbackHash: hash(token),
      result: reference ? { reference: reference.slice(0, 1000) } : null,
      expiresAt: asset.expiresAt,
    });
    const op = await this.usage.reserve(
        asset.runId,
        asset.stepId,
        asset.epoch,
        "diagnostic-batch",
        `diagnostic:${id}`,
        { diagnosticSeconds: asset.durationMs / 1000 },
      ),
      finish = await this.usage.begin(op, "gnani", this.config.GNANI_STT_MODEL);
    try {
      const bytes = await this.media.storage.get(asset.storageKey),
        form = new FormData();
      form.set(
        "files",
        new Blob([new Uint8Array(bytes)], { type: asset.mime }),
        "diagnostic.wav",
      );
      form.set(
        "config",
        JSON.stringify({
          model: this.config.GNANI_STT_MODEL,
          language_code: "hi-IN,en-IN",
          format: "transcribe",
          with_denoise: denoise,
        }),
      );
      form.set(
        "callback_url",
        `${this.config.PUBLIC_ORIGIN}/api/v1/webhooks/gnani/batch/${token}`,
      );
      const response = await this.api("", { method: "POST", body: form });
      ensure(
        typeof response.job_id === "string",
        "BATCH_PROTOCOL",
        "The provider did not return a job ID.",
        502,
      );
      await this.db
        .update(t.evaluations)
        .set({
          providerJobId: response.job_id,
          status: "created",
          updatedAt: new Date(),
        })
        .where(eq(t.evaluations.id, id));
      await this.api(`/${encodeURIComponent(response.job_id)}/start`, {
        method: "POST",
      });
      await this.db
        .update(t.evaluations)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(t.evaluations.id, id));
      await finish({
        status: "completed",
        usage: {
          captureSeconds: asset.durationMs / 1000,
          diagnosticSeconds: asset.durationMs / 1000,
        },
        usageSource: "unknown",
        requestId: response.job_id,
      });
      return { id, providerJobId: response.job_id };
    } catch (error) {
      await this.db
        .update(t.evaluations)
        .set({ status: "uncertain", updatedAt: new Date() })
        .where(eq(t.evaluations.id, id));
      await finish({
        status: "uncertain",
        usage: { captureSeconds: asset.durationMs / 1000 },
        usageSource: "unknown",
        errorCode: error instanceof AppError ? error.code : "BATCH_ERROR",
      });
      throw error;
    }
  }
  async receive(token: string, payload: unknown) {
    ensure(
      /^[a-zA-Z0-9_-]{43}$/.test(token),
      "CALLBACK_NOT_FOUND",
      "Callback unavailable.",
      404,
    );
    const parsed = callback.safeParse(payload);
    ensure(
      parsed.success,
      "INVALID_CALLBACK",
      "Invalid callback notification.",
    );
    const [evaluation] = await this.db
      .select()
      .from(t.evaluations)
      .where(eq(t.evaluations.callbackHash, hash(token)));
    ensure(
      evaluation && evaluation.providerJobId === parsed.data.job_id,
      "CALLBACK_NOT_FOUND",
      "Callback unavailable.",
      404,
    );
    if (
      evaluation.expiresAt.getTime() <= Date.now() ||
      ["cancel-requested", "cancelled", "expired"].includes(evaluation.status)
    )
      return;
    // Store notification metadata only. Callback transcript text is never trusted or retained.
    await this.db
      .insert(t.inbox)
      .values({
        evaluationId: evaluation.id,
        dedupeKey: hash(`${evaluation.id}:${parsed.data.event}`),
        event: parsed.data.event,
      })
      .onConflictDoNothing();
  }
  async reconcile() {
    const pending = await this.db
      .select()
      .from(t.evaluations)
      .where(
        and(
          inArray(t.evaluations.status, [
            "pending",
            "created",
            "uncertain",
            "cancel-requested",
          ]),
          gt(t.evaluations.expiresAt, new Date()),
        ),
      );
    for (const item of pending) {
      if (!item.providerJobId) continue;
      try {
        if (item.status === "cancel-requested") await this.cancel(item);
        else await this.poll(item);
      } catch {
        /* The durable job tries again; raw provider responses never enter logs. */
      }
    }
  }
  private async poll(item: typeof t.evaluations.$inferSelect) {
    const [asset] = item.mediaId
      ? await this.db.select().from(t.media).where(eq(t.media.id, item.mediaId))
      : [];
    if (!asset?.diagnosticConsent) {
      await this.cancel(item);
      return;
    }
    const response = await this.api(
        `/${encodeURIComponent(item.providerJobId!)}`,
      ),
      status = String(response.status).toLowerCase();
    if (
      !["completed", "partial_failure", "failed", "cancelled"].includes(status)
    )
      return;
    let transcript = "";
    if (["completed", "partial_failure"].includes(status)) {
      const result = await this.api(
        `/${encodeURIComponent(item.providerJobId!)}/files`,
      );
      const files = Array.isArray(result) ? result : (result.files ?? []);
      for (const file of files) {
        if (!file.transcript_url) continue;
        const url = new URL(file.transcript_url);
        ensure(
          url.protocol === "https:" &&
            (url.hostname.endsWith(".amazonaws.com") ||
              url.hostname === "api.vachana.ai"),
          "UNTRUSTED_RESULT_URL",
          "The provider returned an unexpected transcript host.",
          502,
        );
        const r = await this.request(url, {
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
        ensure(
          r.ok,
          "TRANSCRIPT_FETCH",
          "Diagnostic transcript unavailable.",
          502,
        );
        const raw = await r.text();
        ensure(
          raw.length < 256000,
          "TRANSCRIPT_SIZE",
          "Diagnostic transcript is too large.",
          502,
        );
        const body = JSON.parse(raw);
        if (typeof body.full_transcript === "string")
          transcript += body.full_transcript.slice(0, 10000);
      }
    }
    await this.db.transaction(async (tx) => {
      const [fresh] = await tx
        .select()
        .from(t.evaluations)
        .where(eq(t.evaluations.id, item.id))
        .for("update");
      if (
        !fresh ||
        fresh.expiresAt.getTime() <= Date.now() ||
        ["cancelled", "cancel-requested"].includes(fresh.status)
      )
        return;
      const reference = (fresh.result as { reference?: string } | null)
        ?.reference;
      await tx
        .update(t.evaluations)
        .set({
          status,
          result: {
            transcript,
            reference,
            wordError: reference ? wordErrorRate(reference, transcript) : null,
            latencyMs: Date.now() - fresh.createdAt.getTime(),
            denoise: fresh.denoise,
          },
          updatedAt: new Date(),
        })
        .where(eq(t.evaluations.id, item.id));
      await tx
        .update(t.inbox)
        .set({ status: "verified", updatedAt: new Date() })
        .where(eq(t.inbox.evaluationId, item.id));
    });
  }
  async cancel(item: typeof t.evaluations.$inferSelect) {
    if (item.providerJobId)
      await this.api(`/${encodeURIComponent(item.providerJobId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Local consent withdrawn or recording expired",
        }),
      });
    await this.db
      .update(t.evaluations)
      .set({ status: "cancelled", result: null })
      .where(eq(t.evaluations.id, item.id));
  }
  async expire() {
    const stale = await this.db
      .select()
      .from(t.evaluations)
      .where(lt(t.evaluations.expiresAt, new Date()));
    for (const item of stale) {
      if (
        !["completed", "failed", "cancelled", "expired"].includes(item.status)
      )
        await this.cancel(item).catch(() => {});
      await this.db.delete(t.evaluations).where(eq(t.evaluations.id, item.id));
    }
  }
}
