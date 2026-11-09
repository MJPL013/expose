import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PLAYER_STORAGE_KEY,
  PlayerPreferencesStore,
} from "../src/player/preferences";
import { friendCard, initialState } from "@expose/shared/game/engine";

afterEach(() => vi.unstubAllGlobals());
function storage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  return data;
}
describe("local player locker", () => {
  it("only stores approved cards and explicitly saved character data", () => {
    const data = storage();
    const store = new PlayerPreferencesStore();
    store.load();
    expect(data.size).toBe(0);
    const card = friendCard(initialState(), "you");
    expect(() => store.saveCard(card, false)).toThrow("Approve");
    expect(data.size).toBe(0);
    store.saveProfile({
      name: "Riya",
      bio: "Snack specialist",
      avatar: 2,
      color: "#a8baa0",
    });
    store.saveCard(card, true);
    store.saveCard(card, true);
    const restored = new PlayerPreferencesStore();
    restored.load();
    expect(restored.getSnapshot().profile).toMatchObject({
      name: "Riya",
      avatar: 2,
    });
    expect(restored.getSnapshot().cards).toHaveLength(1);
    const parsed = JSON.parse(data.get(PLAYER_STORAGE_KEY)!);
    expect(Object.keys(parsed).sort()).toEqual([
      "cards",
      "feedback",
      "layout",
      "profile",
      "sound",
      "speechLanguage",
      "theme",
      "version",
    ]);
    expect(JSON.stringify(parsed)).not.toMatch(
      /blob:|data:audio|audio\/webm|recording/i,
    );
    restored.removeCard(restored.getSnapshot().cards[0].id);
    expect(restored.getSnapshot().cards).toHaveLength(0);
    restored.clear();
    expect(data.size).toBe(0);
  });
  it("recovers from corrupt storage and remains usable when writes are blocked", () => {
    const data = storage();
    data.set(PLAYER_STORAGE_KEY, "{invalid");
    const store = new PlayerPreferencesStore();
    store.load();
    expect(store.getSnapshot().profile.name).toBe("You");
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("Blocked");
      },
    });
    expect(
      store.saveProfile({
        name: "Kabir",
        bio: "",
        avatar: 1,
        color: "#b5b2d8",
      }),
    ).toBe(false);
    expect(store.getSnapshot().profile.name).toBe("Kabir");
  });
  it("bounds saved history and carries selected appearance into the game", () => {
    storage();
    const store = new PlayerPreferencesStore();
    const card = friendCard(initialState(), "you");
    for (let n = 0; n < 20; n++)
      store.saveCard({ ...card, quote: `Line ${n}` }, true);
    expect(store.getSnapshot().cards).toHaveLength(12);
    expect(store.getSnapshot().cards[0].card.quote).toBe("Line 19");
    const game = initialState(undefined, undefined, {
      name: "Riya",
      spice: "medium",
      adult: false,
      mode: "remote",
      avatar: 2,
      color: "#a8baa0",
    });
    expect(friendCard(game, "you")).toMatchObject({
      name: "Riya",
      avatar: 2,
      color: "#a8baa0",
    });
  });
});
