import { z } from "zod";
import { HostLanguageSchema } from "@expose/shared/game/host";
import { PaceSchema } from "@expose/shared/game/guided";
import type { PlayerPreferences } from "../player/preferences";
const key = "expose.room-entry.v1";
export const roomDraftSchema = z.object({
  form: z.enum(["create", "join"]),
  code: z.string().max(6),
  spice: z.enum(["mild", "medium", "spicy"]),
  hostLanguage: HostLanguageSchema,
  pace: PaceSchema,
  guidedVoice: z.boolean(),
  gameMode: z.enum(["spotlight", "bluff"]),
  packId: z.enum(["hostel-2am", "goa-trip"]),
  seatCount: z.number().int().min(2).max(7),
  demo: z.boolean(),
});
export type RoomDraft = z.infer<typeof roomDraftSchema>;
let draft: RoomDraft | null = null;
let destination: string | null = null;
export function hasProfile(p: PlayerPreferences) {
  return (
    p.profileComplete ??
    (p.profile.name.trim() !== "You" && !!p.profile.name.trim())
  );
}
export function saveRoomDraft(value: RoomDraft) {
  draft = value;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
export function readRoomDraft() {
  try {
    return roomDraftSchema.parse(
      JSON.parse(sessionStorage.getItem(key) ?? "null"),
    );
  } catch {
    return draft;
  }
}
export function clearRoomDraft() {
  draft = null;
  try {
    sessionStorage.removeItem(key);
  } catch {}
}
export function setProfileReturn(path: string) {
  destination = path;
  try {
    sessionStorage.setItem(key + ".return", path);
  } catch {}
}
export function takeProfileReturn() {
  let path = destination;
  try {
    path = sessionStorage.getItem(key + ".return") ?? path;
    sessionStorage.removeItem(key + ".return");
  } catch {}
  destination = null;
  return path && /^(?:\/|\/friends|\/demo|\/join\/[A-Z0-9]{6})$/.test(path)
    ? path
    : null;
}
