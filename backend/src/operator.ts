import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { loadConfig } from "./config";
import { createDatabase } from "./db/client";
import { rates, attempts, evaluations } from "./db/schema";
import { UsageLedger } from "./usage";
import { MediaService, PrivateFilesystem } from "./media";
import { BatchService } from "./batch";
import { purge } from "./jobs";

// Local CLI only. Financial evidence and references come from explicit JSON files, never guessed prices.
const config = loadConfig(),
  [command, arg] = process.argv.slice(2);
if (command === "ai-off" || command === "ai-on") {
  if (command === "ai-off") {
    await mkdir(path.dirname(config.aiStopFile), { recursive: true });
    await writeFile(config.aiStopFile, new Date().toISOString());
  } else
    await unlink(config.aiStopFile).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  console.log(
    command === "ai-off"
      ? "AI stopped. Active streams cancel within 500 ms. Typing continues."
      : "Emergency stop cleared. AI_ENABLED still controls provider availability.",
  );
} else {
  const { db, pool } = createDatabase(config.DATABASE_URL),
    usage = new UsageLedger(db, config),
    media = new MediaService(db, new PrivateFilesystem(config.mediaRoot)),
    batch = new BatchService(db, config, media, usage);
  try {
    const input = async () =>
      JSON.parse(await readFile(z.string().min(1).parse(arg), "utf8"));
    if (command === "rate") {
      const values = z
        .array(
          z
            .object({
              provider: z.literal("gnani"),
              model: z.string().min(1),
              unit: z.enum([
                "sttSeconds",
                "ttsCharacters",
                "inputTokens",
                "outputTokens",
                "billedUnits",
                "diagnosticSeconds",
              ]),
              price: z.string().regex(/^\d+(\.\d+)?$/),
              currency: z.string().length(3),
              version: z.string().min(1),
              effectiveAt: z.coerce.date(),
            })
            .strict(),
        )
        .min(1)
        .parse(await input());
      await db.insert(rates).values(values);
      console.log(`${values.length} versioned rates added.`);
    } else if (command === "reconcile") {
      const value = z
        .object({
          attemptId: z.string().uuid(),
          cost: z.string().regex(/^\d+(\.\d+)?$/),
          currency: z.string().length(3),
          providerRequestId: z.string().min(1),
        })
        .strict()
        .parse(await input());
      const changed = await db
        .update(attempts)
        .set({
          reconciledCost: value.cost,
          currency: value.currency,
          requestId: value.providerRequestId,
          updatedAt: new Date(),
        })
        .where(eq(attempts.id, value.attemptId))
        .returning({ id: attempts.id });
      if (!changed.length) throw new Error("Attempt not found");
      console.log(
        "Provider invoice amount recorded separately from the estimate.",
      );
    } else if (command === "evaluate") {
      const value = z
        .object({
          mediaId: z.string().uuid(),
          denoise: z.boolean(),
          reference: z.string().max(1000).optional(),
        })
        .strict()
        .parse(await input());
      console.log(
        JSON.stringify(
          await batch.create(value.mediaId, value.denoise, value.reference),
        ),
      );
    } else if (command === "cancel-evaluation") {
      const [item] = await db
        .select()
        .from(evaluations)
        .where(eq(evaluations.id, z.string().uuid().parse(arg)));
      if (!item) throw new Error("Evaluation not found");
      await batch.cancel(item);
      console.log("Diagnostic cancelled.");
    } else if (command === "poll") {
      await batch.reconcile();
      console.log("Diagnostic jobs reconciled.");
    } else if (command === "purge") {
      await purge(db, media, batch);
      console.log("Expired content purged.");
    } else
      throw new Error(
        "Commands: ai-off | ai-on | rate file.json | reconcile file.json | evaluate file.json | cancel-evaluation ID | poll | purge",
      );
  } finally {
    await pool.end();
  }
}
