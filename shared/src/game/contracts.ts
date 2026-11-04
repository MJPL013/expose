import { z } from "zod";
import { MAX_AVATAR_ID, avatarColors } from "./appearance";
import { PaceSchema, type Narration } from "./guided";
import {
  HostLanguageSchema,
  SpeechLanguageSchema,
  type HostBeatView,
  type AnswerSource,
} from "./host";
export const PackIdSchema = z.enum(["hostel-2am", "goa-trip"]);
export type PackId = z.infer<typeof PackIdSchema>;
export const roomSizes = [2, 3, 4, 5, 6, 7] as const;

export const stepTypes = [
  "lobby",
  "traits",
  "nomination",
  "callout",
  "catchphrase",
  "answer",
  "waiting",
  "vote",
  "reveal",
  "wildcard",
  "sync",
  "story",
  "verdict",
  "card",
  "summary",
  "secret",
  "guess",
  "judge",
  "spotlight-reveal",
] as const;
export const StepDefinitionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(stepTypes),
  act: z.number().int().min(0).max(MAX_AVATAR_ID),
  title: z.string(),
  durationMs: z.number().nonnegative(),
  params: z
    .object({
      round: z.number().int().min(0).optional(),
      index: z.number().int().optional(),
      targetId: z.string().optional(),
      kind: z.enum(["fact", "favourite"]).optional(),
    })
    .default({}),
});
export const FlowDefinitionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  packId: PackIdSchema,
  rulesetId: z.string(),
  steps: z.array(StepDefinitionSchema).min(1),
});
export type StepDefinition = z.infer<typeof StepDefinitionSchema>;
export type StepType = (typeof stepTypes)[number];
export type FlowDefinition = z.infer<typeof FlowDefinitionSchema>;
export type Spice = "mild" | "medium" | "spicy";
export type GameMode = "bluff" | "spotlight";
export type Controller = "human" | "simulated" | "ai";
export type Player = {
  id: string;
  name: string;
  initials: string;
  color: string;
  avatar: number;
  score: number;
  ready: boolean;
  host: boolean;
  controller: Controller;
  connected: boolean;
  disconnectedAt: number | null;
  returnAfterRound: number | null;
  aiPoints: number;
  adultConfirmed?: boolean;
};
export const SetupSchema = z
  .object({
    name: z.string().trim().min(1).max(24),
    spice: z.enum(["mild", "medium", "spicy"]),
    mode: z.enum(["remote", "same-room"]),
    adult: z.boolean().default(false),
    gameMode: z.enum(["bluff", "spotlight"]).optional(),
    seatCount: z.number().int().min(2).max(7).optional(),
    packId: PackIdSchema.optional(),
    avatar: z.number().int().min(0).max(MAX_AVATAR_ID).optional(),
    color: z.enum(avatarColors).optional(),
    hostLanguage: HostLanguageSchema.optional(),
    pace: PaceSchema.optional(),
    guidedVoice: z.boolean().optional(),
  })
  .refine((s) => s.spice !== "spicy" || s.adult, {
    message: "Confirm you are 18+ to select Spicy.",
    path: ["adult"],
  });
export type Setup = z.infer<typeof SetupSchema>;
export type ScoreEvent = {
  playerId: string;
  rule: "mindReader" | "bamboozle" | "aiDecoy" | "factMatch" | "favourite";
  points: number;
  round: number;
  controller?: Controller;
};
export type Callout = {
  targetId?: string;
  trait: string;
  self: number;
  peers: number;
  gap: number;
};
export type VoteOption = { id: string; text: string; isOwn: boolean };
export type RevealedOption = VoteOption & {
  authorId: string | null;
  authorName: string;
  isTruth: boolean;
  isAI: boolean;
  voters: string[];
};

export type PhaseView =
  | {
      type: "secret" | "guess" | "judge";
      round: number;
      targetId: string;
      kind: "fact" | "favourite";
      prompt: string;
      sample: string;
      options: { id: string; text: string }[];
      standIn: boolean;
    }
  | {
      type: "spotlight-reveal";
      round: number;
      targetId: string;
      kind: "fact" | "favourite";
      prompt: string;
      answer: string | null;
      options: {
        id: string;
        text: string;
        authors: string[];
        isAI: boolean;
        selected: boolean;
      }[];
      scoreEvents: ScoreEvent[];
      standIn: boolean;
    }
  | { type: "lobby" }
  | {
      type: "traits";
      traits: { id: string; left: string; right: string }[];
      friendId: string;
    }
  | { type: "nomination"; question: string; selected: string | null }
  | { type: "callout"; callout: Callout; line: string }
  | { type: "catchphrase"; prompt: string; sample: string }
  | {
      type: "answer";
      round: number;
      targetId: string;
      prompt: string;
      sample: string;
      isTarget: boolean;
    }
  | { type: "waiting"; round: number; targetId: string }
  | {
      type: "vote";
      round: number;
      targetId: string;
      prompt: string;
      options: VoteOption[];
      selected: string | null;
      canVote: boolean;
    }
  | {
      type: "reveal";
      round: number;
      targetId: string;
      options: RevealedOption[];
      scoreEvents: ScoreEvent[];
    }
  | { type: "wildcard"; prompt: string; sample: string }
  | {
      type: "sync";
      question: string;
      selected: string | null;
      results: { playerId: string; count: number }[] | null;
    }
  | { type: "story"; title: string; paragraphs: string[] }
  | { type: "verdict"; winners: string[]; totalBluffs: number }
  | { type: "card"; card: FriendCard; approved: boolean }
  | {
      type: "summary";
      card: FriendCard;
      approved: boolean;
      scores: { name: string; score: number }[];
    };

