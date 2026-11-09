import { TabCoordination } from "./tab-coordination";
import { ClipFeed, type SharedClip } from "./clip-feed";
import { clearAnswerDraft, reconcileAnswerDraft } from "./answer-draft";
import { ServerMessageSchema } from "@expose/shared/network";
import { initialState, project } from "@expose/shared/game/engine";
import type {
  GameSnapshot,
  Intent,
  SessionClient,
  Setup,
} from "@expose/shared/game/contracts";
import type { RecordedClip } from "../media/local-audio";

export type Recovery = {
  status?:
    | "connecting"
    | "active"
    | "reconnecting"
    | "controlled-elsewhere"
    | "moved"
    | "inactive"
    | "ended";
  ready: boolean;
  blocked: boolean;
  resumable: boolean;
  active: boolean;
  notice: string | null;
  updateRequired?: boolean;
};
export class GameRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}
type RecoveryResult = {
  rooms: { roomId: string; code: string; status: string }[];
  notices: { roomId: string; code: string; message: string }[];
};
export class NetworkSession implements SessionClient {
  private restoredHostBeats = new Set<string>();
  private restoredNarrations = new Set<string>();
  private recoveryRequest: Promise<RecoveryResult | null> | null = null;
  private terminal(message: string) {
    this.intended = false;
    this.closeSocket();
    this.coordination.release();
    clearAnswerDraft();
    this.roomId = null;
    this.rejectPending(message);
    this.update(
      { connection: "disconnected", submitting: false, notice: message },
      {
        ready: true,
        active: false,
        blocked: false,
        resumable: false,
        status: "ended",
        notice: message,
      },
    );
  }
  refreshRecovery(force = false): Promise<RecoveryResult | null> {
    if ((!force && this.intended) || this.recovery.blocked)
      return Promise.resolve(null);
    if (this.recoveryRequest) return this.recoveryRequest;
    this.recoveryRequest = (async () => {
      try {
        const result = await this.request<RecoveryResult>("/recovery");
        if (this.intended && !force) return result;
        let remembered = this.roomId;
        try {
          remembered ??= localStorage.getItem("expose.last-room");
        } catch {
          /* Session-only recovery. */
        }
        const notice = result.notices.find((n) => n.roomId === remembered);
        if (notice) this.terminal(notice.message);
        const room =
          result.rooms.find((r) => r.roomId === this.roomId) ?? result.rooms[0];
        this.roomId = room?.roomId ?? null;
        this.update(
          {},
          {
            ready: true,
            resumable: Boolean(room),
            notice: notice?.message ?? (room ? null : this.recovery.notice),
          },
        );
        return result;
      } catch (error) {
        if (error instanceof GameRequestError && error.status === 401) {
          if (this.roomId || this.recovery.resumable)
            this.terminal(
              "Your guest session has expired. Join or create a room to play.",
            );
          else this.update({}, { ready: true, resumable: false });
        } else this.update({}, { ready: true });
        return null;
      }
    })().finally(() => {
      this.recoveryRequest = null;
    });
    return this.recoveryRequest;
  }
  async resumeCode(code: string) {
    if (this.intended) return this.snapshot.roomCode === code;
    const result = await this.refreshRecovery();
    const room = result?.rooms.find((r) => r.code === code);
    if (!room) return false;
    this.roomId = room.roomId;
    return this.resume();
  }
  private requireUpdate() {
    const notice =
      "Expose has updated. Refresh the app to reconnect; your submitted answers are saved.";
    this.intended = false;
    this.closeSocket();
    this.coordination.release();
    this.rejectPending(notice);
    this.update(
      { connection: "disconnected", submitting: false, notice },
      {
        ready: true,
        active: false,
        blocked: false,
        resumable: false,
        updateRequired: true,
        notice,
      },
    );
  }
  readonly clips = new ClipFeed((signal) =>
    this.roomId
      ? this.request<SharedClip[]>(
          `/rooms/${this.roomId}/media`,
          undefined,
          "GET",
          signal,
        )
      : Promise.resolve([]),
  );
  private snapshot: GameSnapshot = {
    ...project(initialState()),
    online: true,
    connection: "disconnected",
  };
  private recovery: Recovery = {
    status: "inactive",
    ready: false,
    blocked: false,
    resumable: false,
    active: false,
    notice: null,
  };
  private initialization: Promise<void> | null = null;
  private work = new AbortController();
  private opening: Promise<void> | null = null;
  private resuming: Promise<boolean> | null = null;
  private lifecycleAttached = false;
  private coordination = new TabCoordination((room) => {
    if (!this.intended && (!this.roomId || this.roomId === room)) {
      this.roomId = room;
      clearAnswerDraft();
      this.update(
        { connection: "blocked" },
        {
          ready: true,
          active: false,
          resumable: true,
          blocked: true,
          status: "controlled-elsewhere",
        },
      );
    }
  });
  private online = () => {
    if (this.intended && !this.recovery.blocked) this.reconnectSeat();
  };
  private offline = () => {
    if (!this.intended) return;
    this.closeSocket();
    this.update(
      { connection: "disconnected", animateTransition: false },
      {
        status: "reconnecting",
        notice: "You’re offline. Your seat is reserved.",
      },
    );
  };
  private attachLifecycle() {
    this.coordination.start();
    if (this.lifecycleAttached || typeof window === "undefined") return;
    this.lifecycleAttached = true;
    window.addEventListener("online", this.online);
    window.addEventListener("offline", this.offline);
  }
  private listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private roomId: string | null = null;
  private connectionId: string | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intended = false;
  private fresh = true;
  private pending = new Map<
    string,
    {
      message: string;
      resolve: () => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      acceptedRevision?: number;
      runId: string;
      restart: boolean;
    }
  >();
  private readyWaiters: { resolve: () => void; reject: (e: Error) => void }[] =
    [];
  getSnapshot = () => this.snapshot;
  getRecoverySnapshot = () => this.recovery;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private publish() {
    this.listeners.forEach((fn) => fn());
  }
  private settleAccepted() {
    for (const [cid, action] of this.pending) {
      if (action.acceptedRevision === undefined) continue;
      const updated = action.restart
        ? this.snapshot.sessionId !== action.runId
        : this.snapshot.sessionId === action.runId &&
          this.snapshot.revision >= action.acceptedRevision;
      if (!updated) continue;
      clearTimeout(action.timer);
      this.pending.delete(cid);
      action.resolve();
    }
    this.snapshot = { ...this.snapshot, submitting: this.pending.size > 0 };
  }
  private update(
    values: Partial<GameSnapshot> = {},
    recovery: Partial<Recovery> = {},
  ) {
    this.snapshot = { ...this.snapshot, ...values };
    this.recovery = { ...this.recovery, ...recovery };
    this.publish();
  }
  async request<T>(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.any([
        this.work.signal,
        AbortSignal.timeout(10000),
        ...(signal ? [signal] : []),
      ]),
    });
    if (response.status === 204) return undefined as T;
    const result = await response.json();
    if (!response.ok)
      throw new GameRequestError(
        result.error?.message ?? "The game server is unavailable.",
        result.error?.code ?? "SERVER_UNAVAILABLE",
        response.status,
      );
    return result;
  }
  initialize() {
    this.attachLifecycle();
    return (this.initialization ??= (async () => {
      const owner = await this.coordination.probe();
      if (owner) return;
      await this.refreshRecovery();
    })());
  }
  private async guest(setup: Setup) {
    await this.request("/guests", {
      name: setup.name,
      avatar: setup.avatar ?? 0,
      color: setup.color ?? "#ffb020",
    });
  }
  async createRoom(setup: Setup) {
    if (this.recovery.blocked)
      throw new Error(
        "Your game is open in another tab. Play here instead before creating or joining a room.",
      );
    this.attachLifecycle();
    await this.guest(setup);
    const room = await this.request<{ roomId: string }>("/rooms", setup);
    this.roomId = room.roomId;
    await this.open();
  }
  async joinRoom(code: string, setup: Setup) {
    if (this.recovery.blocked)
      throw new Error(
        "Your game is open in another tab. Play here instead before creating or joining a room.",
      );
    this.attachLifecycle();
    await this.guest(setup);
    const room = await this.request<{ roomId: string }>(
      `/rooms/${encodeURIComponent(code.trim())}/join`,
      {},
    );
    this.roomId = room.roomId;
    await this.open();
  }
  private open(takeover = false): Promise<void> {
    if (!takeover && this.recovery.blocked)
      return Promise.reject(
        new Error("Choose Play here instead to move your seat."),
      );
    if (!takeover && this.socket && this.socket.readyState <= WebSocket.OPEN)
      return this.opening ?? Promise.resolve();
    if (typeof navigator !== "undefined" && navigator.onLine === false)
      return Promise.reject(
        new Error("You’re offline. Reconnect to continue."),
      );
    if (!this.roomId)
      return Promise.reject(new Error("No room to reconnect to."));
    this.closeSocket();
    this.intended = true;
    try {
      localStorage.setItem("expose.last-room", this.roomId);
    } catch {
      /* Optional recovery hint. */
    }
    this.fresh = true;
    this.update(
      { connection: "connecting", notice: null },
      {
        active: true,
        resumable: true,
        blocked: false,
        ready: true,
        status: this.snapshot.revision ? "reconnecting" : "connecting",
      },
    );
    const socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/v1/realtime`,
    );
    this.socket = socket;
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.readyWaiters = this.readyWaiters.filter((item) => item !== waiter);
        if (this.socket === socket) socket.close();
        reject(
          new Error(
            "The game server did not respond. You can retry connecting.",
          ),
        );
      }, 12000);
      const waiter = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (e: Error) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      this.readyWaiters.push(waiter);
    });
    socket.onopen = () => {
      if (this.socket !== socket) return;
      socket.send(
        JSON.stringify({
          protocol_version: 6,
          type: "connect",
          roomId: this.roomId,
          lastRevision: this.snapshot.revision,
          takeover,
          capabilities: ["media-events-v1"],
        }),
      );
      this.heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ type: "ping" }));
      }, 10000);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      const parsed = ServerMessageSchema.safeParse(JSON.parse(event.data));
      if (!parsed.success) {
        this.requireUpdate();
        return;
      }
      const msg = parsed.data;
      if (msg.type === "media.changed") {
        this.clips.invalidate(msg.runId);
        return;
      }
      if (msg.type === "ownership") {
        this.connectionId = msg.connectionId;
        return;
      }
      if (msg.type === "state") {
        if (
          msg.snapshot.sessionId === this.snapshot.sessionId &&
          msg.snapshot.revision < this.snapshot.revision
        )
          return;
        const first = this.fresh;
        if (first && msg.snapshot.hostBeat)
          this.restoredHostBeats.add(msg.snapshot.hostBeat.id);
        if (first && msg.snapshot.narration)
          this.restoredNarrations.add(msg.snapshot.narration.id);
        this.fresh = false;
        this.reconnectAttempt = 0;
        this.snapshot = {
          ...msg.snapshot,
          connection: "connected",
          submitting: this.pending.size > 0,
          animateTransition: !first,
          narrationFresh:
            !first &&
            Boolean(
              msg.snapshot.narration &&
              !this.restoredNarrations.has(msg.snapshot.narration.id),
            ),
          hostAudioFresh:
            !first &&
            Boolean(
              msg.snapshot.hostBeat &&
              !this.restoredHostBeats.has(msg.snapshot.hostBeat.id),
            ),
          deadline:
            msg.snapshot.deadline === null
              ? null
              : msg.snapshot.deadline + Date.now() - msg.snapshot.serverTime,
        };
        this.coordination.claim(this.roomId!);
        reconcileAnswerDraft(this.snapshot);
        this.recovery = {
          status: "active",
          ready: true,
          active: true,
          blocked: false,
          resumable: true,
          notice: null,
        };
        this.settleAccepted();
        this.publish();
        for (const waiter of this.readyWaiters.splice(0)) waiter.resolve();
        if (first)
          for (const value of this.pending.values()) socket.send(value.message);
        if (first) this.clips.invalidate(this.snapshot.sessionId);
      } else if (msg.type === "ack") {
        const action = this.pending.get(msg.cid);
        if (action) {
          if (msg.accepted) action.acceptedRevision = msg.revision;
          else {
            clearTimeout(action.timer);
            this.pending.delete(msg.cid);
          }
          this.settleAccepted();
          this.update({
            submitting: this.pending.size > 0,
            notice: msg.accepted ? null : (msg.message ?? "Action rejected."),
          });
          if (!msg.accepted)
            action.reject(new Error(msg.message ?? "Action rejected."));
        }
      } else if (msg.type === "error") {
        if (msg.code === "CLIENT_UPDATE_REQUIRED") {
          this.requireUpdate();
          return;
        }
        if (
          ["NOT_A_MEMBER", "REMOVED_FROM_ROOM", "ROOM_EXPIRED"].includes(
            msg.code,
          )
        ) {
          this.intended = false;
          this.closeSocket();
          this.coordination.release();
          clearAnswerDraft();
          this.roomId = null;
          this.rejectPending(msg.message);
          this.update(
            {
              connection: "disconnected",
              submitting: false,
              notice: msg.message,
            },
            {
              status: "ended",
              active: false,
              resumable: false,
              blocked: false,
              notice: msg.message,
            },
          );
          return;
        }
        const blocked = ["SEAT_IN_USE", "SEAT_TAKEN_OVER"].includes(msg.code);
        if (blocked) {
          this.intended = false;
          this.closeSocket();
          this.coordination.release();
          clearAnswerDraft();
          this.rejectPending(msg.message);
        }
        this.update(
          {
            connection: blocked ? "blocked" : this.snapshot.connection,
            submitting: this.pending.size > 0,
            notice: msg.message,
          },
          {
            blocked,
            notice: msg.message,
            ...(blocked
              ? {
                  active: false,
                  status:
                    msg.code === "SEAT_TAKEN_OVER"
                      ? ("moved" as const)
                      : ("controlled-elsewhere" as const),
                }
              : {}),
          },
        );
        for (const waiter of this.readyWaiters.splice(0))
          waiter.reject(new Error(msg.message));
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.connectionId = null;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.update(
        { connection: "disconnected", animateTransition: false },
        { status: "reconnecting" },
      );
      if (
        this.intended &&
        !this.recovery.blocked &&
        (typeof navigator === "undefined" || navigator.onLine !== false)
      )
        this.retry = setTimeout(
          () => {
            void this.open().catch(() => {});
          },
          Math.min(1000 * 2 ** Math.min(this.reconnectAttempt++, 5), 10000) *
            (0.75 + Math.random() * 0.5),
        );
    };
    socket.onerror = () => {
      if (this.socket === socket)
        this.update({ notice: "Connection lost. Reconnecting…" });
    };
    this.opening = ready;
    void ready
      .finally(() => {
        if (this.opening === ready) this.opening = null;
      })
      .catch(() => {});
    return ready;
  }
  async sendIntent(intent: Intent) {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      this.snapshot.connection !== "connected"
    )
      throw new Error(
        "Reconnect before submitting. Your answer has not been locked.",
      );
    const message = JSON.stringify({
      protocol_version: 6,
      type: "intent",
      runId: this.snapshot.sessionId,
      intent,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(intent.cid);
        this.update({
          submitting: this.pending.size > 0,
          notice:
            "Confirmation was interrupted. Check your current phase before retrying.",
        });
        reject(new Error("The server did not confirm the action."));
      }, 15000);
      this.pending.set(intent.cid, {
        message,
        resolve,
        reject,
        timer,
        runId: this.snapshot.sessionId,
        restart: intent.type === "restart",
      });
      this.update({ submitting: true });
      this.socket!.send(message);
    });
  }
  askHost(text: string) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(
        JSON.stringify({ type: "host.ask", cid: crypto.randomUUID(), text }),
      );
  }
  async replyHost(
    beatId: string,
    turn: number,
    text: string,
    outcome: "answer" | "pass" | "stt-failed",
    source?: {
      original: string;
      language: import("@expose/shared/game/host").SpeechLanguage;
    },
  ) {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      this.snapshot.connection !== "connected"
    )
      throw new Error("Reconnect before replying.");
    const cid = crypto.randomUUID();
    const message = JSON.stringify({
      type: "host.reply",
      cid,
      beatId,
      turn,
      text,
      outcome,
      ...source,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(cid);
        this.update({ submitting: this.pending.size > 0 });
        reject(new Error("Reply confirmation was interrupted."));
      }, 10000);
      this.pending.set(cid, {
        message,
        resolve,
        reject,
        timer,
        runId: this.snapshot.sessionId,
        restart: false,
      });
      this.socket!.send(message);
    });
    return true;
  }
  translateAnswer(
    original: string,
    language: import("@expose/shared/game/host").SpeechLanguage,
    hostBeatId?: string,
    hostTurn?: number,
  ) {
    if (!this.roomId || !this.connectionId)
      throw new Error("Reconnect before translating.");
    return this.request<{ text: string }>(`/rooms/${this.roomId}/translate`, {
      runId: this.snapshot.sessionId,
      connectionId: this.connectionId,
      phaseEpoch: this.snapshot.phaseEpoch,
      original,
      language,
      hostBeatId,
      hostTurn,
    });
  }
  beginHost() {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "host.begin" }));
  }
  cancelHost(conversationId: string) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "host.cancel", conversationId }));
  }
  async shareClip(clip: RecordedClip, runId: string, phaseEpoch: number) {
    if (!this.roomId) return;
    const bytes = new Uint8Array(await clip.blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return this.request<{ id: string }>(`/rooms/${this.roomId}/media`, {
      runId,
      stepId: clip.stepId,
      phaseEpoch,
      audio: btoa(binary),
      reveal: true,
    });
  }
  async clipConsent(id: string, value: boolean) {
    try {
      await this.request(
        `/media/${id}/consent`,
        { reveal: value, diagnostic: false },
        "PUT",
      );
    } catch (error) {
      this.update({
        notice:
          "Recording consent could not be updated. Reconnect and try again; the previous consent still applies.",
      });
      throw error;
    }
  }
  async removeClip(id: string) {
    try {
      await this.request(`/media/${id}`, undefined, "DELETE");
    } catch (error) {
      this.update({
        notice:
          "The server recording could not be deleted yet. Reconnect and retry before its automatic expiry.",
      });
      throw error;
    }
  }
  voicePlayback(mediaId: string, playing: boolean) {
    if (this.snapshot.setup.mode !== "same-room") return;
    const url = `/api/v1/media/${mediaId}`;
    if (
      ![
        this.snapshot.narration,
        this.snapshot.hostBeat,
        this.snapshot.host,
      ].some(
        (clip) =>
          clip?.audioUrl === url &&
          clip.playbackSeat === this.snapshot.view.viewerId,
      )
    )
      return;
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(
        JSON.stringify({ type: "voice.playback", mediaId, playing }),
      );
  }
  audioContext(
    purpose: "answer" | "host" = "answer",
    diagnosticConsent = false,
  ) {
    if (!this.roomId || !this.connectionId)
      throw new Error("Reconnect before recording.");
    return {
      type: "start",
      roomId: this.roomId,
      runId: this.snapshot.sessionId,
      connectionId: this.connectionId,
      stepId: this.snapshot.step.id,
      phaseEpoch: this.snapshot.phaseEpoch,
      purpose,
      diagnosticConsent,
      sampleRate: 16000,
      captureId: crypto.randomUUID(),
    } as const;
  }
  reconnectSeat(_id?: string) {
    void _id;
    if (
      !this.roomId ||
      !this.intended ||
      this.recovery.blocked ||
      (this.socket && this.socket.readyState <= WebSocket.OPEN)
    )
      return;
    void this.open().catch((error) => this.update({ notice: error.message }));
  }
  disconnectSeat(_id?: string) {
    void _id;
    this.leaveForNow();
  }
  setInterrupted(value: boolean) {
    if (value) this.leaveForNow();
    else this.reconnectSeat();
  }
  async takeover() {
    await this.open(true);
  }
  resume(): Promise<boolean> {
    if (this.recovery.blocked) return Promise.resolve(false);
    if (this.snapshot.connection === "connected" && this.intended)
      return Promise.resolve(true);
    if (this.resuming) return this.resuming;
    const result = this.resumeOnce();
    this.resuming = result;
    void result.finally(() => {
      if (this.resuming === result) this.resuming = null;
    });
    return result;
  }
  private async resumeOnce() {
    try {
      if (!this.roomId) {
        this.initialization = null;
        await this.initialize();
      }
      if (!this.roomId) return false;
      await this.request(`/rooms/${this.roomId}/resume`, {});
      await this.open();
      return true;
    } catch (error) {
      if (
        error instanceof GameRequestError &&
        [
          "REMOVED_FROM_ROOM",
          "NOT_A_MEMBER",
          "ROOM_EXPIRED",
          "ROOM_NOT_FOUND",
        ].includes(error.code)
      ) {
        this.terminal(error.message);
        return false;
      }
      this.update(
        {},
        {
          notice: error instanceof Error ? error.message : "Could not resume.",
        },
      );
      return false;
    }
  }
  leaveForNow(preserveDraft = false) {
    if (!preserveDraft) clearAnswerDraft();
    this.coordination.release();
    this.intended = false;
    this.closeSocket();
    this.rejectPending("You left the game.");
    this.update(
      {
        connection: "disconnected",
        animateTransition: false,
        submitting: false,
      },
      { active: false, status: "inactive" },
    );
  }
  async endMatch() {
    if (this.roomId) await this.request(`/rooms/${this.roomId}/end`, {});
    this.roomId = null;
    this.leaveForNow();
    this.update({}, { active: false, resumable: false, status: "ended" });
  }
  private closeSocket() {
    this.work.abort();
    this.work = new AbortController();
    this.clips.dispose();
    if (this.retry) clearTimeout(this.retry);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.retry = null;
    this.heartbeat = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.connectionId = null;
  }
  private rejectPending(message: string) {
    for (const action of this.pending.values()) {
      clearTimeout(action.timer);
      action.reject(new Error(message));
    }
    this.pending.clear();
    for (const waiter of this.readyWaiters.splice(0))
      waiter.reject(new Error(message));
  }
  dispose() {
    this.coordination.dispose();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.online);
      window.removeEventListener("offline", this.offline);
    }
    this.lifecycleAttached = false;
    this.intended = false;
    this.closeSocket();
    this.rejectPending("Session closed.");
  }
}
