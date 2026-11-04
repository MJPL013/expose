export type PlayMode = "online" | "demo";
/** Only a UI preference; this never contains a seat credential or game state. */
export class PlayModeStore {
  private mode: PlayMode = "online";
  private listeners = new Set<() => void>();
  getSnapshot = () => this.mode;
  getServerSnapshot = (): PlayMode => "online";
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  load() {
    try { this.mode = localStorage.getItem("expose.playMode") === "demo" ? "demo" : "online"; } catch { /* Optional preference. */ }
    this.listeners.forEach(fn => fn());
    return this.mode;
  }
  set(mode: PlayMode) {
    this.mode = mode;
    try { localStorage.setItem("expose.playMode", mode); } catch { /* Optional preference. */ }
    this.listeners.forEach(fn => fn());
  }
}
