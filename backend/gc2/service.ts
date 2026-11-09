import { VoidAi } from "./ai";
import { StoryGraph, invalidateGraph } from "./story-graph";
import { transcriptTurns, analysisRuns } from "./graph-schema";
import { companionPrompt } from "./story-prompts";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { and, eq, isNull, desc, sql, ne } from "drizzle-orm";
import { z } from "zod";
import {
  AnalysisSchema,
  HostSchema,
  PersonaSchema,
  VOID_LIMITS,
  type VoidLanguage,
  type VoidView,
} from "@expose/shared/gc2";
import type { Database, Transaction } from "../src/db/client";
import { selectedHostLlm, type Config } from "../src/config";
import { AppError, ensure } from "../src/errors";
import type { Providers } from "../src/providers";
import { PrivateFilesystem } from "../src/media";
import { voidAccounts, voidAssets, voidJobs, voidSessions } from "./schema";
import {
  initialState,
  nextQuestion,
  shouldWrap,
  limitsFor,
  activeMilliseconds,
  stopClock,
  view,
  type SessionState,
  type Turn,
} from "./state";
import {
  analysisPrompt,
  hostPrompt,
  revealPrompt,
  PROMPT_VERSION,
} from "./prompts";

type Row = typeof voidSessions.$inferSelect;
type Job = typeof voidJobs.$inferSelect;
const CompanionSchema = HostSchema.extend({
  refusedTopics: z.array(z.string().max(80)).max(8).optional(),
});
export class VoidService {
  readonly storage: PrivateFilesystem;
  readonly ai: VoidAi;
  readonly graph: StoryGraph;
  onChange: (sessionId: string) => Promise<void> = async () => {};
  onDeleted: (sessionId: string) => void = () => {};
  constructor(
    readonly db: Database,
    readonly config: Config,
    readonly providers: Providers,
  ) {
    this.storage = new PrivateFilesystem(path.resolve(config.GC2_MEDIA_ROOT));
    this.ai = new VoidAi(config, providers);
    this.graph = new StoryGraph(this);
  }
  get available() {
    return (
      this.config.GC2_ENABLED === "true" &&
      this.config.aiEnabled &&
      this.ai.configured("conversation") &&
      !existsSync(this.config.aiStopFile)
    );
  }
  get voiceAvailable() {
    return this.available && Boolean(this.config.GNANI_API_KEY);
  }
  async row(id: string, accountId?: string) {
    const [r] = await this.db
      .select()
      .from(voidSessions)
      .where(
        and(
          eq(voidSessions.id, id),
          isNull(voidSessions.deletedAt),
          accountId ? eq(voidSessions.accountId, accountId) : undefined,
        ),
      );
    ensure(
      r,
      "VOID_NOT_FOUND",
      "This conversation is no longer available.",
      404,
    );
    return r;
  }
  async change(
    id: string,
    fn: (s: SessionState, row: Row, tx: Transaction) => Promise<void> | void,
    accountId?: string,
    owner?: string,
  ) {
    const result = await this.db.transaction(async (tx) => {
      const [identity] = await tx
        .select({ accountId: voidSessions.accountId })
        .from(voidSessions)
        .where(eq(voidSessions.id, id));
      ensure(
        identity && (!accountId || identity.accountId === accountId),
        "VOID_NOT_FOUND",
        "This conversation is no longer available.",
        404,
      );
      await tx
        .select()
        .from(voidAccounts)
        .where(eq(voidAccounts.id, identity.accountId))
        .for("update");
      const [r] = await tx
        .select()
        .from(voidSessions)
        .where(and(eq(voidSessions.id, id), isNull(voidSessions.deletedAt)))
        .for("update");
      ensure(
        r && (!accountId || r.accountId === accountId),
        "VOID_NOT_FOUND",
        "This conversation is no longer available.",
        404,
      );
      if (owner)
        ensure(
          r.owner === owner && (r.leaseUntil?.getTime() ?? 0) > Date.now(),
          "VOID_OWNERSHIP",
          "This conversation is open on another device. Resume to take it back.",
          409,
        );
      await fn(r.state, r, tx);
      if (r.state.version === 2)
        await this.persistTranscript(tx, r.id, r.state);
      const [updated] = await tx
        .update(voidSessions)
        .set({
          state: r.state,
          revision: r.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(voidSessions.id, id))
        .returning();
      return updated;
    });
    await this.onChange(id);
    return result;
  }
  async persistTranscript(tx: Transaction, id: string, s: SessionState) {
    const timeline = (s.timeline ??= []);
    const entries = new Set(timeline.map((t) => t.id));
    for (const c of s.captions)
      if (!entries.has(c.id)) {
        timeline.push({
          id: c.id,
          role: "assistant",
          at: new Date().toISOString(),
        });
        entries.add(c.id);
      }
    for (const t of s.turns)
      if (!entries.has(t.id)) {
        timeline.push({ id: t.id, role: "user", at: t.at });
        entries.add(t.id);
      }
    for (const t of s.technical ?? [])
      if (!entries.has(t.id)) {
        timeline.push({ id: t.id, role: "technical", at: t.at });
        entries.add(t.id);
      }
    for (const [sequence, item] of timeline.entries()) {
      const user = s.turns.find((t) => t.id === item.id),
        caption = s.captions.find((t) => t.id === item.id),
        technical = s.technical?.find((t) => t.id === item.id);
      const value = {
        sessionId: id,
        id: item.id,
        sequence,
        role: item.role,
        original: user?.original ?? caption?.text ?? "",
        text: user?.text ?? caption?.text ?? "",
        language: user?.language ?? technical?.language ?? s.language,
        audioIds:
          user?.audioIds ??
          (technical
            ? [technical.audioId]
            : caption?.audioId
              ? [caption.audioId]
              : []),
        status: technical
          ? "recognition-failed"
          : user?.invalidated
            ? "invalidated"
            : "accepted",
        correction: user?.correction ?? null,
        at: new Date(item.at),
      };
      await tx
        .insert(transcriptTurns)
        .values(value)
        .onConflictDoUpdate({
          target: [transcriptTurns.sessionId, transcriptTurns.id],
          set: {
            text: value.text,
            correction: value.correction,
            status: value.status,
            audioIds: value.audioIds,
          },
        });
    }
  }
  async recentDialogue(id: string) {
    const rows = await this.db
      .select({
        id: transcriptTurns.id,
        role: transcriptTurns.role,
        text: transcriptTurns.text,
        correction: transcriptTurns.correction,
      })
      .from(transcriptTurns)
      .where(
        and(
          eq(transcriptTurns.sessionId, id),
          eq(transcriptTurns.status, "accepted"),
        ),
      )
      .orderBy(desc(transcriptTurns.sequence))
      .limit(16);
    return rows.reverse().map((r) => ({
      id: r.id,
      role: r.role,
      text: (r.correction || r.text).slice(0, 4000),
    }));
  }
  async finishBatch(s: SessionState, r: Row, tx: Transaction) {
    ensure(
      s.used.analysis < limitsFor(s).analysisCalls,
      "VOID_USAGE_LIMIT",
      "This conversation has reached its analysis allowance.",
      429,
    );
    // Explicit Finish accepts a completed capped utterance; the clock never auto-accepts review.
    if (s.pending.length) {
      const text = s.pending.map((p) => p.text).join(" ");
      s.turns.push({
        id: randomUUID(),
        text,
        original: text,
        language: s.pending[0].language,
        audioIds: s.pending.map((p) => p.audioId),
        sources: [...new Set(s.captions.at(-1)?.sources ?? [])],
        at: new Date().toISOString(),
      });
      s.pending = [];
    }
    stopClock(s);
    s.finishedAt ??= new Date().toISOString();
    s.status = "processing";
    s.processing = "queued";
    delete s.error;
    delete s.capture;
    s.used.analysis++;
    s.workId = await this.enqueue(tx, r.id, "batch");
  }
  async retryAnalysis(id: string, accountId: string) {
    await this.change(
      id,
      async (s, r, tx) => {
        ensure(
          s.version === 2 && s.processing === "failed",
          "VOID_NOT_RETRYABLE",
          "Analysis is not awaiting a retry.",
          409,
        );
        await this.finishBatch(s, r, tx);
      },
      accountId,
    );
  }
  async correctInterpretation(id: string, accountId: string, text: string) {
    await this.change(
      id,
      async (s, r, tx) => {
        ensure(
          s.version === 2 &&
            !!s.finishedAt &&
            ["complete", "error"].includes(s.status),
          "VOID_BUSY",
          "Wait for analysis to finish before correcting it.",
          409,
        );
        s.turns.push({
          id: randomUUID(),
          text: `Correction to my interpretation: ${text}`,
          original: text,
          language: s.language,
          audioIds: [],
          sources: [],
          at: new Date().toISOString(),
        });
        await invalidateGraph(tx, id);
        delete s.persona;
        s.personaVersions = [];
        await this.finishBatch(s, r, tx);
      },
      accountId,
    );
  }
  async retryGraph(id: string, accountId: string) {
    await this.change(
      id,
      async (s, _r, tx) => {
        ensure(
          s.graphStatus === "failed" && (s.used.graph ?? 0) < 8,
          "VOID_NOT_RETRYABLE",
          "Connections are not awaiting a retry.",
          409,
        );
        const attempts = await tx
          .select()
          .from(voidJobs)
          .where(
            and(
              eq(voidJobs.sessionId, id),
              sql`${voidJobs.kind} in ('graph','compare')`,
            ),
          )
          .orderBy(desc(voidJobs.createdAt));
        const [analysis] = await tx
          .select()
          .from(analysisRuns)
          .where(eq(analysisRuns.sessionId, id))
          .orderBy(desc(analysisRuns.createdAt))
          .limit(1);
        const latest = new Map<string, Job>();
        for (const attempt of attempts)
          if (
            (!analysis || attempt.createdAt >= analysis.createdAt) &&
            !latest.has(attempt.kind)
          )
            latest.set(attempt.kind, attempt);
        const failed = [...latest.values()].filter(
          (job) => job.status === "failed",
        );
        ensure(
          failed[0],
          "VOID_NOT_RETRYABLE",
          "No failed connection task was found.",
          409,
        );
        s.graphStatus = "queued";
        await this.enqueue(tx, id, failed[0].kind);
      },
      accountId,
    );
  }
  async enqueue(tx: Transaction, id: string, kind: string, turnId?: string) {
    const jobId = randomUUID();
    await tx
      .insert(voidJobs)
      .values({ id: jobId, sessionId: id, kind, turnId });
    return jobId;
  }
  async create(accountId: string, language: VoidLanguage) {
    ensure(
      this.available,
      "VOID_AI_UNAVAILABLE",
      "The Void's AI is not available yet. Please try again later.",
      503,
    );
    return this.db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(voidAccounts)
        .where(eq(voidAccounts.id, accountId))
        .for("update");
      ensure(account, "VOID_AUTH_REQUIRED", "Sign in again to continue.", 401);
      // Recover an unfinished conversation rather than creating many paid sessions on double taps.
      const existing = await tx
        .select()
        .from(voidSessions)
        .where(
          and(
            eq(voidSessions.accountId, accountId),
            isNull(voidSessions.deletedAt),
          ),
        )
        .orderBy(desc(voidSessions.createdAt))
        .limit(20);
      const active = existing.find(
        (r) => r.state.status !== "complete" && !r.state.finishedAt,
      );
      if (active) return view(active);
      const day = new Date().toISOString().slice(0, 10),
        count = account.usageDay === day ? account.sessionsToday : 0;
      ensure(
        count < this.config.GC2_DAILY_SESSIONS,
        "VOID_DAILY_LIMIT",
        "You've reached today's conversation limit. Come back tomorrow.",
        429,
      );
      await tx
        .update(voidAccounts)
        .set({ usageDay: day, sessionsToday: count + 1 })
        .where(eq(voidAccounts.id, accountId));
      const s = initialState(language, {
        ...VOID_LIMITS,
        speechSeconds: this.config.GC2_SPEECH_SECONDS,
        hostCalls: this.config.GC2_HOST_CALLS,
        turns: this.config.GC2_HOST_CALLS,
        ttsCharacters: this.config.GC2_TTS_CHARACTERS,
      });
      s.activeLimitMs = this.config.GC2_ACTIVE_SECONDS * 1000;
      s.captions[0].audioPending = this.voiceAvailable;
      const [r] = await tx
        .insert(voidSessions)
        .values({ accountId, state: s })
        .returning();
      await this.persistTranscript(tx, r.id, s);
      await tx
        .update(voidSessions)
        .set({ state: s })
        .where(eq(voidSessions.id, r.id));
      if (this.voiceAvailable)
        await this.enqueue(tx, r.id, "tts", s.captions[0].id);
      return view(r);
    });
  }
  async claim(id: string, accountId: string, owner: string) {
    await this.change(
      id,
      async (s, r, tx) => {
        if (s.capture) {
          delete s.capture;
          s.status = s.pending.length ? "review" : "ready";
        }
        if (s.version === 2 && !s.finishedAt) {
          stopClock(s);
          s.activeSince = Date.now();
        }
        await tx
          .update(voidSessions)
          .set({ owner, leaseUntil: new Date(Date.now() + 45000) })
          .where(eq(voidSessions.id, r.id));
      },
      accountId,
    );
    return view(await this.row(id, accountId));
  }
  async heartbeat(id: string, accountId: string, owner: string) {
    const current = await this.row(id, accountId);
    if (
      current.state.version === 2 &&
      !current.state.finishedAt &&
      activeMilliseconds(current.state) >=
        (current.state.activeLimitMs ?? 1800000)
    )
      await this.change(
        id,
        async (s, r, tx) => {
          if (!s.capture && !s.pending.length) await this.finishBatch(s, r, tx);
        },
        accountId,
        owner,
      );
    const r = await this.db
      .update(voidSessions)
      .set({ leaseUntil: new Date(Date.now() + 45000) })
      .where(
        and(
          eq(voidSessions.id, id),
          eq(voidSessions.accountId, accountId),
          eq(voidSessions.owner, owner),
          isNull(voidSessions.deletedAt),
        ),
      )
      .returning({ id: voidSessions.id });
    ensure(
      r.length,
      "VOID_OWNERSHIP",
      "Resume this conversation to continue.",
      409,
    );
  }
  async release(id: string, accountId: string, owner: string) {
    await this.change(
      id,
      async (s, r, tx) => {
        if (s.version === 2) stopClock(s);
        if (s.capture) {
          delete s.capture;
          s.status = s.pending.length ? "review" : "ready";
        }
        await tx
          .update(voidSessions)
          .set({ owner: null, leaseUntil: null })
          .where(eq(voidSessions.id, r.id));
      },
      accountId,
      owner,
    ).catch(() => {});
  }
  check(s: SessionState, r: Row, operation: string, revision: number) {
    if (s.operations.includes(operation)) return false;
    ensure(
      r.revision === revision,
      "VOID_STALE",
      "The conversation changed. Please try again.",
      409,
    );
    ensure(
      !s.capture && ["ready", "review", "error", "complete"].includes(s.status),
      "VOID_BUSY",
      "Let this turn finish first.",
      409,
    );
    s.operations.push(operation);
    if (s.operations.length > 80) s.operations.shift();
    return true;
  }
  async respond(
    id: string,
    accountId: string,
    owner: string,
    operation: string,
    revision: number,
    text?: string,
  ) {
    await this.change(
      id,
      async (s, r, tx) => {
        if (!this.check(s, r, operation, revision)) return;
        ensure(
          s.status !== "complete" &&
            !s.finishedAt &&
            s.turns.length < limitsFor(s).turns,
          "VOID_FINISHED",
          "This conversation is ready to wrap up.",
          409,
        );
        const answer =
          text?.trim() ||
          s.pending
            .map((p) => p.text)
            .join(" ")
            .trim();
        ensure(
          answer && answer.length <= 4000,
          "VOID_EMPTY",
          "I didn't catch that. Please try again or type.",
          400,
        );
        const sources = [...new Set(s.captions.at(-1)?.sources ?? [])];
        const t: Turn = {
          id: operation,
          original: s.pending.length
            ? s.pending.map((p) => p.text).join(" ")
            : answer,
          text: answer,
          language: s.pending[0]?.language ?? s.language,
          audioIds: s.pending.map((p) => p.audioId),
          sources,
          at: new Date().toISOString(),
        };
        s.turns.push(t);
        s.pending = [];
        delete s.error;
        delete s.reflection;
        s.status = "thinking";
        if (s.version === 2) {
          if (
            activeMilliseconds(s) >= (s.activeLimitMs ?? 1800000) ||
            s.used.host >= limitsFor(s).hostCalls ||
            s.turns.length >= limitsFor(s).turns
          ) {
            await this.finishBatch(s, r, tx);
            return;
          }
          s.workId = await this.enqueue(tx, id, "host", t.id);
          return;
        }
        await this.enqueue(tx, id, "analysis", t.id);
        const kind = shouldWrap(s) ? "reveal" : "host";
        s.status = kind === "reveal" ? "revealing" : "thinking";
        s.workId = await this.enqueue(tx, id, kind, t.id);
      },
      accountId,
      owner,
    );
  }
  async action(
    id: string,
    accountId: string,
    owner: string,
    operation: string,
    revision: number,
    action: "skip" | "finish" | "retry",
  ) {
    await this.change(
      id,
      async (s, r, tx) => {
        if (!this.check(s, r, operation, revision)) return;
        ensure(
          s.status !== "complete",
          "VOID_FINISHED",
          "This conversation has finished.",
          409,
        );
        if (s.version === 2) {
          if (
            action === "finish" ||
            (action === "retry" && s.failedKind === "batch")
          ) {
            await this.finishBatch(s, r, tx);
            return;
          }
          ensure(
            !s.finishedAt,
            "VOID_FINISHED",
            "This conversation has finished.",
            409,
          );
          if (action === "skip")
            s.refusedTopics = [
              ...s.refusedTopics,
              s.captions.at(-1)?.text ?? "",
            ].slice(-12);
          for (const p of s.pending)
            await tx
              .update(voidAssets)
              .set({ kind: "discarded" })
              .where(eq(voidAssets.id, p.audioId));
          s.pending = [];
          s.status = "thinking";
          delete s.error;
          s.workId = await this.enqueue(
            tx,
            id,
            "host",
            action === "skip" ? "skip" : s.turns.at(-1)?.id,
          );
          return;
        }
        let kind =
          action === "finish"
            ? "reveal"
            : action === "retry"
              ? (s.failedKind ?? "host")
              : "host";
        if (s.turns.length >= 6) kind = "reveal";
        for (const part of s.pending)
          await tx
            .update(voidAssets)
            .set({ kind: "discarded" })
            .where(eq(voidAssets.id, part.audioId));
        s.pending = [];
        if (kind === "reveal" && !s.turns.length) {
          s.status = "complete";
          s.captions.push({
            id: randomUUID(),
            text:
              s.language === "en"
                ? "A little quiet counts too. Come back whenever you feel like talking."
                : s.language === "hi"
                  ? "जब मन करे, फिर बात करेंगे।"
                  : "Jab mann kare, phir baat karenge.",
            sources: [],
          });
          return;
        }
        delete s.error;
        s.status = kind === "reveal" ? "revealing" : "thinking";
        s.workId = await this.enqueue(
          tx,
          id,
          kind,
          action === "skip" ? "skip" : s.turns.at(-1)?.id,
        );
      },
      accountId,
      owner,
    );
  }
  async correct(
    id: string,
    accountId: string,
    owner: string,
    operation: string,
    revision: number,
    turnId: string,
    text: string,
  ) {
    await this.change(
      id,
      async (s, r, tx) => {
        if (!this.check(s, r, operation, revision)) return;
        const turn = s.turns.find((t) => t.id === turnId);
        ensure(
          turn,
          "VOID_TURN_NOT_FOUND",
          "That reflection is no longer available.",
          404,
        );
        turn.correction = text;
        turn.invalidated = false;
        turn.sources = [];
        s.evidence = s.evidence.filter((e) => !e.turnIds.includes(turnId));
        delete s.reflection;
        delete s.persona;
        delete s.feedback;
        if (s.version === 2) {
          await invalidateGraph(tx, id);
          s.personaVersions = [];
          if (s.finishedAt) {
            await this.finishBatch(s, r, tx);
            return;
          }
          s.status = "ready";
          return;
        }
        await this.enqueue(tx, id, "analysis", turnId);
        const kind = s.status === "complete" ? "reveal" : "host";
        s.status = kind === "reveal" ? "revealing" : "thinking";
        s.workId = await this.enqueue(tx, id, kind, turnId);
      },
      accountId,
      owner,
    );
  }
  async captureStart(
    id: string,
    accountId: string,
    owner: string,
    captureId: string,
    revision: number,
  ) {
    ensure(
      this.voiceAvailable,
      "VOID_VOICE_UNAVAILABLE",
      "Voice is unavailable. You can type instead.",
      503,
    );
    await this.change(
      id,
      (s, r) => {
        ensure(
          r.revision === revision &&
            !s.finishedAt &&
            (s.version === 1 ||
              activeMilliseconds(s) < (s.activeLimitMs ?? 1800000)) &&
            !s.capture &&
            ["ready", "review"].includes(s.status),
          "VOID_STALE",
          "This turn is no longer listening.",
          409,
        );
        ensure(
          s.used.speech + 60 <= limitsFor(s).speechSeconds &&
            s.turns.length < limitsFor(s).turns &&
            s.pending.length < 4,
          "VOID_SPEECH_LIMIT",
          "Voice time is used up. Type or finish this conversation.",
          429,
        );
        ensure(
          !s.operations.includes(captureId),
          "VOID_CAPTURE_DUPLICATE",
          "This recording was already accepted.",
          409,
        );
        s.operations.push(captureId);
        s.used.speech += 60; // Reserve full ceiling; unused time is refunded on a known completion.
        s.capture = { id: captureId, owner, startedAt: Date.now() };
        s.status = "capturing";
      },
      accountId,
      owner,
    );
  }
  async captureCancel(
    id: string,
    accountId: string,
    owner: string,
    captureId: string,
    seconds: number,
  ) {
    await this.change(
      id,
      (s) => {
        if (s.capture?.id !== captureId) return;
        s.used.speech -= Math.max(0, 60 - seconds);
        delete s.capture;
        s.status = s.pending.length ? "review" : "ready";
      },
      accountId,
      owner,
    ).catch(() => {});
  }
  async captureEnd(
    id: string,
    accountId: string,
    owner: string,
    captureId: string,
    text: string,
    audio: Buffer,
    seconds: number,
    language: string,
    capped: boolean,
  ) {
    const key = `${randomUUID()}.bin`,
      assetId = randomUUID();
    await this.storage.put(key, audio);
    let result: Row;
    try {
      result = await this.change(
        id,
        async (s, _r, tx) => {
          ensure(
            s.capture?.id === captureId,
            "VOID_STALE",
            "That recording is no longer active.",
            409,
          );
          await tx
            .insert(voidAssets)
            .values({ id: assetId, sessionId: id, kind: "recording", key });
          if (!text.trim()) {
            if (s.version === 1) {
              await tx
                .update(voidAssets)
                .set({ kind: "discarded" })
                .where(eq(voidAssets.id, assetId));
            } else
              (s.technical ??= []).push({
                id: captureId,
                audioId: assetId,
                language,
                at: new Date().toISOString(),
              });
            s.used.speech -= Math.max(0, 60 - seconds);
            delete s.capture;
            s.status = "ready";
            s.error =
              "I couldn't understand that recording. Try again or type.";
            return;
          }
          s.pending.push({
            text: text.slice(0, 4000),
            audioId: assetId,
            language,
          });
          s.used.speech -= Math.max(0, 60 - seconds);
          delete s.capture;
          s.status = "review";
        },
        accountId,
        owner,
      );
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }
    if (!capped && text.trim())
      await this.respond(id, accountId, owner, randomUUID(), result!.revision);
  }
  async memories(accountId: string, except: string, topic = "") {
    const rows = await this.db
      .select()
      .from(voidSessions)
      .where(
        and(
          eq(voidSessions.accountId, accountId),
          ne(voidSessions.id, except),
          isNull(voidSessions.deletedAt),
        ),
      )
      .orderBy(desc(voidSessions.updatedAt))
      .limit(20);
    const words = new Set(
      topic.toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]{3,}/gu) ?? [],
    );
    return rows
      .filter((r) => r.state.status === "complete")
      .flatMap((r, index) =>
        r.state.evidence.map((e) => ({
          ...e,
          date: r.createdAt.toISOString(),
          relevance:
            [...words].filter((word) =>
              e.summary.toLocaleLowerCase().includes(word),
            ).length *
              10 +
            1 / (index + 1),
        })),
      )
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 12)
      .map(({ relevance: _score, ...memory }) => memory);
  }
  private async assertSources(tx: Transaction, sources: string[]) {
    for (const id of new Set(sources.map((source) => source.split(":")[0]))) {
      const [source] = await tx
        .select({ id: voidSessions.id })
        .from(voidSessions)
        .where(and(eq(voidSessions.id, id), isNull(voidSessions.deletedAt)));
      ensure(
        source,
        "VOID_STALE_EVIDENCE",
        "Earlier evidence was removed. Please try again.",
        409,
      );
    }
  }
  async structured<S extends z.ZodType>(
    schema: S,
    prompt: string,
    data: unknown,
    milliseconds = 5000,
  ): Promise<z.infer<S>> {
    ensure(
      this.available,
      "VOID_AI_UNAVAILABLE",
      "The AI is unavailable. Please retry later.",
      503,
    );
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.providers.host(
          `${PROMPT_VERSION}\n${prompt}\nJSON output schema: ${JSON.stringify(z.toJSONSchema(schema))}`,
          JSON.stringify(data),
          controller.signal,
          { json: true, schema: z.toJSONSchema(schema) },
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("provider deadline"));
          }, milliseconds);
        }),
      ]);
      return schema.parse(JSON.parse(result.text));
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  async runJob(jobId: string) {
    const [job] = await this.db
      .update(voidJobs)
      .set({ status: "running", claimedAt: new Date() })
      .where(and(eq(voidJobs.id, jobId), eq(voidJobs.status, "queued")))
      .returning()
      .catch((e: { code?: string; cause?: { code?: string } }) => {
        if (e.code === "23505" || e.cause?.code === "23505") return [];
        throw e;
      });
    if (!job) return;
    try {
      if (job.kind === "delete") {
        await this.purge(job.sessionId);
        return;
      }
      const row = await this.row(job.sessionId);
      if (
        (job.kind === "host" ||
          job.kind === "reveal" ||
          job.kind === "batch") &&
        row.state.workId !== job.id
      ) {
        await this.done(job);
        return;
      }
      if (job.kind === "batch") await this.graph.analyse(job, row);
      else if (job.kind === "graph" || job.kind === "compare") {
        const [analysis] = await this.db
          .select()
          .from(analysisRuns)
          .where(
            and(
              eq(analysisRuns.sessionId, row.id),
              eq(analysisRuns.status, "ready"),
              eq(analysisRuns.version, row.state.analysisRevision ?? 0),
            ),
          )
          .limit(1);
        if (analysis && job.createdAt >= analysis.createdAt)
          await this.graph.connect(job, row);
      } else if (job.kind === "analysis") await this.analyse(job, row);
      else if (job.kind === "tts") await this.speak(job, row);
      else if (job.kind === "host") await this.host(job, row);
      else if (job.kind === "reveal") {
        // Analysis runs separately. Wait in the durable queue without holding a worker or transaction.
        const pending = await this.db
          .select()
          .from(voidJobs)
          .where(
            and(
              eq(voidJobs.sessionId, job.sessionId),
              eq(voidJobs.kind, "analysis"),
            ),
          );
        if (pending.some((j) => ["queued", "running"].includes(j.status))) {
          await this.db
            .update(voidJobs)
            .set({ status: "queued", claimedAt: null })
            .where(eq(voidJobs.id, job.id));
          return;
        }
        await this.reveal(job, await this.row(job.sessionId));
      }
      await this.done(job);
      if (job.kind === "graph" || job.kind === "compare")
        await this.refreshGraphStatus(job.sessionId);
    } catch (error) {
      const errorCode =
        error instanceof AppError
          ? error.code
          : error instanceof z.ZodError
            ? "VOID_OUTPUT_INVALID"
            : error instanceof Error &&
                (error.name === "AbortError" ||
                  error.message === "Provider deadline")
              ? "PROVIDER_TIMEOUT"
              : "VOID_OPERATION_FAILED";
      await this.db
        .update(voidJobs)
        .set({
          status: "failed",
          errorCode,
          completedAt: new Date(),
          durationMs: Date.now() - (job.claimedAt?.getTime() ?? Date.now()),
        })
        .where(eq(voidJobs.id, job.id));
      if (job.kind === "host" || job.kind === "reveal" || job.kind === "batch")
        await this.change(job.sessionId, (s) => {
          if (s.workId !== job.id) return;
          s.status = "error";
          if (job.kind === "batch") s.processing = "failed";
          s.failedKind = job.kind as "host" | "reveal" | "batch";
          s.error =
            "That thought didn't come through. Retry, or finish when you're ready.";
        }).catch(() => {});
      if (job.kind === "graph" || job.kind === "compare")
        await this.refreshGraphStatus(job.sessionId);
      if (job.kind === "batch")
        await this.db
          .update(analysisRuns)
          .set({ status: "failed" })
          .where(eq(analysisRuns.id, job.id));
      if (job.kind === "tts")
        await this.change(job.sessionId, (s) => {
          const c = s.captions.find((c) => c.id === job.turnId);
          if (c) c.audioPending = false;
        }).catch(() => {});
    }
  }
  async refreshGraphStatus(id: string) {
    await this.change(id, async (s, _r, tx) => {
      const attempts = await tx
        .select()
        .from(voidJobs)
        .where(
          and(
            eq(voidJobs.sessionId, id),
            sql`${voidJobs.kind} in ('graph','compare')`,
          ),
        )
        .orderBy(desc(voidJobs.createdAt));
      const [analysis] = await tx
        .select()
        .from(analysisRuns)
        .where(eq(analysisRuns.sessionId, id))
        .orderBy(desc(analysisRuns.createdAt))
        .limit(1);
      const latest = new Map<string, Job>();
      for (const job of attempts)
        if (
          (!analysis || job.createdAt >= analysis.createdAt) &&
          !latest.has(job.kind)
        )
          latest.set(job.kind, job);
      const statuses = [...latest.values()].map((job) => job.status);
      s.graphStatus = statuses.includes("failed")
        ? "failed"
        : statuses.includes("running")
          ? "running"
          : statuses.includes("queued")
            ? "queued"
            : "ready";
    }).catch(() => {});
  }
  private async done(job: Job) {
    await this.db
      .update(voidJobs)
      .set({
        status: "done",
        completedAt: new Date(),
        durationMs: Date.now() - (job.claimedAt?.getTime() ?? Date.now()),
      })
      .where(eq(voidJobs.id, job.id));
  }
  private async budget(
    id: string,
    kind: "host" | "analysis" | "reveal",
    limit: number,
  ) {
    await this.change(id, (s) => {
      ensure(
        s.used[kind] < limit,
        "VOID_USAGE_LIMIT",
        "This conversation has reached its AI allowance.",
        429,
      );
      s.used[kind]++;
    });
  }
  private async analyse(job: Job, row: Row) {
    const turn = row.state.turns.find((t) => t.id === job.turnId);
    if (!turn || turn.invalidated) return;
    await this.budget(row.id, "analysis", limitsFor(row.state).analysisCalls);
    const result = await this.structured(AnalysisSchema, analysisPrompt, {
      language: row.state.language,
      turn: { id: turn.id, text: turn.text, correction: turn.correction },
    });
    ensure(
      result.evidence.every((e) => e.turnIds.every((id) => id === turn.id)),
      "VOID_UNGROUNDED",
      "Analysis could not be grounded.",
      502,
    );
    await this.change(row.id, async (s, _r, tx) => {
      if (s.turns.find((t) => t.id === turn.id)?.correction !== turn.correction)
        return;
      await this.assertSources(tx, turn.sources);
      s.evidence = s.evidence.filter((e) => !e.turnIds.includes(turn.id));
      s.evidence.push(
        ...result.evidence.map((e, i) => ({
          ...e,
          id: `${row.id}:${turn.id}:${i}`,
          sources: [`${row.id}:${turn.id}`, ...turn.sources],
        })),
      );
      s.refusedTopics = [
        ...new Set([...s.refusedTopics, ...result.refusedTopics]),
      ].slice(-16);
      if (result.reflection)
        s.reflection = { turnId: turn.id, text: result.reflection };
    });
  }
  private async host(job: Job, row: Row) {
    await this.budget(row.id, "host", limitsFor(row.state).hostCalls);
    let questionType = "story";
    if (row.state.version === 1)
      await this.change(row.id, (s) => {
        questionType = nextQuestion(s);
      });
    const memories = await this.memories(
      row.accountId,
      row.id,
      row.state.turns
        .slice(-2)
        .map((t) => t.correction || t.text)
        .join(" "),
    );
    const sources = [
      ...memories.flatMap((m) => m.sources),
      ...row.state.turns
        .filter((t) => !t.invalidated)
        .flatMap((t) => t.sources),
    ];
    const context = {
      language: row.state.language,
      questionType,
      skipped: job.turnId === "skip",
      refusedTopics: row.state.refusedTopics,
      latest: row.state.turns
        .filter((t) => !t.invalidated)
        .slice(-2)
        .map((t) => ({ id: t.id, text: t.correction || t.text })),
      earlier: row.state.version === 1 ? row.state.evidence : [],
      recentDialogue:
        row.state.version === 2 ? await this.recentDialogue(row.id) : undefined,
      wrapSuggested: activeMilliseconds(row.state) >= 1200000,
      memories,
      previousQuestion: row.state.captions.at(-1)?.text,
    };
    const result =
      row.state.version === 2
        ? await this.ai.generate(
            "conversation",
            CompanionSchema,
            companionPrompt,
            context,
          )
        : await this.structured(HostSchema, hostPrompt, context);
    const allowed = new Set([
      ...row.state.evidence.map((e) => e.id),
      ...memories.map((m) => m.id),
      ...row.state.turns.map((t) => t.id),
    ]);
    ensure(
      result.evidenceIds.every((id) => allowed.has(id)) &&
        result.text.split(/\s+/u).length <= 65,
      "VOID_UNGROUNDED",
      "The response could not be grounded.",
      502,
    );
    await this.change(row.id, async (s, _r, tx) => {
      if (s.workId !== job.id || s.finishedAt) return;
      await this.assertSources(tx, sources);
      const caption = {
        id: randomUUID(),
        text: result.text,
        sources: [...new Set(sources)],
        audioPending: this.voiceAvailable,
      };
      if ("refusedTopics" in result && Array.isArray(result.refusedTopics))
        s.refusedTopics = [
          ...new Set([...s.refusedTopics, ...result.refusedTopics]),
        ].slice(-12);
      s.captions.push(caption);
      s.status = "ready";
      delete s.error;
      delete s.workId;
      await tx
        .update(voidJobs)
        .set({ status: "done" })
        .where(eq(voidJobs.id, job.id));
      if (this.voiceAvailable)
        await this.enqueue(tx, row.id, "tts", caption.id);
    });
  }
  private async reveal(job: Job, row: Row) {
    const evidence = row.state.evidence;
    if (!evidence.length) {
      await this.change(row.id, (s) => {
        if (s.workId === job.id) {
          s.status = "complete";
          delete s.workId;
          s.captions.push({
            id: randomUUID(),
            text:
              s.language === "en"
                ? "I don't have enough clear detail for a fair reflection yet. Your stories are saved; we can try again another time."
                : s.language === "hi"
                  ? "अभी एक सही तस्वीर बनाने के लिए बातें कम हैं। फिर कभी बात करेंगे।"
                  : "Abhi ek fair picture ke liye thodi aur baat chahiye. Phir kabhi baat karte hain.",
            sources: [],
          });
        }
      });
      return;
    }
    await this.budget(row.id, "reveal", limitsFor(row.state).revealCalls);
    const persona = await this.structured(
      PersonaSchema,
      revealPrompt,
      { language: row.state.language, evidence },
      8000,
    );
    const allowed = new Set(evidence.map((e) => e.id));
    ensure(
      [
        ...persona.evidenceIds,
        ...persona.observations.flatMap((o) => o.evidenceIds),
      ].every((id) => allowed.has(id)),
      "VOID_UNGROUNDED",
      "The reflection could not be grounded.",
      502,
    );
    await this.change(row.id, async (s, _r, tx) => {
      if (s.workId !== job.id) return;
      await this.assertSources(
        tx,
        evidence.flatMap((e) => e.sources),
      );
      s.persona = persona;
      s.personaVersions.push(persona);
      s.status = "complete";
      delete s.workId;
      delete s.error;
      await tx
        .update(voidJobs)
        .set({ status: "done" })
        .where(eq(voidJobs.id, job.id));
      const caption = {
        id: randomUUID(),
        text: `${persona.quote} ${persona.observations[0].text}`,
        sources: evidence.flatMap((e) => e.sources),
        audioPending: this.voiceAvailable,
      };
      s.captions.push(caption);
      if (this.voiceAvailable)
        await this.enqueue(tx, row.id, "tts", caption.id);
    });
  }
  private async speak(job: Job, row: Row) {
    const caption = row.state.captions.find((c) => c.id === job.turnId);
    if (!caption || !this.voiceAvailable) return;
    await this.change(row.id, (s) => {
      ensure(
        s.used.tts + caption.text.length <= limitsFor(s).ttsCharacters,
        "VOID_TTS_LIMIT",
        "Continue with captions.",
        429,
      );
      s.used.tts += caption.text.length;
    });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.providers.tts(caption.text, controller.signal, row.state.language),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("TTS deadline"));
          }, 8000);
        }),
      ]);
      const key = `${randomUUID()}.bin`,
        assetId = randomUUID();
      await this.storage.put(key, result.audio);
      try {
        await this.change(row.id, async (s, _r, tx) => {
          const c = s.captions.find((c) => c.id === caption.id);
          ensure(
            c && c.audioPending,
            "VOID_STALE",
            "Audio is no longer needed.",
            409,
          );
          await tx
            .insert(voidAssets)
            .values({ id: assetId, sessionId: row.id, kind: "host", key });
          c.audioId = assetId;
          c.audioPending = false;
        });
      } catch (error) {
        await this.storage.delete(key);
        throw error;
      }
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  async history(accountId: string) {
    const rows = await this.db
      .select()
      .from(voidSessions)
      .where(
        and(
          eq(voidSessions.accountId, accountId),
          isNull(voidSessions.deletedAt),
        ),
      )
      .orderBy(desc(voidSessions.createdAt))
      .limit(100);
    return rows.map((r) => ({
      id: r.id,
      date: r.createdAt.toISOString(),
      status: r.state.status,
      persona: r.state.persona,
      language: r.state.language,
      processing: r.state.processing,
      graphStatus: r.state.graphStatus,
      canRetryAnalysis:
        r.state.used.analysis < limitsFor(r.state).analysisCalls,
      canRetryGraph: (r.state.used.graph ?? 0) < 8,
      finished: !!r.state.finishedAt,
      flowVersion: r.state.version,
    }));
  }
  async feedback(id: string, accountId: string, feedback: string) {
    await this.change(
      id,
      (s) => {
        ensure(
          s.status === "complete",
          "VOID_NOT_READY",
          "Let the reflection finish first.",
          409,
        );
        s.feedback = feedback;
      },
      accountId,
    );
  }
  async remove(id: string, accountId: string) {
    await this.db.transaction(async (tx) => {
      await tx
        .select()
        .from(voidAccounts)
        .where(eq(voidAccounts.id, accountId))
        .for("update");
      const [r] = await tx
        .select()
        .from(voidSessions)
        .where(
          and(eq(voidSessions.id, id), eq(voidSessions.accountId, accountId)),
        )
        .for("update");
      ensure(r, "VOID_NOT_FOUND", "Conversation not found.", 404);
      await tx
        .update(voidSessions)
        .set({ deletedAt: new Date(), owner: null, leaseUntil: null })
        .where(eq(voidSessions.id, id));
      await tx
        .update(voidJobs)
        .set({ status: "cancelled" })
        .where(eq(voidJobs.sessionId, id));
      await invalidateGraph(tx, id);
      await this.enqueue(tx, id, "delete");
      const others = await tx
        .select()
        .from(voidSessions)
        .where(
          and(
            eq(voidSessions.accountId, accountId),
            ne(voidSessions.id, id),
            isNull(voidSessions.deletedAt),
          ),
        )
        .for("update");
      for (const other of others) {
        const s = other.state,
          affected =
            s.turns.some((t) =>
              t.sources.some((source) => source.startsWith(id + ":")),
            ) ||
            s.evidence.some((e) =>
              e.sources.some((source) => source.startsWith(id + ":")),
            );
        s.evidence = s.evidence.filter(
          (e) => !e.sources.some((source) => source.startsWith(id + ":")),
        );
        for (const turn of s.turns)
          if (turn.sources.some((source) => source.startsWith(id + ":")))
            turn.invalidated = true;
        for (const caption of s.captions)
          if (caption.sources.some((source) => source.startsWith(id + ":"))) {
            if (caption.audioId)
              await tx
                .update(voidAssets)
                .set({ kind: "discarded" })
                .where(eq(voidAssets.id, caption.audioId));
            caption.text = "An earlier reflection was removed.";
            caption.sources = [];
            delete caption.audioId;
            caption.audioPending = false;
          }
        if (affected) {
          await invalidateGraph(tx, other.id);
          delete s.persona;
          s.personaVersions = [];
          delete s.reflection;
          if (
            s.version === 2 &&
            s.finishedAt &&
            s.used.analysis < limitsFor(s).analysisCalls &&
            s.turns.some((t) => !t.invalidated)
          )
            await this.finishBatch(s, other, tx);
        }
        if (s.version === 2) await this.persistTranscript(tx, other.id, s);
        await tx
          .update(voidSessions)
          .set({ state: s, revision: other.revision + 1 })
          .where(eq(voidSessions.id, other.id));
      }
    });
    this.onDeleted(id);
  }
  async purge(id: string) {
    const [r] = await this.db
      .select()
      .from(voidSessions)
      .where(eq(voidSessions.id, id));
    if (!r?.deletedAt) return;
    const assets = await this.db
      .select()
      .from(voidAssets)
      .where(eq(voidAssets.sessionId, id));
    for (const asset of assets) await this.storage.delete(asset.key);
    await this.db.delete(voidSessions).where(eq(voidSessions.id, id));
  }
  async audio(id: string, assetId: string, accountId: string) {
    const r = await this.row(id, accountId);
    ensure(
      r.state.captions.some((c) => c.audioId === assetId),
      "VOID_NOT_FOUND",
      "Audio unavailable.",
      404,
    );
    const [asset] = await this.db
      .select()
      .from(voidAssets)
      .where(
        and(
          eq(voidAssets.id, assetId),
          eq(voidAssets.sessionId, id),
          eq(voidAssets.kind, "host"),
        ),
      );
    ensure(asset, "VOID_NOT_FOUND", "Audio unavailable.", 404);
    return this.storage.get(asset.key);
  }
  async recover() {
    const expired = await this.db
      .select()
      .from(voidSessions)
      .where(
        and(
          isNull(voidSessions.deletedAt),
          sql`${voidSessions.owner} is not null and ${voidSessions.leaseUntil}<now()`,
        ),
      );
    for (const r of expired) await this.release(r.id, r.accountId, r.owner!);

    const stale = await this.db
      .select()
      .from(voidJobs)
      .where(
        and(
          eq(voidJobs.status, "running"),
          sql`${voidJobs.claimedAt} < now() - (case when ${voidJobs.kind} in ('batch','graph','compare') then interval '15 minutes' else interval '45 seconds' end)`,
        ),
      );
    for (const job of stale) {
      const changed = await this.db
        .update(voidJobs)
        .set({ status: job.kind === "delete" ? "queued" : "failed" })
        .where(and(eq(voidJobs.id, job.id), eq(voidJobs.status, "running")))
        .returning({ id: voidJobs.id });
      if (!changed.length) continue;
      if (job.kind === "batch")
        await this.db
          .update(analysisRuns)
          .set({ status: "failed" })
          .where(eq(analysisRuns.id, job.id));
      await this.change(job.sessionId, (s) => {
        if (job.kind === "graph" || job.kind === "compare")
          s.graphStatus = "failed";
        if (s.workId === job.id) {
          s.status = "error";
          if (job.kind === "batch") s.processing = "failed";
          s.failedKind =
            job.kind === "batch"
              ? "batch"
              : job.kind === "reveal"
                ? "reveal"
                : "host";
          if (job.kind === "batch") s.processing = "failed";
          s.error = "The connection was interrupted. Retry to continue.";
        }
        if (job.kind === "tts") {
          const c = s.captions.find((c) => c.id === job.turnId);
          if (c) c.audioPending = false;
        }
      }).catch(() => {});
    }
    const deleted = await this.db
      .select()
      .from(voidSessions)
      .where(sql`${voidSessions.deletedAt} is not null`);
    for (const r of deleted) await this.purge(r.id);
    const discarded = await this.db
      .select()
      .from(voidAssets)
      .where(eq(voidAssets.kind, "discarded"));
    for (const asset of discarded) {
      await this.storage.delete(asset.key);
      await this.db.delete(voidAssets).where(eq(voidAssets.id, asset.id));
    }
    const known = await this.db
      .select({ key: voidAssets.key })
      .from(voidAssets);
    await this.storage.prune(
      new Set(known.map((a) => a.key)),
      Date.now() - 3600000,
    );
  }
}
