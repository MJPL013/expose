import {
  SetupSchema,
  type FlowDefinition,
  type GameSnapshot,
  type Intent,
  type SessionClient,
  type Setup,
} from "@expose/shared/game/contracts";
import {
  buildFlow,
  classicRules,
  type Ruleset,
} from "@expose/shared/game/definitions";
import {
  activeStep,
  defaultSetup,
  initialState,
  project,
  reduceIntent,
  simulateUntil,
  setPresence,
  finishPhase,
  type EngineState,
} from "@expose/shared/game/engine";
import { CheckpointStore, SESSION_TTL, type Checkpoint } from "./checkpoint";
import { freshContent } from "@expose/shared/game/fresh-content";
import { captureContent } from "@expose/shared/game/content-snapshot";

export class MockSession implements SessionClient {
  private state: EngineState;
  private snapshot: GameSnapshot;
  private listeners = new Set<() => void>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private viewerId = "you";
  private paused = false;
  private interrupted = false;
  private suspendedAt: number | null = null;
  private storage: CheckpointStore | null;
  private saved: Checkpoint | null = null;
  private active = false;
  private initialization = 0;
  private motionAllowed = false;
  private recovery = {
    updateRequired: false,
    ready: false,
    blocked: false,
    resumable: false,
    active: false,
    notice: null as string | null,
  };
  constructor(
    flow: FlowDefinition = buildFlow(),
    rules: Ruleset = classicRules,
    private clock: () => number = Date.now,
    persistent = false,
  ) {
    this.state = initialState(flow, rules);
    this.snapshot = project(this.state);
    this.storage = persistent ? new CheckpointStore() : null;
    this.recovery.ready = !persistent;
    this.recovery.active = !persistent;
  }
  getSnapshot = () => this.snapshot;
  getFlow = () => this.state.flow;
  getRecoverySnapshot = () => this.recovery;
  async initialize() {
    if (!this.storage) return;
    const initialization = ++this.initialization;
    const owned = await this.storage.acquire();
    if (initialization !== this.initialization) return;
    if (owned && !this.active) this.saved = this.storage.read(this.clock());
    this.recovery = {
      updateRequired: false,
      ready: true,
      blocked: !owned,
      resumable: Boolean(this.saved),
      active: this.active,
      notice: this.storage.notice,
    };
    this.publish(false);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (!this.interval) this.interval = setInterval(() => this.tick(), 200);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
    };
  };
  private publish(save = true) {
    if (save && this.storage && this.active && this.saved) {
      this.saved = { ...this.saved, savedAt: this.clock(), state: this.state };
      this.storage.write(this.saved);
    }
    if (this.storage)
      this.recovery = {
        ...this.recovery,
        active: this.active,
        notice: this.storage.notice,
        resumable: Boolean(this.saved),
        blocked: this.recovery.ready && !this.storage.owns(),
      };
    this.snapshot = project(
      this.state,
      this.viewerId,
      this.paused,
      this.interrupted,
    );
    this.snapshot.animateTransition = this.motionAllowed;
    this.listeners.forEach((listener) => listener());
  }
  createRoom(setup: Setup) {
    if (this.storage && !this.storage.owns())
      throw new Error(
        "This seat is open in another tab. Close that tab, then retry here.",
      );
    if (this.storage) this.storage.notice = null;
    this.viewerId = "you";
    this.paused = false;
    this.interrupted = false;
    this.suspendedAt = null;
    this.state = initialState(
      this.state.flow.version === 1
        ? this.state.flow
        : buildFlow(
            setup.gameMode ?? "spotlight",
            setup.seatCount ?? 5,
            false,
            undefined,
            undefined,
            setup.packId,
            setup.pace,
          ),
      this.state.rules,
      SetupSchema.parse(setup),
    );
    this.state.sessionId = crypto.randomUUID();
    if (setup.pace)
      this.state.content = freshContent(
        captureContent(
          this.state.players.length,
          setup.packId,
          setup.hostLanguage,
        ),
        setup,
        this.state.sessionId,
      );
    this.active = true;
    this.motionAllowed = true;
    this.saved = {
      version: 2,
      createdAt: this.clock(),
      savedAt: this.clock(),
      seatId: "you",
      seatToken: crypto.randomUUID(),
      state: this.state,
    };
    this.publish();
  }
  joinRoom(code: string, setup: Setup) {
    if (code.trim().toUpperCase() !== "DEMO42")
      throw new Error(
        "This local demo uses room code DEMO42. Real shared rooms come later.",
      );
    this.createRoom(setup);
  }
  sendIntent = (intent: Intent) => {
    if (this.interrupted) return;
    if (this.storage && !this.storage.owns()) {
      this.publish(false);
      return;
    }
    const actor = this.state.players.find((p) => p.id === this.viewerId);
    if (!actor?.connected || actor.controller === "ai") return;
    this.tick();
    const oldStep = activeStep(this.state).id;
    this.state = reduceIntent(this.state, intent, this.clock(), this.viewerId);
    if (
      intent.type === "restart" &&
      activeStep(this.state).type === "lobby" &&
      oldStep !== "lobby" &&
      this.saved
    ) {
      this.saved = {
        ...this.saved,
        createdAt: this.clock(),
        seatToken: crypto.randomUUID(),
        state: this.state,
      };
    }
    if (activeStep(this.state).id !== oldStep) this.motionAllowed = true;
    if (activeStep(this.state).id !== oldStep && this.suspendedAt !== null)
      this.suspendedAt = this.clock();
    this.publish();
  };
  tick() {
    if (this.paused || this.interrupted) return;
    if (this.storage && (!this.active || !this.storage.owns())) return;
    if (this.saved && this.clock() - this.saved.createdAt >= SESSION_TTL) {
      if (this.storage)
        this.storage.notice = "This match has expired. Start a new room.";
      this.endMatch();
      this.recovery = {
        ...this.recovery,
        notice: "This match has expired. Start a new room.",
      };
      this.publish(false);
      return;
    }
    const next = simulateUntil(this.state, this.clock(), this.viewerId);
    if (next !== this.state) {
      if (activeStep(next).id !== activeStep(this.state).id)
        this.motionAllowed = true;
      this.state = next;
      this.publish();
    } else if (
      this.storage &&
      this.saved &&
      this.clock() - this.saved.savedAt >= 5000
    )
      this.publish();
  }
  private suspension(change: () => void) {
    const wasSuspended = this.paused || this.interrupted;
    change();
    const isSuspended = this.paused || this.interrupted;
    if (!wasSuspended && isSuspended) this.suspendedAt = this.clock();
    if (wasSuspended && !isSuspended && this.suspendedAt !== null) {
      if (this.state.deadline !== null)
        this.state.deadline += this.clock() - this.suspendedAt;
      this.suspendedAt = null;
    }
    this.publish();
  }
  setPaused(value: boolean) {
    this.suspension(() => {
      this.paused = value;
    });
  }
  setInterrupted(value: boolean) {
    this.suspension(() => {
      this.interrupted = value;
    });
  }
  setPerspective(id: string) {
    if (!this.state.players.some((p) => p.id === id)) return;
    this.viewerId = id;
    this.publish();
  }
  setFlow(flow: FlowDefinition) {
    const setup = {
      ...this.state.setup,
      seatCount:
        flow.version === 1 ? 4 : Number(flow.id.match(/-(\d)/)?.[1] ?? 5),
      gameMode: flow.id.includes("spotlight")
        ? ("spotlight" as const)
        : ("bluff" as const),
    };
    this.state = initialState(flow, classicRules, setup);
    this.viewerId = "you";
    this.paused = false;
    this.interrupted = false;
    this.suspendedAt = null;
    this.publish();
  }
  /** Development fixture construction uses real transitions rather than invalid snapshots. */
  jumpTo(stepId: string) {
    const flow = this.state.flow;
    const setup = this.state.setup;
    this.state = initialState(flow, this.state.rules, setup);
    let safety = 0;
    while (
      activeStep(this.state).id !== stepId &&
      safety++ < flow.steps.length + 4
    ) {
      const step = activeStep(this.state);
      if (step.type === "lobby")
        this.state.players.forEach((p) => {
          p.ready = true;
        });
      const type = step.type === "lobby" ? "start" : "skip";
      this.state =
        this.state.flow.version >= 2
          ? finishPhase(this.state, this.clock(), "you")
          : reduceIntent(
              this.state,
              { type, cid: `preview:${safety}`, stepId: step.id },
              this.clock(),
              "you",
            );
    }
    this.paused = true;
    this.motionAllowed = false;
    this.interrupted = false;
    this.suspendedAt = this.clock();
    this.publish();
  }
  restart() {
    this.createRoom(this.state.setup ?? defaultSetup);
  }
  disconnectSeat(id: string) {
    this.state = setPresence(this.state, id, false, this.clock());
    this.publish();
  }
  reconnectSeat(id: string) {
    this.active = true;
    this.recovery = { ...this.recovery, active: true };
    this.motionAllowed = false;
    this.state = simulateUntil(this.state, this.clock(), this.viewerId);
    this.state = setPresence(this.state, id, true, this.clock());
    this.publish();
  }
  leaveForNow() {
    if (this.active) this.disconnectSeat("you");
    this.active = false;
    this.recovery = { ...this.recovery, active: false };
    this.publish(false);
  }
  async resume() {
    if (this.storage && !this.storage.owns()) await this.initialize();
    if (this.recovery.blocked || !this.saved) return false;
    const saved = this.saved;
    if (this.clock() - saved.createdAt >= SESSION_TTL) {
      this.endMatch();
      return false;
    }
    this.state = structuredClone(saved.state);
    this.viewerId = saved.seatId;
    this.active = true;
    this.motionAllowed = false;
    this.paused = false;
    this.interrupted = false;
    // A closed/crashed browser cannot send a disconnect; use the last saved heartbeat.
    this.state = setPresence(this.state, this.viewerId, false, saved.savedAt);
    this.state = simulateUntil(this.state, this.clock(), this.viewerId);
    this.state = setPresence(this.state, this.viewerId, true, this.clock());
    this.publish();
    return true;
  }
  endMatch() {
    this.storage?.clear();
    this.saved = null;
    this.active = false;
    this.viewerId = "you";
    this.paused = false;
    this.interrupted = false;
    this.state = initialState(buildFlow());
    this.publish(false);
  }
  advancePreview() {
    if (activeStep(this.state).type === "lobby")
      this.state.players.forEach((p) => {
        p.ready = true;
      });
    this.state = finishPhase(this.state, this.clock(), this.viewerId);
    this.suspendedAt = this.clock();
    this.publish();
  }
  setBotReady(id: string, ready: boolean) {
    if (activeStep(this.state).type !== "lobby" || id === "you") return;
    const player = this.state.players.find((p) => p.id === id);
    if (player) {
      player.ready = ready;
      this.state.revision += 1;
      this.publish();
    }
  }
  dispose() {
    this.initialization++;
    this.storage?.release();
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.listeners.clear();
  }
}
