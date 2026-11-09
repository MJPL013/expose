import type { PlayerPreferencesStore } from "../player/preferences";

export type SoundCue =
  | "tap"
  | "ready"
  | "start"
  | "reveal"
  | "tick"
  | "timeout"
  | "save"
  | "commit"
  | "turn"
  | "win"
  | "connection";
const cues: Record<
  SoundCue,
  { notes: number[]; length: number; type: OscillatorType }
> = {
  tap: { notes: [420], length: 0.035, type: "sine" },
  ready: { notes: [520, 780], length: 0.07, type: "sine" },
  start: { notes: [196, 294, 392, 587, 784], length: 0.1, type: "triangle" },
  reveal: { notes: [440, 554, 660, 880], length: 0.11, type: "sine" },
  tick: { notes: [760], length: 0.045, type: "sine" },
  timeout: { notes: [360, 240], length: 0.1, type: "triangle" },
  save: { notes: [660, 880], length: 0.09, type: "sine" },
  commit: { notes: [540], length: 0.07, type: "sine" },
  turn: { notes: [440, 660], length: 0.08, type: "sine" },
  win: { notes: [554, 740, 880], length: 0.08, type: "sine" },
  connection: { notes: [330], length: 0.08, type: "sine" },
};

/** Gesture-unlocked, generated cues. No audio files or network requests. */
export class SoundEffects {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: HTMLAudioElement | null = null;
  private ambientEnabled = false;
  private last = 0;
  private suppressed = new Set<string>();
  private sources = new Set<OscillatorNode>();
  constructor(private preferences: PlayerPreferencesStore) {}
  async unlock() {
    if (
      !this.preferences.getSnapshot().sound.enabled ||
      typeof AudioContext === "undefined"
    )
      return;
    try {
      if (!this.context || this.context.state === "closed") {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
      this.syncPreferences();
    } catch {
      /* Sound is optional; game controls always remain usable. */
    }
  }
  suppress(id: string, value: boolean) {
    if (value) this.suppressed.add(id);
    else this.suppressed.delete(id);
    if (value) this.silence();
    else this.syncPreferences();
  }
  private stopCues() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already ended */
      }
    }
    this.sources.clear();
    if (this.master && this.context)
      this.master.gain.setValueAtTime(0, this.context.currentTime);
  }
  silence() {
    this.stopCues();
    this.ambient?.pause();
  }
  setAmbient(enabled: boolean) {
    this.ambientEnabled = enabled;
    this.syncPreferences();
  }
  syncPreferences() {
    const settings = this.preferences.getSnapshot().sound;
    if (
      !this.ambientEnabled ||
      !settings.enabled ||
      !settings.volume ||
      this.suppressed.size ||
      typeof Audio === "undefined" ||
      document.hidden
    ) {
      this.ambient?.pause();
      return;
    }
    this.ambient ??= new Audio(
      "/audio/samples/mfcc-funny-comedy-sneaky-music-620907.mp3",
    );
    this.ambient.loop = true;
    this.ambient.preload = "auto";
    // Ambient music should sit well below prompts, voices and game cues.
    this.ambient.volume = Math.min(0.12, settings.volume * 0.18);
    void this.ambient.play().catch(() => {
      /* Browsers may wait for the first tap; unlock() retries from that gesture. */
    });
  }
  async playStamp() {
    const settings = this.preferences.getSnapshot().sound;
    if (
      !settings.enabled ||
      !settings.volume ||
      this.suppressed.size ||
      typeof Audio === "undefined" ||
      document.hidden
    )
      return false;
    const stamp = new Audio(
      "/audio/samples/freesound_community-traditional-stamp-44189.mp3",
    );
    stamp.volume = Math.min(0.45, settings.volume * 0.65);
    try {
      await stamp.play();
      return true;
    } catch {
      return false;
    }
  }
  play(cue: SoundCue) {
    const settings = this.preferences.getSnapshot().sound;
    const ctx = this.context;
    if (
      !settings.enabled ||
      !ctx ||
      ctx.state !== "running" ||
      !this.master ||
      this.suppressed.size ||
      document.hidden ||
      (cue === "tick" && !settings.timer)
    )
      return;
    if (
      [...document.querySelectorAll("audio")].some((element) => !element.paused)
    )
      return;
    if (cue !== "start" && performance.now() - this.last < 45) return;
    this.last = performance.now();
    this.stopCues();
    const { notes, length, type } = cues[cue];
    this.master.gain.setValueAtTime(settings.volume * 0.22, ctx.currentTime);
    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      this.sources.add(oscillator);
      const envelope = ctx.createGain();
      const start = ctx.currentTime + index * length;
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(1, start + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + length);
      oscillator.connect(envelope);
      envelope.connect(this.master!);
      oscillator.onended = () => {
        this.sources.delete(oscillator);
        oscillator.disconnect();
        envelope.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + length + 0.01);
    });
  }
  dispose() {
    this.silence();
    if (this.ambient) {
      this.ambient.src = "";
      this.ambient.load();
      this.ambient = null;
    }
    void this.context?.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.suppressed.clear();
  }
}
