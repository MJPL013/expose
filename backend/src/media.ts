import {
  mkdir,
  readFile,
  writeFile,
  unlink,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq, desc, gt, isNull } from "drizzle-orm";
import type { Database } from "./db/client";
import * as t from "./db/schema";
import { ensure } from "./errors";
import { type EngineState } from "@expose/shared/game/engine";

export interface MediaStorage {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  prune?(known: Set<string>, olderThan: number): Promise<void>;
}
export class PrivateFilesystem implements MediaStorage {
  constructor(private root: string) {}
  private file(key: string) {
    ensure(
      /^[a-f0-9-]+\.bin$/.test(key),
      "INVALID_MEDIA",
      "Invalid storage key.",
    );
    return path.join(this.root, key);
  }
  async put(key: string, bytes: Buffer) {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.file(key), bytes, { flag: "wx" });
  }
  get(key: string) {
    return readFile(this.file(key));
  }
  async delete(key: string) {
    await unlink(this.file(key)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
  async prune(known: Set<string>, olderThan: number) {
    const keys = await readdir(this.root).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const key of keys) {
      if (!/^[a-f0-9-]+\.bin$/.test(key) || known.has(key)) continue;
      const info = await stat(this.file(key));
      if (info.isFile() && info.mtimeMs < olderThan) await this.delete(key);
    }
  }
}
export class MediaService {
  onChange: (runId: string) => Promise<void> = async () => {};
  private async changed(runId: string) {
    // Reconnect/phase entry revalidates if notification delivery fails.
    await this.onChange(runId).catch(() => {});
  }
  constructor(
    readonly db: Database,
    readonly storage: MediaStorage,
  ) {}
  async upload(
    playerId: string,
    roomId: string,
    input: {
      runId: string;
      stepId: string;
      phaseEpoch: number;
      audio: string;
      reveal: true;
    },
  ) {
    const [run] = await this.db
      .select()
      .from(t.runs)
      .where(
        and(
          eq(t.runs.id, input.runId),
          eq(t.runs.roomId, roomId),
          gt(t.runs.resumeUntil, new Date()),
        ),
      );
    ensure(run?.state, "MATCH_EXPIRED", "This match has expired.", 410);
    const [member] = await this.db
      .select()
      .from(t.members)
      .where(
        and(
          eq(t.members.roomId, roomId),
          eq(t.members.playerId, playerId),
          isNull(t.members.removedAt),
        ),
      );
    ensure(member, "NOT_A_MEMBER", "You do not own a seat in this room.", 403);
    const [submission] = await this.db
      .select()
      .from(t.submissions)
      .where(
        and(
          eq(t.submissions.runId, run.id),
          eq(t.submissions.seatId, member.id),
          eq(t.submissions.stepId, input.stepId),
          eq(t.submissions.epoch, input.phaseEpoch),
          eq(t.submissions.kind, "submit"),
        ),
      );
    ensure(
      submission,
      "ANSWER_NOT_LOCKED",
      "Lock your answer before sharing a clip.",
      409,
    );
    const bytes = Buffer.from(input.audio, "base64");
    ensure(
      bytes.length >= 44 &&
        bytes.length <= 270000 &&
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WAVE" &&
        bytes.readUInt16LE(20) === 1 &&
        bytes.readUInt16LE(22) === 1 &&
        bytes.readUInt32LE(24) === 16000 &&
        bytes.readUInt16LE(34) === 16 &&
        bytes.readUInt32LE(40) === bytes.length - 44,
      "INVALID_AUDIO",
      "Expected a short mono PCM16 WAV recording.",
    );
    const id = await this.save({
      runId: run.id,
      ownerId: member.id,
      stepId: input.stepId,
      epoch: input.phaseEpoch,
      kind: "clip",
      bytes,
      mime: "audio/wav",
      durationMs: Math.round((bytes.length - 44) / 32),
      expiresAt: run.resumeUntil,
    });
    await this.consent(playerId, id, true, false);
    return { id };
  }
  private async revealed(
    asset: typeof t.media.$inferSelect,
    state: EngineState,
  ) {
    if (asset.kind !== "clip" || !asset.revealConsent || !asset.ownerId)
      return false;
    if (!state.completed[asset.stepId]?.includes(asset.ownerId)) return false;
    const [latest] = await this.db
      .select({ epoch: t.submissions.epoch })
      .from(t.submissions)
      .where(
        and(
          eq(t.submissions.runId, asset.runId),
          eq(t.submissions.seatId, asset.ownerId),
          eq(t.submissions.stepId, asset.stepId),
        ),
      )
      .orderBy(desc(t.submissions.epoch))
      .limit(1);
    if (latest?.epoch !== asset.epoch) return false;
    const source = state.flow.steps.find((s) => s.id === asset.stepId);
    if (!source) return false;
    const revealIndex = state.flow.steps.findIndex((s) =>
      source.params.round !== undefined
        ? s.params.round === source.params.round &&
          ["reveal", "spotlight-reveal"].includes(s.type)
        : s.type === "story",
    );
    return revealIndex >= 0 && state.stepIndex >= revealIndex;
  }
  async list(playerId: string, roomId: string) {
    const [member] = await this.db
      .select()
      .from(t.members)
      .where(
        and(
          eq(t.members.roomId, roomId),
          eq(t.members.playerId, playerId),
          isNull(t.members.removedAt),
        ),
      );
    ensure(member, "NOT_A_MEMBER", "Room membership required.", 403);
    const [room] = await this.db
      .select()
      .from(t.rooms)
      .where(eq(t.rooms.id, roomId));
    const [run] = await this.db
      .select()
      .from(t.runs)
      .where(eq(t.runs.id, room.currentRunId!));
    ensure(
      run?.state && run.resumeUntil.getTime() > Date.now(),
      "MATCH_EXPIRED",
      "This match has expired.",
      410,
    );
    const assets = await this.db
      .select()
      .from(t.media)
      .where(
        and(
          eq(t.media.runId, run.id),
          eq(t.media.kind, "clip"),
          gt(t.media.expiresAt, new Date()),
        ),
      );
    const visible = [];
    for (const asset of assets)
      if (await this.revealed(asset, run.state as EngineState))
        visible.push({
          id: asset.id,
          ownerId: asset.ownerId,
          stepId: asset.stepId,
          url: `/api/v1/media/${asset.id}`,
        });
    return visible;
  }
  async save(input: {
    runId: string;
    ownerId: string | null;
    stepId: string;
    epoch: number;
    kind: "clip" | "diagnostic" | "host";
    bytes: Buffer;
    mime: string;
    durationMs: number;
    expiresAt: Date;
    diagnosticConsent?: boolean;
  }) {
    const id = randomUUID(),
      key = `${id}.bin`;
    await this.storage.put(key, input.bytes);
    try {
      await this.db.insert(t.media).values({
        id,
        runId: input.runId,
        ownerId: input.ownerId,
        stepId: input.stepId,
        epoch: input.epoch,
        kind: input.kind,
        storageKey: key,
        mime: input.mime,
        bytes: input.bytes.length,
        durationMs: input.durationMs,
        expiresAt: input.expiresAt,
        diagnosticConsent: input.diagnosticConsent ?? false,
      });
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }
    return id;
  }
  async authorize(playerId: string, id: string, ownerOnly = false) {
    const [asset] = await this.db
      .select()
      .from(t.media)
      .where(eq(t.media.id, id));
    ensure(
      asset && asset.expiresAt.getTime() > Date.now(),
      "MEDIA_EXPIRED",
      "This recording has expired.",
      404,
    );
    const [run] = await this.db
      .select()
      .from(t.runs)
      .where(eq(t.runs.id, asset.runId));
    ensure(run?.state, "MEDIA_EXPIRED", "This recording is unavailable.", 404);
    ensure(
      asset.kind === "diagnostic" || run.resumeUntil.getTime() > Date.now(),
      "MEDIA_EXPIRED",
      "This match recording has expired.",
      404,
    );
    const [member] = await this.db
      .select()
      .from(t.members)
      .where(
        and(
          eq(t.members.roomId, run.roomId),
          eq(t.members.playerId, playerId),
          isNull(t.members.removedAt),
        ),
      );
    ensure(member, "NOT_A_MEMBER", "This recording is private.", 403);
    const owner = asset.ownerId === member.id;
    if (ownerOnly) {
      ensure(
        owner,
        "OWNER_ONLY",
        "Only the recording’s owner can change consent.",
        403,
      );
      return asset;
    }
    const state = run.state as EngineState;
    const revealed = await this.revealed(asset, state);
    ensure(
      owner ||
        asset.kind === "host" ||
        (asset.revealConsent && asset.kind !== "diagnostic" && revealed),
      "MEDIA_PRIVATE",
      "This recording is private until its owner consents and answers are revealed.",
      403,
    );
    return asset;
  }
  async get(playerId: string, id: string) {
    const asset = await this.authorize(playerId, id);
    return { asset, bytes: await this.storage.get(asset.storageKey) };
  }
  async consent(
    playerId: string,
    id: string,
    reveal: boolean,
    diagnostic: boolean,
  ) {
    const asset = await this.authorize(playerId, id, true);
    await this.db.transaction(async (tx) => {
      await tx
        .update(t.media)
        .set({
          revealConsent: reveal,
          diagnosticConsent: diagnostic,
          updatedAt: new Date(),
        })
        .where(eq(t.media.id, id));
      for (const [scope, granted] of [
        ["reveal", reveal],
        ["diagnostic", diagnostic],
      ] as const)
        await tx
          .insert(t.consents)
          .values({ playerId, mediaId: id, scope, granted });
    });
    if (!diagnostic)
      await this.db
        .update(t.evaluations)
        .set({ status: "cancel-requested", result: null })
        .where(eq(t.evaluations.mediaId, id));
    await this.changed(asset.runId);
    return { reveal, diagnostic };
  }
  async delete(playerId: string, id: string) {
    const asset = await this.authorize(playerId, id, true);
    await this.remove(asset);
  }
  async remove(asset: typeof t.media.$inferSelect) {
    await this.storage.delete(asset.storageKey);
    await this.db.transaction(async (tx) => {
      // Preserve the provider job ID until the cancellation worker reconciles it.
      await tx
        .update(t.evaluations)
        .set({ mediaId: null, result: null, status: "cancel-requested" })
        .where(eq(t.evaluations.mediaId, asset.id));
      await tx.delete(t.media).where(eq(t.media.id, asset.id));
    });
    await this.changed(asset.runId);
  }
}

export function pcmWav(pcm: Buffer, sampleRate = 16000) {
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
