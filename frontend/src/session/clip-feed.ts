export type SharedClip = {
  id: string;
  ownerId: string;
  stepId: string;
  url: string;
};
const empty: SharedClip[] = [];
/** Only an eligible visible owner mounts this feed. Invalidations coalesce. */
export class ClipFeed {
  private key: string | null = null;
  private clips: SharedClip[] = empty;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: AbortController | null = null;
  private dirty = false;
  constructor(
    private fetchClips: (signal: AbortSignal) => Promise<SharedClip[]>,
  ) {}
  getSnapshot = () => this.clips;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish(clips: SharedClip[]) {
    this.clips = clips;
    this.listeners.forEach((fn) => fn());
  }
  activate(key: string | null) {
    if (key === this.key) return;
    this.key = key;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.request?.abort();
    this.publish(empty);
    this.dirty = Boolean(key);
    if (key) this.schedule();
  }
  invalidate(runId: string) {
    if (!this.key?.startsWith(`${runId}:`)) return;
    this.dirty = true;
    this.schedule();
  }
  private schedule() {
    if (!this.key || this.timer || this.request || !this.dirty) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, 100);
  }
  private async refresh() {
    if (!this.key || this.request) return;
    const key = this.key;
    const controller = new AbortController();
    this.request = controller;
    this.dirty = false;
    try {
      const clips = await this.fetchClips(controller.signal);
      if (!controller.signal.aborted && key === this.key) this.publish(clips);
    } catch {
      /* Reconnect, visibility return, or the next event retries. */
    } finally {
      this.request = null;
      this.schedule();
    }
  }
  dispose() {
    this.activate(null);
  }
}
