import { z } from "zod";
export const HostLanguageSchema = z.enum(["en", "hi", "hinglish", "te", "ta"]);
export const SpeechLanguageSchema = z.enum([
  "en-IN",
  "hi-IN",
  "te-IN",
  "ta-IN",
]);
export type HostLanguage = z.infer<typeof HostLanguageSchema>;
export type SpeechLanguage = z.infer<typeof SpeechLanguageSchema>;
export type HostStage = "act1" | "midgame" | "reply" | "closing";
export const HostDecisionSchema = z
  .object({
    decision: z.enum(["speak", "wait"]),
    text: z.string().max(500),
    evidenceIds: z.array(z.string().max(100)).max(6),
    inviteSeat: z.string().nullable(),
    memory: z.string().max(240).nullable(),
  })
  .strict();
export type HostDecision = z.infer<typeof HostDecisionSchema>;
export type HostMemory = {
  id: string;
  text: string;
  evidenceIds: string[];
  playerIds: string[];
  runId: string;
  usedAt: number;
  createdAt: number;
};
export type AnswerSource = {
  original: string;
  language: SpeechLanguage;
  text: string;
  stepId: string;
  seatId: string;
  epoch: number;
};
export const HostBeatViewSchema = z
  .object({
    id: z.string(),
    stage: z.enum(["act1", "midgame", "reply", "closing"]),
    status: z.enum(["generating", "speaking", "reply", "done"]),
    text: z.string(),
    audioUrl: z.string().optional(),
    playbackSeat: z.string().optional(),
    invitedSeat: z.string().optional(),
    deadline: z.number(),
    replyDeadline: z.number().optional(),
    turn: z.number(),
    remainingRecordings: z.number().optional(),
    replies: z
      .array(
        z
          .object({
            seatId: z.string(),
            text: z.string(),
            original: z.string().optional(),
            language: z.string().optional(),
            outcome: z.string(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type HostBeatView = z.infer<typeof HostBeatViewSchema>;
export const languageNames = {
  en: "English",
  hi: "Hindi",
  hinglish: "Hinglish",
  te: "Telugu",
  ta: "Tamil",
};
export function speechMatchesRoom(speech: SpeechLanguage, room: HostLanguage) {
  // Hinglish gameplay text is authored in Latin script; review transliteration too.
  return room !== "hinglish" && speech === roomSpeechLanguage[room];
}

export const roomSpeechLanguage: Record<HostLanguage, SpeechLanguage> = {
  en: "en-IN",
  hi: "hi-IN",
  hinglish: "hi-IN",
  te: "te-IN",
  ta: "ta-IN",
};
export const roomLanguageOptions = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी · Hindi" },
  { value: "hinglish", label: "Hinglish" },
  { value: "te", label: "తెలుగు · Telugu" },
  { value: "ta", label: "தமிழ் · Tamil" },
] as const;
export const speechLanguageOptions = roomLanguageOptions
  .filter((l) => l.value !== "hinglish")
  .map((l) => ({ value: roomSpeechLanguage[l.value], label: l.label }));
export function ttsLanguage(language: HostLanguage, model: string) {
  return language === "hinglish" && model !== "timbre-v3.0"
    ? "hi-en"
    : roomSpeechLanguage[language];
}