export type FriendCard = {
  subjectId: string;
  name: string;
  title: string;
  quote: string;
  traits: { label: string; value: number }[];
  caseId: string;
  avatar: number;
  color: string;
};
export type PlayerView = {
  viewerId: string;
  phase: PhaseView;
  actionPending: boolean;
  submitted: boolean;
  completed: number;
  required: number;
};
export const LobbyMessageSchema = z
  .object({
    id: z.string(),
    seatId: z.string(),
    name: z.string(),
    text: z.string().max(240),
    sentAt: z.number(),
  })
  .strict();
export type LobbyMessage = z.infer<typeof LobbyMessageSchema>;
export type GameSnapshot = {
  lobbyChat?: LobbyMessage[];
  protocol_version: 2 | 3 | 4 | 5;
  narration?: Narration;
  narrationFresh?: boolean;
  inviteUrl?: string;
  hostFlowVersion?: number;
  hostAudioFresh?: boolean;
  hostBeat?: HostBeatView;
  remainingRecordings?: number;
  revealedSources?: AnswerSource[];
  online?: boolean;
  liveVoice?: boolean;
  connection?: "connecting" | "connected" | "disconnected" | "blocked";
  submitting?: boolean;
  serverTime?: number;
  canAskHost?: boolean;
  host?: {
    id: string;
    text: string;
    audioUrl?: string;
    speakingSeat?: string;
    deadline?: number;
    playbackSeat?: string;
  };
  sessionId: string;
  phaseEpoch: number;
  roundCount: number;
  durationMinutes: number;
  animateTransition?: boolean;
  revision: number;
  roomCode: string;
  flowId: string;
  scoring: {
    mindReader: number;
    bamboozle: number;
    aiDecoy: number;
    factMatch: number;
    favourite: number;
  };
  step: StepDefinition;
  stepIndex: number;
  stepCount: number;
  deadline: number | null;
  paused: boolean;
  interrupted: boolean;
  players: Player[];
  setup: Setup;
  view: PlayerView;
  notice: string | null;
};

const envelope = {
  cid: z.string().min(1),
  stepId: z.string(),
  phaseEpoch: z.number().int().optional(),
};
export const IntentSchema = z.discriminatedUnion("type", [
  z.object({ ...envelope, type: z.literal("adult.confirm") }),
  z.object({
    ...envelope,
    type: z.literal("appearance.update"),
    avatar: z.number().int().min(0).max(MAX_AVATAR_ID),
    color: z.enum(avatarColors),
  }),
  z.object({
    ...envelope,
    type: z.literal("settings.update"),
    pace: PaceSchema,
    hostLanguage: HostLanguageSchema,
    spice: z.enum(["mild", "medium", "spicy"]),
    adult: z.boolean(),
    guidedVoice: z.boolean(),
  }),
  z.object({
    ...envelope,
    type: z.literal("chat"),
    text: z.string().trim().min(1).max(240),
  }),
  z.object({ ...envelope, type: z.literal("start") }),
  z.object({
    ...envelope,
    type: z.literal("kick"),
    playerId: z.string().uuid(),
  }),
  z.object({ ...envelope, type: z.literal("ready"), ready: z.boolean() }),
  z.object({ ...envelope, type: z.literal("next") }),
  z.object({ ...envelope, type: z.literal("skip") }),
  z.object({ ...envelope, type: z.literal("veto") }),
  z.object({ ...envelope, type: z.literal("restart") }),
  z.object({
    ...envelope,
    type: z.literal("traits"),
    self: z.array(z.number().min(0).max(10)).length(3),
    friend: z.array(z.number().min(0).max(10)).length(3),
  }),
  z.object({ ...envelope, type: z.literal("nominate"), playerId: z.string() }),
  z.object({
    ...envelope,
    type: z.literal("submit"),
    text: z.string().trim().min(1).max(240),
    original: z.string().trim().max(240).optional(),
    language: SpeechLanguageSchema.optional(),
  }),
  z.object({ ...envelope, type: z.literal("vote"), optionId: z.string() }),
  z.object({ ...envelope, type: z.literal("predict"), playerId: z.string() }),
  z.object({ ...envelope, type: z.literal("approve") }),
  z.object({ ...envelope, type: z.literal("reject") }),
]);
export type Intent = z.infer<typeof IntentSchema>;
export type IntentAction = Intent extends infer T
  ? T extends Intent
    ? Omit<T, "cid" | "stepId">
    : never
  : never;

export interface SessionClient {
  createRoom(setup: Setup): void | Promise<void>;
  joinRoom(code: string, setup: Setup): void | Promise<void>;
  getSnapshot(): GameSnapshot;
  subscribe(listener: () => void): () => void;
  sendIntent(intent: Intent): void | Promise<void>;
  disconnectSeat(id: string): void;
  reconnectSeat(id: string): void;
  leaveForNow(): void;
  resume(): Promise<boolean>;
  endMatch(): void;
  dispose(): void;
}
