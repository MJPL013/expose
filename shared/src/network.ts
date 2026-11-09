import { z } from "zod";
import { MAX_AVATAR_ID } from "./game/appearance";
import { NarrationSchema } from "./game/guided";
import { SpeechLanguageSchema, HostBeatViewSchema } from "./game/host";
import {
  IntentSchema,
  SetupSchema,
  StepDefinitionSchema,
  LobbyMessageSchema,
} from "./game/contracts";
export const PROTOCOL_VERSION = 6 as const;
export const GuestSchema = z
  .object({
    name: z.string().trim().min(1).max(24),
    avatar: z.number().int().min(0).max(MAX_AVATAR_ID).default(0),
    color: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .default("#ffb020"),
  })
  .strict();
export const RoomSchema = SetupSchema;
export const NetworkIntentSchema = z
  .object({
    protocol_version: z.literal(6),
    type: z.literal("intent"),
    runId: z.string().uuid(),
    intent: IntentSchema.and(
      z.object({ phaseEpoch: z.number().int().nonnegative() }),
    ),
  })
  .strict();
export const ConnectSchema = z
  .object({
    protocol_version: z.literal(6),
    type: z.literal("connect"),
    roomId: z.string().uuid(),
    lastRevision: z.number().int().nonnegative().default(0),
    takeover: z.boolean().default(false),
    capabilities: z
      .array(z.enum(["media-events-v1"]))
      .max(8)
      .optional(),
  })
  .strict();
export const HostAskSchema = z
  .object({
    type: z.literal("host.ask"),
    cid: z.string().uuid(),
    text: z.string().trim().min(1).max(240),
    captureId: z.string().uuid().optional(),
  })
  .strict();
export const AudioStartSchema = z
  .object({
    type: z.literal("start"),
    roomId: z.string().uuid(),
    runId: z.string().uuid(),
    connectionId: z.string().uuid(),
    stepId: z.string(),
    phaseEpoch: z.number().int(),
    purpose: z.enum(["answer", "host"]),
    diagnosticConsent: z.boolean().default(false),
    sampleRate: z.literal(16000),
    captureId: z.string().uuid(),
    language: SpeechLanguageSchema.optional(),
    hostBeatId: z.string().uuid().optional(),
    hostTurn: z.number().int().min(0).max(2).optional(),
  })
  .strict();
export const AudioPrepareSchema = AudioStartSchema.pick({
  roomId: true,
  runId: true,
  connectionId: true,
})
  .extend({ type: z.literal("prepare"), protocol_version: z.literal(6) })
  .strict();
export const ConsentSchema = z
  .object({ reveal: z.boolean(), diagnostic: z.boolean().default(false) })
  .strict();
export const PlaybackSchema = z
  .object({
    id: z.string().uuid(),
    milliseconds: z.number().int().positive().max(60000),
  })
  .strict();
export const AudioServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("prepared") }).strict(),
  z
    .object({
      type: z.literal("accepted"),
      captureId: z.string().uuid(),
      remainingRecordings: z.number(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ready"),
      sampleRate: z.literal(16000),
      frameBytes: z.literal(1024),
      maxSeconds: z.number().positive(),
      sessionId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal("segment"),
      id: z.string(),
      text: z.string(),
      audioMs: z.number(),
      latencyMs: z.number().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("transcript"),
      text: z.string(),
      final: z.literal(true),
      mediaId: z.string().uuid().optional(),
      captureId: z.string().uuid(),
    })
    .strict(),
  z
    .object({ type: z.literal("error"), code: z.string(), message: z.string() })
    .strict(),
]);
export const ClipUploadSchema = z
  .object({
    runId: z.string().uuid(),
    stepId: z.string().max(100),
    phaseEpoch: z.number().int().nonnegative(),
    audio: z.string().min(60).max(400000),
    reveal: z.literal(true),
  })
  .strict();
