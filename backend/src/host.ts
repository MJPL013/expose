import { randomUUID } from "node:crypto";
import { activeStep } from "@expose/shared/game/engine";
import { Rooms, releaseHostConversation } from "./rooms";
import { UsageLedger } from "./usage";
import { MediaService } from "./media";
import type { Providers } from "./providers";
import { AppError, ensure } from "./errors";
import { HOST_PROMPT_V1, narration } from "./narration";
import { selectedHostLlm } from "./config";

export const hostPhases = new Set([
  "lobby",
  "reveal",
  "spotlight-reveal",
  "summary",
]);
export const hostRules = HOST_PROMPT_V1;
export class HostService {
  private controllers = new Set<AbortController>();
  private conversations = new Map<string, AbortController>();
  private narrationCache = new Map<
    string,
    { audio: Buffer; seconds: number; expires: number; effectiveModel?: string }
  >();
  onNarration: (roomId: string) => void = () => {};
  constructor(
    readonly rooms: Rooms,
    readonly usage: UsageLedger,
    readonly media: MediaService,
    readonly providers: Providers,
  ) {}
  async narrate(roomId: string) {
    const claimed = await this.rooms.db.transaction(async (tx) => {
      const data = await this.rooms.load(tx, roomId),
        state = structuredClone(data.state),
        text = narration(state);
      if (
        state.hostFlowVersion === 2 || !text ||
        state.narratedEpoch === state.phaseEpoch ||
        state.hostState?.deadline
      )
        return null;
      state.narratedEpoch = state.phaseEpoch;
      const id = randomUUID(),
        step = activeStep(state);
      state.hostState = {
        id,
        text,
        epoch: state.phaseEpoch,
        playbackSeat:
          state.setup.mode === "same-room"
            ? state.players.find((p) => p.host)?.id
            : undefined,
      };
      state.revision++;
      await this.rooms.persist(tx, data, state, "narration");
      return {
        id,
        text,
        runId: data.run.id,
        stepId: step.id,
        epoch: state.phaseEpoch,
        expiresAt: data.run.resumeUntil,
      };
    });
    if (!claimed) return;
    this.onNarration(roomId);
    if (!this.usage.enabled) return;
    const controller = new AbortController();
    this.controllers.add(controller);
    const guard = setInterval(() => {
      if (!this.usage.enabled) controller.abort();
    }, 250);
    try {
      const key = JSON.stringify([
        this.usage.config.GNANI_TTS_MODEL,
        this.usage.config.GNANI_TTS_VOICE,
        claimed.text,
      ]);
      for (const [id, value] of this.narrationCache)
        if (value.expires < Date.now()) this.narrationCache.delete(id);
      const cached = this.narrationCache.get(key);
      const op = await this.usage.reserve(
        claimed.runId,
        claimed.stepId,
        claimed.epoch,
        "narration",
        `narration:${claimed.epoch}`,
        cached ? {} : { ttsCharacters: claimed.text.length },
      );
      const finish = await this.usage.begin(
        op,
        cached ? "local-cache" : "gnani",
        this.usage.config.GNANI_TTS_MODEL,
      );
      try {
        const result =
          cached ?? (await this.providers.tts(claimed.text, controller.signal));
        if (!cached)
          this.narrationCache.set(key, {
            ...result,
            expires: Date.now() + 3600000,
          });
        const mediaId = await this.media.save({
          runId: claimed.runId,
          ownerId: null,
          stepId: claimed.stepId,
          epoch: claimed.epoch,
          kind: "host",
          bytes: result.audio,
          mime: "audio/wav",
          durationMs: Math.round(result.seconds * 1000),
          expiresAt: claimed.expiresAt,
        });
        await finish({
          status: "completed",
          usage: cached
            ? { cacheHits: 1 }
            : {
                ttsCharacters: claimed.text.length,
                generatedAudioSeconds: result.seconds,
              },
          usageSource: "measured",
          effectiveModel: result.effectiveModel,
        });
        await this.rooms.db.transaction(async (tx) => {
          const data = await this.rooms.load(tx, roomId);
          if (
            data.run.id !== claimed.runId ||
            data.state.hostState?.id !== claimed.id ||
            data.state.phaseEpoch !== claimed.epoch
          )
            return;
          const state = structuredClone(data.state);
          state.hostState!.audioUrl = `/api/v1/media/${mediaId}`;
          state.revision++;
          await this.rooms.persist(tx, data, state, "narration-ready");
        });
        this.onNarration(roomId);
      } catch (error) {
        await finish({
          status: controller.signal.aborted ? "cancelled" : "failed",
          usage: {},
          usageSource: "unknown",
          errorCode:
            error instanceof AppError ? error.code : "NARRATION_FAILED",
        });
      }
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    } finally {
      clearInterval(guard);
      this.controllers.delete(controller);
    }
  }
  async begin(playerId: string, roomId: string, connectionId: string) {
    await this.claim(playerId, roomId, connectionId, false);
  }
  async cancel(
    playerId: string,
    roomId: string,
    connectionId: string,
    conversationId: string,
  ) {
    const cancelled = await this.rooms.db.transaction(async (tx) => {
      const data = await this.rooms.load(tx, roomId);
      const member = data.members.find((m) => m.playerId === playerId);
      ensure(
        member?.connectionId === connectionId,
        "SEAT_IN_USE",
        "This tab does not control your seat.",
        409,
      );
      if (
        data.state.hostState?.id !== conversationId ||
        !data.state.hostState.deadline
      )
        return;
      ensure(
        data.state.hostState.speakingSeat === member.id,
        "HOST_NOT_YOURS",
        "Only the person asking can close this exchange.",
        403,
      );
      const state = structuredClone(data.state);
      releaseHostConversation(state, Date.now());
      state.revision++;
      await this.rooms.persist(tx, data, state, "host-cancelled");
      return true;
    });
    if (cancelled) this.conversations.get(conversationId)?.abort();
    this.rooms.onChange(roomId);
  }
  private async claim(
    playerId: string,
    roomId: string,
    connectionId: string,
    request: boolean,
  ) {
    const claimed = await this.rooms.db.transaction(async (tx) => {
      const data = await this.rooms.load(tx, roomId);
      ensure(data.state.hostFlowVersion !== 2, "HOST_AUTOMATIC", "The host joins automatically. Use How to play for rules help.", 409);
      const member = data.members.find((m) => m.playerId === playerId);
      ensure(
        member?.connectionId === connectionId,
        "SEAT_IN_USE",
        "This tab does not control your seat.",
        409,
      );
      const state = structuredClone(data.state),
        step = activeStep(state);
      ensure(
        hostPhases.has(step.type),
        "HOST_NOT_NOW",
        "Ask the host between rounds.",
        409,
      );
      const owned =
        request &&
        state.hostState?.speakingSeat === member.id &&
        state.hostState.epoch === state.phaseEpoch &&
        Boolean(
          state.hostState.deadline && state.hostState.deadline > Date.now(),
        ) &&
        !state.hostState.requested;
      ensure(
        owned ||
          (!state.hostState?.deadline &&
            !state.hostQuestions?.includes(state.phaseEpoch)),
        "HOST_BUSY",
        "There is one host exchange per intermission.",
        409,
      );
      const id = owned ? state.hostState!.id : randomUUID(),
        epoch = state.phaseEpoch;
      if (!owned) {
        state.hostQuestions = [...(state.hostQuestions ?? []), epoch];
        state.hostState = {
          id,
          text: "Your turn to ask. Speak or type a short question.",
          speakingSeat: member.id,
          deadline: Date.now() + 25000,
          originalDeadline: state.deadline,
          pausedAt: Date.now(),
          epoch,
          playbackSeat:
            state.setup.mode === "same-room"
              ? state.players.find((p) => p.host)?.id
              : undefined,
        };
        state.deadline = null;
      }
      state.hostState!.requested = request;
      state.revision++;
      await this.rooms.persist(tx, data, state, "host-started");
      // Only identities, public scores and the phase label enter the model context.
      const context = JSON.stringify({
        phase: step.type,
        mode: state.setup.gameMode,
        players: state.players.map((p) => ({ name: p.name, score: p.score })),
      });
      return {
        runId: data.run.id,
        stepId: step.id,
        epoch,
        id,
        context,
        expiresAt: data.run.resumeUntil,
        deadline: state.hostState!.deadline!,
      };
    });
    this.rooms.onChange(roomId);
    return claimed;
  }
  async ask(
    playerId: string,
    roomId: string,
    connectionId: string,
    cid: string,
    question: string,
  ) {
    const claimed = await this.claim(playerId, roomId, connectionId, true);
    const controller = new AbortController();
    this.controllers.add(controller);
    this.conversations.set(claimed.id, controller);
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(1, claimed.deadline - Date.now() - 500),
    );
    const stopCheck = setInterval(() => {
      if (!this.usage.enabled) controller.abort();
    }, 250);
    let audioSeconds = 0;
    let text =
        "Scripted host: Sab ready? Spotlight rewards answers that fit your friend. Bluff rewards finding the truth—and fooling the squad. No secret answers from me!",
      audioUrl: string | undefined;
    try {
      const llm = selectedHostLlm(this.usage.config);
      if (this.usage.enabled && llm.configured) {
        const op = await this.usage.reserve(
          claimed.runId,
          claimed.stepId,
          claimed.epoch,
          "host",
          `host:${cid}`,
          { llmCalls: 1 },
        );
        const finish = await this.usage.begin(
          op,
          llm.provider,
          llm.model,
        );
        try {
          const result = await this.providers.host(
            `${hostRules}\nPublic context: ${claimed.context}`,
            question,
            controller.signal,
          );
          text = result.text;
          await finish({
            status: "completed",
            usage: {
              llmCalls: 1,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
            },
            usageSource:
              result.inputTokens === undefined ? "unknown" : "provider",
            requestId: result.requestId,
            effectiveModel: result.effectiveModel,
          });
        } catch (error) {
          await finish({
            status: controller.signal.aborted ? "cancelled" : "failed",
            usage: { llmCalls: 1 },
            usageSource: "unknown",
            errorCode:
              error instanceof AppError ? error.code : "PROVIDER_ERROR",
          });
        }
      }
      if (this.usage.enabled && !controller.signal.aborted) {
        const op = await this.usage.reserve(
          claimed.runId,
          claimed.stepId,
          claimed.epoch,
          "host-tts",
          `host-tts:${cid}`,
          { ttsCharacters: text.length },
        );
        const finish = await this.usage.begin(
          op,
          "gnani",
          this.usage.config.GNANI_TTS_MODEL,
        );
        try {
          const result = await this.providers.tts(text, controller.signal);
          audioSeconds = result.seconds;
          const mediaId = await this.media.save({
            runId: claimed.runId,
            ownerId: null,
            stepId: claimed.stepId,
            epoch: claimed.epoch,
            kind: "host",
            bytes: result.audio,
            mime: "audio/wav",
            durationMs: Math.round(result.seconds * 1000),
            expiresAt: claimed.expiresAt,
          });
          audioUrl = `/api/v1/media/${mediaId}`;
          await finish({
            status: "completed",
            usage: {
              ttsCharacters: text.length,
              generatedAudioSeconds: result.seconds,
            },
            usageSource: "measured",
            requestId: result.requestId,
            effectiveModel: result.effectiveModel,
          });
        } catch (error) {
          await finish({
            status: controller.signal.aborted ? "cancelled" : "failed",
            usage: { ttsCharacters: text.length },
            usageSource: "unknown",
            errorCode:
              error instanceof AppError ? error.code : "PROVIDER_ERROR",
          });
        }
      }
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
    } finally {
      clearTimeout(timeout);
      clearInterval(stopCheck);
      this.controllers.delete(controller);
      this.conversations.delete(claimed.id);
      try {
        await this.rooms.db.transaction(async (tx) => {
          const data = await this.rooms.load(tx, roomId);
          if (
            data.run.id !== claimed.runId ||
            data.state.phaseEpoch !== claimed.epoch ||
            data.state.hostState?.id !== claimed.id
          )
            return;
          const state = structuredClone(data.state);
          state.hostState = {
            ...state.hostState!,
            text,
            audioUrl,
            deadline: Math.min(
              claimed.deadline,
              Date.now() + Math.max(4000, audioSeconds * 1000 + 500),
            ),
          };
          state.revision++;
          await this.rooms.persist(tx, data, state, "host-response");
        });
        this.rooms.onChange(roomId);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
      }
    }
  }
  dispose() {
    for (const c of this.controllers) c.abort();
    this.controllers.clear();
    this.narrationCache.clear();
  }
}
