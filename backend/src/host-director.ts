import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { activeStep } from "@expose/shared/game/engine";
import {
  HostDecisionSchema,
  type HostDecision,
  type HostMemory,
  type SpeechLanguage,
} from "@expose/shared/game/host";
import { Rooms, hash } from "./rooms";
import {
  checkpoint,
  directorContext,
  finishBeat,
  HOST_PROMPT_V2,
  stagePrompts,
  usableMemories,
  type HostBeat,
} from "./host-context";
import { selectedHostLlm } from "./config";
import { UsageLedger } from "./usage";
import { MediaService } from "./media";
import type { Providers } from "./providers";
import * as t from "./db/schema";
import { ensure, AppError } from "./errors";
import { abortable } from "./deadline";

const resultShape = {
  decision: "speak or wait",
  text: "one short spoken turn",
  evidenceIds: ["supplied fact or memory id"],
  inviteSeat: "eligible seat id or null",
  memory: "brief evidence-backed callback or null",
};
export const hostResponseSchema = z.toJSONSchema(HostDecisionSchema);
export class HostDirector {
  private running = new Map<string, Promise<void>>();
  private aborts = new Set<AbortController>();
  constructor(
    readonly rooms: Rooms,
    readonly usage: UsageLedger,
    readonly media: MediaService,
    readonly providers: Providers,
  ) {}
  dispose() {
    for (const c of this.aborts) c.abort();
  }
  run(roomId: string) {
    const existing = this.running.get(roomId);
    if (existing) return existing;
    const job = this.work(roomId).finally(() => this.running.delete(roomId));
    this.running.set(roomId, job);
    return job;
  }
  private async work(roomId: string) {
    const claim = await this.rooms.db.transaction(async (tx) => {
      const data = await this.rooms.load(tx, roomId);
      if (data.state.hostFlowVersion !== 2) return null;
      let state = structuredClone(data.state),
        beat = state.hostBeat;
      const now = this.rooms.now();
      if (beat && beat.epoch === state.phaseEpoch && beat.status !== "done") {
        if (
          beat.deadline <= now ||
          (beat.status === "generating" && now - beat.generationAt > 6000)
        ) {
          state = finishBeat(state, now);
          await this.rooms.persist(tx, data, state, "host-expired");
          return { changed: true };
        }
        if (beat.status === "generating") return null;
        if (beat.status === "speaking") {
          if (beat.displayUntil > now) return null;
          if (
            beat.invitedSeat &&
            state.players.some(
              (p) => p.id === beat!.invitedSeat && p.connected,
            ) &&
            beat.deadline - now >= 12000
          ) {
            beat.status = "reply";
            beat.replyDeadline = Math.min(
              now + (state.voiceInputVersion === 2 ? 30000 : 20000),
              beat.deadline - 5000,
            );
            state.revision++;
          } else state = finishBeat(state, now);
          await this.rooms.persist(tx, data, state, "host-turn");
          return { changed: true };
        }
        if (beat.status === "reply") {
          if (
            (beat.replyDeadline ?? 0) > now &&
            state.players.some((p) => p.id === beat!.invitedSeat && p.connected)
          )
            return null;
          beat.replies.push({
            seatId: beat.invitedSeat!,
            text: "",
            outcome: "timeout",
          });
          beat.stage = "reply";
          beat.turn++;
          beat.status = "generating";
          beat.generationAt = now;
          delete beat.invitedSeat;
          delete beat.audioUrl;
        }
      } else {
        const point = checkpoint(state);
        if (!point) return null;
        (state.hostChecks ??= []).push(point.key);
        beat = state.hostBeat = {
          id: randomUUID(),
          checkpoint: point.key,
          stage: point.stage,
          status: "generating",
          text: "",
          epoch: state.phaseEpoch,
          runId: data.run.id,
          originalDeadline: state.deadline,
          deadline: now + 60000,
          startedAt: now,
          generationAt: now,
          displayUntil: now,
          turn: 0,
          invited: [],
          replies: [],
          playbackSeat:
            state.setup.mode === "same-room"
              ? state.players.find((p) => p.host)?.id
              : undefined,
        };
      }
      state.revision++;
      await this.rooms.persist(tx, data, state, "host-generation-claimed");
      const context = directorContext(
        state,
        beat!,
        data.room.hostMemory as HostMemory[],
        now,
      );
      return {
        changed: true,
        beat: structuredClone(beat!),
        state,
        context,
        expiresAt: data.run.resumeUntil,
      };
    });
    if (!claim) return;
    this.rooms.onChange(roomId);
    if (!("beat" in claim) || !claim.beat || !claim.context || !claim.state)
      return;
    await this.generate(
      roomId,
      claim.beat,
      claim.state,
      claim.context,
      claim.expiresAt!,
    );
  }
  private async generate(
    roomId: string,
    beat: HostBeat,
    state: import("./rooms").RunState,
    context: ReturnType<typeof directorContext>,
    expiresAt: Date,
  ) {
    const controller = new AbortController();
    this.aborts.add(controller);
    const timeout = setTimeout(() => controller.abort(), 5000);
    const guard = setInterval(() => {
      if (!this.usage.enabled) controller.abort();
    }, 200);
    let decision: HostDecision = {
      decision: "wait",
      text: "",
      evidenceIds: [],
      inviteSeat: null,
      memory: null,
    };
    const llm = selectedHostLlm(this.usage.config);
    try {
      if (this.usage.enabled && llm.configured) {
        const operation = await this.usage.reserve(
          beat.runId,
          activeStep(state).id,
          beat.epoch,
          "director",
          `director:${beat.id}:${beat.turn}`,
          { hostCalls: 1 },
        );
        const finish = await this.usage.begin(
          operation,
          llm.provider,
          llm.model,
        );
        try {
          const result = await abortable(
            this.providers.host(
              `${HOST_PROMPT_V2}\nStage: ${stagePrompts[beat.stage]}\nJSON shape: ${JSON.stringify(resultShape)}`,
              JSON.stringify(context),
              controller.signal,
              { json: true, schema: hostResponseSchema },
            ),
            controller.signal,
          );
          ensure(
            !controller.signal.aborted,
            "HOST_TIMEOUT",
            "Host generation expired.",
          );
          decision = HostDecisionSchema.parse(JSON.parse(result.text));
          const allowed = new Set([
            ...context.facts.map((f) => f.id),
            ...context.memories.map((m) => m.id),
          ]);
          ensure(
            decision.decision === "wait" ||
              (decision.text.trim() &&
                decision.evidenceIds.length > 0 &&
                decision.evidenceIds.every((id) => allowed.has(id))),
            "HOST_EVIDENCE",
            "The host could not ground its response.",
          );
          ensure(
            !decision.inviteSeat ||
              context.eligibleInviteSeats.includes(decision.inviteSeat),
            "HOST_INVITATION",
            "The host selected an unavailable speaker.",
          );
          await finish({
            status: "completed",
            usage: {
              hostCalls: 1,
              llmCalls: 1,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
            },
            usageSource: "provider",
            effectiveModel: result.effectiveModel,
            requestId: result.requestId,
          });
        } catch (error) {
          await finish({
            status: controller.signal.aborted ? "cancelled" : "failed",
            usage: { hostCalls: 1, llmCalls: 1 },
            usageSource: "unknown",
            errorCode:
              error instanceof AppError ? error.code : "HOST_RESPONSE_INVALID",
          });
          decision = {
            decision: "wait",
            text: "",
            evidenceIds: [],
            inviteSeat: null,
            memory: null,
          };
        }
      }
    } catch {
      /* A missing allowance never blocks a match. */
    } finally {
      clearTimeout(timeout);
      clearInterval(guard);
      this.aborts.delete(controller);
    }
    const published = await this.rooms.db.transaction(async (tx) => {
      const data = await this.rooms.load(tx, roomId);
      if (data.run.id !== beat.runId) return false;
      let next = structuredClone(data.state),
        live = next.hostBeat;
      const now = this.rooms.now();
      if (
        !live ||
        live.id !== beat.id ||
        live.turn !== beat.turn ||
        live.status !== "generating" ||
        live.epoch !== next.phaseEpoch ||
        live.deadline <= now
      )
        return false;
      if (beat.stage === "midgame") {
        const round = (activeStep(next).params.round ?? 0) + 1;
        const deferred =
          decision.decision === "wait" &&
          round - (next.hostLastRound ?? 0) === 2;
        next.hostDeferred = deferred;
        if (!deferred) next.hostLastRound = round;
      }
      if (decision.decision === "wait") {
        next = finishBeat(next, now);
      } else {
        live.status = "speaking";
        live.text = decision.text.trim();
        delete live.audioUrl;
        live.displayUntil =
          now +
          Math.min(12000, Math.max(4000, live.text.split(/\s+/).length * 300));
        if (decision.inviteSeat) {
          live.invitedSeat = decision.inviteSeat;
          live.invited.push(decision.inviteSeat);
        }
        next.hostRecentLines = [
          ...(next.hostRecentLines ?? []),
          live.text,
        ].slice(-5);
        const memories = usableMemories(
          data.room.hostMemory as HostMemory[],
          next,
        ).map((m) =>
          decision.evidenceIds.includes(m.id) ? { ...m, usedAt: now } : m,
        );
        if (decision.memory) {
          const involved = [
            ...new Set(
              [...context.facts, ...context.memories]
                .filter((f) => decision.evidenceIds.includes(f.id))
                .flatMap((f) => f.playerIds),
            ),
          ];
          const memory: HostMemory = {
            id: `memory:${randomUUID()}`,
            text: decision.memory,
            evidenceIds: decision.evidenceIds,
            playerIds: involved,
            runId: beat.runId,
            usedAt: now,
            createdAt: now,
          };
          memories.push(memory);
        }
        await tx
          .update(t.rooms)
          .set({ hostMemory: memories.slice(-12) })
          .where(eq(t.rooms.id, roomId));
        next.revision++;
      }
      await this.rooms.persist(tx, data, next, "host-published");
      return decision.decision === "speak";
    });
    this.rooms.onChange(roomId);
    if (published && this.usage.enabled)
      await this.speak(roomId, beat, state, decision.text, expiresAt);
  }
  private async speak(
    roomId: string,
    beat: HostBeat,
    state: import("./rooms").RunState,
    text: string,
    expiresAt: Date,
  ) {
    const controller = new AbortController();
    this.aborts.add(controller);
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const op = await this.usage.reserve(
        beat.runId,
        activeStep(state).id,
        beat.epoch,
        "director-tts",
        `director-tts:${beat.id}:${beat.turn}`,
        { ttsCharacters: text.length },
      );
      const finish = await this.usage.begin(
        op,
        "gnani",
        this.usage.config.GNANI_TTS_MODEL,
      );
      try {
        const result = await abortable(
          this.providers.tts(
            text,
            controller.signal,
            state.setup.hostLanguage ?? "hinglish",
          ),
          controller.signal,
        );
        await finish({
          status: "completed",
          usage: {
            ttsCharacters: text.length,
            generatedAudioSeconds: result.seconds,
          },
          usageSource: "measured",
          effectiveModel: result.effectiveModel,
        });
        const mediaId = await this.media.save({
          runId: beat.runId,
          ownerId: null,
          stepId: activeStep(state).id,
          epoch: beat.epoch,
          kind: "host",
          bytes: result.audio,
          mime: "audio/wav",
          durationMs: Math.round(result.seconds * 1000),
          expiresAt,
        });
        await this.rooms.db.transaction(async (tx) => {
          const data = await this.rooms.load(tx, roomId),
            next = structuredClone(data.state),
            live = next.hostBeat;
          if (
            data.run.id !== beat.runId ||
            !live ||
            live.id !== beat.id ||
            live.turn !== beat.turn ||
            live.epoch !== next.phaseEpoch ||
            live.status !== "speaking"
          )
            return;
          live.audioUrl = `/api/v1/media/${mediaId}`;
          live.displayUntil = Math.min(
            live.deadline,
            Math.max(
              live.displayUntil,
              this.rooms.now() + result.seconds * 1000 + 500,
            ),
          );
          next.revision++;
          await this.rooms.persist(tx, data, next, "host-audio");
        });
        this.rooms.onChange(roomId);
      } catch (error) {
        await finish({
          status: controller.signal.aborted ? "cancelled" : "failed",
          usage: { ttsCharacters: text.length },
          usageSource: "unknown",
          errorCode: error instanceof AppError ? error.code : "TTS_FAILED",
        });
      }
    } catch {
      /* Caption remains usable. */
    } finally {
      clearTimeout(timer);
      this.aborts.delete(controller);
    }
  }
  async reply(
    playerId: string,
    roomId: string,
    connectionId: string,
    input: {
      cid: string;
      beatId: string;
      turn: number;
      text: string;
      original?: string;
      language?: SpeechLanguage;
      outcome: "answer" | "pass" | "stt-failed";
    },
  ) {
    const claim = await this.rooms.db.transaction(async (tx) => {
      const data = await this.rooms.load(tx, roomId),
        state = structuredClone(data.state),
        member = data.members.find((m) => m.playerId === playerId),
        beat = state.hostBeat;
      ensure(
        member?.connectionId === connectionId,
        "SEAT_IN_USE",
        "This tab does not control your seat.",
        409,
      );
      const receipt = `${member.id}:${input.cid}`;
      const bodyHash = hash(JSON.stringify(input));
      const previous = state.hostReplyReceipts?.[receipt];
      if (previous != null) {
        ensure(
          previous.bodyHash === bodyHash,
          "ID_REUSED",
          "An action ID was reused for different content.",
          409,
        );
        return { revision: previous.revision };
      }
      ensure(
        beat?.id === input.beatId &&
          beat.turn === input.turn &&
          beat.status === "reply" &&
          beat.invitedSeat === member.id &&
          (beat.replyDeadline ?? 0) > this.rooms.now() &&
          beat.deadline > this.rooms.now(),
        "HOST_REPLY_EXPIRED",
        "This host invitation has ended.",
        409,
      );
      ensure(
        input.outcome !== "answer" || input.text.trim(),
        "EMPTY_ANSWER",
        "Write an answer or pass.",
      );
      beat.replies.push({
        seatId: member.id,
        text: input.outcome === "answer" ? input.text.trim() : "",
        original: input.original,
        language: input.language,
        outcome: input.outcome,
      });
      beat.turn++;
      beat.stage = "reply";
      beat.status = "generating";
      beat.generationAt = this.rooms.now();
      delete beat.invitedSeat;
      delete beat.audioUrl;
      state.revision++;
      (state.hostReplyReceipts ??= {})[receipt] = {
        revision: state.revision,
        bodyHash,
      };
      await this.rooms.persist(tx, data, state, "host-reply");
      return {
        revision: state.revision,
        beat: structuredClone(beat),
        state,
        context: directorContext(
          state,
          beat,
          data.room.hostMemory as HostMemory[],
          this.rooms.now(),
        ),
        expiresAt: data.run.resumeUntil,
      };
    });
    this.rooms.onChange(roomId);
    if (claim.beat && claim.state && claim.context && claim.expiresAt)
      void this.generate(
        roomId,
        claim.beat,
        claim.state,
        claim.context,
        claim.expiresAt,
      ).catch(() => {});
    return {
      type: "ack" as const,
      cid: input.cid,
      revision: claim.revision,
      accepted: true,
    };
  }
}
