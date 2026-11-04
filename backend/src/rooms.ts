import { roomNames } from "@expose/shared/game/room-names";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { and, eq, gt, asc, desc, sql, isNull } from "drizzle-orm";
import type { Database, Transaction } from "./db/client";
import * as t from "./db/schema";
import {
  activeStep,
  createNetworkState,
  friendCard,
  reduceIntent,
  setPresence,
  simulateUntil,
  project,
  friendTarget,
  requiredActors,
  type EngineState,
} from "@expose/shared/game/engine";
import type {
  Intent,
  Player,
  Setup,
  LobbyMessage,
} from "@expose/shared/game/contracts";
import { NetworkSnapshotSchema } from "@expose/shared/network";
import { ensure, AppError } from "./errors";
import {
  checkpoint,
  finishBeat,
  hostWorkDue,
  type HostBeat,
} from "./host-context";
import type { AnswerSource } from "@expose/shared/game/host";
import { questionNarration } from "@expose/shared/game/guided";

export const TWO_HOURS = 2 * 60 * 60 * 1000;
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export type HostState = {
  id: string;
  text: string;
  audioUrl?: string;
  speakingSeat?: string;
  deadline?: number;
  playbackSeat?: string;
  originalDeadline?: number | null;
  pausedAt?: number;
  epoch?: number;
  requested?: boolean;
};
export type RunState = EngineState & {
  hostBeat?: HostBeat;
  hostChecks?: string[];
  hostLastRound?: number;
  hostDeferred?: boolean;
  hostRecentLines?: string[];
  hostReplyReceipts?: Record<string, { revision: number; bodyHash: string }>;
  answerSources?: AnswerSource[];
  recordings?: Record<string, number>;
  voicePending?: Record<string, number>;
  voiceCaptureIds?: Record<string, string>;
  voiceGraceEpoch?: number;
  inputOutcomes?: Record<
    string,
    {
      seatId: string;
      stepId: string;
      epoch: number;
      outcome: "answer" | "pass" | "timeout" | "blank" | "stt-failed";
    }
  >;
  preparations?: Record<
    string,
    { status: "pending" | "done" | "failed"; text?: string; epoch: number }
  >;
  narrationPrepared?: Record<
    string,
    { mediaId: string; seconds: number; text: string }
  >;
  lobbyChat?: LobbyMessage[];
  hostState?: HostState;
  hostQuestions?: number[];
  narratedEpoch?: number;
  ended?: boolean;
};
/** Release the speaker slot without skipping the interrupted phase. */
export function releaseHostConversation(
  state: RunState,
  now: number,
  keepResponse = false,
) {
  const host = state.hostState;
  if (!host?.deadline) return;
  state.deadline =
    host.originalDeadline == null
      ? null
      : now +
        Math.max(
          1000,
          host.originalDeadline - (host.pausedAt ?? host.deadline - 25000),
        );
  if (!host.requested)
    state.hostQuestions = state.hostQuestions?.filter(
      (epoch) => epoch !== host.epoch,
    );
  if (keepResponse && host.requested) {
    delete host.deadline;
    delete host.speakingSeat;
  } else delete state.hostState;
}
export type Ack = {
  type: "ack";
  cid: string;
  revision: number;
  accepted: boolean;
  code?: string;
  message?: string;
};
type Loaded = {
  room: typeof t.rooms.$inferSelect;
  run: typeof t.runs.$inferSelect;
  state: RunState;
  members: (typeof t.members.$inferSelect)[];
  removedPlayerIds?: string[];
};
export class Rooms {
  onChange: (roomId: string) => void = () => {};
  onTick: (roomId: string) => void = () => {};
  onHostJob: (roomId: string) => Promise<void> = async () => {};
  now = () => this.clock();
  constructor(
    readonly db: Database,
    private clock = Date.now,
    private hostVersion = 1,
  ) {}
  private newState(
    players: Player[],
    setup: Setup,
    runId: string,
    code: string,
    history: string[] = [],
  ): RunState {
    const ids: Record<string, string> = {};
    for (let round = 0; round < players.length; round++)
      for (const id of [...players.map((p) => p.id), "decoy", "shuffle"])
        ids[`${round}:${id}`] = randomUUID();
    return {
      ...createNetworkState(players, setup, runId, code, ids, history),
      hostFlowVersion: this.hostVersion,
    };
  }
  async guest(
    profile: { name: string; avatar: number; color: string },
    playerId?: string,
  ) {
    if (playerId) {
      await this.db
        .update(t.players)
        .set({ ...profile, updatedAt: new Date() })
        .where(eq(t.players.id, playerId));
      return { playerId };
    }
    const id = randomUUID(),
      token = randomBytes(32).toString("base64url");
    await this.db.transaction(async (tx) => {
      await tx.insert(t.players).values({ id, ...profile });
      await tx.insert(t.deviceSessions).values({
        playerId: id,
        tokenHash: hash(token),
        expiresAt: new Date(this.clock() + 30 * 86400000),
      });
    });
    return { playerId: id, token };
  }
  async authenticate(token?: string) {
    if (!token) return null;
    const [session] = await this.db
      .select()
      .from(t.deviceSessions)
      .where(
        and(
          eq(t.deviceSessions.tokenHash, hash(token)),
          gt(t.deviceSessions.expiresAt, new Date(this.clock())),
        ),
      );
    return session?.playerId ?? null;
  }
  private async profile(tx: Transaction, playerId: string) {
    const [p] = await tx
      .select()
      .from(t.players)
      .where(eq(t.players.id, playerId));
    ensure(p, "AUTH_REQUIRED", "Start a guest session first.", 401);
    return { name: p.name, avatar: p.avatar, color: p.color };
  }
  private roster(members: Loaded["members"], previous?: RunState): Player[] {
    const labels = roomNames(
      members.map((m) => (m.profile as { name: string }).name),
    );
    return members.map((m, index) => {
      const p = m.profile as { name: string; avatar: number; color: string };
      return {
        ...p,
        id: m.id,
        score: 0,
        ready: false,
        host: index === 0,
        controller: "human",
        connected: true,
        disconnectedAt: null,
        returnAfterRound: null,
        aiPoints: 0,
        ...previous?.players.find((p) => p.id === m.id),
        name: labels[index],
        initials: labels[index].slice(0, 2).toUpperCase(),
      };
    });
  }
  async create(playerId: string, setup: Setup) {
    setup = {
      ...setup,
      pace: setup.pace ?? "normal",
      guidedVoice: setup.guidedVoice ?? false,
    };
    const roomId = randomUUID(),
      runId = randomUUID();
    const code = randomBytes(5).toString("hex").slice(0, 6).toUpperCase();
    const now = this.clock();
    await this.db.transaction(async (tx) => {
      const profile = await this.profile(tx, playerId);
      await tx.insert(t.rooms).values({
        id: roomId,
        code,
        setup,
        expiresAt: new Date(now + TWO_HOURS),
      });
      const [member] = await tx
        .insert(t.members)
        .values({ roomId, playerId, profile })
        .returning();
      const state = this.newState(this.roster([member]), setup, runId, code);
      state.players[0].adultConfirmed = setup.adult;
      await this.insertRun(tx, roomId, runId, state, now);
      await tx
        .update(t.rooms)
        .set({ currentRunId: runId })
        .where(eq(t.rooms.id, roomId));
    });
    return { roomId, runId, code };
  }
  private async insertRun(
    tx: Transaction,
    roomId: string,
    runId: string,
    state: RunState,
    now: number,
  ) {
    await tx.insert(t.runs).values({
      id: runId,
      roomId,
      state,
      mode: state.setup.gameMode ?? "spotlight",
      seatCount: state.players.length,
      versions: {
        flow: state.flow,
        rules: state.rules,
        prompt:
          state.flow.version >= 4
            ? "host-v3-spice"
            : state.hostFlowVersion === 2
              ? "host-v2"
              : "host-v1",
        pack: state.flow.packId,
      },
      resumeUntil: new Date(now + TWO_HOURS),
      contentExpiresAt: new Date(now + 7 * 86400000),
    });
  }
  async join(playerId: string, code: string) {
    const [room] = await this.db
      .select()
      .from(t.rooms)
      .where(eq(t.rooms.code, code.toUpperCase()));
    ensure(room, "ROOM_NOT_FOUND", "No active room has that code.", 404);
    await this.db.transaction(async (tx) => {
      const data = await this.load(tx, room.id);
      const [existing] = await tx
        .select()
        .from(t.members)
        .where(
          and(eq(t.members.roomId, room.id), eq(t.members.playerId, playerId)),
        );
      ensure(
        !existing?.removedAt,
        "REMOVED_FROM_ROOM",
        "The room host removed you from this room.",
        403,
      );
      if (data.members.some((m) => m.playerId === playerId)) return;
      ensure(
        activeStep(data.state).type === "lobby",
        "ROSTER_FROZEN",
        "This match has already started.",
        409,
      );
      ensure(
        data.members.length < (data.state.setup.seatCount ?? 5),
        "ROOM_FULL",
        "All seats are reserved.",
        409,
      );
      const [member] = await tx
        .insert(t.members)
        .values({
          roomId: room.id,
          playerId,
          profile: await this.profile(tx, playerId),
        })
        .returning();
      data.members.push(member);
      const state = this.newState(
        this.roster(data.members, data.state),
        data.state.setup,
        data.run.id,
        room.code,
        room.questionHistory as string[],
      );
      state.revision = data.state.revision + 1;
      state.hostFlowVersion = data.state.hostFlowVersion;
      if (data.state.hostFlowVersion !== 2) state.content = data.state.content;
      state.lobbyChat = data.state.lobbyChat;
      state.hostState = data.state.hostState;
      state.hostQuestions = data.state.hostQuestions;
      state.narratedEpoch = data.state.narratedEpoch;
      await this.persist(tx, data, state, "joined");
    });
    this.onChange(room.id);
    return { roomId: room.id, runId: room.currentRunId, code: room.code };
  }
  async summary(code: string) {
    const [room] = await this.db
      .select()
      .from(t.rooms)
      .where(eq(t.rooms.code, code.toUpperCase()));
    ensure(
      room,
      "ROOM_NOT_FOUND",
      "This invitation could not be found. Ask the host for a new link.",
      404,
    );
    ensure(
      room.expiresAt.getTime() > this.clock() &&
        !["ended", "expired"].includes(room.status),
      "ROOM_EXPIRED",
      "That room has ended or expired.",
      410,
    );
    const count = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.members)
      .where(and(eq(t.members.roomId, room.id), isNull(t.members.removedAt)));
    const setup = room.setup as Setup;
    return {
      roomId: room.id,
      code: room.code,
      status: room.status,
      seats: count[0].count,
      capacity: setup.seatCount ?? 5,
      spice: setup.spice,
      hostLanguage: setup.hostLanguage ?? "hinglish",
      guidedVoice: setup.guidedVoice ?? false,
    };
  }
  async recovery(playerId: string) {
    const rows = await this.db
      .select({
        roomId: t.rooms.id,
        code: t.rooms.code,
        status: t.rooms.status,
        expires: t.rooms.expiresAt,
        removed: t.members.removedAt,
        resumeUntil: t.runs.resumeUntil,
      })
      .from(t.members)
      .innerJoin(t.rooms, eq(t.members.roomId, t.rooms.id))
      .leftJoin(t.runs, eq(t.runs.id, t.rooms.currentRunId))
      .where(eq(t.members.playerId, playerId))
      .orderBy(desc(t.rooms.updatedAt));
    const active = (r: (typeof rows)[number]) =>
      !r.removed &&
      !["ended", "expired"].includes(r.status) &&
      r.expires.getTime() > this.clock() &&
      (r.resumeUntil?.getTime() ?? 0) > this.clock();
    return {
      rooms: rows
        .filter(active)
        .map((r) => ({ roomId: r.roomId, code: r.code, status: r.status })),
      notices: rows
        .filter((r) => !active(r))
        .map((r) => ({
          roomId: r.roomId,
          code: r.removed ? "REMOVED_FROM_ROOM" : "ROOM_EXPIRED",
          message: r.removed
            ? "The host removed you from your previous room."
            : "Your previous room has ended or expired.",
        })),
    };
  }
  async load(tx: Transaction, roomId: string): Promise<Loaded> {
    const [room] = await tx
      .select()
      .from(t.rooms)
      .where(eq(t.rooms.id, roomId))
      .for("update");
    ensure(room?.currentRunId, "ROOM_NOT_FOUND", "Room unavailable.", 404);
    const [run] = await tx
      .select()
      .from(t.runs)
      .where(eq(t.runs.id, room.currentRunId));
    ensure(
      run?.state &&
        run.resumeUntil.getTime() > this.clock() &&
        room.status !== "ended",
      "ROOM_EXPIRED",
      "This room has ended or its resume window expired.",
      410,
    );
    const members = await tx
      .select()
      .from(t.members)
      .where(eq(t.members.roomId, roomId))
      .orderBy(asc(t.members.createdAt));
    return {
      room,
      run,
      state: run.state as RunState,
      members: members.filter((m) => !m.removedAt),
      removedPlayerIds: members
        .filter((m) => m.removedAt)
        .map((m) => m.playerId),
    };
  }
  private member(data: Loaded, playerId: string) {
    ensure(
      !data.removedPlayerIds?.includes(playerId),
      "REMOVED_FROM_ROOM",
      "The host removed you from your previous room.",
      403,
    );
    const member = data.members.find((m) => m.playerId === playerId);
    ensure(
      member,
      "NOT_A_MEMBER",
      "You no longer have a seat in this room. The room host may have removed you.",
      403,
    );
    return member;
  }
  async current(playerId: string, roomId: string) {
    return this.db.transaction(async (tx) => {
      const data = await this.load(tx, roomId);
      const [membership] = await tx
        .select()
        .from(t.members)
        .where(
          and(eq(t.members.roomId, roomId), eq(t.members.playerId, playerId)),
        );
      ensure(
        !membership?.removedAt,
        "REMOVED_FROM_ROOM",
        "The host removed you from your previous room.",
        403,
      );
      const member = this.member(data, playerId);
      return {
        roomId,
        runId: data.run.id,
        seatId: member.id,
        code: data.room.code,
      };
    });
  }
  async connect(
    playerId: string,
    roomId: string,
    connectionId: string,
    takeover: boolean,
  ) {
    const result = await this.db.transaction(async (tx) => {
      const data = await this.load(tx, roomId);
      const m = this.member(data, playerId);
      ensure(
        !m.connectionId || m.leaseUntil!.getTime() < this.clock() || takeover,
        "SEAT_IN_USE",
        "This seat is active in another tab. Take control to move it here.",
        409,
      );
      await tx
        .update(t.members)
        .set({
          connectionId,
          leaseUntil: new Date(this.clock() + 30000),
          updatedAt: new Date(),
        })
        .where(eq(t.members.id, m.id));
      let state = this.catchUp(data.state);
      state = setPresence(state, m.id, true, this.clock());
      if (state.revision !== data.state.revision)
        await this.persist(tx, data, state, "connected");
      return {
        seatId: m.id,
        runId: data.run.id,
        oldConnectionId: m.connectionId,
      };
    });
    this.onChange(roomId);
    return result;
  }
  async heartbeat(roomId: string, seatId: string, connectionId: string) {
    const rows = await this.db
      .update(t.members)
      .set({ leaseUntil: new Date(this.clock() + 30000) })
      .where(
        and(
          eq(t.members.roomId, roomId),
          eq(t.members.id, seatId),
          eq(t.members.connectionId, connectionId),
          isNull(t.members.removedAt),
        ),
      )
      .returning({ id: t.members.id });
    return !!rows.length;
  }
  async disconnect(roomId: string, seatId: string, connectionId?: string) {
    try {
      await this.db.transaction(async (tx) => {
        const data = await this.load(tx, roomId);
        const m = data.members.find((m) => m.id === seatId);
        if (!m || (connectionId && m.connectionId !== connectionId)) return;
        await tx
          .update(t.members)
          .set({ connectionId: null, leaseUntil: null })
          .where(eq(t.members.id, seatId));
        const state = setPresence(
          data.state,
          seatId,
          false,
          this.clock(),
        ) as RunState;
        if (state.hostState?.speakingSeat === seatId)
          releaseHostConversation(state, this.clock());
        if (state !== data.state)
          await this.persist(tx, data, state, "disconnected");
      });
      this.onChange(roomId);
    } catch (error) {
      if (!(error instanceof AppError && error.status === 410)) throw error;
    }
  }
  async leave(playerId: string, roomId: string) {
    const { seatId } = await this.current(playerId, roomId);
    await this.disconnect(roomId, seatId);
  }
  async end(playerId: string, roomId: string) {
    await this.db.transaction(async (tx) => {
      const data = await this.load(tx, roomId);
      const m = this.member(data, playerId);
      ensure(
        data.state.players.find((p) => p.id === m.id)?.host,
        "HOST_ONLY",
        "Only the host can end the match.",
        403,
      );
      await tx
        .update(t.rooms)
        .set({
          status: "ended",
          hostMemory: [],
          questionHistory: [],
          expiresAt: new Date(this.clock()),
        })
        .where(eq(t.rooms.id, roomId));
      await tx
        .update(t.runs)
        .set({ status: "ended", resumeUntil: new Date(this.clock()) })
        .where(eq(t.runs.id, data.run.id));
    });
    this.onChange(roomId);
  }
  catchUp(previous: RunState): RunState {
    let state = previous;
    const narration = state.narration;
    if (
      narration &&
      narration.epoch === state.phaseEpoch &&
      narration.status !== "done"
    ) {
      const now = this.clock();
      if (
        ["pending", "generating"].includes(narration.status) &&
        narration.generationDeadline <= now
      ) {
        state = structuredClone(state);
        state.narration!.status = "presenting";
        state.narration!.text ||= questionNarration(
          project(state, state.players[0].id),
        );
        state.narration!.opensAt = narration.generationDeadline + 5000;
        state.deadline =
          state.narration!.opensAt + activeStep(state).durationMs;
        state.revision++;
      }
      if (state.narration!.opensAt > now) return state;
      state = structuredClone(state);
      state.narration!.status = "done";
      state.startedAt = state.narration!.opensAt;
      state.revision++;
    }
    if (
      state.hostBeat &&
      state.hostBeat.status !== "done" &&
      state.hostBeat.epoch === state.phaseEpoch
    ) {
      if (state.hostBeat.deadline > this.clock()) return state;
      state = finishBeat(structuredClone(state), this.clock());
    }
    if (
      state.deadline &&
      state.deadline <= this.clock() &&
      state.voiceGraceEpoch !== state.phaseEpoch &&
      Object.values(state.voicePending ?? {}).some(
        (epoch) => epoch === state.phaseEpoch,
      )
    ) {
      state = structuredClone(state);
      state.voiceGraceEpoch = state.phaseEpoch;
      state.deadline = (state.deadline ?? this.clock()) + 15000;
      state.revision++;
    }
    const host = state.hostState;
    if (host?.deadline) {
      if (host.deadline > this.clock()) return state;
      state = structuredClone(state);
      releaseHostConversation(state, this.clock(), true);
      state.revision++;
    }
    if (state.deadline && state.deadline <= this.clock()) {
      state = structuredClone(state);
      for (const seatId of requiredActors(state)) {
        if (!project(state, seatId).view.actionPending) continue;
        const key = `${state.phaseEpoch}:${seatId}`;
        (state.inputOutcomes ??= {})[key] ??= {
          seatId,
          stepId: activeStep(state).id,
          epoch: state.phaseEpoch,
          outcome: "timeout",
        };
      }
    }
    state = simulateUntil(state, this.clock(), state.players[0].id);
    if (
      activeStep(state).type === "card" &&
      state.network &&
      state.players.every(
        (p) =>
          p.controller !== "human" ||
          !p.connected ||
          state.cardDecisions?.[p.id],
      )
    ) {
      state = structuredClone(state);
      state.stepIndex++;
      state.phaseEpoch++;
      state.revision++;
      state.deadline = null;
    }
    return state;
  }
  async tick(roomId: string) {
    try {
      let hostDue = false;
      const changed = await this.db.transaction(async (tx) => {
        const data = await this.load(tx, roomId);
        let state = data.state;
        for (const m of data.members)
          if (
            m.connectionId &&
            m.leaseUntil &&
            m.leaseUntil.getTime() < this.clock()
          ) {
            await tx
              .update(t.members)
              .set({ connectionId: null, leaseUntil: null })
              .where(eq(t.members.id, m.id));
            state = setPresence(state, m.id, false, this.clock());
            if (state.hostState?.speakingSeat === m.id)
              releaseHostConversation(state, this.clock());
          }
        state = this.catchUp(state);
        hostDue =
          hostWorkDue(state, this.clock()) ||
          state.narration?.status === "pending";
        if (state.revision === data.state.revision) return false;
        await this.persist(tx, data, state, "clock");
        return true;
      });
      if (changed) this.onChange(roomId);
      if (hostDue) this.onTick(roomId);
    } catch (error) {
      if (!(error instanceof AppError && error.status === 410)) throw error;
    }
  }
  private projectFor(data: Loaded, playerId: string) {
    const m = this.member(data, playerId);
    const view = project(data.state, m.id);
    view.protocol_version = 5;
    view.online = true;
    view.hostFlowVersion = data.state.hostFlowVersion;
    view.narration = data.state.narration;
    if (
      view.narration?.epoch === view.phaseEpoch &&
      view.narration.status !== "done"
    )
      view.paused = true;
    view.remainingRecordings = Math.max(
      0,
      2 -
        (data.state.recordings?.[`${data.state.phaseEpoch}:${m.id}:answer`] ??
          0),
    );
    const beat = data.state.hostBeat;
    if (beat && beat.epoch === data.state.phaseEpoch) {
      view.hostBeat = {
        id: beat.id,
        stage: beat.stage,
        status: beat.status,
        text: beat.text,
        audioUrl: beat.audioUrl,
        playbackSeat: beat.playbackSeat,
        invitedSeat: beat.invitedSeat,
        deadline: beat.deadline,
        replyDeadline: beat.replyDeadline,
        turn: beat.turn,
        remainingRecordings: Math.max(
          0,
          2 -
            (data.state.recordings?.[`${beat.id}:${beat.turn}:${m.id}:host`] ??
              0),
        ),
      };
      if (beat.status !== "done") {
        view.paused = true;
        view.view.actionPending = false;
      }
      view.hostBeat.replies = beat.replies.map((reply) => ({ ...reply }));
    }
    if (
      ["reveal", "spotlight-reveal", "story", "summary"].includes(
        activeStep(data.state).type,
      )
    )
      view.revealedSources = (data.state.answerSources ?? []).filter(
        (source) => {
          const round = data.state.flow.steps.find(
            (step) => step.id === source.stepId,
          )?.params.round;
          return (
            round == null ||
            data.state.spotlights[round]?.scored ||
            data.state.rounds[round]?.scored
          );
        },
      );
    view.lobbyChat = ["lobby", "summary"].includes(activeStep(data.state).type)
      ? (data.state.lobbyChat ?? []).map((message) => ({
          ...message,
          name:
            data.state.players.find((p) => p.id === message.seatId)?.name ??
            message.name,
        }))
      : [];
    view.serverTime = this.clock();
    view.canAskHost =
      data.state.hostFlowVersion !== 2 &&
      !data.state.hostQuestions?.includes(data.state.phaseEpoch);
    const host = data.state.hostState;
    if (host && host.epoch === data.state.phaseEpoch)
      view.host = {
        id: host.id,
        text: host.text,
        audioUrl: host.audioUrl,
        speakingSeat: host.speakingSeat,
        deadline: host.deadline,
        playbackSeat: host.playbackSeat,
      };
    view.animateTransition = true;
    if (activeStep(data.state).type === "card")
      view.view.submitted = Boolean(data.state.cardDecisions?.[m.id]);
    return NetworkSnapshotSchema.parse(view);
  }
  async snapshot(playerId: string, roomId: string) {
    return this.db.transaction(async (tx) =>
      this.projectFor(await this.load(tx, roomId), playerId),
    );
  }
  /** One committed load and room lock; authorization remains per recipient. */
  async snapshots(
    roomId: string,
    recipients: { playerId: string; id: string }[],
  ) {
    return this.db.transaction(async (tx) => {
      const data = await this.load(tx, roomId);
      return recipients.map(({ playerId, id }) => {
        try {
          const member = this.member(data, playerId);
          ensure(
            member.connectionId === id,
            "SEAT_IN_USE",
            "This tab no longer controls the seat.",
            409,
          );
          return {
            id,
            snapshot: this.projectFor(data, playerId),
            error: undefined,
          };
        } catch (error) {
          return { id, snapshot: undefined, error };
        }
      });
    });
  }
  async intent(
    roomId: string,
    seatId: string,
    connectionId: string,
    runId: string,
    intent: Intent,
  ): Promise<Ack> {
    const result = await this.db.transaction(async (tx) => {
      const data = await this.load(tx, roomId);
      const member = data.members.find((m) => m.id === seatId);
      ensure(
        member?.connectionId === connectionId,
        "SEAT_IN_USE",
        "This connection no longer controls the seat.",
        409,
      );
      ensure(
        runId === data.run.id,
        "STALE_MATCH",
        "This match has been replaced.",
        409,
      );
      const bodyHash = hash(JSON.stringify(intent));
      const [receipt] = await tx
        .select()
        .from(t.receipts)
        .where(
          and(
            eq(t.receipts.runId, runId),
            eq(t.receipts.seatId, seatId),
            eq(t.receipts.cid, intent.cid),
          ),
        );
      if (receipt) {
        ensure(
          receipt.bodyHash === bodyHash,
          "ID_REUSED",
          "An action ID was reused for different content.",
          409,
        );
        return receipt.ack as Ack;
      }
      let state = this.catchUp(data.state);
      const current = activeStep(state);
      let rejection: string | undefined;
      if (
        current.id !== intent.stepId ||
        state.phaseEpoch !== intent.phaseEpoch
      )
        rejection = "That phase has already ended.";
      const actor = state.players.find((p) => p.id === seatId)!;
      if (actor.controller !== "human" || !actor.connected)
        rejection = "The stand-in has control until the next question.";
      if (
        (["next", "restart"].includes(intent.type) ||
          (intent.type === "skip" &&
            [
              "waiting",
              "reveal",
              "spotlight-reveal",
              "sync-revealed",
              "story",
              "verdict",
            ].includes(current.type))) &&
        !actor.host
      )
        rejection = "Only the host can continue the room.";
      if (
        (state.hostState?.deadline ||
          checkpoint(state) ||
          (state.hostBeat &&
            state.hostBeat.status !== "done" &&
            state.hostBeat.epoch === state.phaseEpoch)) &&
        ![
          "chat",
          "ready",
          "kick",
          "adult.confirm",
          "appearance.update",
          "settings.update",
        ].includes(intent.type)
      )
        rejection = "Wait for the host conversation to finish.";
      if (
        state.narration?.epoch === state.phaseEpoch &&
        state.narration.status !== "done"
      )
        rejection =
          "Listen to the question first. Your answer time starts next.";
      if (intent.type === "settings.update") {
        if (!actor.host || current.type !== "lobby")
          rejection = "Only the owner can change settings in the lobby.";
        else if (intent.spice === "spicy" && !intent.adult)
          rejection = "Confirm you are 18+ to choose Spicy.";
      }
      if (
        intent.type === "appearance.update" &&
        !["lobby", "summary"].includes(current.type)
      )
        rejection = "Change your character in the lobby.";
      if (intent.type === "adult.confirm" && current.type !== "lobby")
        rejection = "Confirm in the lobby.";
      if (
        intent.type === "ready" &&
        intent.ready &&
        state.flow.version >= 4 &&
        state.setup.spice === "spicy" &&
        !actor.adultConfirmed
      )
        rejection = "Confirm you are 18+ before getting ready.";
      if (intent.type === "kick") {
        if (!actor.host) rejection = "Only the room host can remove a player.";
        else if (current.type !== "lobby")
          rejection = "Players can only be removed before the game starts.";
        else if (intent.playerId === seatId)
          rejection = "You cannot remove yourself.";
        else if (!state.players.some((p) => p.id === intent.playerId))
          rejection = "That player has already left the room.";
      }
      if (intent.type === "chat") {
        if (!["lobby", "summary"].includes(current.type))
          rejection = "Chat is available before and after the game.";
        if (
          (state.lobbyChat ?? []).filter(
            (m) => m.seatId === seatId && m.sentAt > this.clock() - 10000,
          ).length >= 5
        )
          rejection = "Give the squad a moment. Try again in a few seconds.";
      }
      if (
        intent.type === "start" &&
        state.players.length !== (state.setup.seatCount ?? 5)
      )
        rejection = "Wait for every reserved seat to join.";
      if (
        intent.type === "restart" &&
        current.type === "summary" &&
        !rejection
      ) {
        const id = randomUUID();
        const next = this.newState(
          state.players.map((p) => ({
            ...p,
            score: 0,
            aiPoints: 0,
            ready: false,
            controller: p.connected ? "human" : "ai",
          })),
          { ...state.setup, pace: state.setup.pace ?? "normal" },
          id,
          state.roomCode,
          data.room.questionHistory as string[],
        );
        next.lobbyChat = state.lobbyChat;
        await this.insertRun(tx, roomId, id, next, this.clock());
        await tx
          .update(t.rooms)
          .set({
            currentRunId: id,
            status: "lobby",
            expiresAt: new Date(this.clock() + TWO_HOURS),
          })
          .where(eq(t.rooms.id, roomId));
        const ack: Ack = {
          type: "ack",
          cid: intent.cid,
          revision: next.revision,
          accepted: true,
        };
        await tx
          .insert(t.receipts)
          .values({ runId, seatId, cid: intent.cid, bodyHash, ack });
        return ack;
      }
      let next = rejection
        ? state
        : intent.type === "chat"
          ? {
              ...state,
              notice: null,
              revision: state.revision + 1,
              lobbyChat: [
                ...(state.lobbyChat ?? []),
                {
                  id: `${seatId}:${intent.cid}`,
                  seatId,
                  name: actor.name,
                  text: intent.text,
                  sentAt: this.clock(),
                },
              ].slice(-50),
            }
          : (reduceIntent(state, intent, this.clock(), seatId) as RunState);
      if (!rejection && intent.type === "appearance.update") {
        await tx
          .update(t.members)
          .set({
            profile: {
              ...(member.profile as object),
              avatar: intent.avatar,
              color: intent.color,
            },
          })
          .where(eq(t.members.id, seatId));
        await tx
          .update(t.players)
          .set({ avatar: intent.avatar, color: intent.color })
          .where(eq(t.players.id, member.playerId));
      }
      if (!rejection && intent.type === "settings.update") {
        await tx
          .update(t.rooms)
          .set({ setup: next.setup })
          .where(eq(t.rooms.id, roomId));
      }
      if (!rejection && intent.type === "kick") {
        await tx
          .update(t.members)
          .set({
            removedAt: new Date(this.clock()),
            connectionId: null,
            leaseUntil: null,
          })
          .where(
            and(
              eq(t.members.roomId, roomId),
              eq(t.members.id, intent.playerId),
            ),
          );
        next = this.newState(
          state.players.filter((p) => p.id !== intent.playerId),
          state.setup,
          runId,
          state.roomCode,
          data.room.questionHistory as string[],
        );
        next.revision = state.revision + 1;
        next.hostFlowVersion = state.hostFlowVersion;
        if (state.hostFlowVersion !== 2) next.content = state.content;
        next.phaseEpoch = state.phaseEpoch;
        next.lobbyChat = state.lobbyChat;
        next.hostQuestions = state.hostQuestions;
        next.hostState = state.hostState;
        next.narratedEpoch = state.narratedEpoch;
        if (next.hostState?.speakingSeat === intent.playerId)
          releaseHostConversation(next, this.clock());
      }
      if (
        !rejection &&
        next.notice &&
        !(intent.type === "veto" && next.phaseEpoch !== state.phaseEpoch)
      )
        rejection = next.notice;
      if (!rejection && next === state)
        rejection = "This action has already been completed.";
      if (!rejection) {
        state = next;
        if (intent.type === "submit" && intent.original && intent.language)
          (state.answerSources ??= []).push({
            original: intent.original,
            language: intent.language,
            text: intent.text,
            stepId: intent.stepId,
            seatId,
            epoch: intent.phaseEpoch ?? 0,
          });
        if (state.voicePending) delete state.voicePending[seatId];
        if (state.voiceCaptureIds) delete state.voiceCaptureIds[seatId];
        if (intent.type === "submit" || intent.type === "skip")
          (state.inputOutcomes ??= {})[`${intent.phaseEpoch}:${seatId}`] = {
            seatId,
            stepId: intent.stepId,
            epoch: intent.phaseEpoch ?? 0,
            outcome: intent.type === "submit" ? "answer" : "pass",
          };
        await this.persistAction(tx, runId, seatId, intent, state);
      }
      if (state.revision !== data.state.revision)
        await this.persist(tx, data, state, rejection ? "clock" : "intent");
      const ack: Ack = {
        type: "ack",
        cid: intent.cid,
        revision: state.revision,
        accepted: !rejection,
        ...(rejection ? { code: "ACTION_REJECTED", message: rejection } : {}),
      };
      await tx
        .insert(t.receipts)
        .values({ runId, seatId, cid: intent.cid, bodyHash, ack });
      return ack;
    });
    this.onChange(roomId);
    return result;
  }
  private async persistAction(
    tx: Transaction,
    runId: string,
    seatId: string,
    intent: Intent,
    state: RunState,
  ) {
    if (
      ["submit", "traits", "nominate", "predict", "skip"].includes(intent.type)
    )
      await tx
        .insert(t.submissions)
        .values({
          runId,
          seatId,
          stepId: intent.stepId,
          epoch: intent.phaseEpoch ?? 0,
          kind: intent.type,
          payload: intent,
        })
        .onConflictDoNothing();
    if (intent.type === "vote")
      await tx
        .insert(t.votes)
        .values({
          runId,
          seatId,
          stepId: intent.stepId,
          epoch: intent.phaseEpoch ?? 0,
          optionId: intent.optionId,
        })
        .onConflictDoNothing();
    if (intent.type === "traits")
      for (const [targetId, values] of [
        [seatId, intent.self],
        [friendTarget(state, seatId), intent.friend],
      ] as const)
        await tx
          .insert(t.ratings)
          .values({ runId, raterId: seatId, targetId, values })
          .onConflictDoUpdate({
            target: [t.ratings.runId, t.ratings.raterId, t.ratings.targetId],
            set: { values },
          });
  }
  async persist(tx: Transaction, data: Loaded, state: RunState, type: string) {
    const phase = activeStep(state);
    const status =
      phase.type === "summary"
        ? "completed"
        : phase.type === "lobby"
          ? "lobby"
          : "playing";
    await tx
      .update(t.runs)
      .set({
        state,
        revision: state.revision,
        status,
        seatCount: state.players.length,
        startedAt:
          data.run.startedAt ?? (phase.act > 0 ? new Date(this.clock()) : null),
        departurePhase:
          data.run.departurePhase ??
          (phase.act > 0 &&
          phase.type !== "summary" &&
          state.players.some((p) => !p.connected)
            ? phase.type
            : null),
        versions: {
          flow: state.flow,
          rules: state.rules,
          prompt:
            state.flow.version >= 4
              ? "host-v3-spice"
              : state.hostFlowVersion === 2
                ? "host-v2"
                : "host-v1",
          pack: state.flow.packId,
        },
        deadline: state.deadline ? new Date(state.deadline) : null,
        completedAt:
          status === "completed"
            ? (data.run.completedAt ?? new Date(this.clock()))
            : null,
        updatedAt: new Date(),
      })
      .where(eq(t.runs.id, data.run.id));
    await tx
      .update(t.rooms)
      .set({
        status,
        questionHistory: [
          ...new Set([
            ...(data.room.questionHistory as string[]),
            ...(state.questionHistory ?? []),
          ]),
        ].slice(-512),
        updatedAt: new Date(),
      })
      .where(eq(t.rooms.id, data.room.id));
    await tx
      .insert(t.events)
      .values({
        runId: data.run.id,
        seq: state.revision,
        type,
        payload: {
          stepId: phase.id,
          epoch: state.phaseEpoch,
          deadline: state.deadline,
        },
      })
      .onConflictDoNothing();
    for (const [i, e] of state.scores.entries())
      await tx
        .insert(t.scores)
        .values({
          runId: data.run.id,
          eventKey: `${e.round}:${e.playerId}:${e.rule}:${i}`,
          seatId: e.playerId,
          roundIndex: e.round,
          rule: e.rule,
          points: e.points,
          controller: e.controller ?? "human",
        })
        .onConflictDoNothing();
    for (const [index, payload] of Object.entries({
      ...state.rounds,
      ...state.spotlights,
    }))
      await tx
        .insert(t.rounds)
        .values({
          runId: data.run.id,
          roundIndex: Number(index),
          kind: state.setup.gameMode ?? "bluff",
          payload,
        })
        .onConflictDoUpdate({
          target: [t.rounds.runId, t.rounds.roundIndex],
          set: { payload },
        });
    if (["card", "summary"].includes(phase.type))
      for (const p of state.players)
        await tx
          .insert(t.cards)
          .values({
            runId: data.run.id,
            subjectId: p.id,
            payload: friendCard(state, p.id),
            approvedAt: state.approved.includes(p.id)
              ? new Date(this.clock())
              : null,
          })
          .onConflictDoUpdate({
            target: [t.cards.runId, t.cards.subjectId],
            set: {
              payload: friendCard(state, p.id),
              approvedAt: state.approved.includes(p.id)
                ? new Date(this.clock())
                : null,
            },
          });
  }
}
