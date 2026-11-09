import { z } from "zod";
import type { AccountIdentity } from "./account";

export const GC2_PROTOCOL = 2;
export type VoidIdentity = AccountIdentity & { kind: "google" | "guest" };
export type VoidIdentityView = {
  protocol: 2;
  account: VoidIdentity | null;
  configured: boolean;
  guestAvailable: boolean;
  localTesting: boolean;
  available: boolean;
  voiceAvailable: boolean;
};
export const VoidLanguage = z.enum(["en", "hi", "hinglish"]);
export const VoidSpeechLanguage = z.enum(["en-IN", "hi-IN", "te-IN"]);
export const LEGACY_VOID_LIMITS = {
  captureSeconds: 60,
  speechSeconds: 480,
  turns: 8,
  hostCalls: 12,
  analysisCalls: 12,
  revealCalls: 3,
  ttsCharacters: 12000,
} as const;
export type VoidLimits = {
  captureSeconds: number;
  speechSeconds: number;
  turns: number;
  hostCalls: number;
  analysisCalls: number;
  revealCalls: number;
  ttsCharacters: number;
};
export const VOID_LIMITS: VoidLimits = {
  captureSeconds: 60,
  speechSeconds: 1200,
  turns: 80,
  hostCalls: 80,
  analysisCalls: 3,
  revealCalls: 3,
  ttsCharacters: 60000,
};
export const dimensionNames = [
  "crisis",
  "awkwardness",
  "rules",
  "planning",
  "battery",
  "headHeart",
] as const;
export const EvidenceSchema = z.object({
  dimension: z.enum(dimensionNames),
  summary: z.string().min(1).max(220),
  source: z.enum(["lived", "hypothetical", "self-described"]),
  turnIds: z.array(z.string()).min(1).max(8),
});
export const AnalysisSchema = z.object({
  reflection: z.string().max(180),
  evidence: z.array(EvidenceSchema).max(6),
  refusedTopics: z.array(z.string().max(60)).max(8),
});
export const HostSchema = z.object({
  text: z.string().min(1).max(450),
  evidenceIds: z.array(z.string()).max(12),
});
export const PersonaSchema = z.object({
  title: z.string().min(1).max(65),
  quote: z.string().min(1).max(220),
  observations: z
    .array(
      z.object({
        text: z.string().min(1).max(220),
        evidenceIds: z.array(z.string()).min(1).max(8),
      }),
    )
    .min(1)
    .max(2),
  evidenceIds: z.array(z.string()).min(1).max(16),
});
export type Persona = z.infer<typeof PersonaSchema>;
export type VoidLanguage = z.infer<typeof VoidLanguage>;
export type VoiceMode = "handsfree" | "tap" | "type";
export type VoidStatus =
  | "ready"
  | "capturing"
  | "transcribing"
  | "review"
  | "thinking"
  | "processing"
  | "revealing"
  | "complete"
  | "error";
export type VoidView = {
  protocol: 2;
  flowVersion: 1 | 2;
  processing?: "queued" | "running" | "ready" | "failed";
  graphStatus?: "queued" | "running" | "ready" | "failed";
  activeSeconds?: number;
  wrapSuggested?: boolean;
  id: string;
  revision: number;
  language: VoidLanguage;
  status: VoidStatus;
  caption: {
    id: string;
    text: string;
    audioId?: string;
    audioPending?: boolean;
  };
  reflection?: { turnId: string; text: string };
  persona?: Persona;
  feedback?: string;
  error?: string;
  meaningfulTurns: number;
  pendingParts: number;
  speechRemaining: number;
  limits: VoidLimits;
  createdAt: string;
};
export const VoidMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("claim"),
    protocol: z.literal(2),
    sessionId: z.string().uuid(),
  }),
  z.object({ type: z.literal("heartbeat") }),
  z.object({ type: z.literal("pause") }),
  z.object({
    type: z.literal("capture.start"),
    id: z.string().uuid(),
    revision: z.number().int(),
    language: VoidSpeechLanguage,
  }),
  z.object({
    type: z.literal("capture.end"),
    id: z.string().uuid(),
    capped: z.boolean().default(false),
  }),
  z.object({ type: z.literal("capture.cancel"), id: z.string().uuid() }),
  z.object({
    type: z.literal("answer"),
    id: z.string().uuid(),
    revision: z.number().int(),
    text: z.string().trim().min(1).max(4000),
  }),
  z.object({
    type: z.literal("pending.send"),
    id: z.string().uuid(),
    revision: z.number().int(),
  }),
  z.object({
    type: z.literal("skip"),
    id: z.string().uuid(),
    revision: z.number().int(),
  }),
  z.object({
    type: z.literal("finish"),
    id: z.string().uuid(),
    revision: z.number().int(),
  }),
  z.object({
    type: z.literal("retry"),
    id: z.string().uuid(),
    revision: z.number().int(),
  }),
  z.object({
    type: z.literal("correction"),
    id: z.string().uuid(),
    revision: z.number().int(),
    turnId: z.string().uuid(),
    text: z.string().trim().min(1).max(1000),
  }),
]);
export type VoidClientMessage = z.infer<typeof VoidMessage>;
export type VoidServerMessage =
  | { type: "state"; view: VoidView; reason?: "claimed" | "changed" }
  | { type: "capture.accepted"; id: string }
  | { type: "capture.ready"; id: string }
  | { type: "capture.cap"; id: string }
  | { type: "error"; code: string; message: string }
  | { type: "ownership.lost" }
  | { type: "heartbeat" };
