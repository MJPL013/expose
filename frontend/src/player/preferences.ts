import { z } from "zod";
import {
  SpeechLanguageSchema,
  type SpeechLanguage,
} from "@expose/shared/game/host";
import { MAX_AVATAR_ID, avatarColors } from "@expose/shared/game/appearance";
import type { FriendCard } from "@expose/shared/game/contracts";

export const PLAYER_STORAGE_KEY = "gnani.player.v1";
export { avatarColors } from "@expose/shared/game/appearance";
export const defaultFeedback = {
  vibration: true,
  timerVibration: true,
  reduceMotion: false,
  keepAwake: true,
};
const cardSchema = z.object({
  subjectId: z.string(),
  name: z.string().max(24),
  title: z.string(),
  quote: z.string().max(240),
  traits: z
    .array(z.object({ label: z.string(), value: z.number().min(0).max(100) }))
    .length(3),
  caseId: z.string(),
  avatar: z.number().int().min(0).max(MAX_AVATAR_ID),
  color: z.string(),
});
const schema = z.object({
  version: z.literal(1),
  speechLanguage: SpeechLanguageSchema.default("en-IN"),
  hostVoice: z.boolean().default(true),
  voiceMode: z.enum(["handsfree", "hold", "type"]).default("hold"),
  layout: z.enum(["adaptive", "compact"]).default("adaptive"),
  theme: z.enum(["dark", "light"]).default("dark"),
  profile: z.object({
    name: z.string().trim().min(1).max(24),
    bio: z.string().max(120),
    avatar: z.number().int().min(0).max(MAX_AVATAR_ID),
    color: z.enum(avatarColors),
  }),
  sound: z.object({
    enabled: z.boolean(),
    volume: z.number().min(0).max(1),
    timer: z.boolean(),
  }),
  feedback: z
    .object({
      vibration: z.boolean(),
      timerVibration: z.boolean(),
      reduceMotion: z.boolean(),
      keepAwake: z.boolean(),
    })
    .default(defaultFeedback),
  cards: z
    .array(z.object({ id: z.string(), savedAt: z.string(), card: cardSchema }))
    .max(12),
});
export type PlayerPreferences = z.infer<typeof schema>;
export type PlayerProfile = PlayerPreferences["profile"];
export const defaultPreferences: PlayerPreferences = {
  version: 1,
  speechLanguage: "en-IN",
  hostVoice: true,
  voiceMode: "hold",
  layout: "adaptive",
  theme: "dark",
  profile: { name: "You", bio: "", avatar: 0, color: "#ffb020" },
  sound: { enabled: true, volume: 0.35, timer: true },
  feedback: defaultFeedback,
  cards: [],
};

/** Only explicit profile, sound, and approved-card saves enter this store. Never media. */
export class PlayerPreferencesStore {
  private value = defaultPreferences;
  private listeners = new Set<() => void>();
  private loaded = false;
  getSnapshot = () => this.value;
  getServerSnapshot = () => defaultPreferences;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
      if (raw) this.value = schema.parse(JSON.parse(raw));
    } catch {
      /* Unavailable or older storage starts with a usable default. */
    }
    this.listeners.forEach((fn) => fn());
  }
  private save(value: PlayerPreferences): boolean {
    const parsed = schema.parse(value);
    this.value = parsed;
    let persisted = true;
    try {
      localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      persisted = false;
    }
    this.listeners.forEach((fn) => fn());
    return persisted;
  }
  applyAccount(value: import("@expose/shared/account").AccountPreferences) {
    return this.save({ ...this.value, ...value, cards: this.value.cards });
  }
  saveProfile(profile: PlayerProfile) {
    return this.save({ ...this.value, profile });
  }
  saveSpeechLanguage(speechLanguage: SpeechLanguage) {
    return this.save({ ...this.value, speechLanguage });
  }
  saveVoiceMode(voiceMode: "handsfree" | "hold" | "type") {
    return this.save({ ...this.value, voiceMode });
  }
  saveHostVoice(hostVoice: boolean) {
    return this.save({ ...this.value, hostVoice });
  }
  saveLayout(layout: PlayerPreferences["layout"]) {
    return this.save({ ...this.value, layout });
  }
  saveTheme(theme: PlayerPreferences["theme"]) {
    return this.save({ ...this.value, theme });
  }
  saveSound(sound: PlayerPreferences["sound"]) {
    return this.save({ ...this.value, sound });
  }
  saveFeedback(feedback: PlayerPreferences["feedback"]) {
    return this.save({ ...this.value, feedback });
  }
  saveCard(card: FriendCard, approved: boolean) {
    if (!approved) throw new Error("Approve your card before saving it.");
    const id = JSON.stringify([card.name, card.quote, card.title, card.traits]);
    return this.save({
      ...this.value,
      cards: [
        { id, savedAt: new Date().toISOString(), card },
        ...this.value.cards.filter((item) => item.id !== id),
      ].slice(0, 12),
    });
  }
  removeCard(id: string) {
    return this.save({
      ...this.value,
      cards: this.value.cards.filter((item) => item.id !== id),
    });
  }
  clear() {
    this.value = defaultPreferences;
    try {
      localStorage.removeItem(PLAYER_STORAGE_KEY);
    } catch {
      /* In-memory reset still works. */
    }
    this.listeners.forEach((fn) => fn());
  }
}