export const ClientMessageSchema = z.union([
  ConnectSchema,
  z
    .object({
      type: z.literal("voice.playback"),
      mediaId: z.string().uuid(),
      playing: z.boolean(),
    })
    .strict(),
  NetworkIntentSchema,
  HostAskSchema,
  z
    .object({
      type: z.literal("host.reply"),
      cid: z.string().uuid(),
      beatId: z.string().uuid(),
      turn: z.number().int(),
      text: z.string().trim().max(240),
      original: z.string().max(240).optional(),
      language: SpeechLanguageSchema.optional(),
      outcome: z.enum(["answer", "pass", "stt-failed"]),
    })
    .strict(),
  z.object({ type: z.literal("host.begin") }).strict(),
  z
    .object({
      type: z.literal("host.cancel"),
      conversationId: z.string().uuid(),
    })
    .strict(),
  z.object({ type: z.literal("ping") }).strict(),
]);
export const ErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string(),
  }),
});
const score = z
  .object({
    playerId: z.string(),
    rule: z.enum([
      "mindReader",
      "bamboozle",
      "aiDecoy",
      "factMatch",
      "favourite",
    ]),
    points: z.number(),
    round: z.number(),
    controller: z.enum(["human", "simulated", "ai"]).optional(),
  })
  .strict();
const card = z
  .object({
    subjectId: z.string(),
    name: z.string(),
    title: z.string(),
    quote: z.string(),
    traits: z.array(z.object({ label: z.string(), value: z.number() })),
    caseId: z.string(),
    avatar: z.number(),
    color: z.string(),
  })
  .strict();
const option = z
  .object({ id: z.string(), text: z.string(), isOwn: z.boolean() })
  .strict();
