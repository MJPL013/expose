import { z } from "zod";
export const HostLanguageSchema = z.enum(["en", "hi", "hinglish"]);
export const SpeechLanguageSchema = z.enum(["en-IN", "hi-IN", "te-IN"]);
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
};
export function speechMatchesRoom(speech: SpeechLanguage, room: HostLanguage) {
  return room === "hi" ? speech === "hi-IN" : speech === "en-IN";
}
