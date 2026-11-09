import {
  activeStep,
  previewNextInput,
  project,
} from "@expose/shared/game/engine";
import { questionNarration } from "@expose/shared/game/guided";
import type { GameSnapshot } from "@expose/shared/game/contracts";
import { Rooms, hash } from "./rooms";
import { UsageLedger } from "./usage";
import { MediaService } from "./media";
import type { Providers } from "./providers";
import { abortable } from "./deadline";

/** Public authored speech; separate from the reasoning host and its reserved allowance. */
export class QuestionGuide {
  private running = new Map<string, Promise<void>>();
  private aborts = new Set<AbortController>();
  constructor(
    readonly rooms: Rooms,
    readonly usage: UsageLedger,
    readonly media: MediaService,
    readonly providers: Providers,
  ) {}
  dispose() {
    this.aborts.forEach((c) => c.abort());
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
      const data = await this.rooms.load(tx, roomId),
        state = structuredClone(data.state);
      if (
        state.flow.version < 4 ||
        !state.setup.guidedVoice ||
        !state.players.some((p) => p.connected && p.controller === "human")
      )
        return null;
      const n = state.narration,
        now = this.rooms.now();
      if (
        n?.epoch === state.phaseEpoch &&
        n.status === "pending" &&
        n.generationDeadline > now
      ) {
        const view = {
            ...project(state, state.players[0].id),
            voiceInputVersion: state.voiceInputVersion,
          },
          text = questionNarration(view);
        n.text = text;
        n.status = "generating";
        n.playbackSeat =
          state.setup.mode === "same-room"
            ? state.players.find((p) => p.host)?.id
            : undefined;
        state.revision++;
        await this.rooms.persist(tx, data, state, "question-claimed");
        return {
          view,
          text,
          deadline: n.generationDeadline,
          expiresAt: data.run.resumeUntil,
          publish: true,
        };
      }
      if (n && n.status !== "done") return null;
      const view = previewNextInput(state, now);
      if (!view) return null;
      view.voiceInputVersion = state.voiceInputVersion;
      const text = questionNarration(view),
        key = hash(text);
      if (state.narrationPrepared?.[key]) return null;
      return {
        view,
        text,
        deadline: now + 8000,
        expiresAt: data.run.resumeUntil,
        publish: false,
      };
    });
    if (!claim) return;
    if (claim.publish) this.rooms.onChange(roomId);
    const result = await this.prepare(
      roomId,
      claim.view,
      claim.text,
      claim.deadline,
      claim.expiresAt,
    );
    if (!claim.publish) return;
    await this.rooms.db.transaction(async (tx) => {
      const data = await this.rooms.load(tx, roomId),
        state = structuredClone(data.state),
        n = state.narration,
        now = this.rooms.now();
      if (
        data.run.id !== claim.view.sessionId ||
        state.phaseEpoch !== claim.view.phaseEpoch ||
        n?.status !== "generating" ||
        n.generationDeadline <= now
      )
        return;
      n.status = "presenting";
      n.opensAt =
        now + (result ? Math.ceil(result.seconds * 1000) + 750 : 5000);
      if (result) n.audioUrl = `/api/v1/media/${result.mediaId}`;
      state.deadline = n.opensAt + activeStep(state).durationMs;
      state.revision++;
      await this.rooms.persist(tx, data, state, "question-presented");
    });
    this.rooms.onChange(roomId);
  }
  private async prepare(
    roomId: string,
    view: GameSnapshot,
    text: string,
    deadline: number,
    expiresAt: Date,
  ) {
    const key = hash(text);
    const cached = await this.rooms.db.transaction(async (tx) => {
      const data = await this.rooms.load(tx, roomId);
      return data.run.id === view.sessionId
        ? data.state.narrationPrepared?.[key]
        : undefined;
    });
    if (cached) return cached;
    if (!this.usage.enabled || !text || text.length > 2400) return null;
    const controller = new AbortController();
    this.aborts.add(controller);
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(1, Math.min(8000, deadline - this.rooms.now())),
    );
    let finish: Awaited<ReturnType<UsageLedger["begin"]>> | undefined;
    try {
      const op = await this.usage.reserve(
        view.sessionId,
        view.step.id,
        view.phaseEpoch,
        "question-narration",
        `question:${key}`,
        { narrationCharacters: text.length },
      );
      finish = await this.usage.begin(
        op,
        "gnani",
        this.usage.config.GNANI_TTS_MODEL,
      );
      const spoken = await abortable(
        this.providers.tts(text, controller.signal, view.setup.hostLanguage),
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        !Number.isFinite(spoken.seconds) ||
        spoken.seconds <= 0 ||
        spoken.seconds > 120
      )
        throw new Error("QUESTION_AUDIO_EXPIRED");
      const mediaId = await this.media.save({
        runId: view.sessionId,
        ownerId: null,
        stepId: view.step.id,
        epoch: view.phaseEpoch,
        kind: "host",
        bytes: spoken.audio,
        mime: "audio/wav",
        durationMs: Math.round(spoken.seconds * 1000),
        expiresAt,
      });
      const result = { mediaId, seconds: spoken.seconds, text };
      await this.rooms.db.transaction(async (tx) => {
        const data = await this.rooms.load(tx, roomId);
        if (data.run.id !== view.sessionId) return;
        const state = structuredClone(data.state);
        state.narrationPrepared = { ...state.narrationPrepared, [key]: result };
        state.revision++;
        await this.rooms.persist(tx, data, state, "question-audio-ready");
      });
      await finish({
        status: "completed",
        usage: {
          narrationCharacters: text.length,
          ttsCharacters: text.length,
          generatedAudioSeconds: spoken.seconds,
        },
        usageSource: "measured",
      });
      return result;
    } catch {
      await finish?.({
        status: controller.signal.aborted ? "cancelled" : "failed",
        usage: {},
        usageSource: "unknown",
        errorCode: "QUESTION_AUDIO_UNAVAILABLE",
      }).catch(() => {});
      return null;
    } finally {
      clearTimeout(timeout);
      this.aborts.delete(controller);
    }
  }
}