const phase = z.discriminatedUnion("type", [
  z.object({ type: z.literal("lobby") }).strict(),
  z
    .object({
      type: z.literal("traits"),
      traits: z.array(
        z.object({ id: z.string(), left: z.string(), right: z.string() }),
      ),
      friendId: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("nomination"),
      question: z.string(),
      selected: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("callout"),
      callout: z.object({
        trait: z.string(),
        self: z.number(),
        peers: z.number(),
        gap: z.number(),
        targetId: z.string().optional(),
      }),
      line: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("catchphrase"),
      prompt: z.string(),
      sample: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("answer"),
      round: z.number(),
      targetId: z.string(),
      prompt: z.string(),
      sample: z.string(),
      isTarget: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("waiting"),
      round: z.number(),
      targetId: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("vote"),
      round: z.number(),
      targetId: z.string(),
      prompt: z.string(),
      options: z.array(option),
      selected: z.string().nullable(),
      canVote: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("reveal"),
      round: z.number(),
      targetId: z.string(),
      options: z.array(
        option.extend({
          authorId: z.string().nullable(),
          authorName: z.string(),
          isTruth: z.boolean(),
          isAI: z.boolean(),
          voters: z.array(z.string()),
        }),
      ),
      scoreEvents: z.array(score),
    })
    .strict(),
  z
    .object({
      type: z.literal("wildcard"),
      prompt: z.string(),
      sample: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("sync"),
      question: z.string(),
      selected: z.string().nullable(),
      results: z
        .array(z.object({ playerId: z.string(), count: z.number() }))
        .nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("story"),
      title: z.string(),
      paragraphs: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      type: z.literal("verdict"),
      winners: z.array(z.string()),
      totalBluffs: z.number(),
    })
    .strict(),
  z.object({ type: z.literal("card"), card, approved: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("summary"),
      card,
      approved: z.boolean(),
      scores: z.array(z.object({ name: z.string(), score: z.number() })),
    })
    .strict(),
  ...(["secret", "guess", "judge"] as const).map((type) =>
    z
      .object({
        type: z.literal(type),
        round: z.number(),
        targetId: z.string(),
        kind: z.enum(["fact", "favourite"]),
        prompt: z.string(),
        sample: z.string(),
        options: z.array(
          z.object({ id: z.string(), text: z.string() }).strict(),
        ),
        standIn: z.boolean(),
      })
      .strict(),
  ),
  z
    .object({
      type: z.literal("spotlight-reveal"),
      round: z.number(),
      targetId: z.string(),
      kind: z.enum(["fact", "favourite"]),
      prompt: z.string(),
      answer: z.string().nullable(),
      options: z.array(
        z
          .object({
            id: z.string(),
            text: z.string(),
            authors: z.array(z.string()),
            isAI: z.boolean(),
            selected: z.boolean(),
          })
          .strict(),
      ),
      scoreEvents: z.array(score),
      standIn: z.boolean(),
    })
    .strict(),
]);
export const NetworkSnapshotSchema = z
  .object({
    lobbyChat: z.array(LobbyMessageSchema).max(50).optional(),
    protocol_version: z.literal(6),
    online: z.literal(true),
    narration: NarrationSchema.optional(),
    inviteUrl: z.string().optional(),
    liveVoice: z.boolean().optional(),
    hostFlowVersion: z.number().optional(),
    hostBeat: HostBeatViewSchema.optional(),
    remainingRecordings: z.number().optional(),
    voiceInputVersion: z.number().optional(),
    recordingLimits: z
      .object({ answer: z.number(), host: z.number() })
      .optional(),
    voicePlaybackUntil: z.number().optional(),
    revealedSources: z
      .array(
        z.object({
          original: z.string(),
          text: z.string(),
          language: SpeechLanguageSchema,
          seatId: z.string(),
          stepId: z.string(),
          epoch: z.number(),
        }),
      )
      .optional(),
    sessionId: z.string(),
    phaseEpoch: z.number(),
    roundCount: z.number(),
    durationMinutes: z.number(),
    animateTransition: z.boolean().optional(),
    revision: z.number(),
    roomCode: z.string(),
    flowId: z.string(),
    scoring: z.object({
      mindReader: z.number(),
      bamboozle: z.number(),
      aiDecoy: z.number(),
      factMatch: z.number(),
      favourite: z.number(),
    }),
    step: StepDefinitionSchema,
    stepIndex: z.number(),
    stepCount: z.number(),
    deadline: z.number().nullable(),
    paused: z.boolean(),
    interrupted: z.boolean(),
    players: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          initials: z.string(),
          color: z.string(),
          avatar: z.number(),
          score: z.number(),
          ready: z.boolean(),
          host: z.boolean(),
          controller: z.enum(["human", "simulated", "ai"]),
          connected: z.boolean(),
          disconnectedAt: z.number().nullable(),
          returnAfterRound: z.number().nullable(),
          aiPoints: z.number(),
          adultConfirmed: z.boolean().optional(),
        })
        .strict(),
    ),
    setup: SetupSchema,
    view: z
      .object({
        viewerId: z.string(),
        phase,
        actionPending: z.boolean(),
        submitted: z.boolean(),
        completed: z.number(),
        required: z.number(),
      })
      .strict(),
    notice: z.string().nullable(),
    serverTime: z.number(),
    canAskHost: z.boolean().optional(),
    host: z
      .object({
        id: z.string(),
        text: z.string(),
        audioUrl: z.string().optional(),
        speakingSeat: z.string().optional(),
        deadline: z.number().optional(),
        playbackSeat: z.string().optional(),
      })
      .optional(),
  })
  .strict();
export const ServerMessageSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("media.changed"), runId: z.string().uuid() })
    .strict(),
  z.object({ type: z.literal("ownership"), connectionId: z.string().uuid() }),
  z.object({ type: z.literal("state"), snapshot: NetworkSnapshotSchema }),
  z.object({
    type: z.literal("ack"),
    cid: z.string(),
    revision: z.number(),
    accepted: z.boolean(),
    code: z.string().optional(),
    message: z.string().optional(),
  }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
  z.object({ type: z.literal("pong"), serverTime: z.number() }),
]);
export type NetworkSnapshot = z.infer<typeof NetworkSnapshotSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
