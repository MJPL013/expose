import type { PlayerPreferencesStore } from "../player/preferences";
import type { SoundCue, SoundEffects } from "./sound-effects";

type FeedbackEnvironment = {
  hidden(): boolean;
  playing(): boolean;
  activated(): boolean;
  now(): number;
  vibrate(pattern: number | number[]): boolean | void;
  supported(): boolean;
};
const browserEnvironment: FeedbackEnvironment = {
  hidden: () => typeof document === "undefined" || document.hidden,
  playing: () =>
    typeof document !== "undefined" &&
    [...document.querySelectorAll("audio")].some((audio) => !audio.paused),
  activated: () =>
    typeof navigator !== "undefined" &&
    (navigator.userActivation?.hasBeenActive ?? true),
  now: () => performance.now(),
  supported: () =>
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function",
  vibrate: (pattern) => {
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.vibrate === "function"
      )
        return navigator.vibrate(pattern);
      return false;
    } catch {
      /* Optional device feedback never blocks an action. */
      return false;
    }
  },
};
export const timerPatterns: Record<number, number | number[]> = {
  5: 40,
  3: 50,
  2: [40, 60, 40],
  1: [60, 50, 60],
  0: 60,
};
const patterns: Partial<Record<SoundCue, number | number[]>> = {
  ready: 40,
  start: [20, 60, 20],
  turn: [20, 60, 20],
  commit: 35,
  win: [20, 60, 20],
  save: 15,
  connection: 15,
};

/** Semantic, deduplicated feedback. Renderers never schedule vibration themselves. */
export class FeedbackController {
  private seen = new Set<string>();
  private suppressed = new Set<string>();
  private lastImportant = -Infinity;
  private timerActive = false;
  private serial = 0;
  constructor(
    private sound: SoundEffects,
    private preferences: PlayerPreferencesStore,
    private env = browserEnvironment,
  ) {}
  supported() {
    return this.env.supported();
  }
  testVibration():
    "unsupported" | "disabled" | "suppressed" | "blocked" | "requested" {
    if (!this.supported()) return "unsupported";
    if (!this.preferences.getSnapshot().feedback.vibration) return "disabled";
    if (!this.usable()) return "suppressed";
    this.cancelTimer();
    this.lastImportant = this.env.now();
    return this.env.vibrate([120, 80, 120]) === false ? "blocked" : "requested";
  }
  unlock() {
    return this.sound.unlock();
  }
  private usable() {
    return (
      !this.env.hidden() &&
      !this.env.playing() &&
      !this.suppressed.size &&
      this.env.activated()
    );
  }
  private remember(id: string) {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    if (this.seen.size > 1500)
      this.seen.delete(this.seen.values().next().value!);
    return true;
  }
  emit(cue: SoundCue, id = `interaction:${++this.serial}`) {
    if (!this.remember(id) || !this.usable()) return;
    this.cancelTimer();
    this.lastImportant = this.env.now();
    this.sound.play(cue);
    if (this.preferences.getSnapshot().feedback.vibration && patterns[cue])
      this.env.vibrate(patterns[cue]!);
  }
  timer(id: string, seconds: number, pending: boolean) {
    if (!pending) {
      this.cancelTimer();
      return;
    }
    if (
      !(seconds in timerPatterns) ||
      !this.remember(`${id}:${seconds}`) ||
      !this.usable() ||
      this.env.now() - this.lastImportant < 180
    )
      return;
    const settings = this.preferences.getSnapshot();
    if (settings.sound.timer)
      this.sound.play(seconds === 0 ? "timeout" : "tick");
    if (settings.feedback.vibration && settings.feedback.timerVibration) {
      this.env.vibrate(timerPatterns[seconds]);
      this.timerActive = true;
    }
  }
  cancelTimer() {
    if (this.timerActive) this.env.vibrate(0);
    this.timerActive = false;
  }
  suppress(id: string, value: boolean) {
    if (value) this.suppressed.add(id);
    else this.suppressed.delete(id);
    this.sound.suppress(id, value);
    if (value) this.cancel();
  }
  cancel() {
    this.env.vibrate(0);
    this.timerActive = false;
    this.sound.silence();
  }
  dispose() {
    this.cancel();
    this.suppressed.clear();
  }
}
