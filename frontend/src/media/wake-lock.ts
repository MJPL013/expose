/** Foreground-only wake lock. Rejections and OS releases never affect gameplay. */
export class ScreenAwake {
  private sentinel: WakeLockSentinel | null = null;
  private generation = 0;
  async setActive(active: boolean) {
    const generation = ++this.generation;
    if (!active) {
      await this.sentinel?.release().catch(() => {});
      this.sentinel = null;
      return;
    }
    if (this.sentinel && !this.sentinel.released) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.wakeLock ||
      document.hidden
    )
      return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      if (generation !== this.generation || document.hidden) {
        await sentinel.release();
        return;
      }
      this.sentinel = sentinel;
    } catch {
      /* Power saving, permissions, and unsupported contexts are expected. */
    }
  }
}
