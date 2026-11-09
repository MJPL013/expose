import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackController } from "../src/media/feedback";
import {
  PlayerPreferencesStore,
  PLAYER_STORAGE_KEY,
} from "../src/player/preferences";
import type { SoundEffects } from "../src/media/sound-effects";
import { ScreenAwake } from "../src/media/wake-lock";
afterEach(() => vi.unstubAllGlobals());
function harness() {
  const preferences = new PlayerPreferencesStore();
  const sound = {
    play: vi.fn(),
    silence: vi.fn(),
    suppress: vi.fn(),
    unlock: vi.fn(),
  };
  const env = {
    now: () => 1000,
    hidden: () => false,
    activated: () => true,
    playing: () => false,
    supported: () => true,
    vibrate: vi.fn(),
  };
  return {
    preferences,
    sound,
    env,
    feedback: new FeedbackController(
      sound as unknown as SoundEffects,
      preferences,
      env,
    ),
  };
}
describe("contextual feedback", () => {
  it("reports a vibration request honestly and respects capture suppression", () => {
    const { feedback, env } = harness();
    expect(feedback.testVibration()).toBe("requested");
    expect(env.vibrate).toHaveBeenLastCalledWith([120, 80, 120]);
    env.vibrate.mockReturnValue(false);
    expect(feedback.testVibration()).toBe("blocked");
    feedback.suppress("recording", true);
    env.vibrate.mockClear();
    expect(feedback.testVibration()).toBe("suppressed");
    expect(env.vibrate).not.toHaveBeenCalled();
    env.supported = () => false;
    expect(feedback.testVibration()).toBe("unsupported");
  });
  it("tolerates wake-lock denial and releases a request that finishes after leaving", async () => {
    vi.stubGlobal("document", { hidden: false });
    const request = vi.fn().mockRejectedValueOnce(new Error("Power saver"));
    vi.stubGlobal("navigator", { wakeLock: { request } });
    const awake = new ScreenAwake();
    await expect(awake.setActive(true)).resolves.toBeUndefined();
    let grant!: (sentinel: {
      release(): Promise<void>;
      released: boolean;
    }) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    );
    const pending = awake.setActive(true);
    await awake.setActive(false);
    const release = vi.fn().mockResolvedValue(undefined);
    grant({ release, released: false });
    await pending;
    expect(release).toHaveBeenCalledOnce();
  });
  it("escalates only pending-action thresholds, once each, and cancels on submission", () => {
    const { feedback, env, sound } = harness();
    for (const second of [6, 5, 5, 4, 3, 2, 1])
      feedback.timer("question", second, true);
    expect(env.vibrate.mock.calls).toEqual([
      [40],
      [50],
      [[40, 60, 40]],
      [[60, 50, 60]],
    ]);
    feedback.timer("question", 1, false);
    expect(env.vibrate).toHaveBeenLastCalledWith(0);
    feedback.timer("spectator", 3, false);
    expect(sound.play).toHaveBeenCalledTimes(4);
  });
  it("keeps sound and vibration independent and gives accepted actions precedence", () => {
    const { feedback, preferences, env, sound } = harness();
    preferences.saveSound({ enabled: false, timer: false, volume: 0 });
    feedback.timer("q", 3, true);
    expect(sound.play).not.toHaveBeenCalled();
    expect(env.vibrate).toHaveBeenLastCalledWith(50);
    feedback.emit("commit", "accepted");
    feedback.timer("q", 2, true);
    expect(
      env.vibrate.mock.calls.filter(([pattern]) => Array.isArray(pattern)),
    ).toHaveLength(0);
    feedback.emit("commit", "accepted");
    expect(sound.play).toHaveBeenCalledTimes(1);
  });
  it("suppresses recording/playback/background cues without replaying them later", () => {
    const { feedback, env, sound } = harness();
    feedback.suppress("microphone", true);
    feedback.emit("turn", "turn-a");
    feedback.suppress("microphone", false);
    feedback.emit("turn", "turn-a");
    expect(sound.play).not.toHaveBeenCalled();
    env.hidden = () => true;
    feedback.timer("q", 3, true);
    env.hidden = () => false;
    feedback.timer("q", 3, true);
    expect(sound.play).not.toHaveBeenCalled();
    env.playing = () => true;
    feedback.emit("win", "win-a");
    expect(sound.play).not.toHaveBeenCalled();
  });
  it("adds feedback defaults without resetting an older saved profile", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === PLAYER_STORAGE_KEY
          ? JSON.stringify({
              version: 1,
              profile: { name: "Riya", bio: "", avatar: 2, color: "#a8baa0" },
              sound: { enabled: false, volume: 0.2, timer: false },
              cards: [],
            })
          : null,
    });
    const store = new PlayerPreferencesStore();
    store.load();
    expect(store.getSnapshot().profile.name).toBe("Riya");
    expect(store.getSnapshot().sound.enabled).toBe(false);
    expect(store.getSnapshot().feedback).toMatchObject({
      vibration: true,
      reduceMotion: false,
    });
  });
});
