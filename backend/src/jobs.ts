import { PgBoss } from "pg-boss";
import { and, eq, gt, lt, ne, isNotNull } from "drizzle-orm";
import type { Database } from "./db/client";
import * as t from "./db/schema";
import { Rooms } from "./rooms";
import { MediaService } from "./media";
import { BatchService } from "./batch";
import { startVoidJobs } from "../gc2/jobs";
import type { VoidService } from "../gc2/service";

export async function purge(
  db: Database,
  media: MediaService,
  batch: BatchService,
  now = new Date(),
) {
  await batch.expire();
  await db
    .update(t.rooms)
    .set({ hostMemory: [], questionHistory: [] })
    .where(lt(t.rooms.expiresAt, now));
  const expiredMedia = await db
    .select()
    .from(t.media)
    .where(lt(t.media.expiresAt, now));
  for (const asset of expiredMedia) await media.remove(asset);
  if (media.storage.prune) {
    const known = await db.select({ key: t.media.storageKey }).from(t.media);
    await media.storage.prune(
      new Set(known.map((m) => m.key)),
      now.getTime() - 3600000,
    );
  }
  const expired = await db
    .select({ id: t.runs.id, roomId: t.runs.roomId })
    .from(t.runs)
    .where(and(lt(t.runs.contentExpiresAt, now), isNotNull(t.runs.state)));
  for (const run of expired)
    await db.transaction(async (tx) => {
      await tx
        .update(t.runs)
        .set({ state: null, versions: { purged: true }, deadline: null })
        .where(eq(t.runs.id, run.id));
      for (const table of [
        t.rounds,
        t.submissions,
        t.votes,
        t.ratings,
        t.scores,
        t.cards,
        t.receipts,
        t.events,
        t.evaluations,
      ])
        await tx.delete(table).where(eq(table.runId, run.id));
      // Profile copies are content too. Guest profile preferences stay with the device identity.
      const remaining = await tx
        .select({ id: t.runs.id })
        .from(t.runs)
        .where(
          and(eq(t.runs.roomId, run.roomId), gt(t.runs.contentExpiresAt, now)),
        );
      if (!remaining.length)
        await tx.delete(t.members).where(eq(t.members.roomId, run.roomId));
      await tx
        .update(t.rooms)
        .set({ setup: { purged: true }, hostMemory: [], questionHistory: [], status: "expired" })
        .where(and(eq(t.rooms.id, run.roomId), lt(t.rooms.expiresAt, now)));
    });
  const metricsCutoff = new Date(now.getTime() - 90 * 86400000);
  await db.delete(t.runs).where(lt(t.runs.createdAt, metricsCutoff));
  await db.delete(t.deviceSessions).where(lt(t.deviceSessions.expiresAt, now));
}
export async function startJobs(
  url: string,
  db: Database,
  rooms: Rooms,
  media: MediaService,
  batch: BatchService,
  onError: (error: unknown) => void,
  gc2?: VoidService,
) {
  const boss = new PgBoss({ connectionString: url });
  boss.on("error", onError);
  await boss.start();
  const stopVoid = gc2 ? await startVoidJobs(boss, gc2, onError) : undefined;
  await boss.createQueue("batch-reconcile");
  await boss.createQueue("content-purge");
  await boss.createQueue("host-director");
  await boss.work<{ roomId: string }>(
    "host-director",
    { batchSize: 8, pollingIntervalSeconds: 0.5 },
    async (jobs) => {
      await Promise.all(jobs.map((job) => rooms.onHostJob(job.data.roomId)));
    },
  );
  rooms.onTick = (roomId) => {
    void boss
      .send(
        "host-director",
        { roomId },
        {
          singletonKey: roomId,
          singletonSeconds: 1,
          retryLimit: 1,
          expireInSeconds: 70,
        },
      )
      .catch(onError);
  };
  await boss.work("batch-reconcile", async () => {
    await batch.reconcile();
  });
  // Cron provides restart recovery; the timer adds the 30-second poll cadence.
  // A worker must not depend on successfully scheduling its own successor.
  await boss.schedule("batch-reconcile", "* * * * *", {});
  const poll = setInterval(() => {
    void boss
      .send(
        "batch-reconcile",
        {},
        { singletonKey: "poll", singletonSeconds: 25 },
      )
      .catch(onError);
  }, 30000);
  await boss.work("content-purge", async () => {
    await purge(db, media, batch);
  });
  await boss.schedule("content-purge", "* * * * *", {});
  await boss.send(
    "batch-reconcile",
    {},
    { singletonKey: "poll", singletonSeconds: 20 },
  );
  // Persisted deadlines are the source of truth; startup and every tick catch up under room locks.
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const active = await db
        .select({ id: t.rooms.id })
        .from(t.rooms)
        .where(
          and(gt(t.rooms.expiresAt, new Date()), ne(t.rooms.status, "ended")),
        );
      await Promise.all(active.map((r) => rooms.tick(r.id)));
    } catch (error) {
      onError(error);
    } finally {
      ticking = false;
    }
  };
  await tick();
  const timer = setInterval(() => void tick(), 500);
  return async () => {
    stopVoid?.();
    rooms.onTick = () => {};
    clearInterval(timer);
    clearInterval(poll);
    await boss.stop({ graceful: true, timeout: 5000 });
  };
}
