import { z } from "zod";
import { MAX_AVATAR_ID, avatarColors } from "./game/appearance";
export const ACCOUNT_PROTOCOL = 1;
export const VOID_ONBOARDING_VERSION = 1;
export const AccountProfileSchema = z.object({
  name: z.string().trim().min(1).max(24),
  bio: z.string().max(120),
  avatar: z.number().int().min(0).max(MAX_AVATAR_ID),
  color: z.enum(avatarColors),
});
export const AccountPreferencesSchema = z.object({
  profile: AccountProfileSchema,
  speechLanguage: z.enum(["en-IN", "hi-IN", "te-IN"]),
  hostVoice: z.boolean(),
  voiceMode: z.enum(["handsfree", "hold", "type"]),
  layout: z.enum(["adaptive", "compact"]),
  theme: z.enum(["dark", "light"]),
  sound: z.object({
    enabled: z.boolean(),
    volume: z.number().min(0).max(1),
    timer: z.boolean(),
  }),
  feedback: z.object({
    vibration: z.boolean(),
    timerVibration: z.boolean(),
    reduceMotion: z.boolean(),
    keepAwake: z.boolean(),
  }),
});
export const SavedCardSchema = z.object({
  subjectId: z.string().max(100),
  name: z.string().max(24),
  title: z.string().max(150),
  quote: z.string().max(240),
  traits: z
    .array(
      z.object({
        label: z.string().max(100),
        value: z.number().min(0).max(100),
      }),
    )
    .length(3),
  caseId: z.string().max(100),
  avatar: z.number().int().min(0).max(MAX_AVATAR_ID),
  color: z.string().max(30),
});
export type AccountPreferences = z.infer<typeof AccountPreferencesSchema>;
export type AccountIdentity = {
  id: string;
  name: string;
  role: "player" | "admin";
  onboardingVersion: number;
};
export type AccountView = {
  protocol: 1;
  configured: boolean;
  account: AccountIdentity | null;
  preferences: AccountPreferences | null;
  guestLinked: boolean;
};
