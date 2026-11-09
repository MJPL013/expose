import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { loadConfig } from "../src/config";
import { createDatabase } from "../src/db/client";
import { GnaniProviders } from "../src/providers";
import { accounts } from "../src/accounts/schema";
import { voidSessions } from "./schema";
import { initialState } from "./state";
import { VoidService } from "./service";
const config = loadConfig();
const { db, pool } = createDatabase(config.DATABASE_URL);
const service = new VoidService(db, config, new GnaniProviders(config));
const processRequested = process.argv.includes("--process");
const fixture = z
  .object({
    version: z.literal(1),
    provenance: z.literal("synthetic"),
    profiles: z
      .array(
        z.object({
          key: z.string(),
          name: z.string(),
          sessions: z.array(
            z.array(
              z.object({
                role: z.enum(["user", "assistant"]),
                text: z.string(),
              }),
            ),
          ),
        }),
      )
      .length(3),
  })
  .parse(
    JSON.parse(
      await readFile(
        new URL("./data/synthetic-profiles.json", import.meta.url),
        "utf8",
      ),
    ),
  );
function stableId(key: string) {
  const hex = createHash("sha256")
    .update(`expose-synthetic-v1:${key}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
try {
  for (const profile of fixture.profiles) {
    const [account] = await db
      .insert(accounts)
      .values({
        id: stableId(profile.key),
        googleSub: `synthetic:${profile.key}:v1`,
        name: profile.name,
      })
      .onConflictDoUpdate({
        target: accounts.googleSub,
        set: { name: profile.name },
      })
      .returning();
    for (const [index, dialogue] of profile.sessions.entries()) {
      const id = stableId(`${profile.key}:${index}`),
        s = initialState("en");
      s.provenance = "synthetic";
      s.captions = [];
      s.timeline = [];
      s.finishedAt = new Date().toISOString();
      s.status = "complete";
      for (const [sequence, turn] of dialogue.entries()) {
        const tid = randomUUID(),
          at = new Date(
            Date.now() - (dialogue.length - sequence) * 1000,
          ).toISOString();
        s.timeline.push({ id: tid, role: turn.role, at });
        if (turn.role === "user")
          s.turns.push({
            id: tid,
            text: turn.text,
            original: turn.text,
            language: "en-IN",
            audioIds: [],
            sources: [],
            at,
          });
        else s.captions.push({ id: tid, text: turn.text, sources: [] });
      }
      await db
        .insert(voidSessions)
        .values({ id, accountId: account.id, state: s })
        .onConflictDoNothing();
      const row = await service.row(id);
      if (processRequested && !row.state.analysisRevision && !row.state.workId)
        await service.change(id, async (state, r, tx) => {
          await service.finishBatch(state, r, tx);
        });
      else await service.change(id, () => {});
    }
  }
  // The running worker processes queued jobs; summaries are not automatically approved here.
  console.log(
    JSON.stringify({
      syntheticProfiles: 3,
      syntheticSessions: 6,
      queued: processRequested,
      audioCreated: false,
      approval:
        "Use the operator approve-synthetic command after analysis is ready.",
    }),
  );
} finally {
  await pool.end();
}
