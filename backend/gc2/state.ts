import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  VOID_LIMITS,
  LEGACY_VOID_LIMITS,
  type VoidLimits,
  type AnalysisSchema,
  type Persona,
  type VoidLanguage,
  type VoidView,
} from "@expose/shared/gc2";

export type Evidence = Omit<
  z.infer<typeof AnalysisSchema>["evidence"][number],
  "dimension" | "source"
> & {
  dimension: string;
  source: "lived" | "hypothetical" | "self-described" | "inferred";
  id: string;
  sources: string[];
};
export type Turn = {
  id: string;
  text: string;
  original: string;
  language: string;
  audioIds: string[];
  correction?: string;
  sources: string[];
  at: string;
  invalidated?: boolean;
};
export type Caption = {
  id: string;
  text: string;
  audioId?: string;
  audioPending?: boolean;
  sources: string[];
};
export type SessionState = {
  version: 1 | 2;
  limits?: VoidLimits;
  activeMs?: number;
  activeSince?: number;
  activeLimitMs?: number;
  finishedAt?: string;
  processing?: "queued" | "running" | "ready" | "failed";
  analysisRevision?: number;
  graphStatus?: "queued" | "running" | "ready" | "failed";
  provenance?: "real" | "synthetic";
  timeline?: {
    id: string;
    role: "user" | "assistant" | "technical";
    at: string;
  }[];
  technical?: { id: string; audioId: string; language: string; at: string }[];

  language: VoidLanguage;
  status: VoidView["status"];
  turns: Turn[];
  evidence: Evidence[];
  refusedTopics: string[];
  captions: Caption[];
  reflection?: { turnId: string; text: string };
  persona?: Persona;
  personaVersions: Persona[];
  feedback?: string;
  error?: string;
  pending: { text: string; audioId: string; language: string }[];
  operations: string[];
  workId?: string;
  failedKind?: "host" | "reveal" | "batch";
  capture?: { id: string; owner: string; startedAt: number };
  used: {
    speech: number;
    host: number;
    analysis: number;
    reveal: number;
    tts: number;
    graph?: number;
  };
  questionTypes: string[];
};
export const greeting: Record<VoidLanguage, string> = {
  en: "A little space for your stories. What's been on your mind lately?",
  hi: "आपकी कहानियों के लिए थोड़ी सी जगह। आजकल आपके मन में क्या चल रहा है?",
  hinglish:
    "Thodi si jagah, tumhari stories ke liye. Aajkal dimaag mein kya chal raha hai?",
};
export function initialState(
  language: VoidLanguage,
  limits: VoidLimits = VOID_LIMITS,
): SessionState {
  return {
    version: 2,
    limits,
    activeMs: 0,
    activeLimitMs: 1800000,
    timeline: [],
    technical: [],
    provenance: "real",
    language,
    status: "ready",
    turns: [],
    evidence: [],
    refusedTopics: [],
    captions: [
      {
        id: randomUUID(),
        text: greeting[language],
        sources: [],
        audioPending: true,
      },
    ],
    personaVersions: [],
    pending: [],
    operations: [],
    questionTypes: [],
    used: { speech: 0, host: 0, analysis: 0, reveal: 0, tts: 0 },
  };
}
export function view(row: {
  id: string;
  revision: number;
  state: SessionState;
  createdAt: Date;
}): VoidView {
  const s = row.state,
    caption = s.captions.at(-1)!;
  return {
    protocol: 2,
    flowVersion: s.version,
    processing: s.processing,
    graphStatus: s.graphStatus,
    activeSeconds: Math.floor(activeMilliseconds(s) / 1000),
    wrapSuggested: activeMilliseconds(s) >= 1200000,
    id: row.id,
    revision: row.revision,
    language: s.language,
    status: s.status,
    caption: {
      id: caption.id,
      text: caption.text,
      audioId: caption.audioId,
      audioPending: caption.audioPending,
    },
    reflection: s.reflection,
    persona: s.persona,
    feedback: s.feedback,
    error: s.error,
    meaningfulTurns: s.turns.length,
    pendingParts: s.pending.length,
    speechRemaining: Math.max(0, limitsFor(s).speechSeconds - s.used.speech),
    limits: limitsFor(s),
    createdAt: row.createdAt.toISOString(),
  };
}
export function shouldWrap(s: SessionState) {
  return (
    s.turns.length >= 6 ||
    (s.turns.length >= 4 &&
      new Set(s.evidence.map((e) => e.dimension)).size >= 3)
  );
}
export function nextQuestion(s: SessionState) {
  const types = [
    "story",
    "detail",
    "contrast",
    "playful-dilemma",
    "lighten",
    "bridge",
  ];
  let picked = types[s.questionTypes.length % types.length];
  if (picked === "playful-dilemma" && s.questionTypes.includes(picked))
    picked = "bridge";
  s.questionTypes.push(picked);
  return picked;
}

export function limitsFor(s: SessionState): VoidLimits {
  return s.version === 1 ? LEGACY_VOID_LIMITS : (s.limits ?? VOID_LIMITS);
}
export function activeMilliseconds(s: SessionState) {
  return (
    (s.activeMs ?? 0) +
    (s.activeSince ? Math.max(0, Date.now() - s.activeSince) : 0)
  );
}
export function stopClock(s: SessionState) {
  s.activeMs = activeMilliseconds(s);
  delete s.activeSince;
}
