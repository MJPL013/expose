import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import { AudioStartSchema } from "@expose/shared/network";
import { activeStep, project } from "@expose/shared/game/engine";
import { Rooms } from "./rooms";
import { UsageLedger, type AttemptResult } from "./usage";
import { MediaService, pcmWav } from "./media";
import type { Providers, SpeechStream } from "./providers";
import { AppError, ensure } from "./errors";

export class AudioGateway {
  private active = new Set<string>();
  private cancellations = new Set<() => void>();
  dispose() {
    for (const cancel of this.cancellations) cancel();
    this.cancellations.clear();
  }
  constructor(
    readonly rooms: Rooms,
    readonly usage: UsageLedger,
    readonly media: MediaService,
    readonly providers: Providers,
  ) {}
  attach(socket: WebSocket, playerId: string) {
    let stream: SpeechStream | undefined,
      finished = false,
      started = false,
      frames = 0,
      startTime = 0,
      ownerId = "",
      cap = 8,
      meta: ReturnType<typeof AudioStartSchema.parse> | undefined,
      finishAttempt: ((result: AttemptResult) => Promise<void>) | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    let guard: ReturnType<typeof setInterval> | undefined,
      checking = false;
    let expireAt = new Date(),
      audioFrames: Buffer[] = [],
      busy = false;
    const sessionKey = randomUUID();
    let acceptedCapture: Promise<void> | undefined;
    const recordingKey = () =>
      meta?.purpose === "host" && meta.hostBeatId
        ? `${meta.hostBeatId}:${meta.hostTurn}:${ownerId}:host`
        : `${meta!.phaseEpoch}:${ownerId}:${meta!.purpose}`;
    const hostAllowed = (state: import("./rooms").RunState, seatId: string) => {
      if (state.hostFlowVersion !== 2)
        return (
          state.hostState?.speakingSeat === seatId &&
          Number(state.hostState.deadline) > this.rooms.now()
        );
      const beat = state.hostBeat;
      return (
        beat?.id === meta!.hostBeatId &&
        beat?.turn === meta!.hostTurn &&
        beat?.status === "reply" &&
        beat.invitedSeat === seatId &&
        (beat.replyDeadline ?? 0) > this.rooms.now()
      );
    };
    const acceptCapture = () =>
      this.rooms.db
        .transaction(async (tx) => {
          const data = await this.rooms.load(tx, meta!.roomId);
          const member = data.members.find((m) => m.id === ownerId);
          ensure(
            member?.connectionId === meta!.connectionId &&
              data.run.id === meta!.runId &&
              data.state.phaseEpoch === meta!.phaseEpoch,
            "STALE_PHASE",
            "This recording has ended.",
            409,
          );
          const state = structuredClone(data.state),
            key = recordingKey();
          ensure(
            (state.recordings?.[key] ?? 0) < 2,
            "RECORDING_LIMIT",
            "Both recordings are used. You can still edit, type or pass.",
            409,
          );
          (state.recordings ??= {})[key] = (state.recordings?.[key] ?? 0) + 1;
          if (meta!.purpose === "answer")
            (state.voicePending ??= {})[ownerId] = state.phaseEpoch;
          if (meta!.purpose === "answer")
            (state.voiceCaptureIds ??= {})[ownerId] = meta!.captureId;
          state.revision++;
          await this.rooms.persist(tx, data, state, "recording-accepted");
        })
        .then(() => this.rooms.onChange(meta!.roomId));
    const send = (value: unknown) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(value));
    };
    const release = () => {
      clearTimeout(timer);
      clearInterval(guard);
      stream?.cancel();
      audioFrames = [];
      if (ownerId) this.active.delete(ownerId);
      this.cancellations.delete(cancel);
    };
    const markOutcome = async (outcome: "blank" | "stt-failed") => {
      if (!acceptedCapture || !meta || meta.purpose !== "answer") return;
      await acceptedCapture.catch(() => {});
      await this.rooms.db
        .transaction(async (tx) => {
          const data = await this.rooms.load(tx, meta!.roomId);
          if (
            data.run.id !== meta!.runId ||
            data.state.phaseEpoch !== meta!.phaseEpoch
          )
            return;
          const state = structuredClone(data.state),
            key = `${meta!.phaseEpoch}:${ownerId}`;
          (state.inputOutcomes ??= {})[key] = {
            seatId: ownerId,
            stepId: meta!.stepId,
            epoch: meta!.phaseEpoch,
            outcome,
          };
          await this.rooms.persist(tx, data, state, "voice-outcome");
        })
        .catch(() => {});
    };
    const cancel = () => {
      void clearPending();
      release();
      socket.close(1001, "Capture ended");
    };
    const clearPending = async () => {
      if (!acceptedCapture || !meta || meta.purpose !== "answer") return;
      await acceptedCapture.catch(() => {});
      await this.rooms.db
        .transaction(async (tx) => {
          const data = await this.rooms.load(tx, meta!.roomId);
          if (
            data.run.id !== meta!.runId ||
            data.state.phaseEpoch !== meta!.phaseEpoch
          )
            return;
          const state = structuredClone(data.state);
          if (state.voiceCaptureIds?.[ownerId] !== meta!.captureId) return;
          if (state.voicePending) delete state.voicePending[ownerId];
          if (state.voiceCaptureIds) delete state.voiceCaptureIds[ownerId];
          await this.rooms.persist(tx, data, state, "voice-cancelled");
        })
        .catch(() => {});
    };
    this.cancellations.add(cancel);
    const valid = async () => {
      ensure(
        this.usage.enabled,
        "AI_DISABLED",
        "Live voice is paused. You can type.",
        503,
      );
      await this.rooms.db.transaction(async (tx) => {
        const data = await this.rooms.load(tx, meta!.roomId);
        const member = data.members.find((m) => m.playerId === playerId);
        ensure(
          member?.connectionId === meta!.connectionId &&
            data.state.players.find((p) => p.id === member.id)?.connected,
          "SEAT_IN_USE",
          "Recording stopped because this tab no longer controls the seat.",
          409,
        );
        ensure(
          data.run.id === meta!.runId &&
            data.state.phaseEpoch === meta!.phaseEpoch &&
            activeStep(data.state).id === meta!.stepId,
          "STALE_PHASE",
          "This phase has ended. The recording was discarded.",
          409,
        );
        ensure(
          meta!.purpose === "host"
            ? hostAllowed(data.state, member.id)
            : project(data.state, member.id).view.actionPending,
          "NO_AUDIO_ACTION",
          "This voice action has ended.",
          409,
        );
      });
    };
    const fail = async (error: unknown) => {
      if (finished) return;
      finished = true;
      release();
      await markOutcome("stt-failed");
      await finishAttempt?.({
        status: "failed",
        usage: {
          captureSeconds: frames * 0.032,
          transmittedSeconds: frames * 0.032,
        },
        usageSource: "unknown",
        errorCode: error instanceof AppError ? error.code : "AUDIO_ERROR",
      }).catch(() => {});
      send({
        type: "error",
        code: error instanceof AppError ? error.code : "AUDIO_ERROR",
        message:
          error instanceof AppError
            ? error.message
            : "Recording failed. Please type or retry.",
      });
      socket.close(1000);
    };
    const stop = async () => {
      if (finished || busy || !stream || !meta) return;
      busy = true;
      clearTimeout(timer);
      try {
        const result = await stream.finish();
        if (finished) return;
        await valid();
        if (!result.text.trim()) await markOutcome("blank");
        let mediaId: string | undefined;
        if (meta.diagnosticConsent) {
          mediaId = await this.media.save({
            runId: meta.runId,
            ownerId,
            stepId: meta.stepId,
            epoch: meta.phaseEpoch,
            kind: "diagnostic",
            bytes: pcmWav(Buffer.concat(audioFrames)),
            mime: "audio/wav",
            durationMs: Math.round(frames * 32),
            expiresAt: new Date(
              Math.min(
                Date.now() + 86400000,
                expireAt.getTime() + 22 * 3600000,
              ),
            ),
            diagnosticConsent: true,
          });
        }
        await finishAttempt?.({
          status: "completed",
          usage: {
            captureSeconds: frames * 0.032,
            transmittedSeconds: result.transmittedSeconds,
            speechSeconds: result.speechSeconds,
            sttSeconds: result.transmittedSeconds,
          },
          usageSource: "measured",
          effectiveModel: stream.configuration?.model,
        });
        finished = true;
        send({
          type: "transcript",
          text: result.text,
          final: true,
          mediaId,
          captureId: meta.captureId,
        });
        release();
        socket.close(1000);
      } catch (error) {
        await fail(error);
      }
    };
    socket.on("message", (raw, binary) => {
      void (async () => {
        if (finished) return;
        if (binary) {
          ensure(
            started && stream && !busy,
            "AUDIO_NOT_READY",
            "Wait for the recording connection.",
          );
          const frame = Buffer.from(raw as Buffer);
          ensure(
            frame.length === 1024,
            "AUDIO_FRAME",
            "Expected 1,024 bytes of mono PCM16.",
          );
          ensure(
            frames < Math.ceil(cap / 0.032),
            "AUDIO_LIMIT",
            "Recording limit reached.",
          );
          ensure(
            frames * 0.032 <= (Date.now() - startTime) / 1000 + 0.2,
            "AUDIO_CADENCE",
            "Audio must be sent at real-time speed.",
          );
          acceptedCapture ??= acceptCapture();
          await acceptedCapture;
          if (finished || busy) return;
          stream.push(frame);
          frames++;
          if (meta?.diagnosticConsent) audioFrames.push(frame);
          return;
        }
        const message = JSON.parse(raw.toString());
        if (message.type === "stop") {
          await stop();
          return;
        }
        if (message.type === "cancel") {
          finished = true;
          release();
          await clearPending();
          await finishAttempt?.({
            status: "cancelled",
            usage: {
              captureSeconds: frames * 0.032,
              transmittedSeconds: frames * 0.032,
            },
            usageSource: "unknown",
          }).catch(() => {});
          socket.close();
          return;
        }
        ensure(
          !meta,
          "AUDIO_ALREADY_STARTED",
          "This capture has already started.",
        );
        meta = AudioStartSchema.parse(message);
        const permission = await this.rooms.db.transaction(async (tx) => {
          const data = await this.rooms.load(tx, meta!.roomId);
          const member = data.members.find((m) => m.playerId === playerId);
          ensure(
            member?.connectionId === meta!.connectionId,
            "SEAT_IN_USE",
            "This tab does not control your seat.",
            409,
          );
          ensure(
            data.run.id === meta!.runId &&
              activeStep(data.state).id === meta!.stepId &&
              data.state.phaseEpoch === meta!.phaseEpoch,
            "STALE_PHASE",
            "This phase has ended.",
            409,
          );
          const view = project(data.state, member.id);
          ensure(
            meta!.purpose === "host"
              ? hostAllowed(data.state, member.id)
              : view.view.actionPending &&
                  (!data.state.narration ||
                    data.state.narration.status === "done") &&
                  [
                    "secret",
                    "guess",
                    "answer",
                    "catchphrase",
                    "callout",
                    "wildcard",
                    "nomination",
                    "vote",
                    "judge",
                    "sync",
                    "traits",
                  ].includes(view.step.type),
            "NO_AUDIO_ACTION",
            "There is no voice action for you now.",
            409,
          );
          ensure(
            !this.active.has(member.id),
            "AUDIO_BUSY",
            "A recording is already active.",
            409,
          );
          this.active.add(member.id);
          ownerId = member.id;
          ensure(
            (data.state.recordings?.[recordingKey()] ?? 0) < 2,
            "RECORDING_LIMIT",
            "Both recordings are used. You can still type or pass.",
            409,
          );
          return {
            names: data.state.players.map((p) => p.name),
            cap: view.step.type === "secret" ? 5 : 8,
            expiresAt: data.run.resumeUntil,
            deadline: data.state.deadline,
          };
        });
        expireAt = permission.expiresAt;
        cap = permission.cap;
        if (finished) {
          release();
          return;
        }
        ensure(
          this.usage.enabled,
          "VOICE_UNAVAILABLE",
          "Live voice is disabled. Keep playing by typing.",
          503,
        );
        const op = await this.usage.reserve(
          meta.runId,
          meta.stepId,
          meta.phaseEpoch,
          "stt",
          `capture:${meta.captureId}`,
          { sttSeconds: cap + 1.024 },
        );
        finishAttempt = await this.usage.begin(
          op,
          "gnani",
          this.usage.config.GNANI_STT_MODEL,
        );
        if (finished) {
          await finishAttempt({
            status: "cancelled",
            usage: {},
            usageSource: "unknown",
          });
          release();
          return;
        }
        stream = this.providers.stt(
          permission.names,
          (value) => send({ type: "segment", ...value }),
          meta.language ?? "en-IN",
        );
        await stream.ready;
        if (finished) {
          release();
          return;
        }
        started = true;
        startTime = Date.now();
        guard = setInterval(() => {
          if (checking || finished) return;
          checking = true;
          void valid()
            .catch(fail)
            .finally(() => {
              checking = false;
            });
        }, 500);
        send({
          type: "ready",
          sampleRate: 16000,
          frameBytes: 1024,
          maxSeconds: cap,
          sessionId: sessionKey,
        });
        timer = setTimeout(
          () => void stop(),
          Math.max(
            1,
            Math.min(
              cap * 1000,
              permission.deadline ? permission.deadline - Date.now() : Infinity,
            ),
          ),
        );
      })().catch(fail);
    });
    socket.on("close", () => {
      if (!finished) {
        finished = true;
        void clearPending();
        void finishAttempt?.({
          status: "cancelled",
          usage: {
            captureSeconds: frames * 0.032,
            transmittedSeconds: frames * 0.032,
          },
          usageSource: "unknown",
        }).catch(() => {});
      }
      release();
    });
    socket.on(
      "error",
      () =>
        void fail(
          new AppError("AUDIO_CONNECTION", "Recording was interrupted."),
        ),
    );
  }
}
