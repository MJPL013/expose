type Message = {
  type: "probe" | "owner" | "release";
  tab: string;
  room?: string;
};
/** Advisory metadata only. The server lease decides who may submit. */
export class TabCoordination {
  private channel: BroadcastChannel | null = null;
  private tab = "";
  private owned: string | null = null;
  private other: string | null = null;
  constructor(private onOwner: (room: string) => void) {}
  start() {
    if (
      this.channel ||
      typeof window === "undefined" ||
      !window.BroadcastChannel
    )
      return;
    try {
      this.tab ||= crypto.randomUUID();
      this.channel = new BroadcastChannel("expose.owner.v1");
      this.channel.onmessage = ({ data }: MessageEvent<Message>) => {
        if (!data || data.tab === this.tab) return;
        if (data.type === "probe" && this.owned) this.post("owner", this.owned);
        if (data.type === "owner" && typeof data.room === "string") {
          this.other = data.room;
          this.onOwner(data.room);
        }
        if (data.type === "release" && data.room === this.other)
          this.other = null;
      };
      // A development effect cleanup can close the first channel before its
      // reply arrives. Each new channel announces itself, even with cached init.
      this.post("probe");
    } catch {
      this.channel = null;
    }
  }
  async probe() {
    this.start();
    if (!this.channel) return null;
    this.other = null;
    this.post("probe");
    await new Promise((resolve) => setTimeout(resolve, 200));
    return this.other;
  }
  claim(room: string) {
    if (this.owned === room) return;
    this.owned = room;
    this.post("owner", room);
  }
  release() {
    if (this.owned) this.post("release", this.owned);
    this.owned = null;
  }
  private post(type: Message["type"], room?: string) {
    try {
      this.channel?.postMessage({
        type,
        tab: this.tab,
        room,
      } satisfies Message);
    } catch {
      /* Server fallback. */
    }
  }
  dispose() {
    this.release();
    this.channel?.close();
    this.channel = null;
  }
}
