import type { PgBoss } from "pg-boss";
import { eq, asc } from "drizzle-orm";
import { voidJobs } from "./schema";
import type { VoidService } from "./service";

export async function startVoidJobs(
  boss: PgBoss,
  service: VoidService,
  onError: (error: unknown) => void,
) {
  await boss.createQueue("gc2-work"); // Drain old persisted work with the version-aware service.
  for (const name of ["gc2-work", "gc2-live", "gc2-background"]) {
    if (name !== "gc2-work") await boss.createQueue(name);
    await boss.work<{ jobId: string }>(
      name,
      {
        batchSize: name === "gc2-background" ? 1 : 8,
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
      const jobs = await service.db
        .select({
          id: voidJobs.id,
          kind: voidJobs.kind,
          dispatchId: voidJobs.dispatchId,
        })
        .from(voidJobs)
        .where(eq(voidJobs.status, "queued"))
        .orderBy(asc(voidJobs.createdAt))
        .limit(64);
      for (const j of jobs) {
        const background = ["batch", "graph", "compare"].includes(j.kind);
        const queue = background ? "gc2-background" : "gc2-live";
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
