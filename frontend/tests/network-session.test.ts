import { afterEach, expect, it, vi } from "vitest";
import { NetworkSession } from "../src/session/network-session";
import { initialState, project } from "@expose/shared/game/engine";

class Socket {
  static OPEN = 1;
  static latest: Socket;
  readyState = 1;
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  send = vi.fn();
  constructor() {
    Socket.latest = this;
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}
afterEach(() => vi.unstubAllGlobals());
it.each(["old-state", "refresh-error"])(
  "stops incompatible socket traffic and requests an explicit refresh: %s",
  async (kind) => {
    vi.stubGlobal("WebSocket", Socket);
    vi.stubGlobal("location", { protocol: "http:", host: "localhost:3000" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ roomId: "room" }),
        }),
    );
    const session = new NetworkSession(),
      previous = Socket.latest;
    const opening = session.createRoom({
      name: "Asha",
      spice: "mild",
      mode: "remote",
      adult: false,
      seatCount: 2,
    });
    const rejection = expect(opening).rejects.toThrow("Refresh");
    await vi.waitFor(() => expect(Socket.latest).not.toBe(previous));
    Socket.latest.receive(
      kind === "old-state"
        ? {
            type: "state",
            snapshot: {
              ...project(initialState()),
              protocol_version: 3,
              serverTime: Date.now(),
            },
          }
        : { type: "error", code: "CLIENT_UPDATE_REQUIRED", message: "Refresh" },
    );
    await rejection;
    expect(session.getRecoverySnapshot()).toMatchObject({
      updateRequired: true,
      active: false,
      ready: true,
    });
    expect(Socket.latest.readyState).toBe(3);
    session.dispose();
  },
);
it("shares initialization across concurrent calls and local navigation", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => [] });
  vi.stubGlobal("fetch", fetch);
  const session = new NetworkSession();
  await Promise.all([
    session.initialize(),
    session.initialize(),
    session.initialize(),
  ]);
  await session.initialize();
  expect(fetch).toHaveBeenCalledTimes(1);
  session.dispose();
});
it.each(["ack-first", "snapshot-first"])(
  "waits for accepted snapshot before confirmation feedback: %s",
  async (order) => {
    vi.stubGlobal("WebSocket", Socket);
    vi.stubGlobal("location", { protocol: "http:", host: "localhost:3000" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ roomId: "room" }),
      }),
    );
    const session = new NetworkSession();
    try {
      const previous = Socket.latest;
      const opening = session.createRoom({
        name: "Asha",
        spice: "mild",
        mode: "remote",
        adult: false,
        seatCount: 2,
      });
      await vi.waitFor(() => {
        expect(Socket.latest).not.toBe(previous);
        expect(Socket.latest?.onmessage).toBeDefined();
      });
      const socket = Socket.latest;
      const initial = {
        ...project(initialState()),
        protocol_version: 4,
        online: true,
        serverTime: Date.now(),
      };
      socket.receive({ type: "state", snapshot: initial });
      await opening;
      let resolved = false;
      const intent = {
        type: "ready" as const,
        ready: true,
        cid: "ready-1",
        stepId: initial.step.id,
        phaseEpoch: initial.phaseEpoch,
      };
      const pending = session.sendIntent(intent).then(() => {
        resolved = true;
      });
      const snapshot = {
        ...initial,
        revision: initial.revision + 1,
        players: initial.players.map((p) =>
          p.id === initial.view.viewerId ? { ...p, ready: true } : p,
        ),
      };
      const ack = {
        type: "ack",
        cid: intent.cid,
        revision: snapshot.revision,
        accepted: true,
      };
      socket.receive(order === "ack-first" ? ack : { type: "state", snapshot });
      await Promise.resolve();
      expect(resolved).toBe(false);
      expect(session.getSnapshot().submitting).toBe(true);
      socket.receive(order === "ack-first" ? { type: "state", snapshot } : ack);
      await pending;
      expect(session.getSnapshot().revision).toBe(snapshot.revision);
      expect(session.getSnapshot().players[0].ready).toBe(true);
      expect(session.getSnapshot().submitting).toBe(false);
      await session.request("/resume");
      const signal = vi.mocked(fetch).mock.calls.at(-1)![1]!.signal!;
      expect(signal.aborted).toBe(false);
      const interrupted = session.sendIntent({ ...intent, cid: "unconfirmed" });
      const rejection = expect(interrupted).rejects.toThrow("Moved");
      socket.receive({
        type: "error",
        code: "SEAT_TAKEN_OVER",
        message: "Moved",
      });
      await rejection;
      expect(signal.aborted).toBe(true);
      expect(session.getRecoverySnapshot().status).toBe("moved");
      expect(session.getRecoverySnapshot().active).toBe(false);
      session.reconnectSeat();
      expect(Socket.latest).toBe(socket);
      expect(await session.resume()).toBe(false);
    } finally {
      session.dispose();
    }
  },
);
