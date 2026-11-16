import type { PgBoss } from "pg-boss";
import { eq, asc, and, sql } from "drizzle-orm";
import { voidJobs } from "./schema";
import type { VoidService } from "./service";

export async function startVoidJobs(
  boss: PgBoss,
  service: VoidService,
  onError: (error: unknown) => void,
) {
  await boss.createQueue("gc2-work"); // Drain old persisted work with the version-aware service.
  for (const name of ["gc2-work", "gc2-live", "gc2-background", "gc2-recall"]) {
    if (name !== "gc2-work") await boss.createQueue(name);
    await boss.work<{ jobId: string }>(
      name,
      {
        batchSize:
          name === "gc2-background" ? 1 : name === "gc2-recall" ? 2 : 8,
        pollingIntervalSeconds: 0.5,
      },
      async (jobs) => {
        await Promise.all(jobs.map((j) => service.runJob(j.data.jobId)));
      },
    );
  }
  let polling = false;
  let lastRecovery = 0;
  const dispatch = async () => {
    if (polling) return;
    polling = true;
    try {
      if (Date.now() - lastRecovery > 30000) {
        await service.recover();
        lastRecovery = Date.now();
      }
      // Independent selections prevent queued background receipts from hiding live work.
      const jobs = [];
      for (const group of ["live", "background", "recall"] as const) {
        const eligible =
          group === "live"
            ? sql`${voidJobs.kind} not in ('batch','graph','compare','recall')`
            : group === "recall"
              ? eq(voidJobs.kind, "recall")
              : sql`${voidJobs.kind} in ('batch','graph','compare')`;
        jobs.push(
          ...(await service.db
            .select({
              id: voidJobs.id,
              kind: voidJobs.kind,
              dispatchId: voidJobs.dispatchId,
            })
            .from(voidJobs)
            .where(and(eq(voidJobs.status, "queued"), eligible))
            .orderBy(asc(voidJobs.createdAt))
            .limit(group === "live" ? 48 : 16)),
        );
      }
      for (const j of jobs) {
        const background = ["batch", "graph", "compare"].includes(j.kind);
        const queue =
          j.kind === "recall"
            ? "gc2-recall"
            : background
              ? "gc2-background"
              : "gc2-live";
        if (j.dispatchId) {
          const delivery = await boss.getJobById(queue, j.dispatchId);
          if (
            delivery &&
            ["created", "retry", "active"].includes(delivery.state)
          )
            continue;
        }
        // A queued operation has not invoked its provider. Keep its delivery receipt so a
        // slow queue does not accumulate a fresh copy every polling interval. After a
        // crash between send and receipt, the database claim still guards publication.
        const dispatchId = await boss.send(
          queue,
          { jobId: j.id },
          {
            singletonKey: j.id,
            singletonSeconds: 1,
            retryLimit: 0,
            expireInSeconds: background ? 900 : 40,
          },
        );
        if (dispatchId)
          await service.db
            .update(voidJobs)
            .set({ dispatchId })
            .where(eq(voidJobs.id, j.id));
      }
    } catch (error) {
      onError(error);
    } finally {
      polling = false;
    }
  };
  await dispatch();
  const timer = setInterval(() => void dispatch(), 500);
  return () => clearInterval(timer);
}
